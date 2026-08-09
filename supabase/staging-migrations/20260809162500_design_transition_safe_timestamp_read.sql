-- STAGING ONLY. Optimistic-lock timestamp for the authenticated design transition.
do $guard$
begin
  if not exists (select 1 from leader_staging.environment_guard where singleton = true and project_ref = 'otulfnouybahfnsycxqn') then
    raise exception 'staging_environment_guard_failed';
  end if;
end
$guard$;

grant select (updated_at) on public.leader_design_tasks to authenticated;
