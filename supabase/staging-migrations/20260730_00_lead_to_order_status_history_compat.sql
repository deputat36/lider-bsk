-- STAGING ONLY prerequisite for the lead -> order acceptance harness.
-- Target: lider-bsk-staging / otulfnouybahfnsycxqn. Never apply to production.

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

  if to_regclass('public.leader_orders') is null then
    raise exception 'staging_order_status_history_dependency_missing';
  end if;
end $guard$;

create table if not exists public.leader_order_status_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  order_id uuid references public.leader_orders(id) on delete cascade,
  old_status text,
  new_status text not null,
  comment text,
  changed_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  changed_by_email text
);

create index if not exists leader_order_status_history_order_id_idx
  on public.leader_order_status_history(order_id);

alter table public.leader_order_status_history enable row level security;
revoke all on public.leader_order_status_history from anon, authenticated;
grant all on public.leader_order_status_history to service_role;

comment on table public.leader_order_status_history is
  'STAGING compatibility table for synthetic lead-to-order acceptance history only.';

do $verify$
declare
  v_missing text[];
begin
  select array_agg(expected.column_name order by expected.column_name)
  into v_missing
  from (values
    ('id'), ('owner_id'), ('order_id'), ('old_status'), ('new_status'),
    ('comment'), ('changed_by'), ('created_at'), ('changed_by_email')
  ) expected(column_name)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'leader_order_status_history'
      and c.column_name = expected.column_name
  );

  if v_missing is not null then
    raise exception 'staging_order_status_history_columns_missing:%', array_to_string(v_missing, ',');
  end if;

  if not exists (
    select 1
    from pg_constraint con
    where con.conrelid = 'public.leader_order_status_history'::regclass
      and con.contype = 'f'
      and pg_get_constraintdef(con.oid) = 'FOREIGN KEY (order_id) REFERENCES leader_orders(id) ON DELETE CASCADE'
  ) then
    raise exception 'staging_order_status_history_fk_missing';
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'leader_order_status_history'
      and c.relrowsecurity = true
  ) then
    raise exception 'staging_order_status_history_rls_missing';
  end if;

  if has_table_privilege('anon', 'public.leader_order_status_history', 'SELECT')
     or has_table_privilege('authenticated', 'public.leader_order_status_history', 'SELECT')
     or not has_table_privilege('service_role', 'public.leader_order_status_history', 'SELECT, INSERT, UPDATE, DELETE')
  then
    raise exception 'staging_order_status_history_grants_invalid';
  end if;
end $verify$;
