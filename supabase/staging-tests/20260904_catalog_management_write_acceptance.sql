-- STAGING ONLY acceptance for issue #152.
-- Must run against otulfnouybahfnsycxqn and always roll back synthetic fixtures.

begin;

do $test$
declare
  v_owner_id uuid := '15200000-0000-4000-8000-000000000001';
  v_manager_id uuid := '15200000-0000-4000-8000-000000000002';
  v_owner_email text := 'catalog-owner-152@example.invalid';
  v_manager_email text := 'catalog-manager-152@example.invalid';
  v_create_request_id uuid := '15200000-0000-4000-8000-000000000011';
  v_update_request_id uuid := '15200000-0000-4000-8000-000000000012';
  v_stale_request_id uuid := '15200000-0000-4000-8000-000000000013';
  v_forbidden_request_id uuid := '15200000-0000-4000-8000-000000000014';
  v_create jsonb;
  v_update jsonb;
  v_stale jsonb;
  v_forbidden jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_catalog_id uuid;
  v_initial_updated_at timestamptz;
  v_updated public.leader_catalog%rowtype;
  v_log public.leader_catalog_price_logs%rowtype;
  v_count integer;
begin
  if not exists (
    select 1
    from leader_staging.environment_guard
    where singleton = true
      and project_ref = 'otulfnouybahfnsycxqn'
      and environment_name = 'staging'
      and repository = 'deputat36/lider-bsk'
  ) then
    raise exception 'catalog_acceptance_wrong_environment';
  end if;

  if to_regprocedure('public.leader_manage_catalog_rpc(jsonb)') is null then
    raise exception 'catalog_manage_rpc_missing';
  end if;

  if has_function_privilege('authenticated', 'public.leader_manage_catalog_rpc(jsonb)', 'EXECUTE') then
    raise exception 'catalog_manage_rpc_authenticated_execute_must_be_revoked';
  end if;
  if not has_function_privilege('service_role', 'public.leader_manage_catalog_rpc(jsonb)', 'EXECUTE') then
    raise exception 'catalog_manage_rpc_service_role_execute_missing';
  end if;

  insert into public.leader_user_profiles (user_id, email, full_name, role, is_active, permissions)
  values
    (v_owner_id, v_owner_email, 'Synthetic Catalog Owner', 'owner', true, '{}'::jsonb),
    (v_manager_id, v_manager_email, 'Synthetic Catalog Manager', 'manager', true, '{}'::jsonb)
  on conflict (user_id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        role = excluded.role,
        is_active = excluded.is_active,
        permissions = excluded.permissions,
        updated_at = clock_timestamp();

  v_create := jsonb_build_object(
    'actor_id', v_owner_id,
    'actor_email', v_owner_email,
    'request', jsonb_build_object(
      'action', 'catalog.manage',
      'request_id', v_create_request_id,
      'expected_updated_at', null,
      'payload', jsonb_build_object(
        'operation', 'create',
        'idempotency_key', 'issue-152-create-v1',
        'reason', 'staging acceptance create',
        'patch', jsonb_build_object(
          'category', 'Synthetic category',
          'name', 'Synthetic catalog item #152',
          'unit', 'шт',
          'contractor_price', 100,
          'markup_percent', 30,
          'min_client_price', 120,
          'default_client_price', 150,
          'calculation_mode', 'fixed',
          'item_type', 'Изготовление',
          'sort_order', 152,
          'is_active', true,
          'description', 'Synthetic staging acceptance item',
          'settings', jsonb_build_object('fixture', true)
        )
      )
    )
  );

  v_result := public.leader_manage_catalog_rpc(v_create);
  if coalesce((v_result ->> 'ok')::boolean, false) is not true then
    raise exception 'catalog_create_failed:%', v_result;
  end if;
  v_catalog_id := (v_result #>> '{catalog,id}')::uuid;
  v_initial_updated_at := (v_result #>> '{catalog,updated_at}')::timestamptz;

  select count(*) into v_count
  from public.leader_catalog
  where id = v_catalog_id
    and owner_id = v_owner_id
    and name = 'Synthetic catalog item #152'
    and contractor_price = 100
    and markup_percent = 30
    and is_active = true;
  if v_count <> 1 then
    raise exception 'catalog_create_row_mismatch:%', v_count;
  end if;

  select count(*) into v_count
  from public.leader_catalog_price_logs
  where catalog_id = v_catalog_id and change_type = 'created';
  if v_count <> 1 then
    raise exception 'catalog_create_log_mismatch:%', v_count;
  end if;

  v_replay := public.leader_manage_catalog_rpc(v_create);
  if coalesce((v_replay ->> 'ok')::boolean, false) is not true
     or coalesce((v_replay ->> 'idempotent_replay')::boolean, false) is not true
     or (v_replay #>> '{catalog,id}')::uuid <> v_catalog_id then
    raise exception 'catalog_create_replay_failed:%', v_replay;
  end if;

  select count(*) into v_count from public.leader_catalog where id = v_catalog_id;
  if v_count <> 1 then raise exception 'catalog_replay_duplicated_row:%', v_count; end if;
  select count(*) into v_count from public.leader_catalog_price_logs where catalog_id = v_catalog_id;
  if v_count <> 1 then raise exception 'catalog_replay_duplicated_log:%', v_count; end if;

  v_update := jsonb_build_object(
    'actor_id', v_owner_id,
    'actor_email', v_owner_email,
    'request', jsonb_build_object(
      'action', 'catalog.manage',
      'request_id', v_update_request_id,
      'expected_updated_at', v_initial_updated_at::text,
      'payload', jsonb_build_object(
        'operation', 'update',
        'catalog_id', v_catalog_id,
        'idempotency_key', 'issue-152-update-v1',
        'reason', 'staging acceptance price change',
        'patch', jsonb_build_object(
          'contractor_price', 125,
          'markup_percent', 55,
          'min_client_price', 140,
          'default_client_price', 195,
          'is_active', false
        )
      )
    )
  );

  v_result := public.leader_manage_catalog_rpc(v_update);
  if coalesce((v_result ->> 'ok')::boolean, false) is not true
     or coalesce((v_result ->> 'changed')::boolean, false) is not true then
    raise exception 'catalog_update_failed:%', v_result;
  end if;

  select * into v_updated from public.leader_catalog where id = v_catalog_id;
  if not found
     or v_updated.contractor_price <> 125
     or v_updated.markup_percent <> 55
     or v_updated.min_client_price <> 140
     or v_updated.default_client_price <> 195
     or v_updated.is_active is not false
     or v_updated.updated_at <= v_initial_updated_at then
    raise exception 'catalog_update_row_mismatch:%', row_to_json(v_updated);
  end if;

  select * into v_log
  from public.leader_catalog_price_logs
  where catalog_id = v_catalog_id
  order by created_at desc, id desc
  limit 1;
  if not found
     or v_log.change_type <> 'price_update'
     or v_log.old_contractor_price <> 100
     or v_log.new_contractor_price <> 125
     or v_log.old_markup_percent <> 30
     or v_log.new_markup_percent <> 55
     or v_log.old_is_active is not true
     or v_log.new_is_active is not false
     or v_log.changed_by <> v_owner_id then
    raise exception 'catalog_update_log_mismatch:%', row_to_json(v_log);
  end if;

  select count(*) into v_count from public.leader_catalog_price_logs where catalog_id = v_catalog_id;
  if v_count <> 2 then raise exception 'catalog_update_log_count_mismatch:%', v_count; end if;

  v_stale := jsonb_build_object(
    'actor_id', v_owner_id,
    'actor_email', v_owner_email,
    'request', jsonb_build_object(
      'action', 'catalog.manage',
      'request_id', v_stale_request_id,
      'expected_updated_at', v_initial_updated_at::text,
      'payload', jsonb_build_object(
        'operation', 'update',
        'catalog_id', v_catalog_id,
        'idempotency_key', 'issue-152-stale-v1',
        'patch', jsonb_build_object('contractor_price', 999)
      )
    )
  );
  v_result := public.leader_manage_catalog_rpc(v_stale);
  if v_result #>> '{error,code}' <> 'source_changed' then
    raise exception 'catalog_stale_update_not_rejected:%', v_result;
  end if;
  select contractor_price into v_updated.contractor_price from public.leader_catalog where id = v_catalog_id;
  if v_updated.contractor_price <> 125 then raise exception 'catalog_stale_update_mutated_row'; end if;
  select count(*) into v_count from public.leader_catalog_price_logs where catalog_id = v_catalog_id;
  if v_count <> 2 then raise exception 'catalog_stale_update_mutated_log:%', v_count; end if;
  select count(*) into v_count from leader_private.leader_command_receipts where action='catalog.manage' and idempotency_key='issue-152-stale-v1';
  if v_count <> 0 then raise exception 'catalog_stale_receipt_not_cleaned:%', v_count; end if;

  v_forbidden := jsonb_build_object(
    'actor_id', v_manager_id,
    'actor_email', v_manager_email,
    'request', jsonb_build_object(
      'action', 'catalog.manage',
      'request_id', v_forbidden_request_id,
      'expected_updated_at', null,
      'payload', jsonb_build_object(
        'operation', 'create',
        'idempotency_key', 'issue-152-manager-v1',
        'patch', jsonb_build_object('category','Synthetic','name','Forbidden catalog item #152','unit','шт')
      )
    )
  );
  v_result := public.leader_manage_catalog_rpc(v_forbidden);
  if v_result #>> '{error,code}' <> 'forbidden' then
    raise exception 'catalog_manager_not_rejected:%', v_result;
  end if;
  select count(*) into v_count from public.leader_catalog where name='Forbidden catalog item #152';
  if v_count <> 0 then raise exception 'catalog_forbidden_create_mutated_row'; end if;
  select count(*) into v_count from leader_private.leader_command_receipts where action='catalog.manage' and idempotency_key='issue-152-manager-v1';
  if v_count <> 0 then raise exception 'catalog_forbidden_receipt_created'; end if;
end
$test$;

rollback;
