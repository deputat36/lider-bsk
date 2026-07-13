-- STAGING ONLY.
-- Target project: lider-bsk-staging / otulfnouybahfnsycxqn.
-- Never apply this file to production.

create schema if not exists leader_staging;

revoke all on schema leader_staging from public;
revoke all on schema leader_staging from anon;
revoke all on schema leader_staging from authenticated;
grant usage on schema leader_staging to service_role;

create table if not exists leader_staging.environment_guard (
  singleton boolean primary key default true check (singleton),
  project_ref text not null unique,
  environment_name text not null check (environment_name = 'staging'),
  repository text not null check (repository = 'deputat36/lider-bsk'),
  created_at timestamptz not null default now()
);

alter table leader_staging.environment_guard enable row level security;

revoke all on table leader_staging.environment_guard from public;
revoke all on table leader_staging.environment_guard from anon;
revoke all on table leader_staging.environment_guard from authenticated;
grant select on table leader_staging.environment_guard to service_role;

insert into leader_staging.environment_guard (
  singleton,
  project_ref,
  environment_name,
  repository
)
values (
  true,
  'otulfnouybahfnsycxqn',
  'staging',
  'deputat36/lider-bsk'
)
on conflict (singleton) do update
set project_ref = excluded.project_ref,
    environment_name = excluded.environment_name,
    repository = excluded.repository;

comment on schema leader_staging is
  'РА Лидер: технический guard изолированного staging-проекта. Не переносить в production.';

comment on table leader_staging.environment_guard is
  'Fail-closed marker: staging-only migrations must verify this row before any business DDL.';
