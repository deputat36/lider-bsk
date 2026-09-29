#!/usr/bin/env python3
"""Exercise the actual migration/RPC in disposable PostgreSQL, never a remote DB."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
source = (ROOT / 'supabase/staging-migrations/20260928093643_finance_records_staging.sql').read_text()
source = source.split('-- Preserve the existing full synthetic lifecycle;', 1)[0]
canonical = (ROOT / 'supabase/production-candidates/20260723_01_installation_rbac_receipts_candidate.sql').read_text()
helper = canonical[canonical.index('create or replace function leader_private.leader_actor_has_crm_action('):canonical.index('comment on function leader_private.leader_actor_has_crm_action')]
setup = """
BEGIN;
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA leader_staging; CREATE SCHEMA leader_private; CREATE SCHEMA extensions; CREATE SCHEMA auth;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE TABLE leader_staging.environment_guard(singleton boolean,project_ref text,environment_name text,repository text);
INSERT INTO leader_staging.environment_guard VALUES(true,'otulfnouybahfnsycxqn','staging','deputat36/lider-bsk');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$SELECT NULL::text$$;
CREATE TABLE public.leader_user_profiles(user_id uuid PRIMARY KEY,role text,is_active boolean);
CREATE TABLE leader_private.leader_role_action_matrix_v1(role text PRIMARY KEY,allowed_actions text[]);
INSERT INTO leader_private.leader_role_action_matrix_v1 VALUES ('owner',ARRAY['finance.write','finance.read']),('admin',ARRAY['finance.write','finance.read']),('accountant',ARRAY['finance.write','finance.read']),('manager',ARRAY['orders.read']),('designer',ARRAY['design.read']),('installer',ARRAY['installation.read']),('contractor',ARRAY['production.read']);
CREATE TABLE leader_private.leader_command_receipts(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,action text NOT NULL,idempotency_key text NOT NULL,request_id uuid,request_hash text,actor_id uuid,state text,response jsonb,completed_at timestamptz,UNIQUE(action,idempotency_key));
CREATE TABLE public.leader_orders(id uuid PRIMARY KEY,client_total numeric,contractor_cost numeric,profit numeric,prepayment numeric,balance numeric,payment_status text,is_archived boolean DEFAULT false,updated_at timestamptz DEFAULT clock_timestamp());
INSERT INTO public.leader_orders(id,client_total,contractor_cost,profit,prepayment,balance,payment_status) VALUES('90000000-0000-4000-8000-000000000501',1700,1000,700,0,1700,'Не оплачено');
INSERT INTO public.leader_user_profiles VALUES ('90000000-0000-4000-8000-000000000502','owner',true);
GRANT USAGE ON SCHEMA public,auth,leader_private,extensions TO service_role,authenticated;
GRANT SELECT,UPDATE ON public.leader_orders,public.leader_user_profiles TO service_role;
GRANT SELECT,INSERT,UPDATE ON leader_private.leader_command_receipts TO service_role;
"""
setup += helper + """
CREATE FUNCTION leader_private.leader_has_crm_action(p_action text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT leader_private.leader_actor_has_crm_action(auth.uid(),p_action) $$;
GRANT EXECUTE ON FUNCTION leader_private.leader_actor_has_crm_action(uuid,text) TO service_role;
"""
tests = """
DO $permissions$ BEGIN
 IF has_function_privilege('authenticated','public.leader_write_finance_rpc(jsonb)','EXECUTE') OR has_function_privilege('anon','public.leader_write_finance_rpc(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'browser_rpc_privilege'; END IF;
 IF has_table_privilege('authenticated','public.leader_payments','INSERT') OR has_table_privilege('authenticated','public.leader_expenses','DELETE') THEN RAISE EXCEPTION 'direct_money_mutation_allowed'; END IF;
END $permissions$;
SET LOCAL ROLE service_role;
DO $test$
DECLARE
 actor uuid:='90000000-0000-4000-8000-000000000502'; oid uuid:='90000000-0000-4000-8000-000000000501';
 request jsonb; result jsonb; replay jsonb; stale jsonb; latest timestamptz; rid uuid; rev timestamptz; role_name text; rows_before bigint;
BEGIN
 SELECT updated_at INTO latest FROM public.leader_orders WHERE id=oid;
 request:=jsonb_build_object('actor_id',actor,'request',jsonb_build_object('action','finance.payment.create','request_id',gen_random_uuid(),'expected_updated_at',latest,'payload',jsonb_build_object('order_id',oid,'amount',1000.25,'date',current_date::text,'method','Перевод','category','Предоплата','comment','synthetic')));
 result:=public.leader_write_finance_rpc(request);
 IF result->>'ok' IS DISTINCT FROM 'true' OR (result->>'debt')::numeric<>699.75 THEN RAISE EXCEPTION 'create_failed:%',result; END IF;
 replay:=public.leader_write_finance_rpc(request);
 IF replay->>'idempotent_replay' IS DISTINCT FROM 'true' OR (SELECT count(*) FROM public.leader_payments)<>1 OR (SELECT count(*) FROM public.leader_activity_log)<>1 THEN RAISE EXCEPTION 'replay_duplicate:%',replay; END IF;
 result:=public.leader_write_finance_rpc(jsonb_set(request,'{request,payload,amount}','1001.25'));
 IF result#>>'{error,code}' IS DISTINCT FROM 'idempotency_conflict' THEN RAISE EXCEPTION 'conflict_not_rejected:%',result; END IF;
 stale:=jsonb_set(request,'{request,request_id}',to_jsonb(gen_random_uuid()));
 result:=public.leader_write_finance_rpc(stale);
 IF result#>>'{error,code}' IS DISTINCT FROM 'source_changed' THEN RAISE EXCEPTION 'stale_not_rejected:%',result; END IF;
 FOR role_name IN SELECT unnest(ARRAY['manager','designer','installer','contractor']) LOOP
  UPDATE public.leader_user_profiles SET role=role_name WHERE user_id=actor;
  result:=public.leader_write_finance_rpc(request);
  IF result#>>'{error,code}' IS DISTINCT FROM 'forbidden' THEN RAISE EXCEPTION 'wrong_role_replay_allowed:%',role_name; END IF;
 END LOOP;
 UPDATE public.leader_user_profiles SET role='owner',is_active=false WHERE user_id=actor;
 result:=public.leader_write_finance_rpc(request);
 IF result#>>'{error,code}' IS DISTINCT FROM 'inactive_profile' THEN RAISE EXCEPTION 'inactive_replay_allowed'; END IF;
 UPDATE public.leader_user_profiles SET is_active=true WHERE user_id=actor;
 SELECT updated_at INTO latest FROM public.leader_orders WHERE id=oid;
 request:=jsonb_set(jsonb_set(stale,'{request,expected_updated_at}',to_jsonb(latest)),'{request,payload,amount}','0');
 result:=public.leader_write_finance_rpc(request);
 IF result#>>'{error,code}' IS DISTINCT FROM 'invalid_payload' THEN RAISE EXCEPTION 'zero_record_allowed'; END IF;
 FOR role_name IN SELECT unnest(ARRAY['admin','accountant','owner']) LOOP
  UPDATE public.leader_user_profiles SET role=role_name WHERE user_id=actor;
  SELECT updated_at INTO latest FROM public.leader_orders WHERE id=oid;
  request:=jsonb_build_object('actor_id',actor,'request',jsonb_build_object('action','finance.expense.create','request_id',gen_random_uuid(),'expected_updated_at',latest,'payload',jsonb_build_object('order_id',oid,'amount',400.10,'date',current_date::text,'method','Наличные','category','Материалы','comment','synthetic')));
  result:=public.leader_write_finance_rpc(request);
  IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'allowed_role_failed:% %',role_name,result; END IF;
 END LOOP;
 rid:=(result->>'record_id')::uuid;rev:=(result->>'record_updated_at')::timestamptz;latest:=(result->>'order_updated_at')::timestamptz;
 request:=jsonb_build_object('actor_id',actor,'request',jsonb_build_object('action','finance.record.void','request_id',gen_random_uuid(),'expected_updated_at',latest,'payload',jsonb_build_object('order_id',oid,'kind','expense','record_id',rid,'expected_record_updated_at',rev,'reason','Ошибочная тестовая запись')));
 result:=public.leader_write_finance_rpc(request);
 IF result->>'ok' IS DISTINCT FROM 'true' OR (SELECT status FROM public.leader_expenses WHERE id=rid)<>'Отменён' OR (SELECT amount FROM public.leader_expenses WHERE id=rid)<>400.1 THEN RAISE EXCEPTION 'void_failed:%',result; END IF;
 replay:=public.leader_write_finance_rpc(request);
 IF replay->>'idempotent_replay' IS DISTINCT FROM 'true' OR (SELECT count(*) FROM public.leader_activity_log)<>5 THEN RAISE EXCEPTION 'void_replay_duplicate'; END IF;
 IF (SELECT prepayment FROM public.leader_orders WHERE id=oid)<>1000.25 OR (SELECT payment_status FROM public.leader_orders WHERE id=oid)<>'Частично оплачено' THEN RAISE EXCEPTION 'projection_mismatch'; END IF;
END $test$;
RESET ROLE;
-- Force a downstream audit failure: no money, revision or receipt may survive.
CREATE FUNCTION public.finance_test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic audit unavailable'; END$$;
CREATE TRIGGER finance_test_audit_failure BEFORE INSERT ON public.leader_activity_log FOR EACH ROW EXECUTE FUNCTION public.finance_test_audit_failure();
SET LOCAL ROLE service_role;
DO $atomic$
DECLARE rev timestamptz;result jsonb;oid uuid:='90000000-0000-4000-8000-000000000501';
BEGIN
 SELECT updated_at INTO rev FROM public.leader_orders WHERE id=oid;
 result:=public.leader_write_finance_rpc(jsonb_build_object('actor_id','90000000-0000-4000-8000-000000000502','request',jsonb_build_object('action','finance.payment.create','request_id',gen_random_uuid(),'expected_updated_at',rev,'payload',jsonb_build_object('order_id',oid,'amount',20,'date',current_date::text,'method','Перевод','category','Доплата','comment','synthetic'))));
 IF result#>>'{error,code}' IS DISTINCT FROM 'finance_write_failed' OR (SELECT count(*) FROM public.leader_payments)<>1 OR (SELECT updated_at FROM public.leader_orders WHERE id=oid) IS DISTINCT FROM rev OR (SELECT count(*) FROM leader_private.leader_command_receipts)<>5 THEN RAISE EXCEPTION 'atomic_rollback_failed:%',result; END IF;
END $atomic$;
RESET ROLE;
ROLLBACK;
"""
out = ROOT / 'build/finance-rpc-test.sql'; out.parent.mkdir(exist_ok=True)
out.write_text(setup + source + tests)
print('Built disposable PostgreSQL finance transaction tests from actual source.')
