-- STAGING ONLY integration test.
-- Target: lider-bsk-staging / otulfnouybahfnsycxqn.
-- Uses synthetic UUIDs and removes every inserted row before COMMIT.

begin;
set local statement_timeout = '30s';
set local lock_timeout = '5s';

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM leader_staging.environment_guard
    WHERE singleton = true
      AND project_ref = 'otulfnouybahfnsycxqn'
      AND environment_name = 'staging'
      AND repository = 'deputat36/lider-bsk'
  ) THEN
    RAISE EXCEPTION 'staging_environment_guard_failed';
  END IF;
END
$guard$;

CREATE TEMP TABLE staging_design_rpc_results (
  test_name text PRIMARY KEY,
  response jsonb NOT NULL
) ON COMMIT PRESERVE ROWS;

CREATE OR REPLACE FUNCTION leader_staging.build_design_test_payload(
  p_actor uuid,
  p_request uuid,
  p_expected timestamptz,
  p_order uuid,
  p_key text,
  p_needs uuid[],
  p_title text DEFAULT 'Synthetic design task',
  p_production uuid DEFAULT NULL,
  p_task_extra jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'actor_id', p_actor,
    'actor_email', 'synthetic@example.invalid',
    'request', jsonb_build_object(
      'action', 'design_task.create_from_order',
      'request_id', p_request,
      'expected_updated_at', p_expected,
      'payload', jsonb_build_object(
        'order_id', p_order,
        'production_job_id', p_production,
        'idempotency_key', p_key,
        'need_ids', to_jsonb(p_needs),
        'task', jsonb_build_object(
          'title', p_title,
          'priority', 'Высокий',
          'deadline', NULL,
          'task_text', 'Synthetic brief only',
          'reference_link', 'https://example.invalid/reference'
        ) || p_task_extra
      )
    )
  );
$function$;

INSERT INTO public.leader_user_profiles
  (user_id, email, full_name, role, is_active)
VALUES
  ('00000000-0000-0000-0000-000000000101', 'owner@example.invalid', 'Synthetic Owner', 'owner', true),
  ('00000000-0000-0000-0000-000000000102', 'accountant@example.invalid', 'Synthetic Accountant', 'accountant', true),
  ('00000000-0000-0000-0000-000000000103', 'inactive@example.invalid', 'Synthetic Inactive', 'manager', false),
  ('00000000-0000-0000-0000-000000000104', 'designer@example.invalid', 'Synthetic Designer', 'designer', true);

