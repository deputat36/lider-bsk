-- STAGING ONLY. Scoped upgrade of existing commands after PR569.
-- No business rows, Auth/Storage, shared core or table privileges are changed.
DO $guard$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM leader_staging.environment_guard WHERE singleton=true
  AND project_ref='otulfnouybahfnsycxqn' AND environment_name='staging' AND repository='deputat36/lider-bsk')
 THEN RAISE EXCEPTION 'staging_environment_guard_failed'; END IF;
END $guard$;
DO $upgrade$
DECLARE definition text; f record; new_block text;
BEGIN
 -- Only order editors may choose planned prices/costs at creation; operational
 -- workers can omit financial fields. This fresh check runs before receipt replay.
 FOR f IN SELECT * FROM (VALUES
  ('leader_create_production_job_from_order_impl_rpc','a99ac7bd7b6ece6dfc4c85eab7e59c98','production',ARRAY['contractor_cost']),
  ('leader_create_installation_job_from_order_rpc','70f8f92b08c5c4f2e6b7489338bc6209','installation',ARRAY['installer_cost','client_price'])
 ) AS baseline(name,source_md5,kind,fields) LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.'||f.name||'(jsonb)')
   AND md5(prosrc)=f.source_md5 AND NOT prosecdef)
  THEN RAISE EXCEPTION 'operational_price_runtime_drift:%',f.name; END IF;
  definition:=pg_get_functiondef(('public.'||f.name||'(jsonb)')::regprocedure);
  IF position('  v_request_hash := encode(' IN definition)=0 THEN RAISE EXCEPTION 'operational_price_marker_missing:%',f.name; END IF;
  new_block:=format($price$  if v_job_input ?| %L::text[]
     and not leader_private.leader_actor_has_crm_action(v_actor_id, 'orders.update') then
    return leader_private.leader_%s_command_error(v_request_id, 'forbidden', 'orders.update permission is required to set planned prices');
  end if;

$price$,f.fields,f.kind);
  definition:=replace(definition,'  v_request_hash := encode(',new_block||'  v_request_hash := encode(');
  EXECUTE definition;
 END LOOP;
END $upgrade$;
-- Existing service-only EXECUTE and SECURITY INVOKER are retained by CREATE OR REPLACE.
