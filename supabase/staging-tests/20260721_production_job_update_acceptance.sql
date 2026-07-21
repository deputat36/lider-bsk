-- STAGING ONLY acceptance test for production_job.update.
-- Uses synthetic UUIDs and finishes with ROLLBACK.

begin;

insert into public.leader_user_profiles(user_id,email,full_name,role,is_active)
values
  ('11111111-1111-4111-8111-111111111111','manager@test.local','Test Manager','manager',true),
  ('11111111-1111-4111-8111-222222222222','contractor@test.local','Test Contractor','contractor',true),
  ('11111111-1111-4111-8111-333333333333','accountant@test.local','Test Accountant','accountant',true),
  ('11111111-1111-4111-8111-444444444444','installer@test.local','Test Installer','installer',true),
  ('11111111-1111-4111-8111-555555555555','inactive@test.local','Inactive Manager','manager',false),
  ('11111111-1111-4111-8111-666666666666','unknown@test.local','Unknown Role','unknown_role',true)
on conflict (user_id) do update
set email=excluded.email, full_name=excluded.full_name, role=excluded.role, is_active=excluded.is_active;

insert into public.leader_orders(
  id,owner_id,project_name,status,production_status,layout_status,layout_link,current_stage,updated_at
) values
  ('22222222-2222-4222-8222-111111111111','11111111-1111-4111-8111-111111111111','Acceptance order','Новый','Не передано','Макет не проверен',null,'Новый','2026-07-21T10:00:00Z'),
  ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','Atomic failure order','Новый','Не передано','Макет не проверен',null,'Новый','2026-07-21T10:00:00Z'),
  ('22222222-2222-4222-8222-333333333333','11111111-1111-4111-8111-222222222222','Contractor order','Новый','Не передано','Макет не проверен',null,'Новый','2026-07-21T10:00:00Z');

insert into public.leader_production_jobs(
  id,owner_id,order_id,title,production_status,layout_status,priority,internal_comment,updated_at
) values
  ('33333333-3333-4333-8333-111111111111','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-111111111111','Acceptance job','Не передано','Макет не проверен','Обычная',null,'2026-07-21T10:00:00Z'),
  ('33333333-3333-4333-8333-222222222222','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','Atomic failure job','Не передано','Макет не проверен','Обычная',null,'2026-07-21T10:00:00Z'),
  ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-222222222222','22222222-2222-4222-8222-333333333333','Contractor job','Не передано','Макет не проверен','Обычная',null,'2026-07-21T10:00:00Z');

create or replace function leader_staging.fail_production_event_for_acceptance()
returns trigger
language plpgsql
as $function$
begin
  if new.job_id = '33333333-3333-4333-8333-222222222222'::uuid then
    raise exception 'synthetic_event_failure';
  end if;
  return new;
end
$function$;

create trigger leader_production_events_acceptance_failure
before insert on public.leader_production_events
for each row execute function leader_staging.fail_production_event_for_acceptance();

do $test$
declare
  v_command jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_changed_key jsonb;
  v_invalid jsonb;
  v_stale jsonb;
  v_forbidden jsonb;
  v_atomic jsonb;
  v_contractor jsonb;
  v_updated_at timestamptz;
  v_count bigint;
