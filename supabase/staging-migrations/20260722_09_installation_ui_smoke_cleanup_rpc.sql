-- STAGING ONLY.
-- Applied as 20260722203119 / staging_installation_ui_smoke_cleanup_rpc_20260722.
-- Removes all database rows created for one authenticated UI smoke run.

create or replace function public.leader_cleanup_installation_ui_smoke_rpc(
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
  v_residue jsonb;
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

  perform pg_advisory_xact_lock(hashtextextended('installation-ui-smoke:' || v_run_key, 0));

  select * into v_run
  from leader_staging.installation_ui_smoke_runs
  where run_key = v_run_key
  for update;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'already_clean', true,
      'run_key', v_run_key,
      'auth_user_id', null,
      'residue', jsonb_build_object(
        'profiles', 0, 'orders', 0, 'production_jobs', 0, 'installation_jobs', 0,
        'items', 0, 'events', 0, 'comments', 0, 'receipts', 0, 'runs', 0
      )
    );
  end if;

  update leader_staging.installation_ui_smoke_runs
  set state = 'cleanup_started'
  where run_key = v_run_key;

  delete from leader_private.leader_command_receipts
  where action = 'installation_job.update'
    and actor_id = v_run.auth_user_id;

  delete from public.leader_installation_jobs
  where id = v_run.installation_job_id;

  delete from public.leader_production_jobs
  where id = v_run.production_job_id;

  delete from public.leader_orders
  where id = v_run.order_id;

  delete from public.leader_user_profiles
  where user_id = v_run.auth_user_id;

  delete from leader_staging.installation_ui_smoke_runs
  where run_key = v_run_key;

  select jsonb_build_object(
    'profiles', (select count(*) from public.leader_user_profiles where user_id = v_run.auth_user_id),
    'orders', (select count(*) from public.leader_orders where id = v_run.order_id),
    'production_jobs', (select count(*) from public.leader_production_jobs where id = v_run.production_job_id),
    'installation_jobs', (select count(*) from public.leader_installation_jobs where id = v_run.installation_job_id),
    'items', (select count(*) from public.leader_installation_job_items where job_id = v_run.installation_job_id),
    'events', (select count(*) from public.leader_installation_events where job_id = v_run.installation_job_id),
    'comments', (select count(*) from public.leader_installation_comments where job_id = v_run.installation_job_id),
    'receipts', (select count(*) from leader_private.leader_command_receipts where action = 'installation_job.update' and actor_id = v_run.auth_user_id),
    'runs', (select count(*) from leader_staging.installation_ui_smoke_runs where run_key = v_run_key)
  ) into v_residue;

  return jsonb_build_object(
    'ok', true,
    'already_clean', false,
    'run_key', v_run_key,
    'auth_user_id', v_run.auth_user_id,
    'residue', v_residue
  );
end
$function$;

revoke all on function public.leader_cleanup_installation_ui_smoke_rpc(text) from public, anon, authenticated;
grant execute on function public.leader_cleanup_installation_ui_smoke_rpc(text) to service_role;
