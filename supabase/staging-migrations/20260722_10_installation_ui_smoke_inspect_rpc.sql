-- STAGING ONLY.
-- Applied as 20260722203204 / staging_installation_ui_smoke_inspect_rpc_20260722.
-- Allows the OIDC bootstrap to delete the Auth user before database cleanup.

create or replace function public.leader_inspect_installation_ui_smoke_rpc(
  p_run_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_run_key text := btrim(coalesce(p_run_key, ''));
  v_run leader_staging.installation_ui_smoke_runs%rowtype;
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
  if v_run_key !~ '^[0-9]+:[0-9]+$' then
    raise exception 'run_key_invalid';
  end if;

  select * into v_run
  from leader_staging.installation_ui_smoke_runs
  where run_key = v_run_key;

  if not found then
    return jsonb_build_object('ok', true, 'exists', false, 'run_key', v_run_key);
  end if;

  return jsonb_build_object(
    'ok', true,
    'exists', true,
    'run_key', v_run_key,
    'auth_user_id', v_run.auth_user_id,
    'job_id', v_run.installation_job_id,
    'state', v_run.state
  );
end
$function$;

revoke all on function public.leader_inspect_installation_ui_smoke_rpc(text) from public, anon, authenticated;
grant execute on function public.leader_inspect_installation_ui_smoke_rpc(text) to service_role;
