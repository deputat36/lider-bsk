-- STAGING ONLY integration test.
-- Target: lider-bsk-staging / otulfnouybahfnsycxqn.
-- Uses synthetic UUIDs and removes every inserted row before COMMIT.

begin;

set local statement_timeout = '30s';
set local lock_timeout = '5s';

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM leader_staging.environment_guard
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
  response jsonb,
  passed boolean NOT NULL DEFAULT true
) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION leader_staging.build_design_test_payload(
  p_actor_id uuid,
  p_request_id uuid,
  p_expected_updated_at timestamptz,
  p_order_id uuid,
  p_idempotency_key text,
  p_need_ids uuid[],
  p_title text DEFAULT 'Синтетическая дизайн-задача',
  p_production_job_id uuid DEFAULT NULL,
  p_extra_task jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'actor_id', p_actor_id,
    'actor_email', 'synthetic@example.invalid',
    'request', jsonb_build_object(
      'action', 'design_task.create_from_order',
      'request_id', p_request_id,
      'expected_updated_at', p_expected_updated_at,
      'payload', jsonb_build_object(
        'order_id', p_order_id,
        'production_job_id', p_production_job_id,
        'idempotency_key', p_idempotency_key,
        'need_ids', to_jsonb(p_need_ids),
        'task', jsonb_build_object(
          'title', p_title,
          'priority', 'Высокий',
          'deadline', NULL,
          'task_text', 'Только синтетическое техническое задание.',
          'reference_link', 'https://example.invalid/reference'
        ) || p_extra_task
      )
    )
  );
$function$;

