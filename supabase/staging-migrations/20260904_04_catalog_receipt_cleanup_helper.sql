-- STAGING ONLY.
-- Target project: lider-bsk-staging / otulfnouybahfnsycxqn.
-- Fix catalog.manage typed error paths without granting DELETE on the private receipt table.

do $guard$
begin
  if not exists (
    select 1
    from leader_staging.environment_guard
    where singleton = true
      and project_ref = 'otulfnouybahfnsycxqn'
      and environment_name = 'staging'
      and repository = 'deputat36/lider-bsk'
  ) then
    raise exception 'staging_environment_guard_failed';
  end if;

  if to_regclass('leader_private.leader_command_receipts') is null
     or to_regprocedure('public.leader_manage_catalog_rpc(jsonb)') is null then
    raise exception 'catalog_receipt_cleanup_dependencies_missing';
  end if;
end
$guard$;

create or replace function leader_private.leader_discard_catalog_command_receipt(
  p_receipt_id uuid,
  p_actor_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_deleted integer := 0;
begin
  if p_receipt_id is null or p_actor_id is null then
    return false;
  end if;

  delete from leader_private.leader_command_receipts
  where id = p_receipt_id
    and actor_id = p_actor_id
    and action = 'catalog.manage'
    and state = 'in_progress';
  get diagnostics v_deleted = row_count;

  return v_deleted = 1;
end
$function$;

comment on function leader_private.leader_discard_catalog_command_receipt(uuid, uuid) is
  'STAGING ONLY. Narrow service-role helper that discards only an in-progress catalog.manage receipt owned by the supplied actor. Browser roles cannot execute it.';

revoke all on function leader_private.leader_discard_catalog_command_receipt(uuid, uuid)
  from public, anon, authenticated;
grant execute on function leader_private.leader_discard_catalog_command_receipt(uuid, uuid)
  to service_role;

-- Keep the catalog business RPC SECURITY INVOKER. Patch only its receipt-discard
-- statements so typed failures do not require DELETE privilege on the receipt table.
do $patch$
declare
  v_definition text;
  v_original text;
  v_plain_delete text := 'delete from leader_private.leader_command_receipts where id = v_receipt.id;';
  v_guarded_delete text := 'delete from leader_private.leader_command_receipts where id = v_receipt.id and state = ''in_progress'';';
  v_helper_call text := 'perform leader_private.leader_discard_catalog_command_receipt(v_receipt.id, v_actor_id);';
begin
  select pg_get_functiondef('public.leader_manage_catalog_rpc(jsonb)'::regprocedure)
  into v_definition;
  v_original := v_definition;

  if position(v_plain_delete in v_definition) = 0
     or position(v_guarded_delete in v_definition) = 0 then
    raise exception 'catalog_receipt_cleanup_expected_source_missing';
  end if;

  v_definition := replace(v_definition, v_plain_delete, v_helper_call);
  v_definition := replace(v_definition, v_guarded_delete, v_helper_call);

  if v_definition = v_original
     or position('delete from leader_private.leader_command_receipts where id = v_receipt.id' in v_definition) > 0 then
    raise exception 'catalog_receipt_cleanup_patch_failed';
  end if;

  execute v_definition;
end
$patch$;

-- Reassert the business RPC security boundary after CREATE OR REPLACE.
revoke all on function public.leader_manage_catalog_rpc(jsonb) from public, anon, authenticated;
grant execute on function public.leader_manage_catalog_rpc(jsonb) to service_role;

comment on function public.leader_manage_catalog_rpc(jsonb) is
  'STAGING ONLY. SECURITY INVOKER service-role catalog.manage command. Typed failures discard only their in-progress receipt through a narrow private helper; no DELETE grant exists on the receipt table.';
