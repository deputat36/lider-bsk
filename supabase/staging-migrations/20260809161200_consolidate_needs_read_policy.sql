-- STAGING ONLY. Consolidate overlapping manager/design read policies.
do $guard$
begin
  if not exists (
    select 1 from leader_staging.environment_guard
    where singleton = true and project_ref = 'otulfnouybahfnsycxqn'
  ) then
    raise exception 'staging_environment_guard_failed';
  end if;
end
$guard$;

drop policy if exists leader_lead_needs_design_read_staging on public.leader_lead_needs;
drop policy if exists leader_lead_needs_crm_read_staging on public.leader_lead_needs;
create policy leader_lead_needs_crm_read_staging on public.leader_lead_needs
  for select to authenticated
  using (
    (select leader_private.leader_has_crm_action('needs.read'))
    or (select leader_private.leader_has_crm_action('design.read'))
  );
