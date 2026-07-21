-- STAGING ONLY.
-- Target project: lider-bsk-staging / otulfnouybahfnsycxqn.
-- Atomic production_job.update command. Never apply this migration to production.

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

  if to_regclass('public.leader_production_jobs') is null
     or to_regclass('public.leader_orders') is null
     or to_regclass('public.leader_user_profiles') is null
     or to_regclass('leader_private.leader_command_receipts') is null
     or to_regprocedure('leader_private.leader_actor_has_crm_action(uuid,text)') is null then
    raise exception 'staging_production_job_dependencies_missing';
  end if;
end
$guard$;

alter table public.leader_production_jobs
  add column if not exists contractor_id uuid,
  add column if not exists layout_status text not null default 'Макет не проверен',
  add column if not exists priority text not null default 'Обычная',
  add column if not exists deadline timestamptz,
  add column if not exists sent_to_contractor_at timestamptz,
  add column if not exists ready_at timestamptz,
  add column if not exists issued_at timestamptz,
  add column if not exists contractor_cost numeric not null default 0,
  add column if not exists client_total numeric not null default 0,
  add column if not exists file_url text,
  add column if not exists technical_task text,
  add column if not exists contractor_comment text,
  add column if not exists internal_comment text;

alter table public.leader_orders
  add column if not exists stage_updated_at timestamptz;

create table if not exists public.leader_production_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  job_id uuid,
  order_id uuid,
  event_type text not null default 'Заметка',
  old_status text,
  new_status text,
  body text,
  created_by uuid,
  created_by_email text,
  created_at timestamptz not null default now(),
  constraint leader_production_events_job_id_fkey
    foreign key (job_id) references public.leader_production_jobs(id) on delete cascade,
  constraint leader_production_events_order_id_fkey
    foreign key (order_id) references public.leader_orders(id) on delete cascade
);

create index if not exists leader_production_jobs_order_id_idx
  on public.leader_production_jobs(order_id);
create index if not exists leader_production_events_job_id_created_idx
  on public.leader_production_events(job_id, created_at desc);
create index if not exists leader_production_events_order_id_idx
  on public.leader_production_events(order_id);

alter table public.leader_production_events enable row level security;
revoke all on table public.leader_production_events from public, anon, authenticated;
grant select, insert on table public.leader_production_events to service_role;

grant select, update on table public.leader_production_jobs to service_role;
grant select, update on table public.leader_orders to service_role;

