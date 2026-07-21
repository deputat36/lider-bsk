-- STAGING ONLY.
-- Reproducible source for applied migration
-- 20260721200142 / staging_installation_schema_indexes_reconcile_20260721.
-- This file records the observed applied state; it is not applied by GitHub.

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

  if to_regclass('public.leader_installation_job_items') is null then
    raise exception 'installation_job_items_missing';
  end if;
end
$guard$;

create index if not exists leader_installation_job_items_order_id_idx
  on public.leader_installation_job_items (order_id);
