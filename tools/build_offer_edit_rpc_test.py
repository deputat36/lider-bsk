"""Run the actual migration and behavioral acceptance in an isolated PostgreSQL DB."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
prefix = r"""
begin;
do $$ begin if current_database()<>'leader_offer_editor_test' then raise exception 'isolated_test_database_required'; end if; end $$;
create schema leader_private;
create schema extensions;
create schema auth;
create extension pgcrypto with schema extensions;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
end $$;
create table public.leader_user_profiles(user_id uuid primary key,role text,is_active boolean);
create table public.leader_leads(id uuid primary key,converted_order_id uuid);
create table public.leader_lead_calculations(id uuid primary key,lead_id uuid,is_current_revision boolean,order_id uuid);
create table public.leader_commercial_offers(
  id uuid primary key,lead_id uuid,calculation_id uuid,client_id uuid,order_id uuid,
  offer_number integer default 602,offer_type text default 'Подробное + короткое',title text,
  short_text text,full_text text,total_sum numeric,valid_until date,status text,
  sent_at timestamptz,approved_at timestamptz,rejected_at timestamptz,
  created_at timestamptz default now(),updated_at timestamptz,updated_by uuid,created_by uuid
);
create table public.leader_commercial_offer_events(
  id uuid primary key default gen_random_uuid(),offer_id uuid,lead_id uuid,calculation_id uuid,
  event_type text,old_status text,new_status text,comment text,created_by uuid,created_by_email text,created_at timestamptz
);
create table leader_private.leader_command_receipts(
  id uuid primary key default gen_random_uuid(),action text not null,idempotency_key text not null,
  request_id uuid not null,request_hash text not null,actor_id uuid not null,state text not null,
  response jsonb,created_at timestamptz,updated_at timestamptz,completed_at timestamptz,
  unique(action,idempotency_key),unique(action,request_id)
);
create function leader_private.leader_actor_has_crm_action(uuid,text) returns boolean language sql as
$$ select exists(select 1 from public.leader_user_profiles where user_id=$1 and is_active=true and role in ('owner','admin','manager') and $2 in ('offers.write','offers.read','offers.transition')) $$;
create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql stable as
$$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
create function leader_private.leader_has_access() returns boolean language sql stable security definer set search_path='' as
$$ select exists(select 1 from public.leader_user_profiles where user_id=auth.uid() and is_active) $$;
create function leader_private.leader_has_crm_action(text) returns boolean language sql stable security definer set search_path='' as
$$ select leader_private.leader_actor_has_crm_action(auth.uid(),$1) $$;
grant usage on schema public,leader_private,extensions to service_role;
grant select,insert,update,delete on all tables in schema public to service_role;
grant select,insert,update on leader_private.leader_command_receipts to service_role;
grant execute on function leader_private.leader_actor_has_crm_action(uuid,text) to service_role;
grant usage on schema public,auth,leader_private to anon,authenticated,service_role;
grant all on public.leader_commercial_offers to anon,authenticated;
grant update(title) on public.leader_commercial_offers to authenticated;
grant select(full_text),insert(title),references(id) on public.leader_commercial_offers to anon;
alter table public.leader_commercial_offers enable row level security;
create policy synthetic_legacy_offer_access on public.leader_commercial_offers for all to authenticated
using(leader_private.leader_has_access()) with check(leader_private.leader_has_access());
-- A failure in the event append must roll back the preceding offer UPDATE.
create function leader_private.leader_test_offer_event_failure() returns trigger language plpgsql as $$
begin if current_setting('leader.test_event_failure',true)='on' then raise exception 'synthetic_event_failure'; end if; return new; end $$;
create trigger synthetic_offer_event_failure before insert on public.leader_commercial_offer_events
for each row execute function leader_private.leader_test_offer_event_failure();
"""
target = root / 'build/offer-edit-rpc-test.sql'
target.parent.mkdir(exist_ok=True)
target.write_text(prefix + (root / 'supabase/migrations/20261031180000_leader_offer_editor_v1.sql').read_text()
                  + (root / 'supabase/staging-tests/20261031_offer_editor_acceptance.sql').read_text() + '\nrollback;\n')
print('Generated actual offer editor migration and transactional behavioral acceptance for leader_offer_editor_test.')
