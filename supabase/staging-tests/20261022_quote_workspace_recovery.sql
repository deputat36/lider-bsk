-- Only staging. This acceptance test creates synthetic rows inside a transaction
-- and rolls everything back. No Auth users, schema, roles or grants are changed.
BEGIN;
DO $test$
BEGIN
 IF EXISTS(SELECT FROM public.leader_user_profiles WHERE user_id::text LIKE '90000000-0000-4000-8000-0000000007%') THEN RAISE EXCEPTION 'fixture_collision'; END IF;
END $test$;
INSERT INTO public.leader_user_profiles(user_id,role,is_active,full_name) VALUES
 ('90000000-0000-4000-8000-000000000701','manager',true,'Synthetic quote manager'),
 ('90000000-0000-4000-8000-000000000702','contractor',true,'Synthetic quote contractor'),
 ('90000000-0000-4000-8000-000000000703','contractor',true,'Synthetic unassigned contractor');
INSERT INTO public.leader_leads(id,name) VALUES('90000000-0000-4000-8000-000000000704','Synthetic quote recovery');
INSERT INTO public.leader_lead_needs(id,lead_id,title) VALUES('90000000-0000-4000-8000-000000000705','90000000-0000-4000-8000-000000000704','Synthetic banner');
SET LOCAL ROLE service_role;
DO $test$
DECLARE
 manager_id uuid:='90000000-0000-4000-8000-000000000701'; contractor_id uuid:='90000000-0000-4000-8000-000000000702';
 task_id uuid:='90000000-0000-4000-8000-000000000706'; command jsonb; result jsonb; qid uuid; tid uuid;
 items jsonb:='[{"id":"90000000-0000-4000-8000-000000000707","name":"Печать","specification":"Плёнка","qty":2.5,"unit":"м","unit_cost":120.5},{"id":"90000000-0000-4000-8000-000000000708","name":"Доставка","specification":"Самовывоз","qty":1,"unit":"услуга","unit_cost":0}]';
