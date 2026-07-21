-- STAGING ONLY. APPLIED RECONCILIATION SOURCE.
-- Deployment: 20260721200142 / staging_installation_schema_indexes_reconcile_20260721.
-- Completes production-compatible installation indexes. Never apply to production.

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

  if to_regclass('public.leader_installation_job_items') is null
     or to_regclass('public.leader_installation_comments') is null then
    raise exception 'installation_reconciliation_tables_missing';
  end if;
end
$guard$;

do $rename$
begin
  if to_regclass('public.leader_installation_items_job_idx') is null
     and to_regclass('public.leader_installation_job_items_job_id_idx') is not null then
    alter index public.leader_installation_job_items_job_id_idx
      rename to leader_installation_items_job_idx;
  end if;
end
$rename$;

create index if not exists leader_installation_job_items_order_id_idx
  on public.leader_installation_job_items(order_id);
create index if not exists leader_installation_comments_job_idx
  on public.leader_installation_comments(job_id);
