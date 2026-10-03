-- Synthetic DB contract proof; transaction rollback removes every fixture.
-- No Auth user is created; this is not an authenticated browser proof.
BEGIN;
CREATE TEMP TABLE design_transition_test_ids(actor uuid,order_id uuid,task_id uuid);
INSERT INTO design_transition_test_ids VALUES(gen_random_uuid(),gen_random_uuid(),gen_random_uuid());
GRANT SELECT ON design_transition_test_ids TO service_role;
INSERT INTO public.leader_user_profiles(user_id,role,is_active) SELECT actor,'manager',true FROM design_transition_test_ids;
INSERT INTO public.leader_orders(id,owner_id,project_name,status,client_total,contractor_cost,profit,client_name,client_phone)
 SELECT order_id,actor,'SYNTH-DESIGN-TRANSITION-20261003','Новый',1700,1000,700,'Synthetic only','000' FROM design_transition_test_ids;
INSERT INTO public.leader_design_tasks(id,order_id,title,task_status) SELECT task_id,order_id,'SYNTH-DESIGN-TRANSITION-20261003','Новая' FROM design_transition_test_ids;
UPDATE public.leader_user_profiles SET role='designer' WHERE user_id=(SELECT actor FROM design_transition_test_ids);
SET LOCAL ROLE service_role;
DO $tests$
DECLARE a uuid;o uuid;t uuid;req jsonb;r jsonb;rev timestamptz;target text;role_name text;before_count bigint;
BEGIN
 SELECT actor,order_id,task_id INTO a,o,t FROM design_transition_test_ids;
 FOREACH target IN ARRAY ARRAY['В работе','На согласовании','Согласовано'] LOOP
  SELECT updated_at INTO rev FROM public.leader_design_tasks WHERE id=t;
  req:=jsonb_build_object('actor_id',a,'request',jsonb_build_object('action','design_task.transition','request_id',gen_random_uuid(),'expected_updated_at',rev,'payload',jsonb_build_object('task_id',t,'idempotency_key','SYNTH-DESIGN-TRANSITION-20261003:'||t||':'||target,'status',target,'layout_link',CASE WHEN target='Согласовано' THEN 'https://example.invalid/explicit-test-layout.pdf' ELSE NULL END)));
  IF target='Согласовано' THEN
   r:=public.leader_transition_design_task_rpc(jsonb_set(req,'{request,payload,layout_link}','null'));
   IF r#>>'{error,code}' IS DISTINCT FROM 'validation_error' THEN RAISE EXCEPTION 'empty_link:%',r;END IF;
   r:=public.leader_transition_design_task_rpc(jsonb_set(req,'{request,payload,layout_link}','"javascript:alert(1)"'));
   IF r#>>'{error,code}' IS DISTINCT FROM 'validation_error' THEN RAISE EXCEPTION 'unsafe_link:%',r;END IF;
   UPDATE public.leader_orders SET is_archived=true WHERE id=o;
   r:=public.leader_transition_design_task_rpc(req);
   IF r#>>'{error,code}' IS DISTINCT FROM 'conflict' THEN RAISE EXCEPTION 'archived_order:%',r;END IF;
   UPDATE public.leader_orders SET is_archived=false,status='Закрыт' WHERE id=o;
   r:=public.leader_transition_design_task_rpc(req);
   IF r#>>'{error,code}' IS DISTINCT FROM 'conflict' THEN RAISE EXCEPTION 'closed_order:%',r;END IF;
   UPDATE public.leader_orders SET status='Макет на согласовании' WHERE id=o;
  END IF;
  r:=public.leader_transition_design_task_rpc(req);
  IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'transition:% %',target,r;END IF;
  IF r->'order' ?| ARRAY['client_total','contractor_cost','profit','client_name','client_phone','internal_comment'] OR r->'task' ?| ARRAY['client_name','client_phone','internal_comment'] THEN RAISE EXCEPTION 'private_fields_leaked:%',r;END IF;
  r:=public.leader_transition_design_task_rpc(req);
  IF r->>'idempotent_replay' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'replay:%',r;END IF;
  r:=public.leader_transition_design_task_rpc(jsonb_set(req,'{request,payload,layout_link}','"https://example.invalid/changed.pdf"'));
  IF r#>>'{error,code}' IS DISTINCT FROM 'conflict' THEN RAISE EXCEPTION 'changed_payload:%',r;END IF;
  r:=public.leader_transition_design_task_rpc(jsonb_set(req,'{request,payload,idempotency_key}',to_jsonb('stale:'||t||':'||target)));
  IF r#>>'{error,code}' IS DISTINCT FROM 'conflict' THEN RAISE EXCEPTION 'stale:%',r;END IF;
 END LOOP;
 IF (SELECT count(*) FROM public.leader_design_task_events WHERE task_id=t)<>3 OR EXISTS(SELECT 1 FROM public.leader_design_task_events WHERE task_id=t AND old_status IS NULL) THEN RAISE EXCEPTION 'audit_incomplete';END IF;
 IF (SELECT layout_status FROM public.leader_orders WHERE id=o)<>'Макет согласован' THEN RAISE EXCEPTION 'order_projection';END IF;
 FOREACH role_name IN ARRAY ARRAY['installer','contractor','accountant'] LOOP
  UPDATE public.leader_user_profiles SET role=role_name WHERE user_id=a;
  r:=public.leader_transition_design_task_rpc(req);
  IF r#>>'{error,code}' IS DISTINCT FROM 'forbidden' THEN RAISE EXCEPTION 'wrong_role:% %',role_name,r;END IF;
 END LOOP;
 UPDATE public.leader_user_profiles SET role='designer',is_active=false WHERE user_id=a;
 r:=public.leader_transition_design_task_rpc(req);
 IF r#>>'{error,code}' IS DISTINCT FROM 'forbidden' THEN RAISE EXCEPTION 'inactive_replay:%',r;END IF;
END $tests$;
RESET ROLE;
DO $acl$ BEGIN
 IF has_function_privilege('anon','public.leader_transition_design_task_rpc(jsonb)','EXECUTE') OR has_function_privilege('authenticated','public.leader_transition_design_task_rpc(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'direct_rpc_open';END IF;
END $acl$;
SELECT 'PASS: transitions, approval, privacy, archive/closed guard, audit, replay/stale, role/inactive, RPC ACL' AS evidence;
ROLLBACK;