begin
  v_command := jsonb_build_object(
    'actor_id','11111111-1111-4111-8111-111111111111',
    'actor_email','manager@test.local',
    'request',jsonb_build_object(
      'action','production_job.update',
      'request_id','44444444-4444-4444-8444-111111111111',
      'expected_updated_at','2026-07-21T10:00:00Z',
      'payload',jsonb_build_object(
        'job_id','33333333-3333-4333-8333-111111111111',
        'idempotency_key','acceptance-production-job-main-v1',
        'patch',jsonb_build_object(
          'title','Acceptance job updated',
          'production_status','В очереди',
          'layout_status','На согласовании',
          'priority','Высокая',
          'deadline','2026-07-25T12:00:00Z',
          'file_url','https://example.test/layout.pdf',
          'technical_task','Acceptance technical task',
          'contractor_comment','Acceptance contractor comment',
          'internal_comment','PRIVATE_INTERNAL_SENTINEL'
        )
      )
    )
  );

  v_result := public.leader_update_production_job_rpc(v_command);
  if v_result ->> 'ok' <> 'true' then raise exception 'success_failed: %', v_result; end if;
  if v_result #>> '{entity,production_status}' <> 'В очереди' then raise exception 'job_status_not_updated'; end if;
  if v_result #>> '{order,production_status}' <> 'В очереди' then raise exception 'order_status_not_synchronized'; end if;
  if v_result #>> '{events,0,old_status}' <> 'Не передано' or v_result #>> '{events,0,new_status}' <> 'В очереди' then
    raise exception 'event_status_projection_failed';
  end if;
  if v_result #> '{entity}' ?| array['internal_comment','contractor_cost','client_total','created_by','owner_id'] then
    raise exception 'private_job_field_leaked';
  end if;
  if v_result #> '{events,0}' ?| array['created_by','created_by_email','owner_id'] then
    raise exception 'private_event_field_leaked';
  end if;
  if (select internal_comment from public.leader_production_jobs where id='33333333-3333-4333-8333-111111111111') <> 'PRIVATE_INTERNAL_SENTINEL' then
    raise exception 'manager_internal_comment_not_persisted';
  end if;
  if (select sent_to_contractor_at is null from public.leader_production_jobs where id='33333333-3333-4333-8333-111111111111') then
    raise exception 'queued_timestamp_missing';
  end if;

  v_replay := public.leader_update_production_job_rpc(v_command);
  if v_replay ->> 'ok' <> 'true' or v_replay ->> 'idempotent_replay' <> 'true' then
    raise exception 'exact_replay_failed: %', v_replay;
  end if;
  select count(*) into v_count from public.leader_production_events where job_id='33333333-3333-4333-8333-111111111111';
  if v_count <> 1 then raise exception 'replay_created_duplicate_event'; end if;
  select count(*) into v_count from leader_private.leader_command_receipts where action='production_job.update' and idempotency_key='acceptance-production-job-main-v1';
  if v_count <> 1 then raise exception 'replay_created_duplicate_receipt'; end if;

  v_changed_key := jsonb_set(v_command, '{request,payload,patch,title}', '"Changed payload"'::jsonb);
  v_changed_key := jsonb_set(v_changed_key, '{request,request_id}', '"44444444-4444-4444-8444-222222222222"'::jsonb);
  v_changed_key := public.leader_update_production_job_rpc(v_changed_key);
  if v_changed_key #>> '{error,code}' <> 'conflict' then raise exception 'idempotency_conflict_not_detected: %', v_changed_key; end if;

  select updated_at into v_updated_at from public.leader_production_jobs where id='33333333-3333-4333-8333-111111111111';
  v_invalid := public.leader_update_production_job_rpc(jsonb_build_object(
    'actor_id','11111111-1111-4111-8111-111111111111',
    'actor_email','manager@test.local',
    'request',jsonb_build_object(
      'action','production_job.update',
      'request_id','44444444-4444-4444-8444-333333333333',
      'expected_updated_at',v_updated_at,
      'payload',jsonb_build_object(
        'job_id','33333333-3333-4333-8333-111111111111',
        'idempotency_key','acceptance-production-job-invalid-v1',
        'patch',jsonb_build_object('production_status','Выдано')
      )
    )
  ));
  if v_invalid #>> '{error,code}' <> 'invalid_transition' then raise exception 'invalid_transition_not_detected: %', v_invalid; end if;

  v_stale := public.leader_update_production_job_rpc(jsonb_build_object(
    'actor_id','11111111-1111-4111-8111-111111111111',
    'actor_email','manager@test.local',
    'request',jsonb_build_object(
      'action','production_job.update',
      'request_id','44444444-4444-4444-8444-444444444444',
      'expected_updated_at','2026-07-21T10:00:00Z',
      'payload',jsonb_build_object(
        'job_id','33333333-3333-4333-8333-111111111111',
        'idempotency_key','acceptance-production-job-stale-v1',
        'patch',jsonb_build_object('title','Stale title')
      )
    )
  ));
  if v_stale #>> '{error,code}' <> 'conflict' then raise exception 'stale_conflict_not_detected: %', v_stale; end if;

  foreach v_forbidden in array array[
    public.leader_update_production_job_rpc(jsonb_build_object(
      'actor_id','11111111-1111-4111-8111-222222222222','actor_email','contractor@test.local',
      'request',jsonb_build_object('action','production_job.update','request_id','55555555-5555-4555-8555-111111111111','expected_updated_at',v_updated_at,
        'payload',jsonb_build_object('job_id','33333333-3333-4333-8333-111111111111','idempotency_key','acceptance-contractor-internal-v1','patch',jsonb_build_object('internal_comment','forbidden'))))),
    public.leader_update_production_job_rpc(jsonb_build_object(
      'actor_id','11111111-1111-4111-8111-333333333333','actor_email','accountant@test.local',
      'request',jsonb_build_object('action','production_job.update','request_id','55555555-5555-4555-8555-222222222222','expected_updated_at',v_updated_at,
        'payload',jsonb_build_object('job_id','33333333-3333-4333-8333-111111111111','idempotency_key','acceptance-accountant-denied-v1','patch',jsonb_build_object('title','forbidden'))))),
    public.leader_update_production_job_rpc(jsonb_build_object(
      'actor_id','11111111-1111-4111-8111-444444444444','actor_email','installer@test.local',
      'request',jsonb_build_object('action','production_job.update','request_id','55555555-5555-4555-8555-333333333333','expected_updated_at',v_updated_at,
        'payload',jsonb_build_object('job_id','33333333-3333-4333-8333-111111111111','idempotency_key','acceptance-installer-denied-v1','patch',jsonb_build_object('title','forbidden'))))),
    public.leader_update_production_job_rpc(jsonb_build_object(
      'actor_id','11111111-1111-4111-8111-555555555555','actor_email','inactive@test.local',
      'request',jsonb_build_object('action','production_job.update','request_id','55555555-5555-4555-8555-444444444444','expected_updated_at',v_updated_at,
        'payload',jsonb_build_object('job_id','33333333-3333-4333-8333-111111111111','idempotency_key','acceptance-inactive-denied-v1','patch',jsonb_build_object('title','forbidden'))))),
    public.leader_update_production_job_rpc(jsonb_build_object(
      'actor_id','11111111-1111-4111-8111-666666666666','actor_email','unknown@test.local',
      'request',jsonb_build_object('action','production_job.update','request_id','55555555-5555-4555-8555-555555555555','expected_updated_at',v_updated_at,
        'payload',jsonb_build_object('job_id','33333333-3333-4333-8333-111111111111','idempotency_key','acceptance-unknown-denied-v1','patch',jsonb_build_object('title','forbidden')))))
  ] loop
    if v_forbidden #>> '{error,code}' <> 'forbidden' then raise exception 'forbidden_case_failed: %', v_forbidden; end if;
  end loop;

  v_contractor := public.leader_update_production_job_rpc(jsonb_build_object(
    'actor_id','11111111-1111-4111-8111-222222222222',
    'actor_email','contractor@test.local',
    'request',jsonb_build_object(
      'action','production_job.update',
      'request_id','66666666-6666-4666-8666-111111111111',
      'expected_updated_at','2026-07-21T10:00:00Z',
      'payload',jsonb_build_object(
        'job_id','33333333-3333-4333-8333-333333333333',
        'idempotency_key','acceptance-contractor-positive-v1',
        'patch',jsonb_build_object('contractor_comment','Contractor may update production comment')
      )
    )
  ));
  if v_contractor ->> 'ok' <> 'true' then raise exception 'contractor_positive_failed: %', v_contractor; end if;

  v_atomic := public.leader_update_production_job_rpc(jsonb_build_object(
    'actor_id','11111111-1111-4111-8111-111111111111',
    'actor_email','manager@test.local',
    'request',jsonb_build_object(
      'action','production_job.update',
      'request_id','77777777-7777-4777-8777-111111111111',
      'expected_updated_at','2026-07-21T10:00:00Z',
      'payload',jsonb_build_object(
        'job_id','33333333-3333-4333-8333-222222222222',
        'idempotency_key','acceptance-atomic-failure-v1',
        'patch',jsonb_build_object('title','Must roll back','production_status','В очереди')
      )
    )
  ));
  if v_atomic #>> '{error,code}' <> 'persistence_failed' then raise exception 'forced_failure_not_detected: %', v_atomic; end if;
  if (select title from public.leader_production_jobs where id='33333333-3333-4333-8333-222222222222') <> 'Atomic failure job' then
    raise exception 'job_update_not_rolled_back';
  end if;
  if (select production_status from public.leader_orders where id='22222222-2222-4222-8222-222222222222') <> 'Не передано' then
    raise exception 'order_update_not_rolled_back';
  end if;
  if exists (select 1 from public.leader_production_events where job_id='33333333-3333-4333-8333-222222222222') then
    raise exception 'failed_event_persisted';
  end if;
  if exists (select 1 from leader_private.leader_command_receipts where action='production_job.update' and idempotency_key='acceptance-atomic-failure-v1') then
    raise exception 'failed_receipt_persisted';
  end if;
end
$test$;

rollback;

select jsonb_build_object(
  'profiles', (select count(*) from public.leader_user_profiles where user_id::text like '11111111-1111-4111-8111-%'),
  'orders', (select count(*) from public.leader_orders where id::text like '22222222-2222-4222-8222-%'),
  'jobs', (select count(*) from public.leader_production_jobs where id::text like '33333333-3333-4333-8333-%'),
  'events', (select count(*) from public.leader_production_events where job_id::text like '33333333-3333-4333-8333-%'),
  'receipts', (select count(*) from leader_private.leader_command_receipts where idempotency_key like 'acceptance-%')
) as cleanup;
