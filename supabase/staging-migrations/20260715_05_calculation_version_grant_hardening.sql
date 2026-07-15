-- STAGING ONLY.
-- Target project: lider-bsk-staging / otulfnouybahfnsycxqn.
-- Run immediately after 20260715_04_calculation_version_install.sql and before any test or Edge deployment.

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

  if to_regclass('public.leader_lead_calculations') is null
     or to_regclass('public.leader_lead_calculation_items') is null then
    raise exception 'calculation_version_tables_missing';
  end if;
end
$guard$;

revoke all on table public.leader_lead_calculations from public, anon, authenticated, service_role;
revoke all on table public.leader_lead_calculation_items from public, anon, authenticated, service_role;

grant select, insert on table public.leader_lead_calculations to service_role;
grant select, insert on table public.leader_lead_calculation_items to service_role;

do $verify$
begin
  if has_table_privilege('anon', 'public.leader_lead_calculations', 'SELECT')
     or has_table_privilege('authenticated', 'public.leader_lead_calculations', 'SELECT')
     or has_table_privilege('anon', 'public.leader_lead_calculation_items', 'SELECT')
     or has_table_privilege('authenticated', 'public.leader_lead_calculation_items', 'SELECT') then
    raise exception 'browser_table_privilege_leaked';
  end if;

  if not has_table_privilege('service_role', 'public.leader_lead_calculations', 'SELECT')
     or not has_table_privilege('service_role', 'public.leader_lead_calculations', 'INSERT')
     or not has_table_privilege('service_role', 'public.leader_lead_calculation_items', 'SELECT')
     or not has_table_privilege('service_role', 'public.leader_lead_calculation_items', 'INSERT') then
    raise exception 'service_role_required_privilege_missing';
  end if;

  if has_table_privilege('service_role', 'public.leader_lead_calculations', 'UPDATE')
     or has_table_privilege('service_role', 'public.leader_lead_calculations', 'DELETE')
     or has_table_privilege('service_role', 'public.leader_lead_calculation_items', 'UPDATE')
     or has_table_privilege('service_role', 'public.leader_lead_calculation_items', 'DELETE') then
    raise exception 'service_role_write_privilege_too_broad';
  end if;
end
$verify$;
