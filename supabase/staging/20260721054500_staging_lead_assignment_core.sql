-- Staging-only compatibility contour for CRM lead self-assignment.
-- Never apply this file to production: production already has leader_leads.assigned_to.
-- The isolated lider-bsk-staging project contains synthetic data only.

alter table public.leader_leads
  add column if not exists assigned_to uuid null;

comment on column public.leader_leads.assigned_to is
  'lider-bsk-staging only: synthetic responsibility field for compare-and-set assignment tests.';

alter table public.leader_leads enable row level security;

revoke all on table public.leader_leads from public, anon, authenticated;
grant select, insert, update, delete on table public.leader_leads to service_role;
