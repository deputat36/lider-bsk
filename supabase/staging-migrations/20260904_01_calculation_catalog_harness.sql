-- STAGING ONLY.
-- Target project: lider-bsk-staging / otulfnouybahfnsycxqn.
-- Purpose: make catalog-backed calculations testable in staging without copying production data.

do $guard$
begin
  if not exists (
    select 1
    from leader_staging.environment_guard
    where singleton = true
      and project_ref = 'otulfnouybahfnsycxqn'
      and environment_name = 'staging'
      and repository = 'deputat36/lider-bsk'
  ) then
    raise exception 'staging_environment_guard_failed';
  end if;

  if to_regclass('public.leader_lead_calculation_items') is null
     or to_regclass('public.leader_lead_calculations') is null
     or to_regprocedure('leader_private.leader_has_access()') is null then
    raise exception 'calculation_catalog_requires_staging_calculation_harness';
  end if;
end
$guard$;

create table if not exists public.leader_catalog (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  category text not null,
  name text not null,
  unit text not null,
  contractor_price numeric not null default 0,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  description text,
  item_type text not null default 'Изготовление',
  markup_percent numeric not null default 70,
  min_client_price numeric not null default 0,
  default_client_price numeric,
  calculation_mode text not null default 'markup',
  settings jsonb not null default '{}'::jsonb,
  constraint leader_catalog_owner_id_name_key unique (owner_id, name)
);

create index if not exists idx_leader_catalog_owner
  on public.leader_catalog (owner_id);
create index if not exists leader_catalog_active_idx
  on public.leader_catalog (is_active);
create index if not exists leader_catalog_category_idx
  on public.leader_catalog (category);
create index if not exists leader_catalog_sort_name_idx
  on public.leader_catalog (sort_order, name);

alter table public.leader_catalog enable row level security;

revoke all on table public.leader_catalog from public, anon, authenticated;
grant select on table public.leader_catalog to authenticated;
grant select, insert, update, delete on table public.leader_catalog to service_role;

drop policy if exists leader_catalog_select_active on public.leader_catalog;
create policy leader_catalog_select_active
on public.leader_catalog
for select
to authenticated
using (leader_private.leader_has_access());

do $fk$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leader_lead_calculation_items_catalog_id_fkey'
      and conrelid = 'public.leader_lead_calculation_items'::regclass
  ) then
    alter table public.leader_lead_calculation_items
      add constraint leader_lead_calculation_items_catalog_id_fkey
      foreign key (catalog_id)
      references public.leader_catalog(id)
      on delete set null;
  end if;
end
$fk$;

create index if not exists leader_lead_calculation_items_catalog_id_idx
  on public.leader_lead_calculation_items (catalog_id);
