-- STAGING ONLY integration test.
-- Target: lider-bsk-staging / otulfnouybahfnsycxqn.
-- Uses synthetic rows inside one transaction and finishes with ROLLBACK.

begin;
set local statement_timeout = '30s';
set local lock_timeout = '5s';

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

do $acl_contract$
declare
  policy_count integer;
begin
  if not has_schema_privilege('authenticated', 'leader_private', 'USAGE') then
    raise exception 'authenticated_private_schema_usage_missing';
  end if;
  if has_schema_privilege('anon', 'leader_private', 'USAGE') then
    raise exception 'anon_private_schema_usage_leaked';
  end if;
  if not has_function_privilege('authenticated', 'leader_private.leader_has_crm_action(text)', 'EXECUTE') then
    raise exception 'authenticated_helper_execute_missing';
  end if;
  if has_function_privilege('anon', 'leader_private.leader_has_crm_action(text)', 'EXECUTE') then
    raise exception 'anon_helper_execute_leaked';
  end if;
  if has_function_privilege('authenticated', 'public.leader_create_design_task_from_order_rpc(jsonb)', 'EXECUTE') then
    raise exception 'authenticated_direct_rpc_execute_leaked';
  end if;
  if has_table_privilege('authenticated', 'leader_private.leader_command_receipts', 'SELECT') then
    raise exception 'authenticated_receipt_select_leaked';
  end if;

  if has_table_privilege('authenticated', 'public.leader_orders', 'SELECT')
     or has_table_privilege('authenticated', 'public.leader_lead_needs', 'SELECT')
     or has_table_privilege('authenticated', 'public.leader_design_tasks', 'SELECT') then
    raise exception 'table_level_select_must_remain_false';
  end if;

  if not has_column_privilege('authenticated', 'public.leader_orders', 'id', 'SELECT')
     or not has_column_privilege('authenticated', 'public.leader_orders', 'updated_at', 'SELECT')
     or not has_column_privilege('authenticated', 'public.leader_lead_needs', 'need_design', 'SELECT')
     or not has_column_privilege('authenticated', 'public.leader_lead_needs', 'created_at', 'SELECT')
     or not has_column_privilege('authenticated', 'public.leader_design_tasks', 'task_status', 'SELECT')
     or not has_column_privilege('authenticated', 'public.leader_design_tasks', 'created_at', 'SELECT') then
    raise exception 'safe_column_select_missing';
  end if;

  if has_column_privilege('authenticated', 'public.leader_orders', 'client_phone', 'SELECT')
     or has_column_privilege('authenticated', 'public.leader_orders', 'profit', 'SELECT')
     or has_column_privilege('authenticated', 'public.leader_orders', 'internal_comment', 'SELECT')
     or has_column_privilege('authenticated', 'public.leader_lead_needs', 'description', 'SELECT')
     or has_column_privilege('authenticated', 'public.leader_lead_needs', 'missing_fields', 'SELECT')
     or has_column_privilege('authenticated', 'public.leader_design_tasks', 'client_phone', 'SELECT')
     or has_column_privilege('authenticated', 'public.leader_design_tasks', 'task_text', 'SELECT')
     or has_column_privilege('authenticated', 'public.leader_design_tasks', 'internal_comment', 'SELECT') then
    raise exception 'forbidden_column_select_leaked';
  end if;

  if has_table_privilege('authenticated', 'public.leader_orders', 'INSERT')
     or has_table_privilege('authenticated', 'public.leader_orders', 'UPDATE')
     or has_table_privilege('authenticated', 'public.leader_orders', 'DELETE')
     or has_table_privilege('authenticated', 'public.leader_lead_needs', 'INSERT')
     or has_table_privilege('authenticated', 'public.leader_lead_needs', 'UPDATE')
     or has_table_privilege('authenticated', 'public.leader_lead_needs', 'DELETE')
     or has_table_privilege('authenticated', 'public.leader_design_tasks', 'INSERT')
     or has_table_privilege('authenticated', 'public.leader_design_tasks', 'UPDATE')
     or has_table_privilege('authenticated', 'public.leader_design_tasks', 'DELETE') then
    raise exception 'browser_write_privilege_leaked';
  end if;

  select count(*) into policy_count
  from pg_policies
  where schemaname = 'public'
    and (
      (tablename = 'leader_orders' and policyname = 'leader_orders_design_read_staging')
      or (tablename = 'leader_lead_needs' and policyname = 'leader_lead_needs_design_read_staging')
      or (tablename = 'leader_design_tasks' and policyname = 'leader_design_tasks_design_read_staging')
    )
    and cmd = 'SELECT'
    and roles = array['authenticated']::name[];

  if policy_count <> 3 then
    raise exception 'staging_design_read_policy_count:%', policy_count;
  end if;
