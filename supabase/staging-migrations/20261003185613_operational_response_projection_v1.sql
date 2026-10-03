-- STAGING ONLY: minimal command response, including historical receipt replay.
DO $guard$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM leader_staging.environment_guard WHERE singleton=true
  AND project_ref='otulfnouybahfnsycxqn' AND environment_name='staging' AND repository='deputat36/lider-bsk')
 THEN RAISE EXCEPTION 'staging_environment_guard_failed'; END IF;
END $guard$;
DO $upgrade$
DECLARE f record; definition text; mask text;
BEGIN
 FOR f IN SELECT * FROM (VALUES
  ('leader_create_production_job_from_order_impl_rpc','32f3098d85bf4dfde08e6763328c2fa8'),
  ('leader_create_installation_job_from_order_rpc','b71b210addd56551d1fed38b6d2f2b7a')
 ) AS baseline(name,source_md5) LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.'||f.name||'(jsonb)') AND md5(prosrc)=f.source_md5 AND NOT prosecdef)
  THEN RAISE EXCEPTION 'operational_projection_runtime_drift:%',f.name; END IF;
  definition:=pg_get_functiondef(('public.'||f.name||'(jsonb)')::regprocedure);
  mask:=$mask$ARRAY['contractor_cost','client_total','installer_cost','client_price','profit','internal_comment']$mask$;
  IF position('return v_receipt.response ||' IN definition)=0 OR position('  insert into leader_private.leader_command_receipts (' IN definition)=0
  THEN RAISE EXCEPTION 'projection_marker_missing:%',f.name; END IF;
  definition:=replace(definition,'return v_receipt.response ||',
   'return jsonb_set(v_receipt.response, ''{entity}'', (v_receipt.response->''entity'') - '||mask||') ||');
  definition:=replace(definition,'  insert into leader_private.leader_command_receipts (',
   '  v_response := jsonb_set(v_response, ''{entity}'', (v_response->''entity'') - '||mask||');'||E'\n  insert into leader_private.leader_command_receipts (');
  EXECUTE definition;
 END LOOP;
END $upgrade$;
