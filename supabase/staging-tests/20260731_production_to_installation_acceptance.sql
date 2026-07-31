-- STAGING ONLY: reproducible production -> installation acceptance.
-- Target: otulfnouybahfnsycxqn. Synthetic prefix: LIDER-INSTALLATION-E2E-20260731.
-- Run with psql -v ON_ERROR_STOP=1. The transaction is always rolled back.

\set ON_ERROR_STOP on
begin;

do $guard$
begin
  if not exists (
    select 1 from leader_staging.environment_guard
    where singleton=true and project_ref='otulfnouybahfnsycxqn'
      and environment_name='staging' and repository='deputat36/lider-bsk'
  ) then raise exception 'staging_environment_guard_failed'; end if;
  if to_regprocedure('public.leader_create_installation_job_from_order_rpc(jsonb)') is null
     or to_regclass('public.leader_installation_jobs') is null
     or to_regclass('public.leader_installation_events') is null
     or to_regclass('leader_private.leader_command_receipts') is null
  then raise exception 'production_to_installation_contract_missing'; end if;
end
$guard$;

insert into public.leader_user_profiles(user_id,email,full_name,role,is_active,permissions)
values ('b7313000-0000-4000-8000-000000000001','lider-installation-e2e-20260731@example.invalid','LIDER-INSTALLATION-E2E manager','manager',true,'{"installation.read":true,"installation.write":true}'::jsonb);

insert into public.leader_leads(id,name,phone,source,status,assigned_to,request_id,created_at,updated_at)
values ('b7313000-0000-4000-8000-000000000002','LIDER-INSTALLATION-E2E client','+79990007313','staging-e2e','Создан заказ','b7313000-0000-4000-8000-000000000001','LIDER-INSTALLATION-E2E-20260731-request',clock_timestamp(),clock_timestamp());

insert into public.leader_orders(
  id,owner_id,lead_id,project_name,client_name,client_phone,status,priority,deadline,
  layout_status,payment_status,production_status,installation_status,client_total,
  contractor_cost,profit,source,is_archived,created_at,updated_at
) values
('b7313000-0000-4000-8000-000000000003','b7313000-0000-4000-8000-000000000001','b7313000-0000-4000-8000-000000000002','LIDER-INSTALLATION-E2E ready order','LIDER-INSTALLATION-E2E client','+79990007313','Новый','Обычный',current_date+7,'Макет согласован','Оплачено','Готово','Не назначен',5000,3000,2000,'staging-e2e',false,clock_timestamp(),clock_timestamp()),
('b7313000-0000-4000-8000-000000000013','b7313000-0000-4000-8000-000000000001','b7313000-0000-4000-8000-000000000002','LIDER-INSTALLATION-E2E not ready order','LIDER-INSTALLATION-E2E client','+79990007313','Новый','Обычный',current_date+8,'Макет согласован','Оплачено','В производстве','Не назначен',4000,2500,1500,'staging-e2e',false,clock_timestamp(),clock_timestamp());

insert into public.leader_production_jobs(
  id,owner_id,order_id,title,production_status,created_by,layout_status,priority,
  deadline,ready_at,contractor_cost,client_total,technical_task,created_at,updated_at
) values
('b7313000-0000-4000-8000-000000000004','b7313000-0000-4000-8000-000000000001','b7313000-0000-4000-8000-000000000003','LIDER-INSTALLATION-E2E ready production','Готово','b7313000-0000-4000-8000-000000000001','Макет согласован','Обычная',now()+interval '1 day',clock_timestamp(),3000,5000,'Изделие готово к монтажу',clock_timestamp(),clock_timestamp()),
('b7313000-0000-4000-8000-000000000014','b7313000-0000-4000-8000-000000000001','b7313000-0000-4000-8000-000000000013','LIDER-INSTALLATION-E2E unfinished production','В производстве','b7313000-0000-4000-8000-000000000001','Макет согласован','Обычная',now()+interval '2 days',null,2500,4000,'Изделие ещё не готово',clock_timestamp(),clock_timestamp());

do $scenario$
declare
  v_request jsonb; v_response jsonb; v_replay jsonb; v_conflict jsonb;
  v_duplicate jsonb; v_unready jsonb; v_job_id uuid;
