-- READ ONLY: production catalog rollout preflight.
-- Expected project ref: ofewxuqfjhamgerwzull.
-- This file must not contain DDL or DML.

SELECT jsonb_build_object(
  'captured_at', clock_timestamp(),
  'tables', jsonb_build_object(
    'profiles', to_regclass('public.leader_user_profiles') IS NOT NULL,
    'catalog', to_regclass('public.leader_catalog') IS NOT NULL,
    'catalog_price_logs', to_regclass('public.leader_catalog_price_logs') IS NOT NULL,
    'role_action_matrix', to_regclass('leader_private.leader_role_action_matrix_v1') IS NOT NULL,
    'command_receipts', to_regclass('leader_private.leader_command_receipts') IS NOT NULL
  ),
  'functions', jsonb_build_object(
    'actor_permission', to_regprocedure('leader_private.leader_actor_has_crm_action(uuid,text)') IS NOT NULL,
    'actor_permission_rpc', to_regprocedure('public.leader_actor_has_crm_action_rpc(uuid,text)') IS NOT NULL,
    'catalog_receipt_helper', to_regprocedure('leader_private.leader_discard_catalog_command_receipt(uuid,uuid)') IS NOT NULL,
    'catalog_manage_rpc', to_regprocedure('public.leader_manage_catalog_rpc(jsonb)') IS NOT NULL
  ),
  'row_counts', jsonb_build_object(
    'profiles', (SELECT count(*) FROM public.leader_user_profiles),
    'catalog', (SELECT count(*) FROM public.leader_catalog),
    'catalog_price_logs', (SELECT count(*) FROM public.leader_catalog_price_logs)
  ),
  'roles', (
    SELECT coalesce(jsonb_agg(jsonb_build_object('role', role_name, 'count', role_count) ORDER BY role_name), '[]'::jsonb)
    FROM (
      SELECT lower(btrim(coalesce(role, ''))) AS role_name, count(*) AS role_count
      FROM public.leader_user_profiles
      GROUP BY 1
    ) roles
  ),
  'dependencies', jsonb_build_object(
    'leader_private_schema', EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'leader_private'),
    'pgcrypto_digest', to_regprocedure('extensions.digest(bytea,text)') IS NOT NULL,
    'staging_guard_absent', to_regclass('leader_staging.environment_guard') IS NULL,
    'catalog_required_columns', (
      SELECT count(*) = 17
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'leader_catalog'
        AND column_name IN (
          'id','owner_id','category','name','unit','contractor_price','is_active','sort_order',
          'created_at','updated_at','description','item_type','markup_percent','min_client_price',
          'default_client_price','calculation_mode','settings'
        )
    ),
    'price_log_required_columns', (
      SELECT count(*) = 21
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'leader_catalog_price_logs'
        AND column_name IN (
          'id','catalog_id','owner_id','changed_by','changed_by_email','change_type','reason',
          'old_contractor_price','new_contractor_price','old_markup_percent','new_markup_percent',
          'old_min_client_price','new_min_client_price','old_default_client_price','new_default_client_price',
          'old_calculation_mode','new_calculation_mode','old_is_active','new_is_active','old_values','new_values'
        )
    )
  ),
  'rollout_gate', jsonb_build_object(
    'rbac_receipts_prerequisite_ready',
      to_regclass('leader_private.leader_role_action_matrix_v1') IS NOT NULL
      AND to_regclass('leader_private.leader_command_receipts') IS NOT NULL
      AND to_regprocedure('leader_private.leader_actor_has_crm_action(uuid,text)') IS NOT NULL
      AND to_regprocedure('public.leader_actor_has_crm_action_rpc(uuid,text)') IS NOT NULL,
    'catalog_rpc_not_installed', to_regprocedure('public.leader_manage_catalog_rpc(jsonb)') IS NULL,
    'catalog_helper_not_installed', to_regprocedure('leader_private.leader_discard_catalog_command_receipt(uuid,uuid)') IS NULL
  )
) AS catalog_production_preflight;

SELECT
  role,
  ('catalog.read' = ANY(allowed_actions)) AS catalog_read,
  ('catalog.manage' = ANY(allowed_actions)) AS catalog_manage,
  contract_version
FROM leader_private.leader_role_action_matrix_v1
WHERE to_regclass('leader_private.leader_role_action_matrix_v1') IS NOT NULL
ORDER BY role;
