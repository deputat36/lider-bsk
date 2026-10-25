-- Approved Leader catalog installation: native RPC/RLS probe, always ROLLBACK.
-- Uses an existing active owner/admin; never changes profiles or Auth users.
-- Only the randomly named catalog fixture, its logs and receipts are written.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $setup$
DECLARE actor uuid; catalog_count integer;
BEGIN
  IF to_regclass('leader_staging.environment_guard') IS NOT NULL OR NOT EXISTS (
    SELECT 1 FROM leader_private.leader_rollout_backups
    WHERE id='catalog-management-20261014-v1' AND project_ref='ofewxuqfjhamgerwzull'
  ) THEN RAISE EXCEPTION 'catalog_probe_wrong_environment'; END IF;
  SELECT user_id INTO actor FROM public.leader_user_profiles
  WHERE is_active AND role IN ('owner','admin')
    AND leader_private.leader_actor_has_crm_action(user_id,'catalog.manage')
  ORDER BY role DESC,user_id LIMIT 1;
  IF actor IS NULL THEN RAISE EXCEPTION 'catalog_probe_no_authorized_actor'; END IF;
  SELECT count(*) INTO catalog_count FROM public.leader_catalog;
  PERFORM set_config('leader_probe.actor',actor::text,true);
  PERFORM set_config('leader_probe.catalog_count',catalog_count::text,true);
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
END $setup$;

SET LOCAL ROLE service_role;
DO $commands$
DECLARE
  actor uuid:=current_setting('leader_probe.actor')::uuid;
  key_prefix text:='catalog-postflight-20261025-'||gen_random_uuid();
  item_name text:='__catalog_postflight_20261025__'||gen_random_uuid();
  create_request jsonb; update_request jsonb; stale_request jsonb; result jsonb;
  item_id uuid; initial_revision timestamptz; denied_actor record;
