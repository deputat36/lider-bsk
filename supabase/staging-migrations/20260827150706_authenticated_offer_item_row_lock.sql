-- STAGING ONLY. Issue #487: FOR SHARE requires UPDATE on at least one column.
do $guard$
begin
  if not exists (select 1 from leader_staging.environment_guard where singleton=true and project_ref='otulfnouybahfnsycxqn') then
    raise exception 'staging_environment_guard_failed';
  end if;
end
$guard$;

-- The service-only offer RPC locks immutable item snapshots while calculating.
-- Do not grant browser roles UPDATE or broaden the function to SECURITY DEFINER.
grant update (id) on public.leader_lead_calculation_items to service_role;

