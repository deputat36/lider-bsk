create table if not exists public.leader_public_lead_audit (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  request_id text,
  phone_normalized text,
  source_page_path text,
  page_url text,
  user_agent text,
  referer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  result text not null default 'accepted',
  reason text,
  payload jsonb not null default '{}'::jsonb
);

alter table public.leader_public_lead_audit enable row level security;

create index if not exists ix_leader_public_lead_audit_created_at
  on public.leader_public_lead_audit (created_at desc);

create index if not exists ix_leader_public_lead_audit_request_id
  on public.leader_public_lead_audit (request_id)
  where request_id is not null;

create index if not exists ix_leader_public_lead_audit_phone_created_at
  on public.leader_public_lead_audit (phone_normalized, created_at desc)
  where phone_normalized is not null;

drop policy if exists "leader_public_lead_audit_select_staff" on public.leader_public_lead_audit;
create policy "leader_public_lead_audit_select_staff"
  on public.leader_public_lead_audit
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.leader_user_profiles p
      where p.user_id = auth.uid()
        and coalesce(p.is_active, true) = true
        and p.role in ('owner', 'admin', 'manager')
    )
  );

comment on table public.leader_public_lead_audit is 'РА Лидер: аудит публичных отправок формы сайта и мягкий антиспам.';
comment on column public.leader_public_lead_audit.result is 'accepted, duplicate, rejected, suspicious, error.';
