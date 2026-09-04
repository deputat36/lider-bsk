-- READ ONLY: production catalog database postflight.
-- Run only after the separately approved RBAC/receipts prerequisite and catalog RPC/helper apply.
-- Expected project ref: ofewxuqfjhamgerwzull.
-- This file must not contain DDL or DML.

SELECT jsonb_build_object(
  'captured_at', clock_timestamp(),
  'objects', jsonb_build_object(
    'role_action_matrix', to_regclass('leader_private.leader_role_action_matrix_v1') IS NOT NULL,
    'command_receipts', to_regclass('leader_private.leader_command_receipts') IS NOT NULL,
    'actor_permission', to_regprocedure('leader_private.leader_actor_has_crm_action(uuid,text)') IS NOT NULL,
    'actor_permission_rpc', to_regprocedure('public.leader_actor_has_crm_action_rpc(uuid,text)') IS NOT NULL,
    'catalog_receipt_helper', to_regprocedure('leader_private.leader_discard_catalog_command_receipt(uuid,uuid)') IS NOT NULL,
    'catalog_manage_rpc', to_regprocedure('public.leader_manage_catalog_rpc(jsonb)') IS NOT NULL
  ),
  'catalog_counts', jsonb_build_object(
    'catalog', (SELECT count(*) FROM public.leader_catalog),
    'price_logs', (SELECT count(*) FROM public.leader_catalog_price_logs),
    'catalog_manage_receipts', (SELECT count(*) FROM leader_private.leader_command_receipts WHERE action = 'catalog.manage'),
    'in_progress_catalog_receipts', (SELECT count(*) FROM leader_private.leader_command_receipts WHERE action = 'catalog.manage' AND state = 'in_progress')
  ),
  'receipt_table_privileges', jsonb_build_object(
    'anon_delete', has_table_privilege('anon','leader_private.leader_command_receipts','DELETE'),
    'authenticated_delete', has_table_privilege('authenticated','leader_private.leader_command_receipts','DELETE'),
    'service_role_delete', has_table_privilege('service_role','leader_private.leader_command_receipts','DELETE')
  )
) AS catalog_production_postflight;

SELECT
  n.nspname AS schema_name,
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  md5(pg_get_functiondef(p.oid)) AS definition_md5,
  octet_length(pg_get_functiondef(p.oid)) AS definition_bytes,
  p.prosecdef AS security_definer,
  coalesce(array_to_string(p.proconfig, ','), '') AS function_config,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE (n.nspname, p.proname) IN (
  ('leader_private', 'leader_actor_has_crm_action'),
  ('leader_private', 'leader_discard_catalog_command_receipt'),
  ('public', 'leader_actor_has_crm_action_rpc'),
  ('public', 'leader_manage_catalog_rpc')
)
ORDER BY n.nspname, p.proname;

SELECT
  role,
  ('catalog.read' = ANY(allowed_actions)) AS catalog_read,
  ('catalog.manage' = ANY(allowed_actions)) AS catalog_manage,
  contract_version
FROM leader_private.leader_role_action_matrix_v1
ORDER BY role;

SELECT jsonb_build_object(
  'owner_manage', EXISTS (
    SELECT 1 FROM leader_private.leader_role_action_matrix_v1
    WHERE role = 'owner' AND 'catalog.manage' = ANY(allowed_actions)
  ),
  'admin_manage', EXISTS (
    SELECT 1 FROM leader_private.leader_role_action_matrix_v1
    WHERE role = 'admin' AND 'catalog.manage' = ANY(allowed_actions)
  ),
  'manager_manage', EXISTS (
    SELECT 1 FROM leader_private.leader_role_action_matrix_v1
    WHERE role = 'manager' AND 'catalog.manage' = ANY(allowed_actions)
  ),
  'business_rpc_security_invoker', NOT (
    SELECT p.prosecdef
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='leader_manage_catalog_rpc'
      AND pg_get_function_identity_arguments(p.oid)='p_payload jsonb'
  ),
  'private_helper_security_definer', (
    SELECT p.prosecdef
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='leader_private' AND p.proname='leader_discard_catalog_command_receipt'
      AND pg_get_function_identity_arguments(p.oid)='p_receipt_id uuid, p_actor_id uuid'
  ),
  'business_rpc_authenticated_execute', has_function_privilege('authenticated','public.leader_manage_catalog_rpc(jsonb)','EXECUTE'),
  'business_rpc_service_execute', has_function_privilege('service_role','public.leader_manage_catalog_rpc(jsonb)','EXECUTE'),
  'helper_authenticated_execute', has_function_privilege('authenticated','leader_private.leader_discard_catalog_command_receipt(uuid,uuid)','EXECUTE'),
  'helper_service_execute', has_function_privilege('service_role','leader_private.leader_discard_catalog_command_receipt(uuid,uuid)','EXECUTE'),
  'service_receipt_table_delete', has_table_privilege('service_role','leader_private.leader_command_receipts','DELETE')
) AS catalog_security_postflight;
