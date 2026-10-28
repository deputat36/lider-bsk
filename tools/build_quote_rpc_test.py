"""Exercise the actual production package on an isolated PostgreSQL database."""
from pathlib import Path
from build_quote_production_package import build

root = Path(__file__).resolve().parents[1]
prefix = """
create schema leader_private;
create role anon; create role authenticated; create role service_role bypassrls;
create table public.leader_user_profiles(user_id uuid primary key,role text,is_active boolean,full_name text);
create table public.leader_leads(id uuid primary key,name text);
create table public.leader_lead_needs(id uuid primary key,lead_id uuid,title text);
grant select on public.leader_user_profiles,public.leader_leads,public.leader_lead_needs to service_role;
create function leader_private.leader_actor_has_crm_action(uuid,text) returns boolean language sql as
$$ select exists(select 1 from public.leader_user_profiles where user_id=$1 and is_active and
 ((role in ('owner','admin','manager') and $2 in ('calculations.write','needs.read')) or (role='contractor' and $2='production.write'))) $$;
"""
target = root / 'build/quote-rpc-test.sql'
target.parent.mkdir(exist_ok=True)
target.write_text(prefix + build() + (root / 'supabase/staging-tests/20261022_quote_workspace_recovery.sql').read_text())
print('Generated actual quote package and transactional acceptance; only existing RBAC is represented by a fixture.')
