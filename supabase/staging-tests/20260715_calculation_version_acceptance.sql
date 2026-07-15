-- STAGING ONLY acceptance script.
-- Run only after 20260715_02_calculation_version_harness.sql.
-- The script is transactional and ends with ROLLBACK.

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
end
$guard$;

insert into public.leader_user_profiles (
  user_id,
  email,
  full_name,
  role,
  is_active,
  permissions
) values (
  '10000000-0000-4000-8000-000000000001',
  'calculation.acceptance@example.invalid',
  'Calculation acceptance actor',
  'manager',
  true,
  '{"calculation.write": true}'::jsonb
)
on conflict (user_id) do update
set role = excluded.role,
    is_active = excluded.is_active,
    permissions = excluded.permissions,
    updated_at = now();

insert into public.leader_leads (
  id,
  status,
  created_at,
  updated_at
) values (
  '20000000-0000-4000-8000-000000000001',
  'В работе',
  '2026-07-15T12:00:00Z',
  '2026-07-15T12:00:00Z'
)
on conflict (id) do update
set status = excluded.status,
    updated_at = excluded.updated_at;

insert into public.leader_lead_needs (
  id,
  lead_id,
  need_type,
  title,
  status,
  created_at,
  updated_at
) values (
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'Баннер',
  'Acceptance need',
  'Готово к расчёту',
  '2026-07-15T12:00:00Z',
  '2026-07-15T12:00:00Z'
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
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  'Acceptance source',
  'Согласован',
  1,
  1400,
  800,
  600,
  42.86,
  'ok',
  '[]'::jsonb,
  '60000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '2026-07-15T12:00:00Z',
  '2026-07-15T12:00:00Z'
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
  v_conflict jsonb;
  v_invalid_totals jsonb;
  v_new_id uuid;
  v_source_before jsonb;
  v_source_after jsonb;
  v_count_before integer;
  v_count_after integer;
begin
  select to_jsonb(c)
  into v_source_before
  from public.leader_lead_calculations c
  where c.id = '40000000-0000-4000-8000-000000000001';

  select count(*)
  into v_count_before
  from public.leader_lead_calculations
  where lead_id = '20000000-0000-4000-8000-000000000001';

  v_request := jsonb_build_object(
    'actor_id', '10000000-0000-4000-8000-000000000001',
    'actor_email', 'calculation.acceptance@example.invalid',
    'request', jsonb_build_object(
      'action', 'calculation.create_version',
      'request_id', '80000000-0000-4000-8000-000000000001',
      'expected_updated_at', '2026-07-15T12:00:00Z',
      'payload', jsonb_build_object(
        'source_calculation_id', '40000000-0000-4000-8000-000000000001',
        'idempotency_key', 'acceptance:calculation-version:1',
        'title', 'Acceptance version 2',
        'need_id', '30000000-0000-4000-8000-000000000001',
        'public_comment', 'Public acceptance comment',
        'internal_comment', 'Internal acceptance comment',
        'items', jsonb_build_array(
          jsonb_build_object(
            'catalog_id', null,
            'category', 'Печать',
            'item_type', 'Изготовление',
            'name', 'Баннер 1×2 м',
            'unit', 'м²',
            'qty', 2,
            'contractor_price', 400,
            'client_price', 700,
            'comment', 'Acceptance item',
            'data', jsonb_build_object('calculation_mode', 'banner'),
            'sort_order', 0
          )
        )
      )
    )
  );

  v_result := public.leader_create_calculation_version_rpc(v_request);
  if coalesce((v_result ->> 'ok')::boolean, false) is not true then
    raise exception 'create_version_failed: %', v_result;
  end if;
  if (v_result #>> '{calculation,version_number}')::integer <> 2 then
    raise exception 'next_version_is_not_2: %', v_result;
  end if;
  if v_result #>> '{calculation,status}' <> 'Черновик' then
    raise exception 'new_version_status_is_not_draft: %', v_result;
  end if;
  if v_result #> '{calculation,commercial_offer_id}' <> 'null'::jsonb
     or v_result #> '{calculation,order_id}' <> 'null'::jsonb then
    raise exception 'new_version_inherited_offer_or_order: %', v_result;
  end if;
  if (v_result #>> '{calculation,client_total}')::numeric <> 1400
     or (v_result #>> '{calculation,contractor_cost}')::numeric <> 800
     or (v_result #>> '{calculation,profit}')::numeric <> 600 then
    raise exception 'server_totals_are_wrong: %', v_result;
  end if;
  if jsonb_array_length(v_result -> 'items') <> 1 then
    raise exception 'item_snapshot_count_is_wrong: %', v_result;
  end if;

  v_new_id := (v_result #>> '{calculation,id}')::uuid;

  select to_jsonb(c)
  into v_source_after
  from public.leader_lead_calculations c
  where c.id = '40000000-0000-4000-8000-000000000001';

  if v_source_after is distinct from v_source_before then
    raise exception 'source_calculation_was_modified';
  end if;

  v_replay := public.leader_create_calculation_version_rpc(v_request);
  if coalesce((v_replay ->> 'ok')::boolean, false) is not true
     or coalesce((v_replay ->> 'idempotent_replay')::boolean, false) is not true
     or (v_replay #>> '{calculation,id}')::uuid <> v_new_id then
    raise exception 'idempotent_replay_failed: %', v_replay;
  end if;

  v_conflict := public.leader_create_calculation_version_rpc(
    jsonb_set(v_request, '{request,payload,title}', '"Different title"'::jsonb)
  );
  if v_conflict #>> '{error,code}' <> 'idempotency_conflict' then
    raise exception 'idempotency_conflict_not_detected: %', v_conflict;
  end if;

  v_invalid_totals := public.leader_create_calculation_version_rpc(
    jsonb_set(
      jsonb_set(v_request, '{request,request_id}', '"80000000-0000-4000-8000-000000000002"'::jsonb),
      '{request,payload,idempotency_key}',
      '"acceptance:calculation-version:negative"'::jsonb
    ) #- '{request,payload,items}'
      || jsonb_build_object()
  );

  v_invalid_totals := public.leader_create_calculation_version_rpc(
    jsonb_set(
      jsonb_set(
        jsonb_set(v_request, '{request,request_id}', '"80000000-0000-4000-8000-000000000003"'::jsonb),
        '{request,payload,idempotency_key}',
        '"acceptance:calculation-version:negative-profit"'::jsonb
      ),
      '{request,payload,items,0,client_price}',
      '100'::jsonb
    )
  );
  if v_invalid_totals #>> '{error,code}' <> 'invalid_totals' then
    raise exception 'negative_profit_not_rejected: %', v_invalid_totals;
  end if;

  select count(*)
  into v_count_after
  from public.leader_lead_calculations
  where lead_id = '20000000-0000-4000-8000-000000000001';

  if v_count_after <> v_count_before + 1 then
    raise exception 'failed_commands_created_extra_versions: before %, after %', v_count_before, v_count_after;
  end if;

  if not exists (
    select 1
    from leader_private.leader_command_receipts
    where action = 'calculation.create_version'
      and idempotency_key = 'acceptance:calculation-version:1'
      and state = 'success'
  ) then
    raise exception 'success_receipt_missing';
  end if;
end
$acceptance$;

rollback;
