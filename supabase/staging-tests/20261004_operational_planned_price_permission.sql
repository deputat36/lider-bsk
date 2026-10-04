-- Fixture-only helpers, called inside the existing ROLLBACK acceptance transaction.
CREATE OR REPLACE FUNCTION pg_temp.check_operational_price_permission(fn text, request jsonb)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE actor uuid := (request->>'actor_id')::uuid; original_role text; response jsonb;
 retry jsonb; fields text[]; before_count integer; field text;
 new_order uuid; new_production uuid; original_order uuid;
BEGIN
 SELECT role INTO original_role FROM public.leader_user_profiles WHERE user_id=actor;
 SELECT count(*) INTO before_count FROM leader_private.leader_command_receipts;
 fields:=CASE WHEN fn LIKE '%installation%' THEN ARRAY['installer_cost','client_price'] ELSE ARRAY['contractor_cost'] END;
 UPDATE public.leader_user_profiles SET role=CASE WHEN fn LIKE '%installation%' THEN 'installer' ELSE 'contractor' END WHERE user_id=actor;
 -- Operational permission remains; chosen financial values require order editing.
 EXECUTE format('SELECT public.%I($1)',fn) INTO response USING request;
 IF response#>>'{error,code}' IS DISTINCT FROM 'forbidden' THEN
  RAISE EXCEPTION 'planned_price_replay_without_permission:%:%',fn,response; END IF;
 retry:=jsonb_set(request,'{request,request_id}',to_jsonb(gen_random_uuid()::text));
 retry:=jsonb_set(retry,'{request,payload,idempotency_key}',to_jsonb(('LIDER-PRICE-20261004:'||gen_random_uuid())::text));
 EXECUTE format('SELECT public.%I($1)',fn) INTO response USING retry;
 IF response#>>'{error,code}' IS DISTINCT FROM 'forbidden' THEN
  RAISE EXCEPTION 'planned_price_new_request_without_permission:%:%',fn,response; END IF;
 FOREACH field IN ARRAY fields LOOP
  -- Explicit null/zero remain deliberate financial input, not an omission.
  EXECUTE format('SELECT public.%I($1)',fn) INTO response USING
   jsonb_set(retry,'{request,payload,job}',(retry#>'{request,payload,job}')-fields||jsonb_build_object(field,0));
  IF response#>>'{error,code}' IS DISTINCT FROM 'forbidden' THEN RAISE EXCEPTION 'planned_zero_accepted:%:%',fn,field; END IF;
  EXECUTE format('SELECT public.%I($1)',fn) INTO response USING
   jsonb_set(retry,'{request,payload,job}',(retry#>'{request,payload,job}')-fields||jsonb_build_object(field,null));
  IF response#>>'{error,code}' IS DISTINCT FROM 'forbidden' THEN RAISE EXCEPTION 'planned_null_accepted:%:%',fn,field; END IF;
 END LOOP;
 -- No chosen prices: permission passes; existing fixture already has an active
 -- job / linked design, so normal business conflict is expected (not a new job).
 retry:=jsonb_set(retry,'{request,payload,job}',(retry#>'{request,payload,job}')-fields);
 retry:=jsonb_set(retry,'{request,expected_updated_at}',
  (SELECT to_jsonb(updated_at::text) FROM public.leader_orders WHERE id=(retry#>>'{request,payload,order_id}')::uuid));
 EXECUTE format('SELECT public.%I($1)',fn) INTO response USING retry;
 IF response#>>'{error,code}' IS DISTINCT FROM 'conflict' THEN RAISE EXCEPTION 'worker_omission_permission_failed:%:%',fn,response; END IF;
 -- A positive SQL worker creation without chosen prices on isolated clones.
 -- The nested subtransaction rolls the clones/receipt/event back immediately.
 BEGIN
  new_order:=gen_random_uuid();
  original_order:=(retry#>>'{request,payload,order_id}')::uuid;
  UPDATE public.leader_user_profiles SET role=original_role WHERE user_id=actor;
  INSERT INTO public.leader_orders SELECT (jsonb_populate_record(null::public.leader_orders,
   to_jsonb(t)||jsonb_build_object('id',new_order,'project_name','LIDER-PRICE-20261004 worker order'))).*
   FROM public.leader_orders t WHERE id=original_order;
  UPDATE public.leader_user_profiles SET role=CASE WHEN fn LIKE '%installation%' THEN 'installer' ELSE 'contractor' END WHERE user_id=actor;
  retry:=jsonb_set(retry,'{request,payload,order_id}',to_jsonb(new_order::text));
  IF fn LIKE '%installation%' THEN
   new_production:=gen_random_uuid();
   INSERT INTO public.leader_production_jobs SELECT (jsonb_populate_record(null::public.leader_production_jobs,
    to_jsonb(t)||jsonb_build_object('id',new_production,'order_id',new_order,'title','LIDER-PRICE-20261004 ready production'))).*
    FROM public.leader_production_jobs t WHERE id=(retry#>>'{request,payload,production_job_id}')::uuid;
   retry:=jsonb_set(retry,'{request,payload,production_job_id}',to_jsonb(new_production::text));
  ELSE
   retry:=jsonb_set(retry,'{request,payload}',(retry#>'{request,payload}')-'design_task_id');
  END IF;
  EXECUTE format('SELECT public.%I($1)',fn) INTO response USING retry;
  IF response->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'positive_worker_no_price_failed:%:%',fn,response; END IF;
  IF (response->'entity') ?| ARRAY['contractor_cost','client_total','installer_cost','client_price','profit'] THEN
   RAISE EXCEPTION 'worker_price_response_leak:%',fn; END IF;
  RAISE EXCEPTION USING ERRCODE='ZP001',MESSAGE='rollback_positive_price_fixture';
 EXCEPTION WHEN SQLSTATE 'ZP001' THEN null;
 END;
 IF (SELECT count(*) FROM leader_private.leader_command_receipts)<>before_count THEN RAISE EXCEPTION 'price_rejection_created_receipt:%',fn; END IF;
 UPDATE public.leader_user_profiles SET role=original_role WHERE user_id=actor;
END $$;
