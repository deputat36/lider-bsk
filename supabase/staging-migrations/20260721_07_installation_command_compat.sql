-- STAGING ONLY.
-- Reproducible source for applied migration
-- 20260721195259 / staging_installation_command_compat_20260721.
-- This file records the observed post-migration state; it is not applied by GitHub.

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
     or to_regclass('public.leader_installation_jobs') is null
     or to_regclass('public.leader_installation_job_items') is null
     or to_regclass('public.leader_installation_events') is null then
    raise exception 'installation_compat_requires_schema';
  end if;
end
$guard$;

alter table public.leader_installation_jobs
  drop constraint if exists leader_installation_jobs_order_id_fkey;
alter table public.leader_installation_jobs
  add constraint leader_installation_jobs_order_id_fkey
  foreign key (order_id) references public.leader_orders(id) on delete set null;

alter table public.leader_installation_job_items
  drop constraint if exists leader_installation_job_items_order_id_fkey;
alter table public.leader_installation_job_items
  add constraint leader_installation_job_items_order_id_fkey
  foreign key (order_id) references public.leader_orders(id) on delete set null;

alter table public.leader_installation_events
  drop constraint if exists leader_installation_events_order_id_fkey;
alter table public.leader_installation_events
  add constraint leader_installation_events_order_id_fkey
  foreign key (order_id) references public.leader_orders(id) on delete set null;

create index if not exists leader_installation_events_order_id_idx
  on public.leader_installation_events (order_id);
