-- STAGING ONLY.
-- Reproducible source for deployment
-- 20260723153001 / staging_lead_workflow_update_rpc_20260723.
-- Never apply to production without a separate approval and rollout plan.

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

  if to_regclass('public.leader_leads') is null
     or to_regclass('public.leader_lead_events') is null
     or to_regclass('public.leader_user_profiles') is null
     or to_regclass('leader_private.leader_command_receipts') is null
     or to_regprocedure('leader_private.leader_actor_has_crm_action(uuid,text)') is null then
    raise exception 'staging_lead_workflow_dependencies_missing';
  end if;
end
$guard$;

create or replace function leader_private.leader_lead_workflow_error(
  p_request_id uuid,
  p_code text,
  p_message text
)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $function$
  select jsonb_build_object(
    'ok', false,
    'request_id', p_request_id,
    'error', jsonb_build_object('code', p_code, 'message', p_message)
  );
$function$;

create or replace function leader_private.leader_lead_status_requires_assignee(p_status text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $function$
  select btrim(coalesce(p_status, '')) = any(array[
    'В работе','Уточнение деталей','Расчёт подготовлен','КП отправлено',
    'Ждём ответ','Нужно пересчитать','Согласовано'
  ]);
$function$;

create or replace function leader_private.leader_lead_status_requires_future_contact(p_status text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $function$
  select btrim(coalesce(p_status, '')) = any(array['КП отправлено','Ждём ответ']);
$function$;

create or replace function public.leader_update_lead_workflow_rpc(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_actor_id uuid;
  v_actor_email text;
  v_request jsonb;
  v_request_id uuid;
  v_expected_updated_at timestamptz;
  v_business jsonb;
  v_patch jsonb;
  v_lead_id uuid;
  v_idempotency_key text;
  v_request_hash text;
  v_receipt leader_private.leader_command_receipts%rowtype;
  v_lead public.leader_leads%rowtype;
  v_event public.leader_lead_events%rowtype;
  v_now timestamptz := clock_timestamp();
  v_old_status text;
  v_old_assigned_to uuid;
  v_old_next_contact_at timestamptz;
  v_status text;
  v_assigned_to uuid;
  v_next_contact_at timestamptz;
  v_status_present boolean;
  v_assignment_present boolean;
  v_contact_present boolean;
  v_response jsonb;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return leader_private.leader_lead_workflow_error(null, 'validation_error', 'RPC payload must be an object');
  end if;
  if exists (select 1 from jsonb_object_keys(p_payload) k(key) where key not in ('actor_id','actor_email','request')) then
    return leader_private.leader_lead_workflow_error(null, 'validation_error', 'Unknown RPC payload field');
  end if;

  begin
    v_actor_id := nullif(btrim(coalesce(p_payload ->> 'actor_id', '')), '')::uuid;
  exception when others then
    return leader_private.leader_lead_workflow_error(null, 'validation_error', 'actor_id must be a UUID');
  end;
  v_actor_email := left(btrim(coalesce(p_payload ->> 'actor_email', '')), 320);
  if v_actor_id is null then
    return leader_private.leader_lead_workflow_error(null, 'validation_error', 'actor_id is required');
  end if;

  v_request := p_payload -> 'request';
  if v_request is null or jsonb_typeof(v_request) <> 'object' then
    return leader_private.leader_lead_workflow_error(null, 'validation_error', 'request must be an object');
  end if;
  if exists (select 1 from jsonb_object_keys(v_request) k(key) where key not in ('action','request_id','expected_updated_at','payload')) then
    return leader_private.leader_lead_workflow_error(null, 'validation_error', 'Unknown request field');
  end if;

  begin
    v_request_id := nullif(btrim(coalesce(v_request ->> 'request_id', '')), '')::uuid;
    v_expected_updated_at := nullif(btrim(coalesce(v_request ->> 'expected_updated_at', '')), '')::timestamptz;
  exception when others then
    return leader_private.leader_lead_workflow_error(null, 'validation_error', 'request_id or expected_updated_at is invalid');
  end;
  if v_request_id is null or v_expected_updated_at is null then
    return leader_private.leader_lead_workflow_error(v_request_id, 'validation_error', 'request_id and expected_updated_at are required');
  end if;
  if btrim(coalesce(v_request ->> 'action', '')) <> 'lead_workflow.update' then
    return leader_private.leader_lead_workflow_error(v_request_id, 'unknown_action', 'Unsupported action');
  end if;
  if not leader_private.leader_actor_has_crm_action(v_actor_id, 'leads.update') then
    return leader_private.leader_lead_workflow_error(v_request_id, 'forbidden', 'leads.update permission is required');
  end if;

  v_business := v_request -> 'payload';
  if v_business is null or jsonb_typeof(v_business) <> 'object' then
    return leader_private.leader_lead_workflow_error(v_request_id, 'validation_error', 'payload must be an object');
  end if;
  if exists (select 1 from jsonb_object_keys(v_business) k(key) where key not in ('lead_id','idempotency_key','patch')) then
    return leader_private.leader_lead_workflow_error(v_request_id, 'validation_error', 'Unknown business payload field');
  end if;

  begin
    v_lead_id := nullif(btrim(coalesce(v_business ->> 'lead_id', '')), '')::uuid;
  exception when others then
    return leader_private.leader_lead_workflow_error(v_request_id, 'validation_error', 'lead_id must be a UUID');
  end;
  v_idempotency_key := btrim(coalesce(v_business ->> 'idempotency_key', ''));
  v_patch := v_business -> 'patch';
  if v_lead_id is null or char_length(v_idempotency_key) not between 1 and 160 then
    return leader_private.leader_lead_workflow_error(v_request_id, 'validation_error', 'lead_id and valid idempotency_key are required');
  end if;
  if v_patch is null or jsonb_typeof(v_patch) <> 'object' or v_patch = '{}'::jsonb then
    return leader_private.leader_lead_workflow_error(v_request_id, 'validation_error', 'patch must be a non-empty object');
  end if;
  if exists (select 1 from jsonb_object_keys(v_patch) k(key) where key not in ('status','next_contact_at','assigned_to')) then
    return leader_private.leader_lead_workflow_error(v_request_id, 'validation_error', 'Patch contains unknown or non-workflow fields');
  end if;

  v_status_present := jsonb_exists(v_patch, 'status');
  v_contact_present := jsonb_exists(v_patch, 'next_contact_at');
  v_assignment_present := jsonb_exists(v_patch, 'assigned_to');

  if v_status_present and jsonb_typeof(v_patch -> 'status') <> 'string' then
    return leader_private.leader_lead_workflow_error(v_request_id, 'validation_error', 'status must be a string');
  end if;
  if v_status_present and btrim(v_patch ->> 'status') not in (
    'Новая','В работе','Уточнение деталей','Расчёт подготовлен','КП отправлено',
    'Ждём ответ','Нужно пересчитать','Согласовано','Отказ','Спам','Создан заказ'
  ) then
    return leader_private.leader_lead_workflow_error(v_request_id, 'validation_error', 'Unknown lead status');
  end if;

  if v_assignment_present then
    if jsonb_typeof(v_patch -> 'assigned_to') <> 'string' then
      return leader_private.leader_lead_workflow_error(v_request_id, 'validation_error', 'assigned_to must be the current actor UUID');
    end if;
    begin
      v_assigned_to := nullif(btrim(v_patch ->> 'assigned_to'), '')::uuid;
    exception when others then
      return leader_private.leader_lead_workflow_error(v_request_id, 'validation_error', 'assigned_to must be a UUID');
    end;
    if v_assigned_to is null or v_assigned_to <> v_actor_id then
      return leader_private.leader_lead_workflow_error(v_request_id, 'forbidden', 'Only self-assignment is allowed');
    end if;
  end if;

  if v_contact_present then
    if jsonb_typeof(v_patch -> 'next_contact_at') = 'null' then
      v_next_contact_at := null;
    elsif jsonb_typeof(v_patch -> 'next_contact_at') = 'string' then
      begin
        v_next_contact_at := nullif(btrim(v_patch ->> 'next_contact_at'), '')::timestamptz;
      exception when others then
        return leader_private.leader_lead_workflow_error(v_request_id, 'validation_error', 'next_contact_at must be a timestamp or null');
      end;
    else
      return leader_private.leader_lead_workflow_error(v_request_id, 'validation_error', 'next_contact_at must be a timestamp or null');
    end if;
  end if;

  v_request_hash := encode(
    extensions.digest(
      convert_to((jsonb_build_object(
        'actor_id', v_actor_id,
        'action', 'lead_workflow.update',
        'expected_updated_at', v_expected_updated_at,
        'payload', v_business
      ))::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  perform pg_advisory_xact_lock(hashtextextended('lead_workflow.update:key:' || v_idempotency_key, 0));
  perform pg_advisory_xact_lock(hashtextextended('lead_workflow.update:request:' || v_request_id::text, 0));

  select * into v_receipt
  from leader_private.leader_command_receipts
  where action = 'lead_workflow.update'
    and idempotency_key = v_idempotency_key
  for update;

  if found then
    if v_receipt.request_hash <> v_request_hash then
      return leader_private.leader_lead_workflow_error(v_request_id, 'conflict', 'Idempotency key was used with another payload');
    end if;
    if v_receipt.state = 'success' and v_receipt.response is not null then
      return v_receipt.response || jsonb_build_object('idempotent_replay', true);
    end if;
    return leader_private.leader_lead_workflow_error(v_request_id, 'duplicate_request', 'Request is already in progress');
  end if;

  if exists (
    select 1 from leader_private.leader_command_receipts
    where action = 'lead_workflow.update' and request_id = v_request_id
  ) then
    return leader_private.leader_lead_workflow_error(v_request_id, 'duplicate_request', 'request_id was already used');
  end if;

  select * into v_lead
  from public.leader_leads
  where id = v_lead_id
  for update;

  if not found then
    return leader_private.leader_lead_workflow_error(v_request_id, 'not_found', 'Lead not found');
  end if;
  if v_lead.updated_at is distinct from v_expected_updated_at then
    return leader_private.leader_lead_workflow_error(v_request_id, 'conflict', 'Lead changed since it was loaded');
  end if;

  v_old_status := v_lead.status;
  v_old_assigned_to := v_lead.assigned_to;
  v_old_next_contact_at := v_lead.next_contact_at;
  v_status := case when v_status_present then btrim(v_patch ->> 'status') else v_old_status end;
  if not v_assignment_present then v_assigned_to := v_old_assigned_to; end if;
  if not v_contact_present then v_next_contact_at := v_old_next_contact_at; end if;

  if v_assignment_present and v_old_assigned_to is not null and v_old_assigned_to <> v_actor_id then
    return leader_private.leader_lead_workflow_error(v_request_id, 'conflict', 'Lead is already assigned to another employee');
  end if;
  if leader_private.leader_lead_status_requires_assignee(v_status) and v_assigned_to is null then
    return leader_private.leader_lead_workflow_error(v_request_id, 'assignee_required', 'Working lead status requires assigned_to');
  end if;
  if leader_private.leader_lead_status_requires_future_contact(v_status)
     and (v_next_contact_at is null or v_next_contact_at <= v_now) then
    return leader_private.leader_lead_workflow_error(v_request_id, 'next_contact_required', 'Waiting status requires a future next_contact_at');
  end if;
  if v_status is not distinct from v_old_status
     and v_assigned_to is not distinct from v_old_assigned_to
     and v_next_contact_at is not distinct from v_old_next_contact_at then
    return leader_private.leader_lead_workflow_error(v_request_id, 'no_effect', 'Workflow patch does not change the lead');
  end if;

  insert into leader_private.leader_command_receipts(
    action,idempotency_key,request_id,request_hash,actor_id,state,created_at,updated_at
  ) values (
    'lead_workflow.update',v_idempotency_key,v_request_id,v_request_hash,v_actor_id,'in_progress',v_now,v_now
  ) returning * into v_receipt;

  update public.leader_leads
  set status = v_status,
      assigned_to = v_assigned_to,
      next_contact_at = v_next_contact_at,
      updated_at = v_now
  where id = v_lead_id
  returning * into v_lead;

  insert into public.leader_lead_events(
    lead_id,event_type,old_status,new_status,body,created_by,created_by_email,created_at
  ) values (
    v_lead_id,
    'workflow_update',
    v_old_status,
    v_status,
    case
      when v_old_assigned_to is distinct from v_assigned_to then 'Ответственный и рабочий маршрут заявки обновлены'
      when v_old_next_contact_at is distinct from v_next_contact_at then 'Следующий контакт и рабочий маршрут заявки обновлены'
      else 'Рабочий статус заявки обновлён'
    end,
    v_actor_id,
    nullif(v_actor_email,''),
    v_now
  ) returning * into v_event;

  v_response := jsonb_build_object(
    'ok', true,
    'request_id', v_request_id,
    'idempotent_replay', false,
    'lead', jsonb_build_object(
      'id', v_lead.id,
      'status', v_lead.status,
      'assigned_to', v_lead.assigned_to,
      'next_contact_at', v_lead.next_contact_at,
      'updated_at', v_lead.updated_at
    ),
    'event', jsonb_build_object(
      'id', v_event.id,
      'event_type', v_event.event_type,
      'old_status', v_event.old_status,
      'new_status', v_event.new_status,
      'created_at', v_event.created_at
    )
  );

  update leader_private.leader_command_receipts
  set state='success',response=v_response,updated_at=v_now,completed_at=v_now
  where id=v_receipt.id;

  return v_response;
exception when others then
  return leader_private.leader_lead_workflow_error(v_request_id, 'workflow_update_failed', 'Lead workflow update failed');
end
$function$;

revoke all on function leader_private.leader_lead_workflow_error(uuid,text,text) from public, anon, authenticated;
revoke all on function leader_private.leader_lead_status_requires_assignee(text) from public, anon, authenticated;
revoke all on function leader_private.leader_lead_status_requires_future_contact(text) from public, anon, authenticated;
revoke all on function public.leader_update_lead_workflow_rpc(jsonb) from public, anon, authenticated;
grant execute on function public.leader_update_lead_workflow_rpc(jsonb) to service_role;
