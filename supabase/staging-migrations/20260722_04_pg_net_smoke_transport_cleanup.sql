-- STAGING ONLY.
-- Reproducible source for 20260722060407 /
-- staging_pg_net_smoke_transport_cleanup_20260722.
-- Removes the temporary runtime-smoke HTTP transport.
-- Never apply this migration to production.

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

drop extension if exists pg_net cascade;
drop schema if exists net cascade;
