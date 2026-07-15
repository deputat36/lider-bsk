-- STAGING ONLY.
-- Target project: lider-bsk-staging / otulfnouybahfnsycxqn.
-- Resolves calculation-version unindexed foreign-key advisor findings.

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

create index if not exists leader_lead_calculations_need_id_idx
  on public.leader_lead_calculations (need_id);

create index if not exists leader_lead_calculation_items_lead_id_idx
  on public.leader_lead_calculation_items (lead_id);

do $verify$
begin
  if to_regclass('public.leader_lead_calculations_need_id_idx') is null then
    raise exception 'calculation_need_index_missing';
  end if;

  if to_regclass('public.leader_lead_calculation_items_lead_id_idx') is null then
    raise exception 'calculation_item_lead_index_missing';
  end if;
end
$verify$;