INSERT INTO public.leader_leads (id, status, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000201', 'В работе', '2026-07-13 12:00:00+00', '2026-07-13 12:00:00+00'),
  ('00000000-0000-0000-0000-000000000202', 'В работе', '2026-07-13 12:00:00+00', '2026-07-13 12:00:00+00');

INSERT INTO public.leader_orders (
  id, owner_id, order_number, lead_id, project_name, client_name, client_phone,
  status, priority, deadline, layout_status, payment_status,
  client_total, contractor_cost, profit, prepayment, balance,
  production_status, internal_comment, data, is_archived, created_at, updated_at
)
SELECT
  ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000101'::uuid,
  9000 + n,
  '00000000-0000-0000-0000-000000000201'::uuid,
  'Synthetic Order ' || n,
  'PRIVATE_CLIENT_SENTINEL_' || n,
  '+7000000' || lpad(n::text, 4, '0'),
  'Новый', 'Обычный', date '2026-07-30', 'Макета нет', 'Не оплачено',
  910000 + n, 920000 + n, 930000 + n, 940000 + n, 950000 + n,
  'Не передано', 'PRIVATE_INTERNAL_SENTINEL_' || n,
  jsonb_build_object('private_marker', 'PRIVATE_DATA_SENTINEL_' || n),
  false, '2026-07-13 12:00:00+00', '2026-07-13 12:00:00+00'
FROM generate_series(301, 305) AS n;

INSERT INTO public.leader_lead_needs (
  id, lead_id, need_type, title, need_design, design_reason,
  deadline_date, status, completeness_score, missing_fields, created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000201', 'Наружная реклама', 'Design A', true, '', NULL, 'Подтверждено', 70, '["Размер"]', '2026-07-13 12:00:00+00', '2026-07-13 12:00:00+00'),
  ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000201', 'Печать', 'No design', false, NULL, '2026-07-29', 'Подтверждено', 100, '[]', '2026-07-13 12:00:00+00', '2026-07-13 12:00:00+00'),
  ('00000000-0000-0000-0000-000000000403', '00000000-0000-0000-0000-000000000202', 'Наружная реклама', 'Foreign lead', true, 'Макет нужен', '2026-07-29', 'Подтверждено', 100, '[]', '2026-07-13 12:00:00+00', '2026-07-13 12:00:00+00'),
  ('00000000-0000-0000-0000-000000000404', '00000000-0000-0000-0000-000000000201', 'Наружная реклама', 'Design B', true, 'Макет нужен', '2026-07-28', 'Подтверждено', 100, '[]', '2026-07-13 12:00:00+00', '2026-07-13 12:00:00+00');

INSERT INTO public.leader_production_jobs
  (id, owner_id, order_id, title, production_status, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', 'Production A', 'Не передано', '2026-07-13 12:00:00+00', '2026-07-13 12:00:00+00'),
  ('00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000302', 'Production B', 'Не передано', '2026-07-13 12:00:00+00', '2026-07-13 12:00:00+00');

DO $privileges$
BEGIN
  IF has_function_privilege('anon', 'public.leader_create_design_task_from_order_rpc(jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.leader_create_design_task_from_order_rpc(jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.leader_create_design_task_from_order_rpc(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'RPC execute grants are unsafe';
  END IF;
END
$privileges$;

INSERT INTO staging_design_rpc_results
SELECT 'success', public.leader_create_design_task_from_order_rpc(
  leader_staging.build_design_test_payload(
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000601',
    '2026-07-13 12:00:00+00',
    '00000000-0000-0000-0000-000000000301',
    'staging-design-success-v1',
    ARRAY['00000000-0000-0000-0000-000000000401']::uuid[],
    'Synthetic Design Success',
    '00000000-0000-0000-0000-000000000501'
  )
);

DO $success$
DECLARE v jsonb; v_task uuid; v_text text;
BEGIN
  SELECT response INTO v FROM staging_design_rpc_results WHERE test_name = 'success';
  IF coalesce((v ->> 'ok')::boolean, false) IS NOT TRUE
     OR coalesce((v ->> 'idempotent_replay')::boolean, true) IS NOT FALSE THEN
    RAISE EXCEPTION 'success failed: %', v;
  END IF;
  v_task := (v #>> '{entity,id}')::uuid;
  IF (SELECT count(*) FROM public.leader_design_tasks WHERE id = v_task) <> 1
     OR (SELECT count(*) FROM public.leader_design_task_events WHERE task_id = v_task) <> 1
     OR (SELECT count(*) FROM leader_private.leader_command_receipts WHERE idempotency_key = 'staging-design-success-v1' AND state = 'success') <> 1 THEN
    RAISE EXCEPTION 'atomic success writes are incomplete';
  END IF;
  IF jsonb_array_length(coalesce(v -> 'warnings', '[]')) < 3 THEN
    RAISE EXCEPTION 'readiness warnings missing: %', v;
  END IF;
  SELECT v::text || to_jsonb(t)::text INTO v_text FROM public.leader_design_tasks t WHERE id = v_task;
  IF v_text LIKE '%PRIVATE_%' OR v_text LIKE '%+7000000%' OR v_text LIKE '%910301%' OR v_text LIKE '%920301%' OR v_text LIKE '%930301%' THEN
    RAISE EXCEPTION 'privacy-safe projection leaked order data';
  END IF;
  IF v #> '{entity,owner_id}' IS NOT NULL OR v #> '{entity,created_by}' IS NOT NULL OR v #> '{order,payment_status}' IS NOT NULL THEN
    RAISE EXCEPTION 'forbidden response field present: %', v;
  END IF;
END
$success$;

INSERT INTO staging_design_rpc_results
SELECT 'replay', public.leader_create_design_task_from_order_rpc(
  leader_staging.build_design_test_payload(
    '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000601',
    '2026-07-13 12:00:00+00', '00000000-0000-0000-0000-000000000301',
    'staging-design-success-v1', ARRAY['00000000-0000-0000-0000-000000000401']::uuid[],
    'Synthetic Design Success', '00000000-0000-0000-0000-000000000501'
  )
);

INSERT INTO staging_design_rpc_results
SELECT 'hash_conflict', public.leader_create_design_task_from_order_rpc(
  leader_staging.build_design_test_payload(
    '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000602',
    '2026-07-13 12:00:00+00', '00000000-0000-0000-0000-000000000301',
    'staging-design-success-v1', ARRAY['00000000-0000-0000-0000-000000000401']::uuid[],
    'Changed request'
  )
);

INSERT INTO staging_design_rpc_results
SELECT 'active_conflict', public.leader_create_design_task_from_order_rpc(
  leader_staging.build_design_test_payload(
    '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000603',
    '2026-07-13 12:00:00+00', '00000000-0000-0000-0000-000000000301',
    'staging-design-active-v1', ARRAY['00000000-0000-0000-0000-000000000401']::uuid[]
  )
);

INSERT INTO staging_design_rpc_results
SELECT 'denied_role', public.leader_create_design_task_from_order_rpc(
  leader_staging.build_design_test_payload(
    '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000604',
    '2026-07-13 12:00:00+00', '00000000-0000-0000-0000-000000000302',
    'staging-design-denied-v1', ARRAY['00000000-0000-0000-0000-000000000404']::uuid[]
  )
);

INSERT INTO staging_design_rpc_results
SELECT 'inactive', public.leader_create_design_task_from_order_rpc(
  leader_staging.build_design_test_payload(
    '00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000605',
    '2026-07-13 12:00:00+00', '00000000-0000-0000-0000-000000000302',
    'staging-design-inactive-v1', ARRAY['00000000-0000-0000-0000-000000000404']::uuid[]
  )
);

INSERT INTO staging_design_rpc_results
SELECT 'stale', public.leader_create_design_task_from_order_rpc(
  leader_staging.build_design_test_payload(
    '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000606',
    '2026-07-13 11:59:59+00', '00000000-0000-0000-0000-000000000302',
    'staging-design-stale-v1', ARRAY['00000000-0000-0000-0000-000000000404']::uuid[]
  )
);

INSERT INTO staging_design_rpc_results
SELECT 'non_design', public.leader_create_design_task_from_order_rpc(
  leader_staging.build_design_test_payload(
    '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000607',
    '2026-07-13 12:00:00+00', '00000000-0000-0000-0000-000000000302',
    'staging-design-nondesign-v1', ARRAY['00000000-0000-0000-0000-000000000402']::uuid[]
  )
);

INSERT INTO staging_design_rpc_results
SELECT 'foreign_need', public.leader_create_design_task_from_order_rpc(
  leader_staging.build_design_test_payload(
    '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000608',
    '2026-07-13 12:00:00+00', '00000000-0000-0000-0000-000000000302',
    'staging-design-foreign-v1', ARRAY['00000000-0000-0000-0000-000000000403']::uuid[]
  )
);

INSERT INTO staging_design_rpc_results
SELECT 'wrong_production', public.leader_create_design_task_from_order_rpc(
  leader_staging.build_design_test_payload(
    '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000609',
    '2026-07-13 12:00:00+00', '00000000-0000-0000-0000-000000000302',
    'staging-design-wrong-production-v1', ARRAY['00000000-0000-0000-0000-000000000404']::uuid[],
    'Wrong production', '00000000-0000-0000-0000-000000000501'
  )
);

DO $negative_cases$
DECLARE v jsonb;
BEGIN
  SELECT response INTO v FROM staging_design_rpc_results WHERE test_name='replay';
  IF coalesce((v->>'ok')::boolean,false) IS NOT TRUE OR coalesce((v->>'idempotent_replay')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'replay failed: %',v; END IF;
  SELECT response INTO v FROM staging_design_rpc_results WHERE test_name='hash_conflict';
  IF v#>>'{error,code}' <> 'conflict' THEN RAISE EXCEPTION 'hash conflict failed: %',v; END IF;
  SELECT response INTO v FROM staging_design_rpc_results WHERE test_name='active_conflict';
  IF v#>>'{error,code}' <> 'conflict' THEN RAISE EXCEPTION 'active conflict failed: %',v; END IF;
  SELECT response INTO v FROM staging_design_rpc_results WHERE test_name='denied_role';
  IF v#>>'{error,code}' <> 'forbidden' THEN RAISE EXCEPTION 'role guard failed: %',v; END IF;
  SELECT response INTO v FROM staging_design_rpc_results WHERE test_name='inactive';
  IF v#>>'{error,code}' <> 'access_denied' THEN RAISE EXCEPTION 'profile guard failed: %',v; END IF;
  SELECT response INTO v FROM staging_design_rpc_results WHERE test_name='stale';
  IF v#>>'{error,code}' <> 'conflict' THEN RAISE EXCEPTION 'stale guard failed: %',v; END IF;
  SELECT response INTO v FROM staging_design_rpc_results WHERE test_name='non_design';
  IF v#>>'{error,code}' <> 'validation_error' THEN RAISE EXCEPTION 'design evidence guard failed: %',v; END IF;
  SELECT response INTO v FROM staging_design_rpc_results WHERE test_name='foreign_need';
  IF v#>>'{error,code}' <> 'not_found' THEN RAISE EXCEPTION 'foreign need guard failed: %',v; END IF;
  SELECT response INTO v FROM staging_design_rpc_results WHERE test_name='wrong_production';
  IF v#>>'{error,code}' <> 'not_found' THEN RAISE EXCEPTION 'production relation guard failed: %',v; END IF;
  IF (SELECT count(*) FROM public.leader_design_tasks WHERE order_id='00000000-0000-0000-0000-000000000301') <> 1 THEN RAISE EXCEPTION 'replay or conflicts created duplicate tasks'; END IF;
END
$negative_cases$;

UPDATE public.leader_design_tasks
SET task_status='Завершено', completed_at=now(), updated_at=now()
WHERE order_id='00000000-0000-0000-0000-000000000301';

INSERT INTO staging_design_rpc_results
SELECT 'after_completed', public.leader_create_design_task_from_order_rpc(
  leader_staging.build_design_test_payload(
    '00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000610',
    '2026-07-13 12:00:00+00', '00000000-0000-0000-0000-000000000301',
    'staging-design-after-completed-v1', ARRAY['00000000-0000-0000-0000-000000000401']::uuid[]
  )
);

INSERT INTO public.leader_design_tasks
  (id, owner_id, order_id, title, task_status, layout_status, source, created_by, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000101',
   '00000000-0000-0000-0000-000000000303', 'Unknown status sentinel', 'НЕИЗВЕСТНЫЙ СТАТУС',
   'Макет не начат', 'synthetic_test', '00000000-0000-0000-0000-000000000101',
   '2026-07-13 12:00:00+00', '2026-07-13 12:00:00+00');

INSERT INTO staging_design_rpc_results
SELECT 'unknown_status', public.leader_create_design_task_from_order_rpc(
  leader_staging.build_design_test_payload(
    '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000611',
    '2026-07-13 12:00:00+00', '00000000-0000-0000-0000-000000000303',
    'staging-design-unknown-v1', ARRAY['00000000-0000-0000-0000-000000000404']::uuid[]
  )
);

DO $status_cases$
DECLARE a jsonb; b jsonb;
BEGIN
  SELECT response INTO a FROM staging_design_rpc_results WHERE test_name='after_completed';
  SELECT response INTO b FROM staging_design_rpc_results WHERE test_name='unknown_status';
  IF coalesce((a->>'ok')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'completed task did not allow new task: %',a; END IF;
  IF b#>>'{error,code}' <> 'conflict' THEN RAISE EXCEPTION 'unknown status did not fail closed: %',b; END IF;
END
$status_cases$;

CREATE OR REPLACE FUNCTION leader_staging.force_event_failure()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
BEGIN RAISE EXCEPTION 'forced_event_failure'; END $f$;
CREATE TRIGGER staging_force_event_failure BEFORE INSERT ON public.leader_design_task_events
FOR EACH ROW EXECUTE FUNCTION leader_staging.force_event_failure();

INSERT INTO staging_design_rpc_results
SELECT 'event_rollback', public.leader_create_design_task_from_order_rpc(
  leader_staging.build_design_test_payload(
    '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000612',
    '2026-07-13 12:00:00+00', '00000000-0000-0000-0000-000000000304',
    'staging-design-event-rollback-v1', ARRAY['00000000-0000-0000-0000-000000000404']::uuid[]
  )
);
DROP TRIGGER staging_force_event_failure ON public.leader_design_task_events;
DROP FUNCTION leader_staging.force_event_failure();

CREATE OR REPLACE FUNCTION leader_staging.force_receipt_failure()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
BEGIN IF NEW.state='success' THEN RAISE EXCEPTION 'forced_receipt_failure'; END IF; RETURN NEW; END $f$;
CREATE TRIGGER staging_force_receipt_failure BEFORE UPDATE ON leader_private.leader_command_receipts
FOR EACH ROW EXECUTE FUNCTION leader_staging.force_receipt_failure();

INSERT INTO staging_design_rpc_results
SELECT 'receipt_rollback', public.leader_create_design_task_from_order_rpc(
  leader_staging.build_design_test_payload(
    '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000613',
    '2026-07-13 12:00:00+00', '00000000-0000-0000-0000-000000000305',
    'staging-design-receipt-rollback-v1', ARRAY['00000000-0000-0000-0000-000000000404']::uuid[]
  )
);
DROP TRIGGER staging_force_receipt_failure ON leader_private.leader_command_receipts;
DROP FUNCTION leader_staging.force_receipt_failure();

DO $rollback_cases$
DECLARE a jsonb; b jsonb;
BEGIN
  SELECT response INTO a FROM staging_design_rpc_results WHERE test_name='event_rollback';
  SELECT response INTO b FROM staging_design_rpc_results WHERE test_name='receipt_rollback';
  IF a#>>'{error,code}' <> 'persistence_failed' OR b#>>'{error,code}' <> 'persistence_failed' THEN RAISE EXCEPTION 'rollback errors are unstable: %, %',a,b; END IF;
  IF EXISTS (SELECT 1 FROM public.leader_design_tasks WHERE order_id IN ('00000000-0000-0000-0000-000000000304','00000000-0000-0000-0000-000000000305'))
     OR EXISTS (SELECT 1 FROM public.leader_design_task_events WHERE order_id IN ('00000000-0000-0000-0000-000000000304','00000000-0000-0000-0000-000000000305'))
     OR EXISTS (SELECT 1 FROM leader_private.leader_command_receipts WHERE idempotency_key IN ('staging-design-event-rollback-v1','staging-design-receipt-rollback-v1')) THEN
    RAISE EXCEPTION 'transaction rollback left task, event or receipt evidence';
  END IF;
END
$rollback_cases$;

DO $order_unchanged$
DECLARE o public.leader_orders%rowtype;
BEGIN
  SELECT * INTO o FROM public.leader_orders WHERE id='00000000-0000-0000-0000-000000000301';
  IF o.status<>'Новый' OR o.layout_status<>'Макета нет' OR o.production_status<>'Не передано'
     OR o.payment_status<>'Не оплачено' OR o.client_total<>910301 OR o.contractor_cost<>920301
     OR o.profit<>930301 OR o.prepayment<>940301 OR o.balance<>950301
     OR o.internal_comment<>'PRIVATE_INTERNAL_SENTINEL_301' THEN
    RAISE EXCEPTION 'design command mutated forbidden order fields';
  END IF;
END
$order_unchanged$;

DELETE FROM public.leader_design_task_events WHERE order_id IN (
  '00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-000000000302','00000000-0000-0000-0000-000000000303','00000000-0000-0000-0000-000000000304','00000000-0000-0000-0000-000000000305');
DELETE FROM public.leader_design_tasks WHERE order_id IN (
  '00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-000000000302','00000000-0000-0000-0000-000000000303','00000000-0000-0000-0000-000000000304','00000000-0000-0000-0000-000000000305');
DELETE FROM leader_private.leader_command_receipts WHERE actor_id IN (
  '00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000104');
DELETE FROM public.leader_production_jobs WHERE id IN ('00000000-0000-0000-0000-000000000501','00000000-0000-0000-0000-000000000502');
DELETE FROM public.leader_lead_needs WHERE id IN ('00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000402','00000000-0000-0000-0000-000000000403','00000000-0000-0000-0000-000000000404');
DELETE FROM public.leader_orders WHERE order_number BETWEEN 9301 AND 9305;
DELETE FROM public.leader_leads WHERE id IN ('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000202');
DELETE FROM public.leader_user_profiles WHERE email LIKE '%@example.invalid';
DROP FUNCTION leader_staging.build_design_test_payload(uuid,uuid,timestamptz,uuid,text,uuid[],text,uuid,jsonb);

DO $cleanup$
BEGIN
  IF EXISTS (SELECT 1 FROM public.leader_user_profiles WHERE email LIKE '%@example.invalid')
     OR EXISTS (SELECT 1 FROM public.leader_orders WHERE order_number BETWEEN 9301 AND 9305)
     OR EXISTS (SELECT 1 FROM leader_private.leader_command_receipts WHERE idempotency_key LIKE 'staging-design-%') THEN
    RAISE EXCEPTION 'synthetic test cleanup failed';
  END IF;
END
$cleanup$;

COMMIT;

SELECT jsonb_build_object(
  'ok', true,
  'case_count', (SELECT count(*) FROM staging_design_rpc_results),
  'remaining', jsonb_build_object(
    'profiles', (SELECT count(*) FROM public.leader_user_profiles),
    'leads', (SELECT count(*) FROM public.leader_leads),
    'orders', (SELECT count(*) FROM public.leader_orders),
    'needs', (SELECT count(*) FROM public.leader_lead_needs),
    'production_jobs', (SELECT count(*) FROM public.leader_production_jobs),
    'design_tasks', (SELECT count(*) FROM public.leader_design_tasks),
    'design_events', (SELECT count(*) FROM public.leader_design_task_events),
    'receipts', (SELECT count(*) FROM leader_private.leader_command_receipts)
  )
) AS staging_design_task_rpc_test_summary;