BEGIN
 command:=jsonb_build_object('operation','create','request_id',gen_random_uuid(),'payload',jsonb_build_object('task_id',task_id,'lead_id','90000000-0000-4000-8000-000000000704','need_id','90000000-0000-4000-8000-000000000705','assignee_id',contractor_id,'vendor_name','Synthetic contractor','title','Synthetic request','brief','Размер 2.5 м, уточнить материал'));
 result:=public.leader_quote_workspace_rpc(jsonb_build_object('actor_id',manager_id,'request',command));
 IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'create: %',result;END IF;
 result:=public.leader_quote_workspace_rpc(jsonb_build_object('actor_id',manager_id,'request',command));
 IF result->>'replay' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'create_replay: %',result;END IF;
 result:=public.leader_quote_workspace_rpc(jsonb_build_object('actor_id',contractor_id,'request',jsonb_build_object('operation','list','payload','{}'::jsonb)));
 IF jsonb_array_length(result->'rows')<>1 OR (result->'rows'->0 ? 'lead_id') THEN RAISE EXCEPTION 'contractor_list_projection: %',result;END IF;
 result:=public.leader_quote_workspace_rpc(jsonb_build_object('actor_id','90000000-0000-4000-8000-000000000703','request',jsonb_build_object('operation','list','payload','{}'::jsonb)));
 IF jsonb_array_length(result->'rows')<>0 THEN RAISE EXCEPTION 'unassigned_list';END IF;
 result:=public.leader_quote_workspace_rpc(jsonb_build_object('actor_id','90000000-0000-4000-8000-000000000703','request',jsonb_build_object('operation','detail','payload',jsonb_build_object('task_id',task_id))));
 IF result->'error'->>'code' IS DISTINCT FROM 'not_found' THEN RAISE EXCEPTION 'unassigned_detail';END IF;
 command:=jsonb_build_object('operation','respond','request_id',gen_random_uuid(),'expected_revision',1,'payload',jsonb_build_object('task_id',task_id,'items',items));
 result:=public.leader_quote_workspace_rpc(jsonb_build_object('actor_id',manager_id,'request',command));
 IF result->'error'->>'code' IS DISTINCT FROM 'response_source_required' THEN RAISE EXCEPTION 'manager_source_note';END IF;
 result:=public.leader_quote_workspace_rpc(jsonb_build_object('actor_id',contractor_id,'request',command));
 IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'respond: %',result;END IF;
 result:=public.leader_quote_workspace_rpc(jsonb_build_object('actor_id',contractor_id,'request',command));
 IF result->>'replay' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'response_replay';END IF;
 result:=public.leader_quote_workspace_rpc(jsonb_build_object('actor_id',manager_id,'request',jsonb_build_object('operation','update','request_id',gen_random_uuid(),'expected_revision',2,'payload',jsonb_build_object('task_id',task_id,'brief','Уточнённая плёнка и объём','message','Проверены материалы'))));
 IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'update: %',result;END IF;
 result:=public.leader_quote_workspace_rpc(jsonb_build_object('actor_id',contractor_id,'request',command||jsonb_build_object('request_id',gen_random_uuid())));
 IF result->'error'->>'code' IS DISTINCT FROM 'source_changed' THEN RAISE EXCEPTION 'stale_response';END IF;
 command:=jsonb_build_object('operation','respond','request_id',gen_random_uuid(),'expected_revision',3,'payload',jsonb_build_object('task_id',task_id,'items',items,'valid_until',clock_timestamp()+interval '30 days','note','Внутренние условия'));
 result:=public.leader_quote_workspace_rpc(jsonb_build_object('actor_id',contractor_id,'request',command));
 IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'new_response: %',result;END IF;
 qid:=(result->>'quote_id')::uuid;
 result:=public.leader_quote_workspace_rpc(jsonb_build_object('actor_id',contractor_id,'request',jsonb_build_object('operation','accept','request_id',gen_random_uuid(),'expected_revision',4,'payload',jsonb_build_object('task_id',task_id))));
 IF result->'error'->>'code' IS DISTINCT FROM 'forbidden' THEN RAISE EXCEPTION 'contractor_cannot_accept';END IF;
 result:=public.leader_quote_workspace_rpc(jsonb_build_object('actor_id',manager_id,'request',jsonb_build_object('operation','accept','request_id',gen_random_uuid(),'expected_revision',4,'payload',jsonb_build_object('task_id',task_id))));
 IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'accept: %',result;END IF;
 command:=jsonb_build_object('operation','selection','payload',jsonb_build_object('task_id',task_id,'quote_id',qid,'item_ids',jsonb_build_array('90000000-0000-4000-8000-000000000707')));
 result:=public.leader_quote_workspace_rpc(jsonb_build_object('actor_id',manager_id,'request',command));
 IF result->>'ok' IS DISTINCT FROM 'true' OR jsonb_array_length(result->'items')<>1 OR result->'items'->0->>'unit'<>'м' OR result ? 'note' THEN RAISE EXCEPTION 'selection: %',result;END IF;
 command:=command||jsonb_build_object('operation','template.save','request_id',gen_random_uuid(),'expected_revision',5,'payload',(command->'payload')||jsonb_build_object('name','Synthetic template','category','Печать'));
 result:=public.leader_quote_workspace_rpc(jsonb_build_object('actor_id',manager_id,'request',command));
 IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'template_save: %',result;END IF;
 tid:=(result->>'template_id')::uuid;
 result:=public.leader_quote_workspace_rpc(jsonb_build_object('actor_id',manager_id,'request',command));
 IF result->>'replay' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'template_replay';END IF;
 result:=public.leader_quote_workspace_rpc(jsonb_build_object('actor_id',manager_id,'request',jsonb_build_object('operation','template.get','payload',jsonb_build_object('template_id',tid))));
 IF result->>'ok' IS DISTINCT FROM 'true' OR jsonb_array_length(result->'template'->'items')<>1 THEN RAISE EXCEPTION 'template_get: %',result;END IF;
 IF (SELECT count(*) FROM public.leader_quote_requests WHERE id=task_id)<>1 OR (SELECT count(*) FROM public.leader_quote_revisions WHERE id=qid)<>1 THEN RAISE EXCEPTION 'duplicate_rows';END IF;
END $test$;
RESET ROLE;
ROLLBACK;
SELECT jsonb_build_object('passed',true,'requests',(SELECT count(*) FROM public.leader_quote_requests),'quotes',(SELECT count(*) FROM public.leader_quote_revisions),'templates',(SELECT count(*) FROM public.leader_quote_templates),'receipts',(SELECT count(*) FROM leader_private.leader_quote_receipts)) AS recovery_acceptance;
