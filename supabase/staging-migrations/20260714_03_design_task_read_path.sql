-- STAGING ONLY.
-- Target project: lider-bsk-staging / otulfnouybahfnsycxqn.
-- Depends on the isolated design-task harness and environment guard.
-- This migration must never be applied to production.

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
end
$guard$;

-- The helper is deliberately kept outside exposed API schemas. It accepts no
-- browser-supplied user id and resolves identity only through auth.uid().
create or replace function leader_private.leader_has_crm_action(p_action text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when p_action = 'design.read' then exists (
      select 1
      from public.leader_user_profiles as profile
      where profile.user_id = (select auth.uid())
        and profile.is_active = true
        and lower(btrim(coalesce(profile.role, ''))) = any (
          array['owner', 'admin', 'manager', 'designer']::text[]
        )
    )
    else false
  end;
$function$;

comment on function leader_private.leader_has_crm_action(text) is
  'Staging-only boolean authorization helper. Uses auth.uid(), active leader_user_profiles and the canonical design.read role set.';

revoke all on function leader_private.leader_has_crm_action(text) from public;
revoke all on function leader_private.leader_has_crm_action(text) from anon;
revoke all on function leader_private.leader_has_crm_action(text) from authenticated;
grant execute on function leader_private.leader_has_crm_action(text) to authenticated;
grant execute on function leader_private.leader_has_crm_action(text) to service_role;

-- Schema USAGE is needed for the policy-bound helper. No table privileges are
-- granted in leader_private and the schema is not exposed by the Data API.
revoke all on schema leader_private from public;
revoke all on schema leader_private from anon;
grant usage on schema leader_private to authenticated;
grant usage on schema leader_private to service_role;
revoke all on table leader_private.leader_command_receipts from anon;
revoke all on table leader_private.leader_command_receipts from authenticated;

-- Remove any inherited or previous browser ACL before applying the exact
-- column projections below. Column-level privileges are revoked explicitly.
revoke all privileges on table public.leader_orders from anon;
revoke all privileges on table public.leader_orders from authenticated;
revoke all privileges on table public.leader_lead_needs from anon;
revoke all privileges on table public.leader_lead_needs from authenticated;
revoke all privileges on table public.leader_design_tasks from anon;
revoke all privileges on table public.leader_design_tasks from authenticated;

do $column_acl$
declare
  target_table text;
  column_list text;
begin
  foreach target_table in array array[
    'leader_orders',
    'leader_lead_needs',
    'leader_design_tasks'
  ]
  loop
    select string_agg(format('%I', column_name), ', ' order by ordinal_position)
      into column_list
    from information_schema.columns
    where table_schema = 'public'
      and table_name = target_table;

    if column_list is null then
      raise exception 'staging_read_path_table_missing:%', target_table;
    end if;

    execute format(
      'revoke select (%s) on table public.%I from anon',
      column_list,
      target_table
    );
    execute format(
      'revoke select (%s) on table public.%I from authenticated',
      column_list,
      target_table
    );
  end loop;
end
$column_acl$;

-- Exact projections consumed by design-task-draft-preview-v1.js.
grant select (
  id,
  order_number,
  lead_id,
  project_name,
  status,
  priority,
  deadline,
  layout_status,
  layout_link,
  is_archived,
  updated_at
) on table public.leader_orders to authenticated;

grant select (
  id,
  lead_id,
  need_type,
  title,
  need_design,
  design_reason,
  deadline_date,
  status,
  completeness_score,
  created_at
) on table public.leader_lead_needs to authenticated;

grant select (
  id,
  order_id,
  task_status,
  layout_status,
  designer_name,
  deadline,
  layout_link,
  created_at
) on table public.leader_design_tasks to authenticated;

alter table public.leader_orders enable row level security;
alter table public.leader_lead_needs enable row level security;
alter table public.leader_design_tasks enable row level security;

drop policy if exists leader_orders_design_read_staging on public.leader_orders;
create policy leader_orders_design_read_staging
on public.leader_orders
for select
to authenticated
using ((select leader_private.leader_has_crm_action('design.read')));

drop policy if exists leader_lead_needs_design_read_staging on public.leader_lead_needs;
create policy leader_lead_needs_design_read_staging
on public.leader_lead_needs
for select
to authenticated
using ((select leader_private.leader_has_crm_action('design.read')));

drop policy if exists leader_design_tasks_design_read_staging on public.leader_design_tasks;
create policy leader_design_tasks_design_read_staging
on public.leader_design_tasks
for select
to authenticated
using ((select leader_private.leader_has_crm_action('design.read')));

-- Direct mutation and direct design RPC execution remain server-only.
revoke insert, update, delete, truncate, references, trigger
  on table public.leader_orders from authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.leader_lead_needs from authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.leader_design_tasks from authenticated;
revoke execute on function public.leader_create_design_task_from_order_rpc(jsonb)
  from public, anon, authenticated;
grant execute on function public.leader_create_design_task_from_order_rpc(jsonb)
  to service_role;
