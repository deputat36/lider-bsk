-- STAGING ONLY.
-- Aligns the synthetic staging lead table with the real CRM v4 lead-card read contract.
-- No production data is copied and production is not modified.

alter table public.leader_leads
  add column if not exists name text,
  add column if not exists phone text,
  add column if not exists source text default 'Сайт',
  add column if not exists message text,
  add column if not exists page_url text,
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists service text,
  add column if not exists contact_preference text,
  add column if not exists city text,
  add column if not exists budget numeric,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists utm_term text,
  add column if not exists converted_order_id uuid,
  add column if not exists converted_client_id uuid,
  add column if not exists last_contact_at timestamptz,
  add column if not exists converted_at timestamptz,
  add column if not exists reject_reason text,
  add column if not exists lead_quality text default 'Не оценена',
  add column if not exists estimated_amount numeric default 0,
  add column if not exists request_id text,
  add column if not exists phone_normalized text,
  add column if not exists source_page_path text,
  add column if not exists submitted_at timestamptz,
  add column if not exists client_user_agent text;

grant select on public.leader_user_profiles to authenticated;
grant select on public.leader_leads to authenticated;
grant select on public.leader_lead_events to authenticated;

drop policy if exists leader_staging_profiles_select_self on public.leader_user_profiles;
create policy leader_staging_profiles_select_self
on public.leader_user_profiles
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists leader_staging_leads_select_active_staff on public.leader_leads;
create policy leader_staging_leads_select_active_staff
on public.leader_leads
for select
to authenticated
using (
  exists (
    select 1
    from public.leader_user_profiles p
    where p.user_id = (select auth.uid())
      and p.is_active = true
      and p.role in ('manager', 'admin', 'owner')
  )
);

drop policy if exists leader_staging_lead_events_select_active_staff on public.leader_lead_events;
create policy leader_staging_lead_events_select_active_staff
on public.leader_lead_events
for select
to authenticated
using (
  exists (
    select 1
    from public.leader_user_profiles p
    where p.user_id = (select auth.uid())
      and p.is_active = true
      and p.role in ('manager', 'admin', 'owner')
  )
);
