-- READ ONLY: production installation rollout preflight.
-- Expected project ref: ofewxuqfjhamgerwzull.

SELECT jsonb_build_object(
  'captured_at', clock_timestamp(),
  'tables', jsonb_build_object(
    'profiles', to_regclass('public.leader_user_profiles') IS NOT NULL,
    'orders', to_regclass('public.leader_orders') IS NOT NULL,
    'production_jobs', to_regclass('public.leader_production_jobs') IS NOT NULL,
    'installation_jobs', to_regclass('public.leader_installation_jobs') IS NOT NULL,
    'installation_items', to_regclass('public.leader_installation_job_items') IS NOT NULL,
    'installation_events', to_regclass('public.leader_installation_events') IS NOT NULL,
    'installation_comments', to_regclass('public.leader_installation_comments') IS NOT NULL,
    'role_action_matrix', to_regclass('leader_private.leader_role_action_matrix_v1') IS NOT NULL,
    'command_receipts', to_regclass('leader_private.leader_command_receipts') IS NOT NULL
  ),
  'functions', jsonb_build_object(
    'actor_permission', to_regprocedure('leader_private.leader_actor_has_crm_action(uuid,text)') IS NOT NULL,
    'actor_permission_rpc', to_regprocedure('public.leader_actor_has_crm_action_rpc(uuid,text)') IS NOT NULL,
    'installation_read', to_regprocedure('public.leader_read_installation_job_rpc(uuid,uuid)') IS NOT NULL,
    'installation_update', to_regprocedure('public.leader_update_installation_job_rpc(jsonb)') IS NOT NULL
  ),
  'row_counts', jsonb_build_object(
    'orders', (SELECT count(*) FROM public.leader_orders),
    'installation_jobs', (SELECT count(*) FROM public.leader_installation_jobs),
    'installation_items', (SELECT count(*) FROM public.leader_installation_job_items),
    'installation_events', (SELECT count(*) FROM public.leader_installation_events),
    'installation_comments', (SELECT count(*) FROM public.leader_installation_comments)
  ),
  'dependencies', jsonb_build_object(
    'leader_private_schema', EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'leader_private'),
    'pgcrypto_digest', to_regprocedure('extensions.digest(bytea,text)') IS NOT NULL,
    'order_required_columns', (
      SELECT count(*) = 9
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'leader_orders'
        AND column_name IN (
          'installation_status','installation_address','installation_scheduled_at',
          'installation_completed_at','installer_name','installer_phone',
          'current_stage','stage_updated_at','updated_at'
        )
    ),
    'job_required_columns', (
      SELECT count(*) = 11
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'leader_installation_jobs'
        AND column_name IN (
          'order_id','title','install_status','installer_name','installer_phone',
          'address','scheduled_at','started_at','completed_at','updated_at','updated_by'
        )
    )
  )
) AS installation_production_preflight;

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
  ('public', 'leader_actor_has_crm_action_rpc'),
  ('public', 'leader_read_installation_job_rpc'),
  ('public', 'leader_update_installation_job_rpc')
)
ORDER BY n.nspname, p.proname;
