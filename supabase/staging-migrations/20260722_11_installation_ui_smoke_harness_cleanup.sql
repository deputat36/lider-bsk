-- STAGING ONLY.
-- Applied as 20260722204939 / staging_installation_ui_smoke_harness_cleanup_20260722.
-- Removes all temporary fixture lifecycle objects after authenticated browser smoke.

do $guard$
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

  if exists (select 1 from auth.users)
     or exists (select 1 from public.leader_user_profiles)
     or exists (select 1 from public.leader_orders)
     or exists (select 1 from public.leader_production_jobs)
     or exists (select 1 from public.leader_installation_jobs)
     or exists (select 1 from public.leader_installation_job_items)
     or exists (select 1 from public.leader_installation_events)
     or exists (select 1 from public.leader_installation_comments)
     or exists (select 1 from leader_private.leader_command_receipts where action = 'installation_job.update')
     or exists (select 1 from leader_staging.installation_ui_smoke_runs) then
    raise exception 'installation_ui_smoke_cleanup_requires_empty_staging';
  end if;
end
$guard$;

drop function if exists public.leader_prepare_installation_ui_smoke_rpc(text,uuid,text);
drop function if exists public.leader_cleanup_installation_ui_smoke_rpc(text);
drop function if exists public.leader_inspect_installation_ui_smoke_rpc(text);
drop table if exists leader_staging.installation_ui_smoke_runs;