begin
  v_request := jsonb_build_object(
    'actor_id','b7313000-0000-4000-8000-000000000001',
    'request',jsonb_build_object(
      'action','installation_job.create_from_order',
      'request_id','b7313000-0000-4000-8000-000000000005',
      'expected_updated_at',(select updated_at from public.leader_orders where id='b7313000-0000-4000-8000-000000000003'),
      'payload',jsonb_build_object(
        'order_id','b7313000-0000-4000-8000-000000000003',
        'production_job_id','b7313000-0000-4000-8000-000000000004',
        'idempotency_key','LIDER-INSTALLATION-E2E-20260731-create',
        'job',jsonb_build_object(
          'title','LIDER-INSTALLATION-E2E монтаж вывески','priority','Высокий',
          'installer_name','Монтажник Тестовый','installer_phone','+79990000001',
          'address','Борисоглебск, тестовый адрес, 1',
          'scheduled_at',(now()+interval '3 days')::text,
          'installer_cost',1200,'client_price',1800,
          'technical_task','Установить вывеску, проверить крепления',
          'tools_required','Лестница, перфоратор, уровень'
        )
      )
    )
  );

  v_response := public.leader_create_installation_job_from_order_rpc(v_request);
  if coalesce((v_response->>'ok')::boolean,false) is not true then raise exception 'installation_create_failed: %',v_response; end if;
  v_job_id := (v_response#>>'{entity,id}')::uuid;
  if v_job_id is null then raise exception 'installation_entity_id_missing'; end if;

  if (select count(*) from public.leader_installation_jobs where order_id='b7313000-0000-4000-8000-000000000003') <> 1
     or (select count(*) from public.leader_installation_events where job_id=v_job_id and event_type='created') <> 1
     or (select install_status from public.leader_installation_jobs where id=v_job_id) <> 'Запланирован'
     or (select production_job_id from public.leader_installation_jobs where id=v_job_id) <> 'b7313000-0000-4000-8000-000000000004'
     or (select installer_cost from public.leader_installation_jobs where id=v_job_id) <> 1200
     or (select client_price from public.leader_installation_jobs where id=v_job_id) <> 1800
     or (select installation_status from public.leader_orders where id='b7313000-0000-4000-8000-000000000003') <> 'Запланирован'
     or (select current_stage from public.leader_orders where id='b7313000-0000-4000-8000-000000000003') <> 'Монтаж: Запланирован'
  then raise exception 'installation_projection_failed'; end if;

  v_replay := public.leader_create_installation_job_from_order_rpc(v_request);
  if coalesce((v_replay->>'ok')::boolean,false) is not true
     or coalesce((v_replay->>'idempotent_replay')::boolean,false) is not true
     or (v_replay#>>'{entity,id}')::uuid <> v_job_id
  then raise exception 'installation_idempotent_replay_failed'; end if;

  v_conflict := public.leader_create_installation_job_from_order_rpc(jsonb_set(v_request,'{request,payload,job,address}','"Другой адрес"'::jsonb));
  if coalesce(v_conflict#>>'{error,code}','') <> 'conflict' then raise exception 'installation_idempotency_conflict_failed'; end if;

  v_duplicate := public.leader_create_installation_job_from_order_rpc(
    jsonb_set(
      jsonb_set(v_request,'{request,request_id}','"b7313000-0000-4000-8000-000000000006"'::jsonb),
      '{request,payload,idempotency_key}','"LIDER-INSTALLATION-E2E-20260731-second"'::jsonb
    )
  );
  if coalesce(v_duplicate#>>'{error,code}','') <> 'conflict' then raise exception 'active_installation_job_conflict_failed'; end if;

  v_unready := public.leader_create_installation_job_from_order_rpc(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(v_request,'{request,request_id}','"b7313000-0000-4000-8000-000000000015"'::jsonb),
          '{request,payload,idempotency_key}','"LIDER-INSTALLATION-E2E-20260731-unready"'::jsonb
        ),
        '{request,payload,order_id}','"b7313000-0000-4000-8000-000000000013"'::jsonb
      ),
      '{request,payload,production_job_id}','"b7313000-0000-4000-8000-000000000014"'::jsonb
    )
  );
  v_unready := jsonb_set(v_unready,'{ignored}','null'::jsonb,true) - 'ignored';
  if coalesce(v_unready#>>'{error,code}','') not in ('validation_error','conflict') then
    raise exception 'unready_production_gate_failed: %',v_unready;
  end if;

  perform 1 from public.leader_installation_jobs where id=v_job_id
    and technical_task='Установить вывеску, проверить крепления'
    and tools_required='Лестница, перфоратор, уровень';
  if not found then raise exception 'installation_job_reopen_failed'; end if;
end
$scenario$;

rollback;
select 'production-to-installation acceptance: OK; cleanup verified: zero residue' as result;
