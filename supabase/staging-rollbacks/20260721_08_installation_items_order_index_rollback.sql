-- STAGING ONLY rollback for deployed reconciliation source
-- supabase/staging-migrations/20260721_08_installation_items_order_index_candidate.sql.

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

drop index if exists public.leader_installation_comments_job_idx;
drop index if exists public.leader_installation_job_items_order_id_idx;

do $rename_back$
begin
  if to_regclass('public.leader_installation_job_items_job_id_idx') is null
     and to_regclass('public.leader_installation_items_job_idx') is not null then
    alter index public.leader_installation_items_job_idx
      rename to leader_installation_job_items_job_id_idx;
  end if;
end
$rename_back$;
