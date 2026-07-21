-- Staging-only compatibility contour for CRM lead exception flow.
-- Applied only to Supabase project otulfnouybahfnsycxqn (lider-bsk-staging).
-- Never apply this file to production: production already has the full CRM schema.

alter table public.leader_leads
  add column if not exists next_contact_at timestamptz null;

create table if not exists public.leader_lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leader_leads(id) on delete cascade,
  event_type text not null default 'Комментарий',
  old_status text null,
  new_status text null,
  body text null,
  created_by uuid null,
  created_by_email text null,
  created_at timestamptz not null default now()
);

comment on table public.leader_lead_events is
  'lider-bsk-staging only: synthetic lead timeline used to test the one-action exception flow.';

create index if not exists leader_lead_events_lead_created_idx
  on public.leader_lead_events (lead_id, created_at desc);

alter table public.leader_leads enable row level security;
alter table public.leader_lead_events enable row level security;

revoke all on table public.leader_leads from public, anon, authenticated;
revoke all on table public.leader_lead_events from public, anon, authenticated;

grant select, insert, update, delete on table public.leader_leads to service_role;
grant select, insert, update, delete on table public.leader_lead_events to service_role;