end
$acl_contract$;

insert into public.leader_user_profiles
  (user_id, email, full_name, role, is_active)
values
  ('10000000-0000-4000-8000-000000000101', 'owner-read@example.invalid', 'Synthetic Owner', 'owner', true),
  ('10000000-0000-4000-8000-000000000102', 'admin-read@example.invalid', 'Synthetic Admin', 'admin', true),
  ('10000000-0000-4000-8000-000000000103', 'manager-read@example.invalid', 'Synthetic Manager', 'manager', true),
  ('10000000-0000-4000-8000-000000000104', 'designer-read@example.invalid', 'Synthetic Designer', 'designer', true),
  ('10000000-0000-4000-8000-000000000105', 'accountant-read@example.invalid', 'Synthetic Accountant', 'accountant', true),
  ('10000000-0000-4000-8000-000000000106', 'installer-read@example.invalid', 'Synthetic Installer', 'installer', true),
  ('10000000-0000-4000-8000-000000000107', 'contractor-read@example.invalid', 'Synthetic Contractor', 'contractor', true),
  ('10000000-0000-4000-8000-000000000108', 'inactive-read@example.invalid', 'Synthetic Inactive', 'manager', false),
  ('10000000-0000-4000-8000-000000000109', 'unknown-read@example.invalid', 'Synthetic Unknown', 'future_role', true);

insert into public.leader_leads (id, status, created_at, updated_at)
values (
  '10000000-0000-4000-8000-000000000201',
  'В работе',
  '2026-07-14 08:00:00+00',
  '2026-07-14 08:00:00+00'
);

insert into public.leader_orders (
  id, owner_id, order_number, lead_id, project_name, client_name, client_phone,
  status, priority, deadline, layout_status, layout_link, payment_status,
  client_total, contractor_cost, profit, prepayment, balance,
  production_status, internal_comment, data, is_archived, created_at, updated_at
) values (
  '10000000-0000-4000-8000-000000000301',
  '10000000-0000-4000-8000-000000000101',
  9401,
  '10000000-0000-4000-8000-000000000201',
  'Synthetic Design Read Order',
  'PRIVATE_CLIENT_NAME_SENTINEL',
  '+70000000000',
  'Новый',
  'Обычный',
  '2026-07-30',
  'Макета нет',
  null,
  'Не оплачено',
  991001,
  991002,
  991003,
  991004,
  991005,
  'Не передано',
  'PRIVATE_ORDER_INTERNAL_SENTINEL',
  '{"private":"PRIVATE_ORDER_DATA_SENTINEL"}'::jsonb,
  false,
  '2026-07-14 08:00:00+00',
  '2026-07-14 08:00:00+00'
);

insert into public.leader_lead_needs (
  id, lead_id, need_type, title, description, structured_data,
  need_design, design_reason, deadline_date, status, completeness_score,
  missing_fields, created_by, created_at, updated_at
) values (
  '10000000-0000-4000-8000-000000000401',
  '10000000-0000-4000-8000-000000000201',
  'Наружная реклама',
  'Synthetic design need',
  'PRIVATE_NEED_DESCRIPTION_SENTINEL',
  '{"private":"PRIVATE_NEED_STRUCTURED_SENTINEL"}'::jsonb,
  true,
  'Нужен макет',
  '2026-07-28',
  'Подтверждено',
  90,
  '["PRIVATE_NEED_MISSING_SENTINEL"]'::jsonb,
  '10000000-0000-4000-8000-000000000101',
  '2026-07-14 08:00:00+00',
  '2026-07-14 08:00:00+00'
);

insert into public.leader_design_tasks (
  id, owner_id, order_id, title, client_name, client_phone,
  task_status, layout_status, priority, designer_name, deadline,
  source, layout_link, reference_link, task_text,
  client_comment, internal_comment, result_comment, created_by,
  created_at, updated_at
) values (
  '10000000-0000-4000-8000-000000000501',
  '10000000-0000-4000-8000-000000000101',
  '10000000-0000-4000-8000-000000000301',
  'PRIVATE_TASK_TITLE_SENTINEL',
  'PRIVATE_TASK_CLIENT_SENTINEL',
  '+71111111111',
  'Новая',
  'Макет не начат',
  'Обычный',
  'Synthetic Designer',
  '2026-07-27 12:00:00+00',
  'crm_v4_server_action',
  'https://example.invalid/layout',
  'https://example.invalid/reference',
  'PRIVATE_TASK_TEXT_SENTINEL',
  'PRIVATE_TASK_CLIENT_COMMENT_SENTINEL',
  'PRIVATE_TASK_INTERNAL_SENTINEL',
  'PRIVATE_TASK_RESULT_SENTINEL',
  '10000000-0000-4000-8000-000000000101',
  '2026-07-14 08:00:00+00',
  '2026-07-14 08:00:00+00'
);

