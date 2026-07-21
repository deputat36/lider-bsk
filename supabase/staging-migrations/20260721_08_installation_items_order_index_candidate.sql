-- STAGING ONLY. SOURCE-ONLY CANDIDATE, NOT APPLIED.
-- Adds the only remaining production-compatible FK covering index.

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

  if exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'leader_installation_job_items_order_id_idx'
  ) then
    raise exception 'installation_items_order_index_already_exists';
  end if;
end
$guard$;

create index leader_installation_job_items_order_id_idx
  on public.leader_installation_job_items (order_id);
