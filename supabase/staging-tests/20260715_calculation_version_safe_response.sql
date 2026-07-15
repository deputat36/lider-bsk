-- STAGING ONLY acceptance script for the public safe-response wrapper.
-- Run after 20260715_02 and 20260715_03. Ends with ROLLBACK.

begin;

do $guard$
begin
  if not exists (
    select 1
    from leader_staging.environment_guard
    where singleton = true
      and project_ref = 'otulfnouybahfnsycxqn'
      and environment_name = 'staging'
      and repository = 'deputat36/lider-bsk'
  ) then
    raise exception 'staging_environment_guard_failed';
  end if;

  if to_regprocedure('public.leader_create_calculation_version_rpc(jsonb)') is null
     or to_regprocedure('leader_private.leader_create_calculation_version_rpc_internal_v1(jsonb)') is null then
    raise exception 'safe_response_functions_missing';
  end if;
end
$guard$;

insert into public.leader_user_profiles (
  user_id, email, full_name, role, is_active, permissions
) values (
  '11000000-0000-4000-8000-000000000001',
  'calculation.safe-response@example.invalid',
  'Calculation safe-response actor',
  'manager',
  true,
  '{"calculation.write": true}'::jsonb
)
on conflict (user_id) do update
set role = excluded.role,
    is_active = excluded.is_active,
    permissions = excluded.permissions,
    updated_at = now();

insert into public.leader_leads (id, status, created_at, updated_at)
values (
  '21000000-0000-4000-8000-000000000001',
  'В работе',
  '2026-07-15T13:00:00Z',
  '2026-07-15T13:00:00Z'
)
on conflict (id) do update
set status = excluded.status,
    updated_at = excluded.updated_at;

insert into public.leader_lead_needs (
  id, lead_id, need_type, title, status, created_at, updated_at
) values (
  '31000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  'Баннер',
  'Safe response need',
  'Готово к расчёту',
  '2026-07-15T13:00:00Z',
  '2026-07-15T13:00:00Z'
)
on conflict (id) do update
set lead_id = excluded.lead_id,
    status = excluded.status,
    updated_at = excluded.updated_at;

insert into public.leader_lead_calculations (
  id,
  lead_id,
  need_id,
  client_id,
  title,
  status,
  version_number,
  client_total,
  contractor_cost,
  profit,
  margin_percent,
  warning_level,
  warnings,
  commercial_offer_id,
  order_id,
  created_by,
  updated_by,
  created_at,
  updated_at
) values (
  '41000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  'Safe response source',
  'Согласован',
  1,
  2000,
  1200,
  800,
  40,
  'ok',
  '[]'::jsonb,
  '61000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  '2026-07-15T13:00:00Z',
  '2026-07-15T13:00:00Z'
)
on conflict (id) do update
set title = excluded.title,
    status = excluded.status,
    version_number = excluded.version_number,
    commercial_offer_id = excluded.commercial_offer_id,
    order_id = excluded.order_id,
    updated_at = excluded.updated_at;

do $acceptance$
declare
  v_request jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_receipt jsonb;
  v_calculation jsonb;
  v_item jsonb;
  v_allowed_calculation text[] := array[
    'id', 'lead_id', 'need_id', 'client_id', 'title', 'status',
    'version_number', 'client_total', 'contractor_cost', 'profit',
    'margin_percent', 'warning_level', 'warnings', 'public_comment',
    'internal_comment', 'created_at', 'updated_at'
  ];
  v_allowed_item text[] := array[
    'id', 'catalog_id', 'category', 'item_type', 'name', 'unit', 'qty',
    'contractor_price', 'contractor_sum', 'markup_percent', 'client_price',
    'client_sum', 'profit', 'margin_percent', 'comment', 'data', 'sort_order',
    'created_at', 'updated_at'
  ];
