-- STAGING ONLY.
-- Target project: lider-bsk-staging / otulfnouybahfnsycxqn.
-- Production-compatible synthetic installation schema. Does not contain production data.

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

  if to_regclass('public.leader_orders') is null
     or to_regclass('public.leader_production_jobs') is null
     or to_regclass('public.leader_user_profiles') is null then
    raise exception 'installation_schema_requires_staging_crm_harness';
  end if;
end
$guard$;

alter table public.leader_orders
  add column if not exists installation_address text,
  add column if not exists installation_scheduled_at timestamptz,
  add column if not exists installation_completed_at timestamptz,
  add column if not exists installer_name text,
  add column if not exists installer_phone text;

create table if not exists public.leader_installation_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid default auth.uid(),
  order_id uuid,
  production_job_id uuid,
  title text not null,
  client_name text,
  client_phone text,
  install_status text not null default 'Нужно назначить',
  priority text not null default 'Обычный',
  installer_name text,
  installer_phone text,
  address text,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  accepted_at timestamptz,
  installer_cost numeric not null default 0,
  client_price numeric not null default 0,
  technical_task text,
  tools_required text,
  client_comment text,
  installer_comment text,
  internal_comment text,
  result_comment text,
  before_photo_url text,
  after_photo_url text,
  created_by uuid default auth.uid(),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leader_installation_jobs_order_id_fkey
    foreign key (order_id) references public.leader_orders(id) on delete set null,
  constraint leader_installation_jobs_production_job_id_fkey
    foreign key (production_job_id) references public.leader_production_jobs(id) on delete set null
);

create table if not exists public.leader_installation_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  order_id uuid,
  event_type text not null default 'status',
  old_status text,
  new_status text,
  body text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint leader_installation_events_job_id_fkey
    foreign key (job_id) references public.leader_installation_jobs(id) on delete cascade,
  constraint leader_installation_events_order_id_fkey
    foreign key (order_id) references public.leader_orders(id) on delete set null
);

create table if not exists public.leader_installation_comments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  owner_id uuid default auth.uid(),
  comment_type text not null default 'internal',
  body text not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint leader_installation_comments_job_id_fkey
    foreign key (job_id) references public.leader_installation_jobs(id) on delete cascade
);

create index if not exists leader_installation_jobs_order_id_idx
  on public.leader_installation_jobs (order_id);
create index if not exists leader_installation_jobs_production_job_id_idx
  on public.leader_installation_jobs (production_job_id);
create index if not exists leader_installation_jobs_scheduled_at_idx
  on public.leader_installation_jobs (scheduled_at);
create index if not exists leader_installation_jobs_status_idx
  on public.leader_installation_jobs (install_status);
create index if not exists leader_installation_events_job_idx
  on public.leader_installation_events (job_id);
create index if not exists leader_installation_events_order_id_idx
  on public.leader_installation_events (order_id);
create index if not exists leader_installation_comments_job_idx
  on public.leader_installation_comments (job_id);

alter table public.leader_installation_jobs enable row level security;
alter table public.leader_installation_events enable row level security;
alter table public.leader_installation_comments enable row level security;

revoke all on table public.leader_installation_jobs from public, anon, authenticated;
revoke all on table public.leader_installation_events from public, anon, authenticated;
revoke all on table public.leader_installation_comments from public, anon, authenticated;

grant select, insert, update on table public.leader_installation_jobs to service_role;
grant select, insert on table public.leader_installation_events to service_role;
grant select, insert on table public.leader_installation_comments to service_role;
