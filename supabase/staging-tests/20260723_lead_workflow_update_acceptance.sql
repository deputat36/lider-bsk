-- STAGING ONLY. Synthetic rows only; the outer transaction always rolls back.
begin;

do $acceptance$
declare
  v_manager uuid := gen_random_uuid();
  v_accountant uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_lead uuid := gen_random_uuid();
  v_initial timestamptz := '2026-07-23T15:40:00Z';
  v_request jsonb;
  v_result jsonb;
  v_success jsonb;
  v_updated_at timestamptz;
  v_events integer;
  v_receipts integer;
begin
  insert into public.leader_user_profiles(user_id,full_name,role,is_active)
  values (v_manager,'Manager','manager',true),(v_accountant,'Accountant','accountant',true),(v_other,'Other manager','manager',true);
  insert into public.leader_leads(id,status,created_at,updated_at,next_contact_at,assigned_to)
  values (v_lead,'Новая',v_initial,v_initial,null,null);

  v_result := public.leader_update_lead_workflow_rpc(jsonb_build_object(
    'actor_id',v_manager,'request',jsonb_build_object('action','lead_workflow.update','request_id',gen_random_uuid(),'expected_updated_at',v_initial,
      'payload',jsonb_build_object('lead_id',v_lead,'idempotency_key','assignee-'||gen_random_uuid(),'patch',jsonb_build_object('status','В работе')))));
  if v_result #>> '{error,code}' <> 'assignee_required' then raise exception 'assignee gate failed'; end if;

  v_result := public.leader_update_lead_workflow_rpc(jsonb_build_object(
    'actor_id',v_accountant,'request',jsonb_build_object('action','lead_workflow.update','request_id',gen_random_uuid(),'expected_updated_at',v_initial,
      'payload',jsonb_build_object('lead_id',v_lead,'idempotency_key','forbidden-'||gen_random_uuid(),'patch',jsonb_build_object('assigned_to',v_accountant)))));
  if v_result #>> '{error,code}' <> 'forbidden' then raise exception 'role gate failed'; end if;

  v_result := public.leader_update_lead_workflow_rpc(jsonb_build_object(
    'actor_id',v_manager,'request',jsonb_build_object('action','lead_workflow.update','request_id',gen_random_uuid(),'expected_updated_at',v_initial,
      'payload',jsonb_build_object('lead_id',v_lead,'idempotency_key','other-'||gen_random_uuid(),'patch',jsonb_build_object('assigned_to',v_other)))));
  if v_result #>> '{error,code}' <> 'forbidden' then raise exception 'self assignment gate failed'; end if;

  v_request := jsonb_build_object(
    'actor_id',v_manager,
    'request',jsonb_build_object('action','lead_workflow.update','request_id',gen_random_uuid(),'expected_updated_at',v_initial,
      'payload',jsonb_build_object('lead_id',v_lead,'idempotency_key','self-'||gen_random_uuid(),
        'patch',jsonb_build_object('assigned_to',v_manager,'status','В работе'))));
  v_success := public.leader_update_lead_workflow_rpc(v_request);
  if coalesce((v_success->>'ok')::boolean,false) is not true or v_success #>> '{lead,status}' <> 'В работе' then
    raise exception 'self assignment success failed';
  end if;
  v_updated_at := (v_success #>> '{lead,updated_at}')::timestamptz;
  v_result := public.leader_update_lead_workflow_rpc(v_request);
  if coalesce((v_result->>'idempotent_replay')::boolean,false) is not true then raise exception 'replay failed'; end if;

  v_result := public.leader_update_lead_workflow_rpc(jsonb_build_object(
    'actor_id',v_manager,'request',jsonb_build_object('action','lead_workflow.update','request_id',gen_random_uuid(),'expected_updated_at',v_updated_at,
      'payload',jsonb_build_object('lead_id',v_lead,'idempotency_key','waiting-null-'||gen_random_uuid(),
        'patch',jsonb_build_object('status','Ждём ответ','next_contact_at',null)))));
  if v_result #>> '{error,code}' <> 'next_contact_required' then raise exception 'future contact gate failed'; end if;

  v_result := public.leader_update_lead_workflow_rpc(jsonb_build_object(
    'actor_id',v_manager,'request',jsonb_build_object('action','lead_workflow.update','request_id',gen_random_uuid(),'expected_updated_at',v_updated_at,
      'payload',jsonb_build_object('lead_id',v_lead,'idempotency_key','waiting-future-'||gen_random_uuid(),
        'patch',jsonb_build_object('status','Ждём ответ','next_contact_at','2026-08-01T10:00:00Z')))));
  if coalesce((v_result->>'ok')::boolean,false) is not true or v_result #>> '{lead,status}' <> 'Ждём ответ' then
    raise exception 'waiting success failed';
  end if;

  v_result := public.leader_update_lead_workflow_rpc(jsonb_build_object(
    'actor_id',v_manager,'request',jsonb_build_object('action','lead_workflow.update','request_id',gen_random_uuid(),'expected_updated_at',v_initial,
      'payload',jsonb_build_object('lead_id',v_lead,'idempotency_key','stale-'||gen_random_uuid(),'patch',jsonb_build_object('status','Уточнение деталей')))));
  if v_result #>> '{error,code}' <> 'conflict' then raise exception 'stale conflict failed'; end if;

  select count(*) into v_events from public.leader_lead_events where lead_id=v_lead;
  select count(*) into v_receipts from leader_private.leader_command_receipts where action='lead_workflow.update';
  if v_events <> 2 or v_receipts <> 2 then raise exception 'event or receipt count failed'; end if;
end
$acceptance$;

rollback;
