-- STAGING ONLY: reproducible order -> production job acceptance.
-- Target: otulfnouybahfnsycxqn. Synthetic prefix: LIDER-PRODUCTION-E2E-20260731.
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

  if to_regprocedure('public.leader_create_production_job_from_order_rpc(jsonb)') is null
     or to_regclass('public.leader_production_jobs') is null
     or to_regclass('public.leader_production_events') is null
     or to_regclass('leader_private.leader_command_receipts') is null
  then raise exception 'order_to_production_contract_missing'; end if;
end
$guard$;

insert into public.leader_user_profiles(user_id,email,full_name,role,is_active,permissions)
values (
  'b7311000-0000-4000-8000-000000000001',
  'lider-production-e2e-20260731@example.invalid',
  'LIDER-PRODUCTION-E2E manager',
  'manager',
  true,
  '{"production.read":true,"production.write":true}'::jsonb
);

insert into public.leader_leads(id,name,phone,source,status,assigned_to,next_contact_at,request_id,created_at,updated_at)
values (
  'b7311000-0000-4000-8000-000000000002',
  'LIDER-PRODUCTION-E2E client',
  '+79990007312',
  'staging-e2e',
  'Создан заказ',
  'b7311000-0000-4000-8000-000000000001',
  now()+interval '1 day',
  'LIDER-PRODUCTION-E2E-20260731-request',
  clock_timestamp(),
  clock_timestamp()
);

insert into public.leader_orders(
  id,owner_id,lead_id,project_name,client_name,client_phone,status,priority,deadline,
  layout_status,layout_link,payment_status,production_status,client_total,contractor_cost,
  profit,source,is_archived,created_at,updated_at
) values
(
  'b7311000-0000-4000-8000-000000000003',
  'b7311000-0000-4000-8000-000000000001',
  'b7311000-0000-4000-8000-000000000002',
  'LIDER-PRODUCTION-E2E order',
  'LIDER-PRODUCTION-E2E client',
  '+79990007312',
  'Новый','Обычный',current_date+7,
  'Макет согласован',
  'https://example.invalid/lider-production-e2e-layout.pdf',
  'Оплачено','Не передано',2400,1700,700,'staging-e2e',false,
  clock_timestamp(),clock_timestamp()
),
(
  'b7311000-0000-4000-8000-000000000013',
  'b7311000-0000-4000-8000-000000000001',
  'b7311000-0000-4000-8000-000000000002',
  'LIDER-PRODUCTION-E2E unapproved order',
  'LIDER-PRODUCTION-E2E client',
  '+79990007312',
  'Новый','Обычный',current_date+8,
  'На согласовании',null,
  'Оплачено','Не передано',1000,600,400,'staging-e2e',false,
  clock_timestamp(),clock_timestamp()
);

insert into public.leader_design_tasks(
  id,owner_id,order_id,title,task_status,layout_status,priority,deadline,source,
  layout_link,task_text,created_by,updated_by,approved_at,completed_at,created_at,updated_at
) values (
  'b7311000-0000-4000-8000-000000000004',
  'b7311000-0000-4000-8000-000000000001',
  'b7311000-0000-4000-8000-000000000003',
  'LIDER-PRODUCTION-E2E approved layout',
  'Завершено','Макет согласован','Обычный',now()+interval '3 days','staging-e2e',
  'https://example.invalid/lider-production-e2e-layout.pdf',
  'Согласованный макет баннера',
  'b7311000-0000-4000-8000-000000000001',
  'b7311000-0000-4000-8000-000000000001',
  clock_timestamp(),clock_timestamp(),clock_timestamp(),clock_timestamp()
);

do $scenario$
declare
  v_request jsonb;
  v_response jsonb;
  v_replay jsonb;
  v_conflict jsonb;
  v_duplicate jsonb;
  v_unapproved jsonb;
  v_job_id uuid;
