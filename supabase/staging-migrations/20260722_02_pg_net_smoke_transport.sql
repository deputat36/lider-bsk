-- STAGING ONLY.
-- Reproducible source for 20260722053726 / staging_pg_net_smoke_transport_20260722.
-- pg_net was enabled only to invoke a short-lived staging bootstrap from the same
-- staging database. It was removed by 20260722060407 after the runtime smoke.
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

create extension if not exists pg_net;

-- Defense-in-depth requests issued during the applied migration. The extension
-- owner controls its default ACLs, therefore the runtime also verified that the
-- net schema was not exposed through the Data API and removed the extension
-- immediately after the smoke.
revoke all on schema net from public, anon, authenticated;
revoke all on all tables in schema net from public, anon, authenticated;
revoke all on all sequences in schema net from public, anon, authenticated;
revoke all on all functions in schema net from public, anon, authenticated;

grant usage on schema net to postgres;
grant execute on function net.http_post(text, jsonb, jsonb, jsonb, integer) to postgres;
