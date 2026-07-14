-- Read-only collector for the isolated design-task staging project.
-- Execute only against project ref otulfnouybahfnsycxqn.

select jsonb_build_object(
  'snapshot_version', 'leader-design-task-staging-post-cleanup-snapshot-v1',
  'project_ref', 'otulfnouybahfnsycxqn',
  'captured_at', now(),
  'counts', jsonb_build_object(
    'auth_users', (select count(*) from auth.users),
    'profiles', (select count(*) from public.leader_user_profiles),
    'leads', (select count(*) from public.leader_leads),
    'orders', (select count(*) from public.leader_orders),
    'needs', (select count(*) from public.leader_lead_needs),
    'production_jobs', (select count(*) from public.leader_production_jobs),
    'design_tasks', (select count(*) from public.leader_design_tasks),
    'design_events', (select count(*) from public.leader_design_task_events),
    'receipts', (select count(*) from leader_private.leader_command_receipts),
    'environment_guard', (select count(*) from leader_staging.environment_guard)
  ),
  'objects', jsonb_build_object(
    'design_rpc_present', to_regprocedure('public.leader_create_design_task_from_order_rpc(jsonb)') is not null,
    'read_helper_present', to_regprocedure('leader_private.leader_has_crm_action(text)') is not null,
    'active_index_present', to_regclass('public.leader_design_tasks_one_active_per_order_uidx') is not null,
    'select_policy_count', (
      select count(*)
      from pg_policies
      where schemaname = 'public'
        and policyname in (
          'leader_orders_design_read_staging',
          'leader_lead_needs_design_read_staging',
          'leader_design_tasks_design_read_staging'
        )
    )
  ),
  'privileges', jsonb_build_object(
    'authenticated_direct_rpc_execute', has_function_privilege(
      'authenticated',
      'public.leader_create_design_task_from_order_rpc(jsonb)',
      'EXECUTE'
    ),
    'authenticated_receipt_select', has_table_privilege(
      'authenticated',
      'leader_private.leader_command_receipts',
      'SELECT'
    ),
    'authenticated_orders_table_select', has_table_privilege(
      'authenticated',
      'public.leader_orders',
      'SELECT'
    ),
    'authenticated_orders_id_select', has_column_privilege(
      'authenticated',
      'public.leader_orders',
      'id',
      'SELECT'
    ),
    'authenticated_orders_client_phone_select', has_column_privilege(
      'authenticated',
      'public.leader_orders',
      'client_phone',
      'SELECT'
    )
  )
) as snapshot;
