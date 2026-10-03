-- Synthetic transactional proof; no Auth user, no committed fixtures.
BEGIN;
CREATE TEMP TABLE design_command_test_ids(actor uuid,other_actor uuid,order_id uuid,need_id uuid,lead_id uuid);
INSERT INTO design_command_test_ids VALUES(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid());
GRANT SELECT ON design_command_test_ids TO service_role;
INSERT INTO public.leader_user_profiles(user_id,role,is_active) SELECT actor,'manager',true FROM design_command_test_ids UNION ALL SELECT other_actor,'designer',true FROM design_command_test_ids;
INSERT INTO public.leader_leads(id,status) SELECT lead_id,'Новая' FROM design_command_test_ids;
INSERT INTO public.leader_orders(id,owner_id,lead_id,project_name,status,client_total,contractor_cost,profit) SELECT order_id,actor,lead_id,'SYNTH-DESIGN-COMMAND-20261003','Новый',1700,1000,700 FROM design_command_test_ids;
INSERT INTO public.leader_lead_needs(id,lead_id,title,need_design,status,completeness_score,design_reason) SELECT need_id,lead_id,'SYNTH-DESIGN-COMMAND-20261003',true,'Черновик',100,'Нужен новый макет' FROM design_command_test_ids;
SET LOCAL ROLE service_role;
DO $tests$
DECLARE a uuid;b uuid;o uuid;n uuid;req jsonb;r jsonb;rev timestamptz;t uuid;role_name text;
BEGIN
 SELECT actor,other_actor,order_id,need_id INTO a,b,o,n FROM design_command_test_ids;
 SELECT updated_at INTO rev FROM public.leader_orders WHERE id=o;
 req:=jsonb_build_object('actor_id',a,'request',jsonb_build_object('action','design_task.create_from_order','request_id',gen_random_uuid(),'expected_updated_at',rev,'payload',jsonb_build_object('order_id',o,'production_job_id',null,'idempotency_key','SYNTH-DESIGN-COMMAND:'||o,'need_ids',jsonb_build_array(n),'task',jsonb_build_object('title','Synthetic task','task_text','Synthetic brief','reference_link','https://example.invalid/reference.pdf'))));
 r:=public.leader_create_design_task_from_order_rpc(jsonb_set(req,'{request,action}','null'));
 IF r#>>'{error,code}' IS DISTINCT FROM 'unknown_action' THEN RAISE EXCEPTION 'null_action:%',r;END IF;
 r:=public.leader_create_design_task_from_order_rpc(req);
 IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'create:%',r;END IF;
 t:=(r#>>'{entity,id}')::uuid;
 IF r->'entity' ?| ARRAY['client_phone','client_name','internal_comment','profit'] OR r->'order' ?| ARRAY['profit','client_total','contractor_cost','client_phone'] THEN RAISE EXCEPTION 'creation_privacy';END IF;
 r:=public.leader_create_design_task_from_order_rpc(jsonb_set(req,'{request,request_id}',to_jsonb(gen_random_uuid())));
 IF r->>'idempotent_replay' IS DISTINCT FROM 'true' OR (SELECT count(*) FROM public.leader_design_tasks WHERE order_id=o)<>1 OR (SELECT count(*) FROM public.leader_design_task_events WHERE task_id=t)<>1 THEN RAISE EXCEPTION 'retry_with_new_request_id:%',r;END IF;
 r:=public.leader_create_design_task_from_order_rpc(jsonb_set(req,'{actor_id}',to_jsonb(b)));
 IF r#>>'{error,code}' IS DISTINCT FROM 'conflict' THEN RAISE EXCEPTION 'cross_actor_replay:%',r;END IF;
 r:=public.leader_create_design_task_from_order_rpc(jsonb_set(req,'{request,payload,task,title}','"changed"'));
 IF r#>>'{error,code}' IS DISTINCT FROM 'conflict' THEN RAISE EXCEPTION 'changed_replay:%',r;END IF;
 FOREACH role_name IN ARRAY ARRAY['installer','contractor','accountant'] LOOP
  UPDATE public.leader_user_profiles SET role=role_name WHERE user_id=a;
  r:=public.leader_create_design_task_from_order_rpc(req);
  IF r#>>'{error,code}' IS DISTINCT FROM 'forbidden' THEN RAISE EXCEPTION 'creation_role:% %',role_name,r;END IF;
 END LOOP;
 UPDATE public.leader_user_profiles SET role='manager',is_active=false WHERE user_id=a;
 r:=public.leader_create_design_task_from_order_rpc(req);
 IF r#>>'{error,code}' NOT IN ('forbidden','access_denied') THEN RAISE EXCEPTION 'creation_inactive:%',r;END IF;
 UPDATE public.leader_user_profiles SET is_active=true WHERE user_id=a;
 SELECT updated_at INTO rev FROM public.leader_design_tasks WHERE id=t;
 req:=jsonb_build_object('actor_id',b,'request',jsonb_build_object('action','design_task.transition','request_id',gen_random_uuid(),'expected_updated_at',rev,'payload',jsonb_build_object('task_id',t,'idempotency_key','SYNTH-DESIGN-COMMAND:transition:'||t,'status','В работе','layout_link',null)));
 r:=public.leader_transition_design_task_rpc(jsonb_set(req,'{request,action}','null'));
 IF r#>>'{error,code}' IS DISTINCT FROM 'validation_error' THEN RAISE EXCEPTION 'transition_null_action:%',r;END IF;
 r:=public.leader_transition_design_task_rpc(jsonb_set(req,'{request,payload,profit}','1'));
 IF r#>>'{error,code}' IS DISTINCT FROM 'validation_error' THEN RAISE EXCEPTION 'unknown_field:%',r;END IF;
 r:=public.leader_transition_design_task_rpc(req);
 IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'designer_mutation:%',r;END IF;
 r:=public.leader_transition_design_task_rpc(jsonb_set(req,'{request,request_id}',to_jsonb(gen_random_uuid())));
 IF r->>'idempotent_replay' IS DISTINCT FROM 'true' OR (SELECT count(*) FROM public.leader_design_task_events WHERE task_id=t)<>2 THEN RAISE EXCEPTION 'designer_retry:%',r;END IF;
END $tests$;
RESET ROLE;
DO $acl$ BEGIN
 IF has_function_privilege('anon','public.leader_create_design_task_from_order_rpc(jsonb)','EXECUTE') OR has_function_privilege('authenticated','public.leader_create_design_task_from_order_rpc(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'direct_rpc_open';END IF;
END $acl$;
SELECT 'PASS: atomic creation, fresh canonical RBAC, retry/new request_id, cross-actor conflict, strict transition, positive designer mutation, privacy/audit' AS evidence;
ROLLBACK;
