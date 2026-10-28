"""Actual adjustment SQL against an isolated representation of existing tables."""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
prefix="""
create schema extensions;create extension pgcrypto with schema extensions;create schema leader_private;
create role anon;create role authenticated;create role service_role bypassrls;
create table public.leader_user_profiles(user_id uuid primary key,role text,is_active boolean,full_name text);
create table public.leader_clients(id uuid primary key,owner_id uuid,name text);
create table public.leader_orders(id uuid primary key,owner_id uuid,client_id uuid references public.leader_clients(id),order_number bigint,project_name text,client_total numeric,prepayment numeric default 0,balance numeric default 0,payment_status text,is_archived boolean default false,data jsonb default '{}',created_at timestamptz default now(),updated_at timestamptz default now());
create table public.leader_payments(id uuid primary key default gen_random_uuid(),owner_id uuid,order_id uuid references public.leader_orders(id),amount numeric,method text,payment_date date,comment text,payment_status text,payment_type text,is_confirmed boolean,created_by uuid,finance_category text,related_entity_type text,related_entity_id uuid,created_at timestamptz default now(),updated_at timestamptz default now());
create table public.leader_expenses(id uuid primary key default gen_random_uuid(),owner_id uuid,order_id uuid references public.leader_orders(id),amount numeric,expense_date timestamptz,category text,status text,updated_at timestamptz default now());
grant select,insert,update on public.leader_orders,public.leader_payments,public.leader_expenses to service_role;
grant select on public.leader_user_profiles,public.leader_clients to service_role;
grant usage on schema leader_private,extensions to service_role;
create function leader_private.leader_actor_has_crm_action(uuid,text) returns boolean language sql as $$ select exists(select from public.leader_user_profiles where user_id=$1 and is_active and role='owner') $$;
create function public.leader_write_finance_rpc(jsonb) returns jsonb language sql as $$ select '{}'::jsonb $$;
"""
target=root/'build/finance-adjustment-rpc-test.sql';target.parent.mkdir(exist_ok=True)
target.write_text(prefix+(root/'supabase/production-candidates/leader_finance_adjustments_v1.sql').read_text()+(root/'supabase/staging-tests/finance_adjustments_acceptance.sql').read_text())
print('Generated real refund/allocation/replay/expense invalidation SQL proof.')
