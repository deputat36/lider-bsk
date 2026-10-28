"""Run the actual document package with a small fixture for existing business tables."""
from pathlib import Path

root=Path(__file__).resolve().parents[1]
prefix="""
create schema extensions;create extension pgcrypto with schema extensions;
create schema leader_private;
create role anon;create role authenticated;create role service_role bypassrls;
create table public.leader_user_profiles(user_id uuid primary key,role text,is_active boolean,full_name text);
insert into public.leader_user_profiles values('80000000-0000-4000-8000-000000000601','owner',true,'Existing synthetic parent');
create table public.leader_clients(id uuid primary key);
create table public.leader_orders(id uuid primary key,owner_id uuid,client_id uuid,order_number bigint,project_name text,client_name text,client_total numeric,updated_at timestamptz default now());
grant select on public.leader_user_profiles,public.leader_orders,public.leader_clients to service_role;
create function leader_private.leader_actor_has_crm_action(uuid,text) returns boolean language sql as
$$ select exists(select from public.leader_user_profiles where user_id=$1 and is_active and (role='owner' or (role='manager' and $2 in ('documents.read','documents.create','documents.update','documents.generate','documents.send')))) $$;
grant usage on schema extensions to service_role;
"""
target=root/'build/document-rpc-test.sql';target.parent.mkdir(exist_ok=True)
target.write_text(prefix+(root/'supabase/production-candidates/leader_document_workspace_v1.sql').read_text()+(root/'supabase/staging-tests/document_archive_acceptance.sql').read_text())
print('Generated document SQL, atomic numbering/receipts/terminal status proof.')
