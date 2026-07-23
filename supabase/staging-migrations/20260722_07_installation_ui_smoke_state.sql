-- STAGING ONLY.
-- Applied as 20260722203019 / staging_installation_ui_smoke_state_20260722.
-- Temporary state for one authenticated installation UI smoke run.

do $guard$
begin
  if not exists (
    select 1 from leader_staging.environment_guard
    where singleton = true
      and project_ref = 'otulfnouybahfnsycxqn'
      and environment_name = 'staging'
      and repository = 'deputat36/lider-bsk'
  ) then
    raise exception 'staging_environment_guard_failed';
  end if;
end
$guard$;

create table if not exists leader_staging.installation_ui_smoke_runs (
  run_key text primary key,
  auth_user_id uuid not null unique,
  order_id uuid not null unique,
  production_job_id uuid not null unique,
  installation_job_id uuid not null unique,
  state text not null default 'prepared' check (state in ('prepared','cleanup_started')),
  created_at timestamptz not null default now(),
  constraint installation_ui_smoke_run_key_check check (run_key ~ '^[0-9]+:[0-9]+$')
);

alter table leader_staging.installation_ui_smoke_runs enable row level security;
revoke all on table leader_staging.installation_ui_smoke_runs from public, anon, authenticated, service_role;
