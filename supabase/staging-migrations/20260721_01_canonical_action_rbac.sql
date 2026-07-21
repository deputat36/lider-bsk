-- STAGING ONLY.
-- Target project: lider-bsk-staging / otulfnouybahfnsycxqn.
-- Depends on the isolated environment guard and design-task harness.
-- This migration must never be applied to production.

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
end
$guard$;

create schema if not exists leader_private;

create table if not exists leader_private.leader_role_action_matrix_v1 (
  role text primary key,
  allowed_actions text[] not null,
  contract_version integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint leader_role_action_matrix_v1_role_check
    check (role in ('owner', 'admin', 'manager', 'accountant', 'designer', 'installer', 'contractor')),
  constraint leader_role_action_matrix_v1_version_check
    check (contract_version = 1),
  constraint leader_role_action_matrix_v1_actions_check
    check (cardinality(allowed_actions) > 0)
);

alter table leader_private.leader_role_action_matrix_v1 enable row level security;
revoke all on table leader_private.leader_role_action_matrix_v1 from public, anon, authenticated;
grant select, insert, update, delete on table leader_private.leader_role_action_matrix_v1 to service_role;

-- MATRIX_JSON_BEGIN
-- The checker compares this exact seed with contracts/crm-v4-role-action-matrix-v1.json.
do $seed$
declare
  v_matrix jsonb := $matrix$
{
  "owner": ["leads.read","leads.create","leads.update","leads.assign","leads.transition","clients.read","clients.write","needs.read","needs.write","calculations.read","calculations.write","costs.read","offers.read","offers.write","offers.transition","orders.read","orders.create","orders.update","orders.transition","production.read","production.write","installation.read","installation.write","design.read","design.write","finance.read","finance.write","documents.read","documents.create","documents.update","documents.generate","documents.send","documents.sign","documents.void","catalog.read","catalog.manage","audit.read","users.manage","settings.manage"],
  "admin": ["leads.read","leads.create","leads.update","leads.assign","leads.transition","clients.read","clients.write","needs.read","needs.write","calculations.read","calculations.write","costs.read","offers.read","offers.write","offers.transition","orders.read","orders.create","orders.update","orders.transition","production.read","production.write","installation.read","installation.write","design.read","design.write","finance.read","finance.write","documents.read","documents.create","documents.update","documents.generate","documents.send","documents.sign","documents.void","catalog.read","catalog.manage","audit.read","users.manage","settings.manage"],
  "manager": ["leads.read","leads.create","leads.update","leads.assign","leads.transition","clients.read","clients.write","needs.read","needs.write","calculations.read","calculations.write","offers.read","offers.write","offers.transition","orders.read","orders.create","orders.update","orders.transition","production.read","production.write","installation.read","installation.write","design.read","design.write","documents.read","documents.create","documents.update","documents.generate","documents.send","audit.read"],
  "accountant": ["orders.read","finance.read","finance.write","costs.read","documents.read","documents.generate","documents.send","documents.sign"],
  "designer": ["design.read","design.write","production.read","production.write"],
  "installer": ["installation.read","installation.write"],
  "contractor": ["production.read","production.write"]
}
$matrix$::jsonb;
begin
  delete from leader_private.leader_role_action_matrix_v1;

  insert into leader_private.leader_role_action_matrix_v1 (
    role,
    allowed_actions,
    contract_version,
    updated_at
  )
  select
    entry.key,
    array(
      select jsonb_array_elements_text(entry.value)
    ),
    1,
    now()
  from jsonb_each(v_matrix) as entry;
end
$seed$;
-- MATRIX_JSON_END

comment on table leader_private.leader_role_action_matrix_v1 is
  'Staging-only canonical CRM v4 role/action matrix. Production deployment requires explicit approval.';