create function pg_temp.assert_design_read_visibility(p_expected integer, p_label text)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  order_count integer;
  need_count integer;
  task_count integer;
begin
  if auth.uid() is null then
    raise exception 'auth_uid_missing:%', p_label;
  end if;

  select count(*) into order_count
  from public.leader_orders
  where id = '10000000-0000-4000-8000-000000000301';

  select count(*) into need_count
  from public.leader_lead_needs
  where id = '10000000-0000-4000-8000-000000000401';

  select count(*) into task_count
  from public.leader_design_tasks
  where id = '10000000-0000-4000-8000-000000000501';

  if order_count <> p_expected or need_count <> p_expected or task_count <> p_expected then
    raise exception 'design_read_visibility_failed:%:%:%:%', p_label, order_count, need_count, task_count;
  end if;

  if p_expected = 1 then
    perform id, order_number, lead_id, project_name, status, priority, deadline,
      layout_status, layout_link, is_archived, updated_at
    from public.leader_orders
    where id = '10000000-0000-4000-8000-000000000301';

    perform id, lead_id, need_type, title, need_design, design_reason,
      deadline_date, status, completeness_score, created_at
    from public.leader_lead_needs
    where id = '10000000-0000-4000-8000-000000000401';

    perform id, order_id, task_status, layout_status, designer_name,
      deadline, layout_link, created_at
    from public.leader_design_tasks
    where id = '10000000-0000-4000-8000-000000000501';
  end if;
end
$function$;

create function pg_temp.assert_browser_write_and_private_read_denied()
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  begin
    perform client_name, client_phone, profit, internal_comment
    from public.leader_orders
    limit 1;
    raise exception 'private_order_columns_unexpectedly_readable';
  exception when insufficient_privilege then null;
  end;

  begin
    perform description, structured_data, missing_fields
    from public.leader_lead_needs
    limit 1;
    raise exception 'private_need_columns_unexpectedly_readable';
  exception when insufficient_privilege then null;
  end;

  begin
    perform client_phone, task_text, internal_comment
    from public.leader_design_tasks
    limit 1;
    raise exception 'private_task_columns_unexpectedly_readable';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.leader_design_tasks (order_id, title)
    values ('10000000-0000-4000-8000-000000000301', 'forbidden');
    raise exception 'browser_insert_unexpectedly_allowed';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.leader_orders
    set status = 'Закрыт'
    where id = '10000000-0000-4000-8000-000000000301';
    raise exception 'browser_update_unexpectedly_allowed';
  exception when insufficient_privilege then null;
  end;

  begin
    delete from public.leader_lead_needs
    where id = '10000000-0000-4000-8000-000000000401';
    raise exception 'browser_delete_unexpectedly_allowed';
  exception when insufficient_privilege then null;
  end;

  begin
    perform * from leader_private.leader_command_receipts limit 1;
    raise exception 'receipt_read_unexpectedly_allowed';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.leader_create_design_task_from_order_rpc('{}'::jsonb);
    raise exception 'direct_design_rpc_unexpectedly_allowed';
  exception when insufficient_privilege then null;
  end;
end
$function$;

-- Canonical positive design.read roles.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000101', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000101","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_design_read_visibility(1, 'owner');
select pg_temp.assert_browser_write_and_private_read_denied();
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000102', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000102","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_design_read_visibility(1, 'admin');
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000103', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000103","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_design_read_visibility(1, 'manager');
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000104', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000104","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_design_read_visibility(1, 'designer');
reset role;

-- Canonical denied and fail-closed roles.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000105', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000105","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_design_read_visibility(0, 'accountant');
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000106', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000106","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_design_read_visibility(0, 'installer');
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000107', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000107","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_design_read_visibility(0, 'contractor');
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000108', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000108","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_design_read_visibility(0, 'inactive_manager');
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000109', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000109","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_design_read_visibility(0, 'unknown_role');
reset role;

-- Missing auth identity fails closed.
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
do $missing_identity$
declare
  visible_rows integer;
begin
  select count(*) into visible_rows from public.leader_orders;
  if visible_rows <> 0 then
    raise exception 'missing_auth_uid_did_not_fail_closed';
  end if;
end
$missing_identity$;
reset role;

-- anon has no read surface at all.
set local role anon;
do $anon_denied$
begin
  begin
    perform id from public.leader_orders limit 1;
    raise exception 'anon_order_read_unexpectedly_allowed';
  exception when insufficient_privilege then null;
  end;
end
$anon_denied$;
reset role;

rollback;