BEGIN
  create_request:=jsonb_build_object('actor_id',actor,'request',jsonb_build_object(
    'action','catalog.manage','request_id',gen_random_uuid(),'payload',jsonb_build_object(
      'operation','create','idempotency_key',key_prefix||'-create',
      'reason','Approved transaction-only production postflight; rollback follows',
      'patch',jsonb_build_object('name',item_name,'category','Synthetic rollout probe','unit','шт',
        'contractor_price',100,'markup_percent',30,'is_active',true))));
  result:=public.leader_manage_catalog_rpc(create_request);
  IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'catalog_probe_create:%',result; END IF;
  item_id:=(result#>>'{catalog,id}')::uuid;
  initial_revision:=(result#>>'{catalog,updated_at}')::timestamptz;
  IF item_id IS NULL OR initial_revision IS NULL THEN RAISE EXCEPTION 'catalog_probe_missing_ack'; END IF;
  PERFORM set_config('leader_probe.item',item_id::text,true);

  result:=public.leader_manage_catalog_rpc(create_request);
  IF result->>'idempotent_replay' IS DISTINCT FROM 'true'
    OR result#>>'{catalog,id}' IS DISTINCT FROM item_id::text
    OR (SELECT count(*) FROM public.leader_catalog WHERE id=item_id)<>1
    OR (SELECT count(*) FROM public.leader_catalog_price_logs WHERE catalog_id=item_id)<>1
  THEN RAISE EXCEPTION 'catalog_probe_replay:%',result; END IF;
  result:=public.leader_manage_catalog_rpc(jsonb_set(create_request,'{request,payload,patch,name}',to_jsonb(item_name||'-changed')));
  IF result#>>'{error,code}' IS DISTINCT FROM 'idempotency_conflict'
  THEN RAISE EXCEPTION 'catalog_probe_changed_replay:%',result; END IF;

  update_request:=jsonb_build_object('actor_id',actor,'request',jsonb_build_object(
    'action','catalog.manage','request_id',gen_random_uuid(),'expected_updated_at',initial_revision,
    'payload',jsonb_build_object('operation','update','catalog_id',item_id,
      'idempotency_key',key_prefix||'-update','reason','Transaction-only price audit probe',
      'patch',jsonb_build_object('contractor_price',125,'markup_percent',55))));
  result:=public.leader_manage_catalog_rpc(update_request);
  IF result->>'ok' IS DISTINCT FROM 'true' OR result->>'changed' IS DISTINCT FROM 'true'
  THEN RAISE EXCEPTION 'catalog_probe_update:%',result; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.leader_catalog_price_logs
    WHERE catalog_id=item_id AND change_type='price_update' AND changed_by=actor
      AND old_contractor_price=100 AND new_contractor_price=125
      AND old_markup_percent=30 AND new_markup_percent=55)
    OR (SELECT count(*) FROM public.leader_catalog_price_logs WHERE catalog_id=item_id)<>2
  THEN RAISE EXCEPTION 'catalog_probe_audit'; END IF;

  stale_request:=jsonb_set(jsonb_set(update_request,'{request,request_id}',to_jsonb(gen_random_uuid())),
    '{request,payload,idempotency_key}',to_jsonb(key_prefix||'-stale'));
  -- Production's existing touch trigger uses now(): create/update share its
  -- transaction timestamp in this rollback-only probe. Use an explicitly old
  -- revision; separate HTTP transactions do not share that timestamp.
  stale_request:=jsonb_set(stale_request,'{request,expected_updated_at}',to_jsonb(initial_revision-interval '1 second'));
  result:=public.leader_manage_catalog_rpc(stale_request);
  IF result#>>'{error,code}' IS DISTINCT FROM 'source_changed'
    OR (SELECT contractor_price FROM public.leader_catalog WHERE id=item_id) IS DISTINCT FROM 125::numeric
    OR (SELECT count(*) FROM public.leader_catalog_price_logs WHERE catalog_id=item_id)<>2
    OR EXISTS (SELECT 1 FROM leader_private.leader_command_receipts
      WHERE action='catalog.manage' AND idempotency_key=key_prefix||'-stale')
  THEN RAISE EXCEPTION 'catalog_probe_stale:%',result; END IF;

  result:=public.leader_manage_catalog_rpc(jsonb_set(create_request,'{actor_id}',to_jsonb(gen_random_uuid())));
  IF result#>>'{error,code}' IS DISTINCT FROM 'forbidden'
  THEN RAISE EXCEPTION 'catalog_probe_unknown_actor:%',result; END IF;
  FOR denied_actor IN SELECT user_id FROM public.leader_user_profiles WHERE role NOT IN ('owner','admin') LOOP
    result:=public.leader_manage_catalog_rpc(jsonb_set(create_request,'{actor_id}',to_jsonb(denied_actor.user_id)));
    IF result#>>'{error,code}' IS DISTINCT FROM 'forbidden'
    THEN RAISE EXCEPTION 'catalog_probe_forbidden_replay:%',result; END IF;
  END LOOP;
END $commands$;

RESET ROLE;
SET LOCAL ROLE authenticated;
DO $browser$
BEGIN
  IF (SELECT count(*) FROM public.leader_catalog)<>current_setting('leader_probe.catalog_count')::integer+1
    OR (SELECT count(*) FROM public.leader_catalog_price_logs WHERE catalog_id=current_setting('leader_probe.item')::uuid)<>2
  THEN RAISE EXCEPTION 'catalog_probe_authenticated_read'; END IF;
  BEGIN
    UPDATE public.leader_catalog SET name=name WHERE false;
    RAISE EXCEPTION 'catalog_probe_browser_write_open';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.leader_manage_catalog_rpc('{}');
    RAISE EXCEPTION 'catalog_probe_browser_rpc_open';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $browser$;

RESET ROLE;
ROLLBACK;
SELECT 'PASS: native create/replay/conflict/update/audit/stale cleanup, forbidden replay and authenticated RLS read/write denial; all fixture writes rolled back' AS result;
