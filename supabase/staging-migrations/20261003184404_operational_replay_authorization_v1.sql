-- STAGING ONLY: fresh authorization before receipt replay and layout reads.
-- Existing canonical matrix/core is reused. No business rows or global grants changed.
DO $guard$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM leader_staging.environment_guard WHERE singleton=true
   AND project_ref='otulfnouybahfnsycxqn' AND environment_name='staging'
   AND repository='deputat36/lider-bsk') THEN RAISE EXCEPTION 'staging_environment_guard_failed'; END IF;
 IF position('leader_role_action_matrix_v1' IN pg_get_functiondef('leader_private.leader_actor_has_crm_action(uuid,text)'::regprocedure))=0
 THEN RAISE EXCEPTION 'canonical_permission_bridge_missing'; END IF;
END $guard$;

-- Bound to inspected July runtime definitions. Drift fails atomically; never patch unknown SQL.
DO $upgrade$
DECLARE f record; definition text; permission_block text;
BEGIN
 FOR f IN SELECT * FROM (VALUES
  ('leader_create_production_job_from_order_impl_rpc','0a668d5d73848fd025aead8c8a07ee59','production'),
  ('leader_update_production_job_rpc','21e7b182dd677c2af506885cd1ba0dfa','production'),
  ('leader_create_installation_job_from_order_rpc','07a70e58ec233c187637509d40a44449','installation'),
  ('leader_update_installation_job_rpc','85d56207d6ab3bdff31447c21f87b5ed','installation')
 ) AS baseline(name,source_md5,kind)
 LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.'||f.name||'(jsonb)') AND md5(prosrc)=f.source_md5 AND NOT prosecdef)
   THEN RAISE EXCEPTION 'operational_runtime_drift:%',f.name; END IF;
  definition:=pg_get_functiondef(('public.'||f.name||'(jsonb)')::regprocedure);
  IF f.kind='production' THEN
   permission_block:=$permission$  if not leader_private.leader_actor_has_crm_action(v_actor_id, 'production.write') then
    return leader_private.leader_production_command_error(v_request_id, 'forbidden', 'production.write permission is required');
  end if;
$permission$;
   IF f.name='leader_update_production_job_rpc' THEN
    permission_block:=permission_block||$permission$  if v_patch ? 'internal_comment'
     and not leader_private.leader_actor_has_crm_action(v_actor_id, 'orders.update') then
    return leader_private.leader_production_command_error(v_request_id, 'forbidden', 'orders.update permission is required for internal_comment');
  end if;
$permission$;
   END IF;
   IF position(permission_block IN definition)=0 THEN RAISE EXCEPTION 'permission_marker_missing:%',f.name; END IF;
   definition:=replace(definition,permission_block,'');
   definition:=replace(definition,'  v_request_hash := encode(',permission_block||E'
  v_request_hash := encode(');
  END IF;
  IF position('if v_receipt.request_hash <> v_request_hash then' IN definition)=0
    OR position($replay$jsonb_build_object('idempotent_replay', true)$replay$ IN definition)=0
   THEN RAISE EXCEPTION 'receipt_marker_missing:%',f.name; END IF;
  definition:=replace(definition,'if v_receipt.request_hash <> v_request_hash then',
   'if v_receipt.actor_id IS DISTINCT FROM v_actor_id or v_receipt.request_hash IS DISTINCT FROM v_request_hash then');
  definition:=replace(definition,$replay$jsonb_build_object('idempotent_replay', true)$replay$,
   $replay$jsonb_build_object('idempotent_replay', true, 'request_id', v_request_id)$replay$);
  EXECUTE definition;
 END LOOP;
 -- Wrapper must not query order/layout before authenticating the supplied server actor.
 IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='public.leader_create_production_job_from_order_rpc(jsonb)'::regprocedure
   AND md5(prosrc)='7f63a2174707908a91a2c439900d0d34' AND NOT prosecdef)
 THEN RAISE EXCEPTION 'production_layout_wrapper_drift'; END IF;
 definition:=pg_get_functiondef('public.leader_create_production_job_from_order_rpc(jsonb)'::regprocedure);
 definition:=replace(definition,'  v_request_id uuid;',E'  v_request_id uuid;\n  v_actor_id uuid;');
 definition:=replace(definition,'    v_request_id :=',E'    v_actor_id := nullif(btrim(coalesce(p_payload ->> ''actor_id'','''')),'''')::uuid;\n    v_request_id :=');
 definition:=replace(definition,'  if v_order_id is not null then',$permission$
  if not leader_private.leader_actor_has_crm_action(v_actor_id, 'production.write') then
    return leader_private.leader_production_command_error(v_request_id, 'forbidden', 'production.write permission is required');
  end if;
  -- Full validation is delegated before looking up any business data.
  if btrim(coalesce(v_request ->> 'action','')) <> 'production_job.create_from_order' then
    return public.leader_create_production_job_from_order_impl_rpc(p_payload);
  end if;
  if v_order_id is not null then$permission$);
 EXECUTE definition;
END $upgrade$;

-- Reassert service-only boundary on exactly the five affected functions.
REVOKE ALL ON FUNCTION public.leader_create_production_job_from_order_rpc(jsonb),
 public.leader_create_production_job_from_order_impl_rpc(jsonb),public.leader_update_production_job_rpc(jsonb),
 public.leader_create_installation_job_from_order_rpc(jsonb),public.leader_update_installation_job_rpc(jsonb)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.leader_create_production_job_from_order_rpc(jsonb),
 public.leader_create_production_job_from_order_impl_rpc(jsonb),public.leader_update_production_job_rpc(jsonb),
 public.leader_create_installation_job_from_order_rpc(jsonb),public.leader_update_installation_job_rpc(jsonb)
 TO service_role;