-- Synthetic actors.
INSERT INTO public.leader_user_profiles (
  user_id, email, full_name, role, is_active, permissions
) VALUES
  ('00000000-0000-0000-0000-000000000101', 'owner@example.invalid', 'Synthetic Owner', 'owner', true, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000102', 'accountant@example.invalid', 'Synthetic Accountant', 'accountant', true, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000103', 'inactive@example.invalid', 'Synthetic Inactive', 'manager', false, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000104', 'designer@example.invalid', 'Synthetic Designer', 'designer', true, '{}'::jsonb);

-- Synthetic leads.
INSERT INTO public.leader_leads (id, status, created_at, updated_at) VALUES
  ('00000000-0000-0000-0000-000000000201', 'В работе', '2026-07-13 12:00:00+00', '2026-07-13 12:00:00+00'),
  ('00000000-0000-0000-0000-000000000202', 'В работе', '2026-07-13 12:00:00+00', '2026-07-13 12:00:00+00');

-- Synthetic orders. Sentinel values must never appear in RPC responses or design tasks.
INSERT INTO public.leader_orders (
  id, owner_id, order_number, lead_id, project_name, client_name, client_phone,
  status, priority, deadline, layout_status, layout_link, payment_status,
  client_total, contractor_cost, profit, prepayment, balance,
  production_status, internal_comment, data, is_archived, created_at, updated_at
) VALUES
  (
    '00000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000101', 9301,
    '00000000-0000-0000-0000-000000000201',
    'Synthetic Order A', 'PRIVATE_CLIENT_SENTINEL_A', '+700000009301',
    'Новый', 'Обычный', '2026-07-30', 'Макета нет', NULL, 'Не оплачено',
    930101, 930102, 930103, 930104, 930105,
    'Не передано', 'PRIVATE_INTERNAL_SENTINEL_A',
    '{"private_marker":"PRIVATE_DATA_SENTINEL_A"}'::jsonb,
    false, '2026-07-13 12:00:00+00', '2026-07-13 12:00:00+00'
  ),
  (
    '00000000-0000-0000-0000-000000000302',
    '00000000-0000-0000-0000-000000000101', 9302,
    '00000000-0000-0000-0000-000000000201',
    'Synthetic Order B', 'PRIVATE_CLIENT_SENTINEL_B', '+700000009302',
    'Новый', 'Обычный', '2026-07-31', 'Макета нет', NULL, 'Не оплачено',
    930201, 930202, 930203, 930204, 930205,
    'Не передано', 'PRIVATE_INTERNAL_SENTINEL_B', '{}'::jsonb,
    false, '2026-07-13 12:00:00+00', '2026-07-13 12:00:00+00'
  ),
  (
    '00000000-0000-0000-0000-000000000303',
    '00000000-0000-0000-0000-000000000101', 9303,
    '00000000-0000-0000-0000-000000000201',
    'Synthetic Order C', 'PRIVATE_CLIENT_SENTINEL_C', '+700000009303',
    'Новый', 'Обычный', '2026-08-01', 'Макета нет', NULL, 'Не оплачено',
    930301, 930302, 930303, 930304, 930305,
    'Не передано', 'PRIVATE_INTERNAL_SENTINEL_C', '{}'::jsonb,
    false, '2026-07-13 12:00:00+00', '2026-07-13 12:00:00+00'
  ),
  (
    '00000000-0000-0000-0000-000000000304',
    '00000000-0000-0000-0000-000000000101', 9304,
    '00000000-0000-0000-0000-000000000201',
    'Synthetic Order D', 'PRIVATE_CLIENT_SENTINEL_D', '+700000009304',
    'Новый', 'Обычный', '2026-08-02', 'Макета нет', NULL, 'Не оплачено',
    930401, 930402, 930403, 930404, 930405,
    'Не передано', 'PRIVATE_INTERNAL_SENTINEL_D', '{}'::jsonb,
    false, '2026-07-13 12:00:00+00', '2026-07-13 12:00:00+00'
  ),
  (
    '00000000-0000-0000-0000-000000000305',
    '00000000-0000-0000-0000-000000000101', 9305,
    '00000000-0000-0000-0000-000000000201',
    'Synthetic Order E', 'PRIVATE_CLIENT_SENTINEL_E', '+700000009305',
    'Новый', 'Обычный', '2026-08-03', 'Макета нет', NULL, 'Не оплачено',
    930501, 930502, 930503, 930504, 930505,
    'Не передано', 'PRIVATE_INTERNAL_SENTINEL_E', '{}'::jsonb,
    false, '2026-07-13 12:00:00+00', '2026-07-13 12:00:00+00'
  );

INSERT INTO public.leader_lead_needs (
  id, lead_id, need_type, title, need_design, design_reason,
  deadline_date, status, completeness_score, missing_fields,
  created_at, updated_at
) VALUES
  (
    '00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000201',
    'Наружная реклама', 'Design Need A', true, '', NULL,
    'Подтверждено', 70, '["Размер"]'::jsonb,
    '2026-07-13 12:00:00+00', '2026-07-13 12:00:00+00'
  ),
  (
    '00000000-0000-0000-0000-000000000402',
    '00000000-0000-0000-0000-000000000201',
    'Печать', 'Non-design Need', false, NULL, '2026-07-29',
    'Подтверждено', 100, '[]'::jsonb,
    '2026-07-13 12:00:00+00', '2026-07-13 12:00:00+00'
  ),
  (
    '00000000-0000-0000-0000-000000000403',
    '00000000-0000-0000-0000-000000000202',
    'Наружная реклама', 'Foreign Lead Need', true, 'Макет нужен', '2026-07-29',
    'Подтверждено', 100, '[]'::jsonb,
    '2026-07-13 12:00:00+00', '2026-07-13 12:00:00+00'
  ),
  (
    '00000000-0000-0000-0000-000000000404',
    '00000000-0000-0000-0000-000000000201',
    'Наружная реклама', 'Design Need B', true, 'Макет нужен', '2026-07-28',
    'Подтверждено', 100, '[]'::jsonb,
    '2026-07-13 12:00:00+00', '2026-07-13 12:00:00+00'
  );

INSERT INTO public.leader_production_jobs (
  id, owner_id, order_id, title, production_status, created_at, updated_at
) VALUES
  (
    '00000000-0000-0000-0000-000000000501',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000301',
    'Synthetic Production A', 'Не передано',
    '2026-07-13 12:00:00+00', '2026-07-13 12:00:00+00'
  ),
  (
    '00000000-0000-0000-0000-000000000502',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000302',
    'Synthetic Production B', 'Не передано',
    '2026-07-13 12:00:00+00', '2026-07-13 12:00:00+00'
  );

DO $privileges$
BEGIN
  IF has_function_privilege('anon', 'public.leader_create_design_task_from_order_rpc(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute design task RPC';
  END IF;

  IF has_function_privilege('authenticated', 'public.leader_create_design_task_from_order_rpc(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must not execute design task RPC directly';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.leader_create_design_task_from_order_rpc(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must execute design task RPC';
  END IF;
END
$privileges$;

-- Successful creation.
INSERT INTO staging_design_rpc_results (test_name, response)
SELECT
  'success',
  public.leader_create_design_task_from_order_rpc(
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
DECLARE
  v_response jsonb;
  v_task_id uuid;
  v_response_text text;
  v_task_text text;
BEGIN
  SELECT response INTO v_response
  FROM staging_design_rpc_results
  WHERE test_name = 'success';

  IF coalesce((v_response ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'success case failed: %', v_response;
  END IF;

  IF coalesce((v_response ->> 'idempotent_replay')::boolean, true) IS NOT FALSE THEN
    RAISE EXCEPTION 'first success must not be replay: %', v_response;
  END IF;

  v_task_id := (v_response #>> '{entity,id}')::uuid;

  IF (SELECT count(*) FROM public.leader_design_tasks WHERE id = v_task_id) <> 1 THEN
    RAISE EXCEPTION 'success must create exactly one design task';
  END IF;

  IF (SELECT count(*) FROM public.leader_design_task_events WHERE task_id = v_task_id) <> 1 THEN
    RAISE EXCEPTION 'success must create exactly one audit event';
  END IF;

  IF (
    SELECT count(*)
    FROM leader_private.leader_command_receipts
    WHERE action = 'design_task.create_from_order'
      AND idempotency_key = 'staging-design-success-v1'
      AND state = 'success'
  ) <> 1 THEN
    RAISE EXCEPTION 'success must persist one completed receipt';
  END IF;

  IF jsonb_array_length(coalesce(v_response -> 'warnings', '[]'::jsonb)) < 3 THEN
    RAISE EXCEPTION 'advisory warnings were not returned: %', v_response;
  END IF;

  v_response_text := v_response::text;
  SELECT to_jsonb(t)::text INTO v_task_text
  FROM public.leader_design_tasks t
  WHERE t.id = v_task_id;

  IF v_response_text LIKE '%PRIVATE_CLIENT_SENTINEL%'
     OR v_response_text LIKE '%+700000009301%'
     OR v_response_text LIKE '%93010%'
     OR v_response_text LIKE '%PRIVATE_INTERNAL_SENTINEL%'
     OR v_response_text LIKE '%PRIVATE_DATA_SENTINEL%' THEN
    RAISE EXCEPTION 'safe response leaked client, finance or internal data: %', v_response;
  END IF;

  IF v_task_text LIKE '%PRIVATE_CLIENT_SENTINEL%'
     OR v_task_text LIKE '%+700000009301%'
     OR v_task_text LIKE '%93010%'
     OR v_task_text LIKE '%PRIVATE_INTERNAL_SENTINEL%'
     OR v_task_text LIKE '%PRIVATE_DATA_SENTINEL%' THEN
    RAISE EXCEPTION 'design task copied forbidden order data: %', v_task_text;
  END IF;

  IF v_response #> '{entity,owner_id}' IS NOT NULL
     OR v_response #> '{entity,created_by}' IS NOT NULL
     OR v_response #> '{order,payment_status}' IS NOT NULL
     OR v_response #> '{order,client_total}' IS NOT NULL THEN
    RAISE EXCEPTION 'safe projection contains forbidden fields: %', v_response;
  END IF;
END
$success$;

-- Exact replay returns stored result and creates no duplicates.
INSERT INTO staging_design_rpc_results (test_name, response)
SELECT
  'replay',
  public.leader_create_design_task_from_order_rpc(
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

DO $replay$
DECLARE
  v_response jsonb;
BEGIN
  SELECT response INTO v_response
  FROM staging_design_rpc_results
  WHERE test_name = 'replay';

  IF coalesce((v_response ->> 'ok')::boolean, false) IS NOT TRUE
     OR coalesce((v_response ->> 'idempotent_replay')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'replay case failed: %', v_response;
  END IF;

  IF (SELECT count(*) FROM public.leader_design_tasks WHERE order_id = '00000000-0000-0000-0000-000000000301') <> 1
     OR (SELECT count(*) FROM public.leader_design_task_events WHERE order_id = '00000000-0000-0000-0000-000000000301') <> 1 THEN
    RAISE EXCEPTION 'replay created duplicate task or event';
  END IF;
END
$replay$;

-- Same key with another request must conflict.
INSERT INTO staging_design_rpc_results (test_name, response)
SELECT
  'idempotency_conflict',
  public.leader_create_design_task_from_order_rpc(
    leader_staging.build_design_test_payload(
      '00000000-0000-0000-0000-000000000101',
      '00000000-0000-0000-0000-000000000602',
      '2026-07-13 12:00:00+00',
      '00000000-0000-0000-0000-000000000301',
      'staging-design-success-v1',
      ARRAY['00000000-0000-0000-0000-000000000401']::uuid[],
      'Changed Request'
    )
  );

DO $idempotency_conflict$
DECLARE v_response jsonb;
BEGIN
  SELECT response INTO v_response FROM staging_design_rpc_results WHERE test_name = 'idempotency_conflict';
  IF v_response #>> '{error,code}' <> 'conflict' THEN
    RAISE EXCEPTION 'idempotency conflict was not rejected: %', v_response;
  END IF;
END
$idempotency_conflict$;

-- Active task blocks another logical task with a new key.
INSERT INTO staging_design_rpc_results (test_name, response)
SELECT
  'active_task_conflict',
  public.leader_create_design_task_from_order_rpc(
    leader_staging.build_design_test_payload(
      '00000000-0000-0000-0000-000000000101',
      '00000000-0000-0000-0000-000000000603',
      '2026-07-13 12:00:00+00',
      '00000000-0000-0000-0000-000000000301',
      'staging-design-active-conflict-v1',
      ARRAY['00000000-0000-0000-0000-000000000401']::uuid[]
    )
  );

DO $active_task_conflict$
DECLARE v_response jsonb;
BEGIN
  SELECT response INTO v_response FROM staging_design_rpc_results WHERE test_name = 'active_task_conflict';
  IF v_response #>> '{error,code}' <> 'conflict' THEN
    RAISE EXCEPTION 'active task conflict was not rejected: %', v_response;
  END IF;
  IF EXISTS (
    SELECT 1 FROM leader_private.leader_command_receipts
    WHERE idempotency_key = 'staging-design-active-conflict-v1'
  ) THEN
    RAISE EXCEPTION 'failed active-task command retained a receipt';
  END IF;
END
$active_task_conflict$;

-- Role and profile checks happen before business mutation.
INSERT INTO staging_design_rpc_results (test_name, response)
SELECT 'denied_role', public.leader_create_design_task_from_order_rpc(
  leader_staging.build_design_test_payload(
    '00000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000604',
    '2026-07-13 12:00:00+00',
    '00000000-0000-0000-0000-000000000302',
    'staging-design-denied-role-v1',
    ARRAY['00000000-0000-0000-0000-000000000404']::uuid[]
  )
);

INSERT INTO staging_design_rpc_results (test_name, response)
SELECT 'inactive_profile', public.leader_create_design_task_from_order_rpc(
  leader_staging.build_design_test_payload(
    '00000000-0000-0000-0000-000000000103',
    '00000000-0000-0000-0000-000000000605',
    '2026-07-13 12:00:00+00',
    '00000000-0000-0000-0000-000000000302',
    'staging-design-inactive-v1',
    ARRAY['00000000-0000-0000-0000-000000000404']::uuid[]
  )
);

DO $access_checks$
DECLARE v_denied jsonb; v_inactive jsonb;
BEGIN
  SELECT response INTO v_denied FROM staging_design_rpc_results WHERE test_name = 'denied_role';
  SELECT response INTO v_inactive FROM staging_design_rpc_results WHERE test_name = 'inactive_profile';
  IF v_denied #>> '{error,code}' <> 'forbidden' THEN
    RAISE EXCEPTION 'denied role was not rejected: %', v_denied;
  END IF;
  IF v_inactive #>> '{error,code}' <> 'access_denied' THEN
    RAISE EXCEPTION 'inactive profile was not rejected: %', v_inactive;
  END IF;
END
$access_checks$;

-- Stale order, non-design need, foreign need and wrong production relation.
INSERT INTO staging_design_rpc_results (test_name, response)
SELECT 'stale_order', public.leader_create_design_task_from_order_rpc(
  leader_staging.build_design_test_payload(
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000606',
    '2026-07-13 11:59:59+00',
    '00000000-0000-0000-0000-000000000302',
    'staging-design-stale-v1',
    ARRAY['00000000-0000-0000-0000-000000000404']::uuid[]
  )
);

INSERT INTO staging_design_rpc_results (test_name, response)
SELECT 'non_design_need', public.leader_create_design_task_from_order_rpc(
  leader_staging.build_design_test_payload(
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000607',
    '2026-07-13 12:00:00+00',
    '00000000-0000-0000-0000-000000000302',
    'staging-design-nondesign-v1',
    ARRAY['00000000-0000-0000-0000-000000000402']::uuid[]
  )
);

INSERT INTO staging_design_rpc_results (test_name, response)
SELECT 'foreign_need', public.leader_create_design_task_from_order_rpc(
  leader_staging.build_design_test_payload(
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000608',
    '2026-07-13 12:00:00+00',
    '00000000-0000-0000-0000-000000000302',
    'staging-design-foreign-v1',
    ARRAY['00000000-0000-0000-0000-000000000403']::uuid[]
  )
);

INSERT INTO staging_design_rpc_results (test_name, response)
SELECT 'wrong_production', public.leader_create_design_task_from_order_rpc(
  leader_staging.build_design_test_payload(
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000609',
    '2026-07-13 12:00:00+00',
    '00000000-0000-0000-0000-000000000302',
    'staging-design-wrong-production-v1',
    ARRAY['00000000-0000-0000-0000-000000000404']::uuid[],
    'Wrong Production Relation',
    '00000000-0000-0000-0000-000000000501'
  )
);

DO $validation_checks$
DECLARE v_response jsonb;
BEGIN
  SELECT response INTO v_response FROM staging_design_rpc_results WHERE test_name = 'stale_order';
  IF v_response #>> '{error,code}' <> 'conflict' THEN RAISE EXCEPTION 'stale order test failed: %', v_response; END IF;

  SELECT response INTO v_response FROM staging_design_rpc_results WHERE test_name = 'non_design_need';
  IF v_response #>> '{error,code}' <> 'validation_error' THEN RAISE EXCEPTION 'non-design need test failed: %', v_response; END IF;

  SELECT response INTO v_response FROM staging_design_rpc_results WHERE test_name = 'foreign_need';
  IF v_response #>> '{error,code}' <> 'not_found' THEN RAISE EXCEPTION 'foreign need test failed: %', v_response; END IF;

  SELECT response INTO v_response FROM staging_design_rpc_results WHERE test_name = 'wrong_production';
  IF v_response #>> '{error,code}' <> 'not_found' THEN RAISE EXCEPTION 'wrong production test failed: %', v_response; END IF;
END
$validation_checks$;

-- A completed task permits a new logical task.
UPDATE public.leader_design_tasks
SET task_status = 'Завершено', completed_at = now(), updated_at = now()
WHERE order_id = '00000000-0000-0000-0000-000000000301';

INSERT INTO staging_design_rpc_results (test_name, response)
SELECT 'after_completed', public.leader_create_design_task_from_order_rpc(
  leader_staging.build_design_test_payload(
    '00000000-0000-0000-0000-000000000104',
    '00000000-0000-0000-0000-000000000610',
    '2026-07-13 12:00:00+00',
    '00000000-0000-0000-0000-000000000301',
    'staging-design-after-completed-v1',
    ARRAY['00000000-0000-0000-0000-000000000401']::uuid[]
  )
);

DO $completed_allows_new$
DECLARE v_response jsonb;
BEGIN
  SELECT response INTO v_response FROM staging_design_rpc_results WHERE test_name = 'after_completed';
  IF coalesce((v_response ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'completed task did not allow new task: %', v_response;
  END IF;
  IF (SELECT count(*) FROM public.leader_design_tasks WHERE order_id = '00000000-0000-0000-0000-000000000301') <> 2 THEN
    RAISE EXCEPTION 'expected completed historical task plus one active task';
  END IF;
END
$completed_allows_new$;

-- Unknown raw status fails closed as active.
INSERT INTO public.leader_design_tasks (
  id, owner_id, order_id, title, task_status, layout_status, source, created_by,
  created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000701',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000303',
  'Unknown Status Sentinel', 'НЕИЗВЕСТНЫЙ СТАТУС', 'Макет не начат',
  'synthetic_test', '00000000-0000-0000-0000-000000000101',
  '2026-07-13 12:00:00+00', '2026-07-13 12:00:00+00'
);

INSERT INTO staging_design_rpc_results (test_name, response)
SELECT 'unknown_status_blocks', public.leader_create_design_task_from_order_rpc(
  leader_staging.build_design_test_payload(
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000611',
    '2026-07-13 12:00:00+00',
    '00000000-0000-0000-0000-000000000303',
    'staging-design-unknown-status-v1',
    ARRAY['00000000-0000-0000-0000-000000000404']::uuid[]
  )
);

DO $unknown_status$
DECLARE v_response jsonb;
BEGIN
  SELECT response INTO v_response FROM staging_design_rpc_results WHERE test_name = 'unknown_status_blocks';
  IF v_response #>> '{error,code}' <> 'conflict' THEN
    RAISE EXCEPTION 'unknown raw status did not fail closed: %', v_response;
  END IF;
END
$unknown_status$;

-- Forced event failure must roll back task and receipt.
CREATE OR REPLACE FUNCTION leader_staging.force_design_event_failure()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'forced_event_failure';
END
$function$;

CREATE TRIGGER staging_force_design_event_failure
BEFORE INSERT ON public.leader_design_task_events
FOR EACH ROW EXECUTE FUNCTION leader_staging.force_design_event_failure();

INSERT INTO staging_design_rpc_results (test_name, response)
SELECT 'event_rollback', public.leader_create_design_task_from_order_rpc(
  leader_staging.build_design_test_payload(
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000612',
    '2026-07-13 12:00:00+00',
    '00000000-0000-0000-0000-000000000304',
    'staging-design-event-rollback-v1',
    ARRAY['00000000-0000-0000-0000-000000000404']::uuid[]
  )
);

DROP TRIGGER staging_force_design_event_failure ON public.leader_design_task_events;
DROP FUNCTION leader_staging.force_design_event_failure();

DO $event_rollback$
DECLARE v_response jsonb;
BEGIN
  SELECT response INTO v_response FROM staging_design_rpc_results WHERE test_name = 'event_rollback';
  IF v_response #>> '{error,code}' <> 'persistence_failed' THEN
    RAISE EXCEPTION 'forced event failure returned wrong error: %', v_response;
  END IF;
  IF EXISTS (SELECT 1 FROM public.leader_design_tasks WHERE order_id = '00000000-0000-0000-0000-000000000304')
     OR EXISTS (SELECT 1 FROM leader_private.leader_command_receipts WHERE idempotency_key = 'staging-design-event-rollback-v1') THEN
    RAISE EXCEPTION 'event failure did not roll back task and receipt';
  END IF;
END
$event_rollback$;

-- Forced receipt completion failure must roll back task, event and receipt.
CREATE OR REPLACE FUNCTION leader_staging.force_receipt_completion_failure()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF NEW.state = 'success' THEN
    RAISE EXCEPTION 'forced_receipt_completion_failure';
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER staging_force_receipt_completion_failure
BEFORE UPDATE ON leader_private.leader_command_receipts
FOR EACH ROW EXECUTE FUNCTION leader_staging.force_receipt_completion_failure();

INSERT INTO staging_design_rpc_results (test_name, response)
SELECT 'receipt_rollback', public.leader_create_design_task_from_order_rpc(
  leader_staging.build_design_test_payload(
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000613',
    '2026-07-13 12:00:00+00',
    '00000000-0000-0000-0000-000000000305',
    'staging-design-receipt-rollback-v1',
    ARRAY['00000000-0000-0000-0000-000000000404']::uuid[]
  )
);

DROP TRIGGER staging_force_receipt_completion_failure ON leader_private.leader_command_receipts;
DROP FUNCTION leader_staging.force_receipt_completion_failure();

DO $receipt_rollback$
DECLARE v_response jsonb;
BEGIN
  SELECT response INTO v_response FROM staging_design_rpc_results WHERE test_name = 'receipt_rollback';
  IF v_response #>> '{error,code}' <> 'persistence_failed' THEN
    RAISE EXCEPTION 'forced receipt failure returned wrong error: %', v_response;
  END IF;
  IF EXISTS (SELECT 1 FROM public.leader_design_tasks WHERE order_id = '00000000-0000-0000-0000-000000000305')
     OR EXISTS (SELECT 1 FROM public.leader_design_task_events WHERE order_id = '00000000-0000-0000-0000-000000000305')
     OR EXISTS (SELECT 1 FROM leader_private.leader_command_receipts WHERE idempotency_key = 'staging-design-receipt-rollback-v1') THEN
    RAISE EXCEPTION 'receipt completion failure did not roll back task, event and receipt';
  END IF;
END
$receipt_rollback$;

-- The command must not mutate order workflow, layout, production or finance fields.
DO $order_unchanged$
DECLARE v_order public.leader_orders%rowtype;
BEGIN
  SELECT * INTO v_order
  FROM public.leader_orders
  WHERE id = '00000000-0000-0000-0000-000000000301';

  IF v_order.status <> 'Новый'
     OR v_order.layout_status <> 'Макета нет'
     OR v_order.layout_link IS NOT NULL
     OR v_order.production_status <> 'Не передано'
     OR v_order.payment_status <> 'Не оплачено'
     OR v_order.client_total <> 930101
     OR v_order.contractor_cost <> 930102
     OR v_order.profit <> 930103
     OR v_order.prepayment <> 930104
     OR v_order.balance <> 930105
     OR v_order.internal_comment <> 'PRIVATE_INTERNAL_SENTINEL_A' THEN
    RAISE EXCEPTION 'design action mutated forbidden order fields';
  END IF;
END
$order_unchanged$;

-- Remove synthetic evidence. The environment guard and schema objects remain.
DELETE FROM public.leader_design_task_events
WHERE order_id IN (
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000302',
  '00000000-0000-0000-0000-000000000303',
  '00000000-0000-0000-0000-000000000304',
  '00000000-0000-0000-0000-000000000305'
);

DELETE FROM public.leader_design_tasks
WHERE order_id IN (
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000302',
  '00000000-0000-0000-0000-000000000303',
  '00000000-0000-0000-0000-000000000304',
  '00000000-0000-0000-0000-000000000305'
);

DELETE FROM leader_private.leader_command_receipts
WHERE actor_id IN (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000103',
  '00000000-0000-0000-0000-000000000104'
);

DELETE FROM public.leader_production_jobs
WHERE id IN (
  '00000000-0000-0000-0000-000000000501',
  '00000000-0000-0000-0000-000000000502'
);

DELETE FROM public.leader_lead_needs
WHERE id IN (
  '00000000-0000-0000-0000-000000000401',
  '00000000-0000-0000-0000-000000000402',
  '00000000-0000-0000-0000-000000000403',
  '00000000-0000-0000-0000-000000000404'
);

DELETE FROM public.leader_orders
WHERE id IN (
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000302',
  '00000000-0000-0000-0000-000000000303',
  '00000000-0000-0000-0000-000000000304',
  '00000000-0000-0000-0000-000000000305'
);

DELETE FROM public.leader_leads
WHERE id IN (
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000202'
);

DELETE FROM public.leader_user_profiles
WHERE user_id IN (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000103',
  '00000000-0000-0000-0000-000000000104'
);

DROP FUNCTION leader_staging.build_design_test_payload(
  uuid, uuid, timestamptz, uuid, text, uuid[], text, uuid, jsonb
);

DO $cleanup$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.leader_user_profiles
    WHERE email LIKE '%@example.invalid'
  ) OR EXISTS (
    SELECT 1
    FROM public.leader_orders
    WHERE order_number BETWEEN 9301 AND 9305
  ) OR EXISTS (
    SELECT 1
    FROM public.leader_design_tasks
    WHERE source IN ('synthetic_test', 'crm_v4_server_action')
  ) OR EXISTS (
    SELECT 1
    FROM leader_private.leader_command_receipts
    WHERE idempotency_key LIKE 'staging-design-%'
  ) THEN
    RAISE EXCEPTION 'synthetic test cleanup failed';
  END IF;
END
$cleanup$;

COMMIT;

SELECT jsonb_build_object(
  'ok', true,
  'tests', (
    SELECT jsonb_object_agg(test_name, response ORDER BY test_name)
    FROM staging_design_rpc_results
  ),
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