begin
  v_request := jsonb_build_object(
    'actor_id', '11000000-0000-4000-8000-000000000001',
    'actor_email', 'calculation.safe-response@example.invalid',
    'request', jsonb_build_object(
      'action', 'calculation.create_version',
      'request_id', '81000000-0000-4000-8000-000000000001',
      'expected_updated_at', '2026-07-15T13:00:00Z',
      'payload', jsonb_build_object(
        'source_calculation_id', '41000000-0000-4000-8000-000000000001',
        'idempotency_key', 'acceptance:calculation-safe-response:1',
        'title', 'Safe response version 2',
        'need_id', '31000000-0000-4000-8000-000000000001',
        'public_comment', 'Visible public comment',
        'internal_comment', 'Authorized internal comment',
        'items', jsonb_build_array(
          jsonb_build_object(
            'catalog_id', null,
            'category', 'Печать',
            'item_type', 'Изготовление',
            'name', 'Баннер 2×1 м',
            'unit', 'м²',
            'qty', 2,
            'contractor_price', 600,
            'client_price', 1000,
            'comment', 'Safe response item',
            'data', jsonb_build_object('calculation_mode', 'banner'),
            'sort_order', 0
          )
        )
      )
    )
  );

  v_result := public.leader_create_calculation_version_rpc(v_request);
  if coalesce((v_result ->> 'ok')::boolean, false) is not true then
    raise exception 'safe_response_create_failed: %', v_result;
  end if;

  v_calculation := v_result -> 'calculation';
  v_item := v_result #> '{items,0}';

  if exists (
    select key from jsonb_object_keys(v_calculation) as keys(key)
    where key <> all(v_allowed_calculation)
  ) or exists (
    select allowed from unnest(v_allowed_calculation) as allowed
    where not (v_calculation ? allowed)
  ) then
    raise exception 'calculation_response_projection_drifted: %', v_calculation;
  end if;

  if exists (
    select key from jsonb_object_keys(v_item) as keys(key)
    where key <> all(v_allowed_item)
  ) or exists (
    select allowed from unnest(v_allowed_item) as allowed
    where not (v_item ? allowed)
  ) then
    raise exception 'item_response_projection_drifted: %', v_item;
  end if;

  if v_calculation ?| array['created_by', 'updated_by', 'commercial_offer_id', 'order_id'] then
    raise exception 'calculation_server_owned_fields_leaked';
  end if;

  if v_item ?| array['calculation_id', 'lead_id'] then
    raise exception 'item_parent_identifiers_leaked';
  end if;

  select response
  into v_receipt
  from leader_private.leader_command_receipts
  where action = 'calculation.create_version'
    and idempotency_key = 'acceptance:calculation-safe-response:1';

  if v_receipt is distinct from v_result then
    raise exception 'receipt_did_not_store_safe_response: result %, receipt %', v_result, v_receipt;
  end if;

  v_replay := public.leader_create_calculation_version_rpc(v_request);
  if coalesce((v_replay ->> 'idempotent_replay')::boolean, false) is not true then
    raise exception 'safe_response_replay_failed: %', v_replay;
  end if;

  if v_replay #> '{calculation}' is distinct from v_calculation
     or v_replay #> '{items,0}' is distinct from v_item then
    raise exception 'replay_projection_changed';
  end if;

  if has_function_privilege('anon', 'public.leader_create_calculation_version_rpc(jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.leader_create_calculation_version_rpc(jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'leader_private.leader_create_calculation_version_rpc_internal_v1(jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'leader_private.leader_create_calculation_version_rpc_internal_v1(jsonb)', 'EXECUTE') then
    raise exception 'browser_execute_privilege_leaked';
  end if;

  if not has_function_privilege('service_role', 'public.leader_create_calculation_version_rpc(jsonb)', 'EXECUTE')
     or not has_function_privilege('service_role', 'leader_private.leader_create_calculation_version_rpc_internal_v1(jsonb)', 'EXECUTE') then
    raise exception 'service_role_execute_privilege_missing';
  end if;
end
$acceptance$;

rollback;
