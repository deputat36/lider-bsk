#!/usr/bin/env python3
"""Exercise the deployed command SQL in the existing disposable PostgreSQL gate."""
import json
from pathlib import Path
from build_finance_rpc_test import setup, source

ROOT = Path(__file__).resolve().parents[1]
operation_sql = (ROOT/'supabase/staging-migrations/20261001082221_order_operations_v1.sql').read_text()
extra = """
ALTER TABLE public.leader_orders ADD COLUMN owner_id uuid DEFAULT '90000000-0000-4000-8000-000000000502',ADD COLUMN status text DEFAULT 'Новый',ADD COLUMN layout_status text DEFAULT 'Макета нет',ADD COLUMN layout_comment text,ADD COLUMN deadline date,ADD COLUMN data jsonb DEFAULT '{}';
CREATE TABLE public.leader_order_items(id uuid,order_id uuid);
CREATE TABLE public.leader_design_tasks(id uuid,order_id uuid,task_status text);
CREATE TABLE public.leader_production_jobs(id uuid,order_id uuid,production_status text);
CREATE TABLE public.leader_installation_jobs(id uuid,order_id uuid,install_status text);
GRANT SELECT,UPDATE ON public.leader_orders,public.leader_design_tasks,public.leader_production_jobs,public.leader_installation_jobs TO service_role;
UPDATE leader_private.leader_role_action_matrix_v1 SET allowed_actions=allowed_actions||ARRAY['orders.read','orders.create','orders.update','orders.transition','design.write'] WHERE role IN ('owner','admin','manager');
"""
tests = r"""
SET LOCAL ROLE service_role;
DO $test$
DECLARE actor uuid:='90000000-0000-4000-8000-000000000502';oid uuid:='90000000-0000-4000-8000-000000000501';req jsonb;r jsonb;rev timestamptz;target text;role_name text;
BEGIN
 SELECT updated_at INTO rev FROM public.leader_orders WHERE id=oid;
 req:=jsonb_build_object('actor_id',actor,'request',jsonb_build_object('action','order.transition','request_id',gen_random_uuid(),'expected_updated_at',rev,'payload',jsonb_build_object('order_id',oid,'target_status','production')));
 r:=public.leader_write_order_operation_rpc(req);
 IF r#>>'{error,code}' IS DISTINCT FROM 'layout_not_ready' THEN RAISE EXCEPTION 'layout_gate:%',r; END IF;
 req:=jsonb_build_object('actor_id',actor,'request',jsonb_build_object('action','order.layout_not_required','request_id',gen_random_uuid(),'expected_updated_at',rev,'payload',jsonb_build_object('order_id',oid,'comment','Готовая услуга без дизайна')));
 r:=public.leader_write_order_operation_rpc(req);
 IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'layout_not_required:%',r; END IF;
 r:=public.leader_write_order_operation_rpc(req);
 IF r->>'idempotent_replay' IS DISTINCT FROM 'true' OR (SELECT count(*) FROM public.leader_activity_log)<>1 THEN RAISE EXCEPTION 'order_replay_duplicate:%',r; END IF;
 r:=public.leader_write_order_operation_rpc(jsonb_set(req,'{request,payload,comment}','"changed"'));
 IF r#>>'{error,code}' IS DISTINCT FROM 'idempotency_conflict' THEN RAISE EXCEPTION 'order_conflict:%',r; END IF;
 r:=public.leader_write_order_operation_rpc(jsonb_set(req,'{request,request_id}',to_jsonb(gen_random_uuid())));
 IF r#>>'{error,code}' IS DISTINCT FROM 'source_changed' THEN RAISE EXCEPTION 'order_stale:%',r; END IF;
 FOR role_name IN SELECT unnest(ARRAY['accountant','designer','installer','contractor']) LOOP
  UPDATE public.leader_user_profiles SET role=role_name WHERE user_id=actor;
  r:=public.leader_write_order_operation_rpc(req);
  IF r#>>'{error,code}' IS DISTINCT FROM 'forbidden' THEN RAISE EXCEPTION 'order_role:% %',role_name,r; END IF;
 END LOOP;
 UPDATE public.leader_user_profiles SET role='owner',is_active=false WHERE user_id=actor;
 r:=public.leader_write_order_operation_rpc(req);
 IF r#>>'{error,code}' IS DISTINCT FROM 'inactive_profile' THEN RAISE EXCEPTION 'order_inactive:%',r; END IF;
 UPDATE public.leader_user_profiles SET is_active=true WHERE user_id=actor;
 FOREACH target IN ARRAY ARRAY['production','ready','issued'] LOOP
  SELECT updated_at INTO rev FROM public.leader_orders WHERE id=oid;
  req:=jsonb_build_object('actor_id',actor,'request',jsonb_build_object('action','order.transition','request_id',gen_random_uuid(),'expected_updated_at',rev,'payload',jsonb_build_object('order_id',oid,'target_status',target,'comment','Результат передан клиенту')));
  r:=public.leader_write_order_operation_rpc(req);
  IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'order_lifecycle:% %',target,r; END IF;
 END LOOP;
 SELECT updated_at INTO rev FROM public.leader_orders WHERE id=oid;
 req:=jsonb_build_object('actor_id',actor,'request',jsonb_build_object('action','order.transition','request_id',gen_random_uuid(),'expected_updated_at',rev,'payload',jsonb_build_object('order_id',oid,'target_status','closed')));
 r:=public.leader_write_order_operation_rpc(req);
 IF r#>>'{error,code}' IS DISTINCT FROM 'closing_checklist_required' THEN RAISE EXCEPTION 'order_checklist:%',r; END IF;
 req:=jsonb_set(req,'{request,payload}',(req#>'{request,payload}')||'{"expenses_reviewed":true,"documents_reviewed":true}');
 r:=public.leader_write_order_operation_rpc(req);
 IF r#>>'{error,code}' IS DISTINCT FROM 'unpaid_order' THEN RAISE EXCEPTION 'order_unpaid:%',r; END IF;
 FOR i IN 1..2 LOOP
  SELECT updated_at INTO rev FROM public.leader_orders WHERE id=oid;
  r:=public.leader_write_finance_rpc(jsonb_build_object('actor_id',actor,'request',jsonb_build_object('action','finance.payment.create','request_id',gen_random_uuid(),'expected_updated_at',rev,'payload',jsonb_build_object('order_id',oid,'amount',850,'date',current_date::text,'method','Перевод','category','Доплата'))));
  IF r->>'ok' IS DISTINCT FROM 'true' OR (i=1 AND r->>'payment_status'<>'Частично оплачено') THEN RAISE EXCEPTION 'order_payment:%',r; END IF;
 END LOOP;
 SELECT updated_at INTO rev FROM public.leader_orders WHERE id=oid;
 req:=jsonb_set(req,'{request,expected_updated_at}',to_jsonb(rev));
 r:=public.leader_write_order_operation_rpc(req);
 IF r->>'ok' IS DISTINCT FROM 'true' OR (SELECT completed_at IS NULL OR issued_at IS NULL OR balance<>0 OR status<>'Закрыт' FROM public.leader_orders WHERE id=oid) THEN RAISE EXCEPTION 'close_failed:%',r; END IF;
 r:=public.leader_write_order_operation_rpc(req);
 IF r->>'idempotent_replay' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'close_replay:%',r; END IF;
 UPDATE public.leader_orders SET payment_status='Не оплачено',prepayment=999999,balance=888888 WHERE id=oid;
 IF (SELECT payment_status<>'Оплачено' OR prepayment<>1700 OR balance<>0 FROM public.leader_orders WHERE id=oid) THEN RAISE EXCEPTION 'legacy_financial_projection_bypass'; END IF;
END $test$;
RESET ROLE;
DO $acl$ BEGIN
 IF has_function_privilege('authenticated','public.leader_write_order_operation_rpc(jsonb)','EXECUTE') OR has_function_privilege('anon','public.leader_write_order_operation_rpc(jsonb)','EXECUTE') OR has_any_column_privilege('authenticated','public.leader_orders','UPDATE') THEN RAISE EXCEPTION 'order_browser_write_allowed'; END IF;
END $acl$;
ROLLBACK;
"""
out=ROOT/'build/order-operations-test.sql';out.parent.mkdir(exist_ok=True)
out.write_text(setup+source+extra+operation_sql+tests)
print('Built actual order lifecycle, money projection, permissions and replay SQL tests.')
