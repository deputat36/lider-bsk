-- STAGING ONLY.
-- Target project: lider-bsk-staging / otulfnouybahfnsycxqn.
-- Applied migration name: staging_orders_edge_projection_compat_20260716.
-- Never apply this file to production.

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

  if to_regclass('public.leader_orders') is null then
    raise exception 'leader_orders_missing';
  end if;
end
$guard$;

alter table public.leader_orders
  add column if not exists client_id uuid,
  add column if not exists source text,
  add column if not exists layout_comment text,
  add column if not exists current_stage text,
  add column if not exists next_action text,
  add column if not exists progress_percent integer not null default 0,
  add column if not exists installation_status text;

comment on column public.leader_orders.client_id is
  'STAGING compatibility field for the current leader-crm-orders source projection.';
comment on column public.leader_orders.source is
  'STAGING compatibility field for the current leader-crm-orders source projection.';
comment on column public.leader_orders.layout_comment is
  'STAGING compatibility field for the current leader-crm-orders update contract.';
comment on column public.leader_orders.current_stage is
  'STAGING compatibility field for the manager order projection.';
comment on column public.leader_orders.next_action is
  'STAGING compatibility field for the manager order projection.';
comment on column public.leader_orders.progress_percent is
  'STAGING compatibility field for the manager order projection.';
comment on column public.leader_orders.installation_status is
  'STAGING compatibility field for the manager order projection.';

do $verify$
declare
  missing text[];
begin
  select array_agg(expected.column_name order by expected.column_name)
  into missing
  from (
    values
      ('client_id'),
      ('source'),
      ('layout_comment'),
      ('current_stage'),
      ('next_action'),
      ('progress_percent'),
      ('installation_status')
  ) as expected(column_name)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'leader_orders'
      and c.column_name = expected.column_name
  );

  if missing is not null then
    raise exception 'orders_edge_projection_columns_missing:%', array_to_string(missing, ',');
  end if;
end
$verify$;
