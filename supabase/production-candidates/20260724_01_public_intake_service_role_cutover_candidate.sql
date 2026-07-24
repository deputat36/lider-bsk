-- Source-only production candidate. DO NOT APPLY without explicit owner approval.
-- Project: ofewxuqfjhamgerwzull
-- Goal: make leader-public-lead the only anonymous write path while preserving CRM manual lead creation.

begin;

-- Stop if the production policy baseline drifted. Review names and expressions before applying.
do $preflight$
declare
  public_lead_policy_count integer;
  public_audit_policy_count integer;
begin
  select count(*) into public_lead_policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'leader_leads'
    and policyname = 'leader_leads_insert_public_safe'
    and cmd = 'INSERT'
    and roles @> array['anon']::name[];

  select count(*) into public_audit_policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'leader_public_lead_audit'
    and policyname = 'leader_public_lead_audit_insert_public'
    and cmd = 'INSERT'
    and roles @> array['anon']::name[];

  if public_lead_policy_count <> 1 then
    raise exception 'public intake cutover stopped: leader_leads public insert policy drift';
  end if;
  if public_audit_policy_count <> 1 then
    raise exception 'public intake cutover stopped: audit public insert policy drift';
  end if;
  if not has_table_privilege('anon', 'public.leader_leads', 'INSERT') then
    raise exception 'public intake cutover stopped: anon leader_leads INSERT baseline drift';
  end if;
  if not has_table_privilege('anon', 'public.leader_public_lead_audit', 'INSERT') then
    raise exception 'public intake cutover stopped: anon audit INSERT baseline drift';
  end if;
end
$preflight$;

revoke insert on table public.leader_leads from anon;
revoke insert on table public.leader_public_lead_audit from anon;

drop policy leader_leads_insert_public_safe on public.leader_leads;
drop policy leader_public_lead_audit_insert_public on public.leader_public_lead_audit;

-- Preserve the existing authenticated manual-lead scenario, but require an active CRM profile.
drop policy if exists leader_leads_insert_app on public.leader_leads;
create policy leader_leads_insert_app
on public.leader_leads
for insert
to authenticated
with check (leader_private.leader_has_access());

grant insert on table public.leader_leads to authenticated;

-- Service role remains the only writer used by the public Edge endpoint and bypasses RLS.
grant insert on table public.leader_leads to service_role;
grant insert on table public.leader_public_lead_audit to service_role;

-- Postconditions inside the same transaction.
do $postflight$
begin
  if has_table_privilege('anon', 'public.leader_leads', 'INSERT') then
    raise exception 'public intake cutover failed: anon can still insert leader_leads';
  end if;
  if has_table_privilege('anon', 'public.leader_public_lead_audit', 'INSERT') then
    raise exception 'public intake cutover failed: anon can still insert audit';
  end if;
  if not has_table_privilege('authenticated', 'public.leader_leads', 'INSERT') then
    raise exception 'public intake cutover failed: CRM manual lead INSERT lost';
  end if;
  if not has_table_privilege('service_role', 'public.leader_leads', 'INSERT')
     or not has_table_privilege('service_role', 'public.leader_public_lead_audit', 'INSERT') then
    raise exception 'public intake cutover failed: service role INSERT missing';
  end if;
end
$postflight$;

commit;
