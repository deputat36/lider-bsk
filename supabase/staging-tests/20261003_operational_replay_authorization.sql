-- Included inside the disposable/staging acceptance transaction. Never commit fixtures.
CREATE OR REPLACE FUNCTION pg_temp.check_operational_replay(fn text, request jsonb)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE response jsonb; actor uuid := (request->>'actor_id')::uuid;
 profile_role text; retry jsonb; retry_id uuid := gen_random_uuid(); original_actor uuid;
 receipt_action text := request#>>'{request,action}'; receipt_key text := request#>>'{request,payload,idempotency_key}';
 before_count integer;
BEGIN
 SELECT role INTO profile_role FROM public.leader_user_profiles WHERE user_id=actor;
 SELECT count(*) INTO before_count FROM leader_private.leader_command_receipts;
 retry := jsonb_set(request,'{request,request_id}',to_jsonb(retry_id::text));
 EXECUTE format('SELECT public.%I($1)',fn) INTO response USING retry;
 IF response->>'ok' IS DISTINCT FROM 'true' OR response->>'idempotent_replay' IS DISTINCT FROM 'true'
    OR response->>'request_id' IS DISTINCT FROM retry_id::text THEN
  RAISE EXCEPTION 'new_request_replay_failed:%:%',fn,response; END IF;
 UPDATE public.leader_user_profiles SET is_active=false WHERE user_id=actor;
 EXECUTE format('SELECT public.%I($1)',fn) INTO response USING retry;
 IF response#>>'{error,code}' IS DISTINCT FROM 'forbidden' THEN
  RAISE EXCEPTION 'inactive_replay_leaked:%:%',fn,response; END IF;
 UPDATE public.leader_user_profiles SET is_active=true,role='viewer' WHERE user_id=actor;
 EXECUTE format('SELECT public.%I($1)',fn) INTO response USING retry;
 IF response#>>'{error,code}' IS DISTINCT FROM 'forbidden' THEN
  RAISE EXCEPTION 'role_changed_replay_leaked:%:%',fn,response; END IF;
 UPDATE public.leader_user_profiles SET role=profile_role WHERE user_id=actor;
 IF request#>'{request,payload,patch}' ? 'internal_comment' THEN
  UPDATE public.leader_user_profiles SET role='contractor' WHERE user_id=actor;
  IF NOT leader_private.leader_actor_has_crm_action(actor,'production.write') THEN
   RAISE EXCEPTION 'contractor_fixture_missing_production_write'; END IF;
  EXECUTE format('SELECT public.%I($1)',fn) INTO response USING retry;
  IF response#>>'{error,code}' IS DISTINCT FROM 'forbidden' THEN
   RAISE EXCEPTION 'internal_comment_replay_leaked:%:%',fn,response; END IF;
  UPDATE public.leader_user_profiles SET role=profile_role WHERE user_id=actor;
 END IF;
 SELECT actor_id INTO original_actor FROM leader_private.leader_command_receipts
 WHERE action=receipt_action AND idempotency_key=receipt_key;
 UPDATE leader_private.leader_command_receipts SET actor_id=gen_random_uuid()
 WHERE action=receipt_action AND idempotency_key=receipt_key;
 EXECUTE format('SELECT public.%I($1)',fn) INTO response USING retry;
 IF response#>>'{error,code}' IS DISTINCT FROM 'conflict' THEN
  RAISE EXCEPTION 'receipt_actor_mismatch_accepted:%:%',fn,response; END IF;
 UPDATE leader_private.leader_command_receipts SET actor_id=original_actor
 WHERE action=receipt_action AND idempotency_key=receipt_key;
 IF (SELECT count(*) FROM leader_private.leader_command_receipts)<>before_count THEN
  RAISE EXCEPTION 'replay_created_receipt:%',fn; END IF;
 IF has_function_privilege('authenticated','public.'||fn||'(jsonb)','EXECUTE')
  OR has_function_privilege('anon','public.'||fn||'(jsonb)','EXECUTE') THEN
  RAISE EXCEPTION 'browser_command_exposed:%',fn; END IF;
END $$;