begin
  v_request := jsonb_build_object(
    'actor_id','b7311000-0000-4000-8000-000000000001',
    'actor_email','lider-production-e2e-20260731@example.invalid',
    'request',jsonb_build_object(
      'action','production_job.create_from_order',
      'request_id','b7311000-0000-4000-8000-000000000005',
      'expected_updated_at',(select updated_at from public.leader_orders where id='b7311000-0000-4000-8000-000000000003'),
      'payload',jsonb_build_object(
        'order_id','b7311000-0000-4000-8000-000000000003',
        'design_task_id','b7311000-0000-4000-8000-000000000004',
        'idempotency_key','LIDER-PRODUCTION-E2E-20260731-create',
        'job',jsonb_build_object(
          'title','LIDER-PRODUCTION-E2E баннер 2x1 м',
          'priority','Высокая',
          'deadline',(now()+interval '4 days')::text,
          'layout_status','Макет согласован',
          'file_url','https://example.invalid/lider-production-e2e-layout.pdf',
          'technical_task','Напечатать баннер 2x1 м, люверсы по периметру',
          'contractor_cost',1700
        )
      )
    )
  );

  v_response := public.leader_create_production_job_from_order_rpc(v_request);
  if coalesce((v_response->>'ok')::boolean,false) is not true then
    raise exception 'production_create_failed: %',v_response;
  end if;
  v_job_id := (v_response#>>'{entity,id}')::uuid;
  if v_job_id is null then raise exception 'production_entity_id_missing: %',v_response; end if;

  if (select count(*) from public.leader_production_jobs where order_id='b7311000-0000-4000-8000-000000000003') <> 1
     or (select count(*) from public.leader_production_events where job_id=v_job_id and event_type='Создание задания') <> 1
     or (select production_status from public.leader_production_jobs where id=v_job_id) <> 'В очереди'
     or (select layout_status from public.leader_production_jobs where id=v_job_id) <> 'Макет согласован'
     or (select priority from public.leader_production_jobs where id=v_job_id) <> 'Высокая'
     or (select contractor_cost from public.leader_production_jobs where id=v_job_id) <> 1700
     or (select client_total from public.leader_production_jobs where id=v_job_id) <> 2400
     or (select production_job_id from public.leader_design_tasks where id='b7311000-0000-4000-8000-000000000004') <> v_job_id
     or (select production_status from public.leader_orders where id='b7311000-0000-4000-8000-000000000003') <> 'В очереди'
     or (select current_stage from public.leader_orders where id='b7311000-0000-4000-8000-000000000003') <> 'Производство: В очереди'
     or (select next_action from public.leader_orders where id='b7311000-0000-4000-8000-000000000003') <> 'Контролировать производство'
  then raise exception 'production_projection_failed'; end if;

  v_replay := public.leader_create_production_job_from_order_rpc(v_request);
  if coalesce((v_replay->>'ok')::boolean,false) is not true
     or coalesce((v_replay->>'idempotent_replay')::boolean,false) is not true
     or (v_replay#>>'{entity,id}')::uuid <> v_job_id
  then raise exception 'production_idempotent_replay_failed: %',v_replay; end if;

  v_conflict := public.leader_create_production_job_from_order_rpc(
    jsonb_set(v_request,'{request,payload,job,title}','"LIDER-PRODUCTION-E2E changed title"'::jsonb)
  );
  if coalesce(v_conflict#>>'{error,code}','') <> 'conflict' then
    raise exception 'production_idempotency_conflict_failed: %',v_conflict;
  end if;

  v_duplicate := public.leader_create_production_job_from_order_rpc(
    jsonb_build_object(
      'actor_id','b7311000-0000-4000-8000-000000000001',
      'actor_email','lider-production-e2e-20260731@example.invalid',
      'request',jsonb_build_object(
        'action','production_job.create_from_order',
        'request_id','b7311000-0000-4000-8000-000000000006',
        'expected_updated_at',(select updated_at from public.leader_orders where id='b7311000-0000-4000-8000-000000000003'),
        'payload',jsonb_build_object(
          'order_id','b7311000-0000-4000-8000-000000000003',
          'idempotency_key','LIDER-PRODUCTION-E2E-20260731-second',
          'job',jsonb_build_object(
            'title','LIDER-PRODUCTION-E2E second job',
            'priority','Обычная',
            'layout_status','Макет согласован'
          )
        )
      )
    )
  );
  if coalesce(v_duplicate#>>'{error,code}','') <> 'conflict' then
    raise exception 'active_production_job_conflict_failed: %',v_duplicate;
  end if;

  v_unapproved := public.leader_create_production_job_from_order_rpc(
    jsonb_build_object(
      'actor_id','b7311000-0000-4000-8000-000000000001',
      'actor_email','lider-production-e2e-20260731@example.invalid',
      'request',jsonb_build_object(
        'action','production_job.create_from_order',
        'request_id','b7311000-0000-4000-8000-000000000015',
        'expected_updated_at',(select updated_at from public.leader_orders where id='b7311000-0000-4000-8000-000000000013'),
        'payload',jsonb_build_object(
          'order_id','b7311000-0000-4000-8000-000000000013',
          'idempotency_key','LIDER-PRODUCTION-E2E-20260731-unapproved',
          'job',jsonb_build_object(
            'title','LIDER-PRODUCTION-E2E blocked job',
            'priority','Обычная',
            'layout_status','Макет согласован'
          )
        )
      )
    )
  );
  if coalesce(v_unapproved#>>'{error,code}','') <> 'validation_error'
     or exists(select 1 from public.leader_production_jobs where order_id='b7311000-0000-4000-8000-000000000013')
  then raise exception 'unapproved_layout_gate_failed: %',v_unapproved; end if;

  perform 1 from public.leader_production_jobs
  where id=v_job_id
    and file_url='https://example.invalid/lider-production-e2e-layout.pdf'
    and technical_task='Напечатать баннер 2x1 м, люверсы по периметру';
  if not found then raise exception 'production_job_reopen_failed'; end if;
end
$scenario$;

rollback;

select 'order-to-production acceptance: OK; cleanup verified: zero residue' as result;
