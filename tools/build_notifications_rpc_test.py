from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
prefix = """
create schema extensions; create extension pgcrypto with schema extensions;
create schema leader_private; create schema net; create schema cron;
create role anon; create role authenticated; create role service_role bypassrls;
grant usage on schema extensions to service_role;
create table public.leader_user_profiles(user_id uuid primary key,role text,is_active boolean,full_name text);
create table public.leader_leads(id uuid primary key default gen_random_uuid(),name text,status text,assigned_to uuid);
grant select,insert,update on public.leader_leads,public.leader_user_profiles to service_role;
create function leader_private.leader_actor_has_crm_action(uuid,text) returns boolean language sql as
$$ select exists(select 1 from public.leader_user_profiles where user_id=$1 and is_active and role in ('owner','admin','manager')) $$;
create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$ select 1::bigint $$;
create function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint $$;
"""
source = (root / 'supabase/production-candidates/leader_notifications_v1.sql').read_text()
# The isolated PostgreSQL image does not ship pg_net/pg_cron. Only their two IO
# entrypoints above are stubs; the actual tables, RPCs, triggers and grants execute.
source = re.sub(r'^create extension if not exists (?:pg_net|pg_cron);\s*$', '', source, flags=re.M)
target = root / 'build/notifications-rpc-test.sql'
target.parent.mkdir(exist_ok=True)
target.write_text(prefix + source + (root / 'supabase/staging-tests/20261027_notifications_acceptance.sql').read_text())
print('Generated isolated notification RPC proof; network/cron IO is stubbed, actual source SQL retained.')
