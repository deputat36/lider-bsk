-- STAGING ONLY. Applied to project otulfnouybahfnsycxqn as staging_public_intake_contract_alignment_v1.

begin;

create or replace function leader_private.leader_has_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.leader_user_profiles
    where user_id = auth.uid()
      and is_active = true
  )
$function$;

revoke all on function leader_private.leader_has_access() from public, anon;
grant usage on schema leader_private to authenticated, service_role;
grant execute on function leader_private.leader_has_access() to authenticated, service_role;

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
revoke all on table public.leader_public_lead_audit from public, anon, authenticated;
grant insert, select, delete on table public.leader_public_lead_audit to service_role;

do $unique_request_id$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'leader_leads'
      and c.conname = 'leader_leads_request_id_key'
  ) then
    alter table public.leader_leads
      add constraint leader_leads_request_id_key unique (request_id);
  end if;
end
$unique_request_id$;

revoke insert on table public.leader_leads from anon;
drop policy if exists leader_leads_insert_public_safe on public.leader_leads;
drop policy if exists leader_public_lead_audit_insert_public on public.leader_public_lead_audit;

drop policy if exists leader_leads_insert_app on public.leader_leads;
create policy leader_leads_insert_app
on public.leader_leads
for insert
to authenticated
with check (leader_private.leader_has_access());

grant insert on table public.leader_leads to authenticated, service_role;
grant insert on table public.leader_public_lead_audit to service_role;

commit;