create or replace function leader_private.leader_production_status_key(p_status text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $function$
  select case btrim(coalesce(p_status, ''))
    when 'Не передано' then 'not_sent'
    when 'В очереди' then 'queued'
    when 'Передано в производство' then 'queued'
    when 'В производстве' then 'in_production'
    when 'В работе' then 'in_production'
    when 'Приостановлено' then 'stopped'
    when 'Проблема' then 'stopped'
    when 'Готово' then 'ready'
    when 'Выдано' then 'issued'
    when 'Не требуется' then 'not_required'
    when 'Отменено' then 'cancelled'
    else null
  end;
$function$;

create or replace function leader_private.leader_production_status_label(p_key text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $function$
  select case p_key
    when 'not_sent' then 'Не передано'
    when 'queued' then 'В очереди'
    when 'in_production' then 'В производстве'
    when 'stopped' then 'Приостановлено'
    when 'ready' then 'Готово'
    when 'issued' then 'Выдано'
    when 'not_required' then 'Не требуется'
    when 'cancelled' then 'Отменено'
    else null
  end;
$function$;

create or replace function leader_private.leader_production_transition_allowed(
  p_from_key text,
  p_to_key text
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $function$
  select case p_from_key
    when 'not_sent' then p_to_key = any(array['queued','in_production','not_required'])
    when 'queued' then p_to_key = any(array['in_production','cancelled'])
    when 'in_production' then p_to_key = any(array['ready','stopped','cancelled'])
    when 'stopped' then p_to_key = any(array['queued','in_production','cancelled'])
    when 'ready' then p_to_key = 'issued'
    else false
  end;
$function$;

revoke all on function leader_private.leader_production_status_key(text) from public, anon, authenticated;
revoke all on function leader_private.leader_production_status_label(text) from public, anon, authenticated;
revoke all on function leader_private.leader_production_transition_allowed(text, text) from public, anon, authenticated;
grant execute on function leader_private.leader_production_status_key(text) to service_role;
grant execute on function leader_private.leader_production_status_label(text) to service_role;
grant execute on function leader_private.leader_production_transition_allowed(text, text) to service_role;

create or replace function public.leader_update_production_job_rpc(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_actor_id uuid;
  v_actor_email text;
  v_request jsonb;
  v_action text;
  v_request_id uuid;
  v_expected_updated_at timestamptz;
  v_payload jsonb;
  v_patch jsonb;
  v_job_id uuid;
  v_idempotency_key text;
  v_request_hash text;
  v_receipt leader_private.leader_command_receipts%rowtype;
  v_job public.leader_production_jobs%rowtype;
  v_order public.leader_orders%rowtype;
  v_event public.leader_production_events%rowtype;
  v_now timestamptz := clock_timestamp();
  v_title text;
  v_status text;
  v_target_status text;
  v_old_key text;
  v_new_key text;
  v_layout_status text;
  v_priority text;
  v_deadline timestamptz;
  v_file_url text;
  v_technical_task text;
  v_contractor_comment text;
  v_internal_comment text;
  v_sent_to_contractor_at timestamptz;
  v_ready_at timestamptz;
  v_issued_at timestamptz;
  v_response jsonb;
  v_exception_message text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return jsonb_build_object('ok', false, 'request_id', null,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'RPC payload must be an object'));
  end if;

  if exists (
    select 1 from jsonb_object_keys(p_payload) as k(key)
    where key not in ('actor_id','actor_email','request')
  ) then
    return jsonb_build_object('ok', false, 'request_id', null,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'Unknown RPC payload field'));
  end if;

  begin
    v_actor_id := nullif(btrim(coalesce(p_payload ->> 'actor_id', '')), '')::uuid;
  exception when others then
    return jsonb_build_object('ok', false, 'request_id', null,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'actor_id must be a UUID'));
  end;
  if v_actor_id is null then
    return jsonb_build_object('ok', false, 'request_id', null,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'actor_id is required'));
  end if;
  v_actor_email := left(nullif(lower(btrim(coalesce(p_payload ->> 'actor_email', ''))), ''), 240);

  v_request := p_payload -> 'request';
  if v_request is null or jsonb_typeof(v_request) <> 'object' then
    return jsonb_build_object('ok', false, 'request_id', null,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'request must be an object'));
  end if;
  if exists (
    select 1 from jsonb_object_keys(v_request) as k(key)
    where key not in ('action','request_id','expected_updated_at','payload')
  ) then
    return jsonb_build_object('ok', false, 'request_id', null,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'Unknown request field'));
  end if;

  v_action := btrim(coalesce(v_request ->> 'action', ''));
  if v_action <> 'production_job.update' then
    return jsonb_build_object('ok', false, 'request_id', v_request ->> 'request_id',
      'error', jsonb_build_object('code', 'unknown_action', 'message', 'Unsupported action'));
  end if;

  begin
    v_request_id := nullif(btrim(coalesce(v_request ->> 'request_id', '')), '')::uuid;
    v_expected_updated_at := nullif(btrim(coalesce(v_request ->> 'expected_updated_at', '')), '')::timestamptz;
  exception when others then
    return jsonb_build_object('ok', false, 'request_id', v_request ->> 'request_id',
      'error', jsonb_build_object('code', 'validation_error', 'message', 'request_id or expected_updated_at is invalid'));
  end;
  if v_request_id is null or v_expected_updated_at is null then
    return jsonb_build_object('ok', false, 'request_id', v_request ->> 'request_id',
      'error', jsonb_build_object('code', 'validation_error', 'message', 'request_id and expected_updated_at are required'));
  end if;

  v_payload := v_request -> 'payload';
  if v_payload is null or jsonb_typeof(v_payload) <> 'object' then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'payload must be an object'));
  end if;
  if exists (
    select 1 from jsonb_object_keys(v_payload) as k(key)
    where key not in ('job_id','idempotency_key','patch')
  ) then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'Unknown business payload field'));
  end if;

  begin
    v_job_id := nullif(btrim(coalesce(v_payload ->> 'job_id', '')), '')::uuid;
  exception when others then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'job_id must be a UUID'));
  end;
  v_idempotency_key := btrim(coalesce(v_payload ->> 'idempotency_key', ''));
  v_patch := v_payload -> 'patch';
  if v_job_id is null or char_length(v_idempotency_key) not between 1 and 160 then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'job_id and valid idempotency_key are required'));
  end if;
  if v_patch is null or jsonb_typeof(v_patch) <> 'object' or v_patch = '{}'::jsonb then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'patch must be a non-empty object'));
  end if;
  if exists (
    select 1 from jsonb_object_keys(v_patch) as k(key)
    where key not in (
      'title','production_status','layout_status','priority','deadline','file_url',
      'technical_task','contractor_comment','internal_comment'
    )
  ) then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'Patch contains unknown or server-owned fields'));
  end if;

  v_request_hash := encode(
    extensions.digest(
      convert_to((jsonb_build_object(
        'action', v_action,
        'expected_updated_at', v_expected_updated_at,
        'payload', v_payload
      ))::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  perform pg_advisory_xact_lock(hashtextextended(v_action || ':key:' || v_idempotency_key, 0));
  perform pg_advisory_xact_lock(hashtextextended(v_action || ':request:' || v_request_id::text, 0));

  select * into v_receipt
  from leader_private.leader_command_receipts
  where action = v_action and idempotency_key = v_idempotency_key
  for update;

  if found then
    if v_receipt.request_hash <> v_request_hash then
      return jsonb_build_object('ok', false, 'request_id', v_request_id,
        'error', jsonb_build_object('code', 'conflict', 'message', 'Idempotency key was used with another payload'));
    end if;
    if v_receipt.state = 'success' and v_receipt.response is not null then
      return v_receipt.response || jsonb_build_object('idempotent_replay', true);
    end if;
  end if;

  if exists (
    select 1 from leader_private.leader_command_receipts
    where action = v_action and request_id = v_request_id
      and idempotency_key <> v_idempotency_key
  ) then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'duplicate_request', 'message', 'request_id was already used'));
  end if;

  if not leader_private.leader_actor_has_crm_action(v_actor_id, 'production.write') then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'forbidden', 'message', 'production.write permission is required'));
  end if;

  select * into v_job
  from public.leader_production_jobs
  where id = v_job_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'not_found', 'message', 'Production job was not found'));
  end if;

  if v_job.updated_at <> v_expected_updated_at then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'conflict', 'message', 'Production job changed after it was loaded'));
  end if;

  if v_job.order_id is not null then
    select * into v_order
    from public.leader_orders
    where id = v_job.order_id
    for update;
    if not found then
      return jsonb_build_object('ok', false, 'request_id', v_request_id,
        'error', jsonb_build_object('code', 'not_found', 'message', 'Linked order was not found'));
    end if;
  end if;

  v_title := case when v_patch ? 'title'
    then nullif(btrim(coalesce(v_patch ->> 'title', '')), '') else v_job.title end;
  if v_title is null or char_length(v_title) > 500 then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'title must contain 1 to 500 characters'));
  end if;

  v_layout_status := case when v_patch ? 'layout_status'
    then nullif(btrim(coalesce(v_patch ->> 'layout_status', '')), '') else v_job.layout_status end;
  if v_layout_status is null or v_layout_status not in ('Макет не проверен','На согласовании','Макет согласован','Нужны правки') then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'layout_status is invalid'));
  end if;

  v_priority := case when v_patch ? 'priority'
    then nullif(btrim(coalesce(v_patch ->> 'priority', '')), '') else v_job.priority end;
  if v_priority is null or v_priority not in ('Обычная','Высокая','Срочно') then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'priority is invalid'));
  end if;

  begin
    v_deadline := case when v_patch ? 'deadline'
      then nullif(btrim(coalesce(v_patch ->> 'deadline', '')), '')::timestamptz else v_job.deadline end;
  exception when others then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'deadline must be an ISO datetime or null'));
  end;

  v_file_url := case when v_patch ? 'file_url'
    then nullif(btrim(coalesce(v_patch ->> 'file_url', '')), '') else v_job.file_url end;
  v_technical_task := case when v_patch ? 'technical_task'
    then nullif(btrim(coalesce(v_patch ->> 'technical_task', '')), '') else v_job.technical_task end;
  v_contractor_comment := case when v_patch ? 'contractor_comment'
    then nullif(btrim(coalesce(v_patch ->> 'contractor_comment', '')), '') else v_job.contractor_comment end;
  v_internal_comment := case when v_patch ? 'internal_comment'
    then nullif(btrim(coalesce(v_patch ->> 'internal_comment', '')), '') else v_job.internal_comment end;

  if char_length(coalesce(v_file_url, '')) > 2000
     or char_length(coalesce(v_technical_task, '')) > 12000
     or char_length(coalesce(v_contractor_comment, '')) > 8000
     or char_length(coalesce(v_internal_comment, '')) > 8000 then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'One or more text fields are too long'));
  end if;

  v_target_status := case when v_patch ? 'production_status'
    then nullif(btrim(coalesce(v_patch ->> 'production_status', '')), '') else v_job.production_status end;
  if v_target_status is null then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'production_status is required'));
  end if;

  v_old_key := leader_private.leader_production_status_key(v_job.production_status);
  v_new_key := leader_private.leader_production_status_key(v_target_status);
  v_status := v_job.production_status;

  if v_patch ? 'production_status' then
    if v_old_key is null then
      if v_target_status <> v_job.production_status then
        return jsonb_build_object('ok', false, 'request_id', v_request_id,
          'error', jsonb_build_object('code', 'invalid_transition', 'message', 'Unknown current production status cannot be changed'));
      end if;
    elsif v_new_key is null then
      return jsonb_build_object('ok', false, 'request_id', v_request_id,
        'error', jsonb_build_object('code', 'invalid_transition', 'message', 'Unknown target production status'));
    elsif v_old_key = v_new_key then
      v_status := v_job.production_status;
    elsif not leader_private.leader_production_transition_allowed(v_old_key, v_new_key) then
      return jsonb_build_object('ok', false, 'request_id', v_request_id,
        'error', jsonb_build_object('code', 'invalid_transition', 'message', 'Production status transition is not allowed'));
    else
      v_status := leader_private.leader_production_status_label(v_new_key);
    end if;
  end if;

  v_sent_to_contractor_at := v_job.sent_to_contractor_at;
  v_ready_at := v_job.ready_at;
  v_issued_at := v_job.issued_at;
  if v_old_key is distinct from v_new_key then
    if v_new_key in ('queued','in_production') then
      v_sent_to_contractor_at := coalesce(v_sent_to_contractor_at, v_now);
    elsif v_new_key = 'ready' then
      v_ready_at := coalesce(v_ready_at, v_now);
    elsif v_new_key = 'issued' then
      v_issued_at := coalesce(v_issued_at, v_now);
    end if;
  end if;

  update public.leader_production_jobs
  set title = v_title,
      production_status = v_status,
      layout_status = v_layout_status,
      priority = v_priority,
      deadline = v_deadline,
      file_url = v_file_url,
      technical_task = v_technical_task,
      contractor_comment = v_contractor_comment,
      internal_comment = v_internal_comment,
      sent_to_contractor_at = v_sent_to_contractor_at,
      ready_at = v_ready_at,
      issued_at = v_issued_at,
      updated_at = v_now
  where id = v_job_id
  returning * into v_job;

  if v_job.order_id is not null then
    update public.leader_orders
    set production_status = v_status,
        layout_status = v_layout_status,
        layout_link = v_file_url,
        current_stage = 'Производство: ' || v_status,
        updated_at = v_now,
        stage_updated_at = v_now
    where id = v_job.order_id
    returning * into v_order;
  end if;

  insert into public.leader_production_events (
    owner_id, job_id, order_id, event_type, old_status, new_status, body,
    created_by, created_by_email, created_at
  ) values (
    v_actor_id, v_job.id, v_job.order_id, 'Обновление задания',
    v_old_key is null and v_job.production_status or null,
    v_status,
    'Производственное задание обновлено атомарной командой CRM v4',
    v_actor_id, v_actor_email, v_now
  )
  returning * into v_event;

  -- Correct old_status after the job row has been updated.
  update public.leader_production_events
  set old_status = case
    when v_patch ? 'production_status' then coalesce(
      (select old_status from public.leader_production_events where id = v_event.id),
      null
    )
    else v_status
  end
  where id = v_event.id
  returning * into v_event;

  -- Build a privacy-safe response. Costs, internal notes and actor email are omitted.
  v_response := jsonb_build_object(
    'ok', true,
    'request_id', v_request_id,
    'entity', jsonb_build_object(
      'id', v_job.id,
      'order_id', v_job.order_id,
      'title', v_job.title,
      'production_status', v_job.production_status,
      'layout_status', v_job.layout_status,
      'priority', v_job.priority,
      'deadline', v_job.deadline,
      'sent_to_contractor_at', v_job.sent_to_contractor_at,
      'ready_at', v_job.ready_at,
      'issued_at', v_job.issued_at,
      'file_url', v_job.file_url,
      'technical_task', v_job.technical_task,
      'contractor_comment', v_job.contractor_comment,
      'updated_at', v_job.updated_at
    ),
    'order', case when v_job.order_id is null then null else jsonb_build_object(
      'id', v_order.id,
      'production_status', v_order.production_status,
      'layout_status', v_order.layout_status,
      'layout_link', v_order.layout_link,
      'current_stage', v_order.current_stage,
      'updated_at', v_order.updated_at,
      'stage_updated_at', v_order.stage_updated_at
    ) end,
    'events', jsonb_build_array(jsonb_build_object(
      'id', v_event.id,
      'event_type', v_event.event_type,
      'old_status', v_event.old_status,
      'new_status', v_event.new_status,
      'body', v_event.body,
      'created_at', v_event.created_at
    )),
    'idempotent_replay', false
  );

  insert into leader_private.leader_command_receipts (
    action, idempotency_key, request_id, request_hash, actor_id,
    state, response, created_at, updated_at, completed_at
  ) values (
    v_action, v_idempotency_key, v_request_id, v_request_hash, v_actor_id,
    'success', v_response, v_now, v_now, v_now
  );

  return v_response;
exception when others then
  get stacked diagnostics v_exception_message = message_text;
  return jsonb_build_object(
    'ok', false,
    'request_id', coalesce(v_request_id::text, null),
    'error', jsonb_build_object(
      'code', 'persistence_failed',
      'message', 'Production job update could not be persisted'
    )
  );
end
$function$;

comment on function public.leader_update_production_job_rpc(jsonb) is
  'Staging-only atomic production_job.update command. Canonical production.write, optimistic concurrency, idempotency and safe response.';

revoke all on function public.leader_update_production_job_rpc(jsonb) from public, anon, authenticated;
grant execute on function public.leader_update_production_job_rpc(jsonb) to service_role;
