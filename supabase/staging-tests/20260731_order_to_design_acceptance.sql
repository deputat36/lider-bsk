-- STAGING ONLY: reproducible order -> design task acceptance.
-- Target: otulfnouybahfnsycxqn. Synthetic prefix: LIDER-DESIGN-E2E-20260731.
-- Run with psql -v ON_ERROR_STOP=1 against staging only. The transaction is rolled back.

\set ON_ERROR_STOP on

begin;

do $guard$
begin
  if not exists (
    select 1 from leader_staging.environment_guard
    where singleton=true
      and project_ref='otulfnouybahfnsycxqn'
      and environment_name='staging'
      and repository='deputat36/lider-bsk'
  ) then raise exception 'staging_environment_guard_failed'; end if;

  if to_regprocedure('public.leader_create_design_task_from_order_rpc(jsonb)') is null
     or to_regclass('public.leader_design_tasks') is null
     or to_regclass('public.leader_design_task_events') is null
     or to_regclass('leader_private.leader_command_receipts') is null
  then raise exception 'order_to_design_contract_missing'; end if;
end $guard$;

insert into public.leader_user_profiles(user_id,email,full_name,role,is_active,permissions)
values (
  'b7310000-0000-4000-8000-000000000001',
  'lider-design-e2e-20260731@example.invalid',
  'LIDER-DESIGN-E2E manager',
  'manager',
  true,
  '{"design.read":true,"design.write":true}'::jsonb
);

insert into public.leader_leads(id,name,phone,source,status,assigned_to,next_contact_at,request_id,created_at,updated_at)
values (
  'b7310000-0000-4000-8000-000000000002',
  'LIDER-DESIGN-E2E client',
  '+79990007311',
  'staging-e2e',
  'Создан заказ',
  'b7310000-0000-4000-8000-000000000001',
  now()+interval '1 day',
  'LIDER-DESIGN-E2E-20260731-request',
  clock_timestamp(),
  clock_timestamp()
);

insert into public.leader_orders(
  id,owner_id,lead_id,project_name,client_name,client_phone,status,priority,deadline,
  layout_status,production_status,client_total,contractor_cost,profit,source,is_archived,
  created_at,updated_at
) values (
  'b7310000-0000-4000-8000-000000000003',
  'b7310000-0000-4000-8000-000000000001',
  'b7310000-0000-4000-8000-000000000002',
  'LIDER-DESIGN-E2E order',
  'LIDER-DESIGN-E2E client',
  '+79990007311',
  'Новый',
  'Обычный',
  current_date+7,
  'Нужен дизайн',
  'Не передано',
  2400,1700,700,
  'staging-e2e',
  false,
  clock_timestamp(),
  clock_timestamp()
);

insert into public.leader_lead_needs(
  id,lead_id,need_type,title,description,structured_data,need_design,design_reason,
  deadline_date,status,completeness_score,missing_fields,created_by,updated_by
) values (
  'b7310000-0000-4000-8000-000000000004',
  'b7310000-0000-4000-8000-000000000002',
  'Баннер',
  'LIDER-DESIGN-E2E need',
  'Подготовить макет баннера 2x1 м',
  '{"synthetic_run":"LIDER-DESIGN-E2E-20260731","width_m":2,"height_m":1}'::jsonb,
  true,
  'Нужен новый макет',
  current_date+5,
  'Готово к расчёту',
  100,
  '[]'::jsonb,
  'b7310000-0000-4000-8000-000000000001',
  'b7310000-0000-4000-8000-000000000001'
);

do $scenario$
declare
  v_request jsonb;
  v_response jsonb;
  v_replay jsonb;
  v_conflict jsonb;
  v_duplicate jsonb;
  v_task_id uuid;