create or replace function leader_private.leader_actor_has_crm_action(
  p_actor_id uuid,
  p_action text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    p_actor_id is not null
    and nullif(btrim(coalesce(p_action, '')), '') is not null
    and exists (
      select 1
      from public.leader_user_profiles as profile
      join leader_private.leader_role_action_matrix_v1 as matrix
        on matrix.role = lower(btrim(coalesce(profile.role, '')))
      where profile.user_id = p_actor_id
        and profile.is_active = true
        and btrim(p_action) = any (matrix.allowed_actions)
    );
$function$;

comment on function leader_private.leader_actor_has_crm_action(uuid, text) is
  'Staging-only actor-aware CRM action authorization. Active profile plus canonical role/action matrix; unknown role/action fail closed.';

revoke all on function leader_private.leader_actor_has_crm_action(uuid, text) from public, anon, authenticated;
grant execute on function leader_private.leader_actor_has_crm_action(uuid, text) to service_role;

create or replace function leader_private.leader_has_crm_action(p_action text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select leader_private.leader_actor_has_crm_action(
    (select auth.uid()),
    p_action
  );
$function$;

comment on function leader_private.leader_has_crm_action(text) is
  'Staging-only auth.uid-based CRM action authorization for RLS policies. Browser actor ids and roles are not accepted.';

revoke all on function leader_private.leader_has_crm_action(text) from public, anon, authenticated;
grant execute on function leader_private.leader_has_crm_action(text) to authenticated;
grant execute on function leader_private.leader_has_crm_action(text) to service_role;

-- Preserve the existing tested implementation, then place the canonical action
-- authorization gate in front of it without changing business logic.
do $rename_impl$
begin
  if to_regprocedure('public.leader_create_design_task_from_order_impl_rpc(jsonb)') is null then
    if to_regprocedure('public.leader_create_design_task_from_order_rpc(jsonb)') is null then
      raise exception 'staging_design_task_rpc_missing';
    end if;

    alter function public.leader_create_design_task_from_order_rpc(jsonb)
      rename to leader_create_design_task_from_order_impl_rpc;
  end if;
end
$rename_impl$;

create or replace function public.leader_create_design_task_from_order_rpc(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_actor_id uuid;
  v_action text;
  v_request_id text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return jsonb_build_object(
      'ok', false,
      'request_id', null,
      'error', jsonb_build_object(
        'code', 'validation_error',
        'message', 'RPC payload must be an object'
      )
    );
  end if;

  v_request_id := p_payload #>> '{request,request_id}';
  v_action := btrim(coalesce(p_payload #>> '{request,action}', ''));

  begin
    v_actor_id := nullif(btrim(coalesce(p_payload ->> 'actor_id', '')), '')::uuid;
  exception when others then
    return jsonb_build_object(
      'ok', false,
      'request_id', v_request_id,
      'error', jsonb_build_object(
        'code', 'validation_error',
        'message', 'actor_id must be a UUID'
      )
    );
  end;

  if v_actor_id is null then
    return jsonb_build_object(
      'ok', false,
      'request_id', v_request_id,
      'error', jsonb_build_object(
        'code', 'validation_error',
        'message', 'actor_id is required'
      )
    );
  end if;

  if v_action <> 'design_task.create_from_order' then
    return jsonb_build_object(
      'ok', false,
      'request_id', v_request_id,
      'error', jsonb_build_object(
        'code', 'unknown_action',
        'message', 'Unsupported action'
      )
    );
  end if;

  if not leader_private.leader_actor_has_crm_action(v_actor_id, 'design.write') then
    return jsonb_build_object(
      'ok', false,
      'request_id', v_request_id,
      'error', jsonb_build_object(
        'code', 'forbidden',
        'message', 'design.write permission is required'
      )
    );
  end if;

  return public.leader_create_design_task_from_order_impl_rpc(p_payload);
end
$function$;

comment on function public.leader_create_design_task_from_order_rpc(jsonb) is
  'Staging-only canonical design.write authorization wrapper. Service-role only; checks actor before business implementation.';

revoke all on function public.leader_create_design_task_from_order_rpc(jsonb) from public, anon, authenticated;
revoke all on function public.leader_create_design_task_from_order_impl_rpc(jsonb) from public, anon, authenticated;
grant execute on function public.leader_create_design_task_from_order_rpc(jsonb) to service_role;
grant execute on function public.leader_create_design_task_from_order_impl_rpc(jsonb) to service_role;
