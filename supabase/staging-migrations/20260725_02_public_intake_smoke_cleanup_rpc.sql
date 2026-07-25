-- STAGING ONLY. Applied to project otulfnouybahfnsycxqn as staging_public_intake_smoke_cleanup_rpc_v1.

create or replace function public.leader_staging_public_intake_smoke_cleanup_rpc(p_run_id text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, leader_private, leader_staging
as $function$
declare
  v_run_id text := btrim(coalesce(p_run_id, ''));
  v_pattern text;
  v_audit integer := 0;
  v_leads integer := 0;
  v_receipts integer := 0;
begin
  if not exists (
    select 1 from leader_staging.environment_guard
    where singleton = true
      and project_ref = 'otulfnouybahfnsycxqn'
      and environment_name = 'staging'
      and repository = 'deputat36/lider-bsk'
  ) then
    raise exception 'staging_environment_guard_failed';
  end if;

  if v_run_id !~ '^staging-public-intake-[0-9]{10,}$' then
    raise exception 'staging_public_intake_run_id_invalid' using errcode = '22023';
  end if;

  v_pattern := v_run_id || '-%';

  delete from public.leader_public_lead_audit where request_id like v_pattern;
  get diagnostics v_audit = row_count;

  delete from public.leader_leads where request_id like v_pattern;
  get diagnostics v_leads = row_count;

  delete from leader_private.leader_public_intake_rate_limit_receipts where request_id like v_pattern;
  get diagnostics v_receipts = row_count;

  return jsonb_build_object(
    'ok', true,
    'run_id', v_run_id,
    'audit_deleted', v_audit,
    'leads_deleted', v_leads,
    'receipts_deleted', v_receipts
  );
end
$function$;

revoke all on function public.leader_staging_public_intake_smoke_cleanup_rpc(text) from public, anon, authenticated;
grant execute on function public.leader_staging_public_intake_smoke_cleanup_rpc(text) to service_role;