begin
  v_request := jsonb_build_object(
    'actor_id','b7310000-0000-4000-8000-000000000001',
    'actor_email','lider-design-e2e-20260731@example.invalid',
    'request',jsonb_build_object(
      'action','design_task.create_from_order',
      'request_id','b7310000-0000-4000-8000-000000000005',
      'expected_updated_at',(select updated_at from public.leader_orders where id='b7310000-0000-4000-8000-000000000003'),
      'payload',jsonb_build_object(
        'order_id','b7310000-0000-4000-8000-000000000003',
        'idempotency_key','LIDER-DESIGN-E2E-20260731-create',
        'need_ids',jsonb_build_array('b7310000-0000-4000-8000-000000000004'),
        'task',jsonb_build_object(
          'title','LIDER-DESIGN-E2E макет баннера',
          'priority','Обычный',
          'deadline',(current_date+5)::text,
          'task_text','Подготовить макет баннера 2x1 м',
          'reference_link','https://example.invalid/lider-design-e2e-reference'
        )
      )
    )
  );

  v_response := public.leader_create_design_task_from_order_rpc(v_request);
  if coalesce((v_response->>'ok')::boolean,false) is not true then
    raise exception 'design_create_failed: %',v_response;
  end if;
  v_task_id := (v_response#>>'{entity,id}')::uuid;
  if v_task_id is null then raise exception 'design_entity_id_missing: %',v_response; end if;

  if (select count(*) from public.leader_design_tasks where order_id='b7310000-0000-4000-8000-000000000003') <> 1
     or (select count(*) from public.leader_design_task_events where task_id=v_task_id and event_type='created') <> 1
     or (select task_status from public.leader_design_tasks where id=v_task_id) <> 'Новая'
     or (select layout_status from public.leader_design_tasks where id=v_task_id) <> 'Макет не начат'
     or (select deadline::date from public.leader_design_tasks where id=v_task_id) <> current_date+5
  then raise exception 'design_projection_failed'; end if;

  v_replay := public.leader_create_design_task_from_order_rpc(v_request);
  if coalesce((v_replay->>'ok')::boolean,false) is not true
     or coalesce((v_replay->>'idempotent_replay')::boolean,false) is not true
     or (v_replay#>>'{entity,id}')::uuid <> v_task_id
  then raise exception 'design_idempotent_replay_failed: %',v_replay; end if;

  v_conflict := public.leader_create_design_task_from_order_rpc(
    jsonb_set(v_request,'{request,payload,task,title}','"LIDER-DESIGN-E2E changed title"'::jsonb)
  );
  if coalesce(v_conflict#>>'{error,code}','') <> 'conflict' then
    raise exception 'design_idempotency_conflict_failed: %',v_conflict;
  end if;

  v_duplicate := public.leader_create_design_task_from_order_rpc(
    jsonb_set(
      jsonb_set(v_request,'{request,request_id}','"b7310000-0000-4000-8000-000000000006"'::jsonb),
      '{request,payload,idempotency_key}',
      '"LIDER-DESIGN-E2E-20260731-second"'::jsonb
    )
  );
  if coalesce(v_duplicate#>>'{error,code}','') <> 'conflict' then
    raise exception 'active_design_task_conflict_failed: %',v_duplicate;
  end if;

  perform 1 from public.leader_design_tasks
  where id=v_task_id and title='LIDER-DESIGN-E2E макет баннера';
  if not found then raise exception 'design_task_reopen_failed'; end if;
end $scenario$;

rollback;

do $cleanup$
begin
  if (select count(*) from public.leader_user_profiles where user_id='b7310000-0000-4000-8000-000000000001') <> 0
     or (select count(*) from public.leader_leads where request_id='LIDER-DESIGN-E2E-20260731-request') <> 0
     or (select count(*) from public.leader_orders where id='b7310000-0000-4000-8000-000000000003') <> 0
     or (select count(*) from public.leader_lead_needs where id='b7310000-0000-4000-8000-000000000004') <> 0
     or (select count(*) from public.leader_design_tasks where title='LIDER-DESIGN-E2E макет баннера') <> 0
     or (select count(*) from public.leader_design_task_events where order_id='b7310000-0000-4000-8000-000000000003') <> 0
     or (select count(*) from leader_private.leader_command_receipts where idempotency_key like 'LIDER-DESIGN-E2E-20260731%') <> 0
  then raise exception 'order_to_design_cleanup_failed'; end if;

  raise notice 'order-to-design acceptance: OK; cleanup verified: zero residue';
end $cleanup$;
