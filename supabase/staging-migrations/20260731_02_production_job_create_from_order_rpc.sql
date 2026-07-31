-- STAGING ONLY.
-- Target: lider-bsk-staging / otulfnouybahfnsycxqn.
-- Atomic production_job.create_from_order command. Never apply to production.

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
     or to_regclass('public.leader_production_events') is null
     or to_regclass('public.leader_orders') is null
     or to_regclass('public.leader_design_tasks') is null
     or to_regclass('public.leader_user_profiles') is null
     or to_regclass('leader_private.leader_command_receipts') is null
     or to_regprocedure('leader_private.leader_actor_has_crm_action(uuid,text)') is null
     or to_regprocedure('leader_private.leader_production_command_error(uuid,text,text)') is null then
    raise exception 'staging_production_create_dependencies_missing';
  end if;
end
$guard$;

create unique index if not exists leader_production_jobs_one_active_per_order_uidx
  on public.leader_production_jobs(order_id)
  where order_id is not null
    and production_status not in ('Готово','Выдано','Не требуется','Отменено');

grant select, insert on table public.leader_production_jobs to service_role;
grant select, insert on table public.leader_production_events to service_role;
grant select, update on table public.leader_orders to service_role;
grant select, update on table public.leader_design_tasks to service_role;
grant select on table public.leader_user_profiles to service_role;

create or replace function public.leader_create_production_job_from_order_rpc(p_payload jsonb)
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
  v_payload jsonb;
  v_job_input jsonb;
  v_order_id uuid;
  v_design_task_id uuid;
  v_contractor_id uuid;
  v_idempotency_key text;
  v_request_hash text;
  v_receipt leader_private.leader_command_receipts%rowtype;
  v_order public.leader_orders%rowtype;
  v_design public.leader_design_tasks%rowtype;
  v_job public.leader_production_jobs%rowtype;
  v_event public.leader_production_events%rowtype;
  v_now timestamptz := clock_timestamp();
  v_title text;
  v_priority text;
  v_deadline timestamptz;
  v_layout_status text;
  v_file_url text;
  v_technical_task text;
  v_contractor_cost numeric;
  v_order_status_key text;
  v_order_layout_key text;
  v_design_layout_key text;
  v_response jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_exception_message text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return leader_private.leader_production_command_error(null, 'validation_error', 'RPC payload must be an object');
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_payload) as k(key)
    where key not in ('actor_id','actor_email','request')
  ) then
    return leader_private.leader_production_command_error(null, 'validation_error', 'Unknown RPC payload field');
  end if;

  begin
    v_actor_id := nullif(btrim(coalesce(p_payload ->> 'actor_id', '')), '')::uuid;
  exception when others then
    return leader_private.leader_production_command_error(null, 'validation_error', 'actor_id must be a UUID');
  end;
  if v_actor_id is null then
    return leader_private.leader_production_command_error(null, 'validation_error', 'actor_id is required');
  end if;
  v_actor_email := left(nullif(lower(btrim(coalesce(p_payload ->> 'actor_email', ''))), ''), 240);

  v_request := p_payload -> 'request';
  if v_request is null or jsonb_typeof(v_request) <> 'object' then
    return leader_private.leader_production_command_error(null, 'validation_error', 'request must be an object');
  end if;
  if exists (
    select 1 from jsonb_object_keys(v_request) as k(key)
    where key not in ('action','request_id','expected_updated_at','payload')
  ) then
    return leader_private.leader_production_command_error(null, 'validation_error', 'Unknown request field');
  end if;

  begin
    v_request_id := nullif(btrim(coalesce(v_request ->> 'request_id', '')), '')::uuid;
    v_expected_updated_at := nullif(btrim(coalesce(v_request ->> 'expected_updated_at', '')), '')::timestamptz;
  exception when others then
    return leader_private.leader_production_command_error(null, 'validation_error', 'request_id or expected_updated_at is invalid');
  end;
  if v_request_id is null or v_expected_updated_at is null then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'request_id and expected_updated_at are required');
  end if;
  if btrim(coalesce(v_request ->> 'action', '')) <> 'production_job.create_from_order' then
    return leader_private.leader_production_command_error(v_request_id, 'unknown_action', 'Unsupported action');
  end if;

  v_payload := v_request -> 'payload';
  if v_payload is null or jsonb_typeof(v_payload) <> 'object' then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'payload must be an object');
  end if;
  if exists (
    select 1 from jsonb_object_keys(v_payload) as k(key)
    where key not in ('order_id','design_task_id','idempotency_key','job')
  ) then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'Unknown business payload field');
  end if;

  begin
    v_order_id := nullif(btrim(coalesce(v_payload ->> 'order_id', '')), '')::uuid;
    v_design_task_id := nullif(btrim(coalesce(v_payload ->> 'design_task_id', '')), '')::uuid;
  exception when others then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'order_id or design_task_id is invalid');
  end;
  v_idempotency_key := btrim(coalesce(v_payload ->> 'idempotency_key', ''));
  v_job_input := v_payload -> 'job';
  if v_order_id is null or char_length(v_idempotency_key) not between 1 and 180 then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'order_id and valid idempotency_key are required');
  end if;
  if v_job_input is null or jsonb_typeof(v_job_input) <> 'object' then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'job must be an object');
  end if;
  if exists (
    select 1 from jsonb_object_keys(v_job_input) as k(key)
    where key not in (
      'title','priority','deadline','layout_status','file_url','technical_task',
      'contractor_id','contractor_cost'
    )
  ) then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'Job contains unknown or server-owned fields');
  end if;

  v_title := nullif(btrim(coalesce(v_job_input ->> 'title', '')), '');
  v_priority := nullif(btrim(coalesce(v_job_input ->> 'priority', '')), '');
  v_layout_status := nullif(btrim(coalesce(v_job_input ->> 'layout_status', '')), '');
  v_file_url := nullif(btrim(coalesce(v_job_input ->> 'file_url', '')), '');
  v_technical_task := nullif(btrim(coalesce(v_job_input ->> 'technical_task', '')), '');

  begin
    v_deadline := nullif(btrim(coalesce(v_job_input ->> 'deadline', '')), '')::timestamptz;
    v_contractor_id := nullif(btrim(coalesce(v_job_input ->> 'contractor_id', '')), '')::uuid;
    v_contractor_cost := nullif(btrim(coalesce(v_job_input ->> 'contractor_cost', '')), '')::numeric;
  exception when others then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'deadline, contractor_id or contractor_cost is invalid');
  end;

  if v_title is null or char_length(v_title) > 500 then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'title must contain 1 to 500 characters');
  end if;
  if v_priority not in ('Обычная','Высокая','Срочно') then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'priority is invalid');
  end if;
  if v_layout_status <> 'Макет согласован' then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'layout_status must confirm an approved layout');
  end if;
  if char_length(coalesce(v_file_url, '')) > 2000
     or char_length(coalesce(v_technical_task, '')) > 12000 then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'One or more text fields are too long');
  end if;
  if v_contractor_cost is not null and v_contractor_cost < 0 then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'contractor_cost cannot be negative');
  end if;

  v_request_hash := encode(
    extensions.digest(
      convert_to((jsonb_build_object(
        'actor_id', v_actor_id,
        'action', 'production_job.create_from_order',
        'expected_updated_at', v_expected_updated_at,
        'payload', jsonb_build_object(
          'order_id', v_order_id,
          'design_task_id', v_design_task_id,
          'idempotency_key', v_idempotency_key,
          'job', jsonb_build_object(
            'title', v_title,
            'priority', v_priority,
            'deadline', v_deadline,
            'layout_status', v_layout_status,
            'file_url', v_file_url,
            'technical_task', v_technical_task,
            'contractor_id', v_contractor_id,
            'contractor_cost', v_contractor_cost
          )
        )
      ))::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  perform pg_advisory_xact_lock(hashtextextended('production_job.create_from_order:key:' || v_idempotency_key, 0));
  perform pg_advisory_xact_lock(hashtextextended('production_job.create_from_order:request:' || v_request_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('production_job.create_from_order:order:' || v_order_id::text, 0));

  select * into v_receipt
  from leader_private.leader_command_receipts
  where action = 'production_job.create_from_order'
    and idempotency_key = v_idempotency_key
  for update;

  if found then
    if v_receipt.request_hash <> v_request_hash then
      return leader_private.leader_production_command_error(v_request_id, 'conflict', 'Idempotency key was used with another payload');
    end if;
    if v_receipt.state = 'success' and v_receipt.response is not null then
      return v_receipt.response || jsonb_build_object('idempotent_replay', true);
    end if;
    return leader_private.leader_production_command_error(v_request_id, 'duplicate_request', 'Request is already in progress');
  end if;

  if exists (
    select 1
    from leader_private.leader_command_receipts
    where action = 'production_job.create_from_order'
      and request_id = v_request_id
      and idempotency_key <> v_idempotency_key
  ) then
    return leader_private.leader_production_command_error(v_request_id, 'duplicate_request', 'request_id was already used');
  end if;

  if not leader_private.leader_actor_has_crm_action(v_actor_id, 'production.write') then
    return leader_private.leader_production_command_error(v_request_id, 'forbidden', 'production.write permission is required');
  end if;

  select * into v_order
  from public.leader_orders
  where id = v_order_id
  for update;
  if not found then
    return leader_private.leader_production_command_error(v_request_id, 'not_found', 'Order was not found');
  end if;
  if v_order.is_archived is true then
    return leader_private.leader_production_command_error(v_request_id, 'conflict', 'Archived order cannot enter production');
  end if;
  if v_order.updated_at is distinct from v_expected_updated_at then
    return leader_private.leader_production_command_error(v_request_id, 'conflict', 'Order changed after it was loaded');
  end if;

  v_order_status_key := lower(replace(btrim(coalesce(v_order.status, '')), 'ё', 'е'));
  if v_order_status_key in ('закрыт','закрыто','отменен','отменено','отмена','cancelled','closed') then
    return leader_private.leader_production_command_error(v_request_id, 'conflict', 'Closed or cancelled order cannot enter production');
  end if;

  v_order_layout_key := lower(replace(btrim(coalesce(v_order.layout_status, '')), 'ё', 'е'));
  if not (
    v_order_layout_key like '%согласован%'
    or v_order_layout_key like '%утвержден%'
    or v_order_layout_key = 'готов'
    or v_order_layout_key like '%готовый макет%'
    or v_order_layout_key like '%не требуется%'
  ) then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'Order layout is not approved');
  end if;

  if v_design_task_id is not null then
    select * into v_design
    from public.leader_design_tasks
    where id = v_design_task_id
    for update;
    if not found or v_design.order_id is distinct from v_order.id then
      return leader_private.leader_production_command_error(v_request_id, 'not_found', 'Design task was not found for this order');
    end if;
    if v_design.production_job_id is not null then
      return leader_private.leader_production_command_error(v_request_id, 'conflict', 'Design task is already linked to production');
    end if;
    v_design_layout_key := lower(replace(btrim(coalesce(v_design.layout_status, '')), 'ё', 'е'));
    if v_design.approved_at is null
       and not (
         v_design_layout_key like '%согласован%'
         or v_design_layout_key like '%утвержден%'
         or v_design_layout_key = 'готов'
         or v_design_layout_key like '%готовый макет%'
       ) then
      return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'Design task does not prove layout approval');
    end if;
    v_file_url := coalesce(v_file_url, nullif(btrim(coalesce(v_design.layout_link, '')), ''));
  end if;

  v_file_url := coalesce(v_file_url, nullif(btrim(coalesce(v_order.layout_link, '')), ''));
  if v_file_url is null then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('code','layout_file_missing'));
  end if;
  if v_deadline is null and v_order.deadline is not null then
    v_deadline := v_order.deadline::timestamptz;
  end if;
  if v_deadline is null then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('code','production_deadline_missing'));
  end if;
  v_contractor_cost := coalesce(v_contractor_cost, v_order.contractor_cost, 0);

  perform 1
  from public.leader_production_jobs
  where order_id = v_order.id
    and production_status not in ('Готово','Выдано','Не требуется','Отменено')
  for update;
  if found then
    return leader_private.leader_production_command_error(v_request_id, 'conflict', 'Active production job already exists for this order');
  end if;

  insert into public.leader_production_jobs (
    owner_id, order_id, title, production_status, created_by, contractor_id,
    layout_status, priority, deadline, sent_to_contractor_at, contractor_cost,
    client_total, file_url, technical_task, created_at, updated_at
  ) values (
    v_actor_id, v_order.id, v_title, 'В очереди', v_actor_id, v_contractor_id,
    'Макет согласован', v_priority, v_deadline, v_now, v_contractor_cost,
    v_order.client_total, v_file_url, v_technical_task, v_now, v_now
  ) returning * into v_job;

  insert into public.leader_production_events (
    owner_id, job_id, order_id, event_type, old_status, new_status, body,
    created_by, created_by_email, created_at
  ) values (
    v_actor_id, v_job.id, v_order.id, 'Создание задания', 'Не передано', 'В очереди',
    'Производственное задание создано из согласованного заказа.',
    v_actor_id, v_actor_email, v_now
  ) returning * into v_event;

  update public.leader_orders
  set production_status = 'В очереди',
      layout_status = case
        when lower(replace(btrim(coalesce(layout_status, '')), 'ё', 'е')) like '%не требуется%'
          then layout_status
        else 'Макет согласован'
      end,
      layout_link = coalesce(v_file_url, layout_link),
      current_stage = 'Производство: В очереди',
      next_action = 'Контролировать производство',
      stage_updated_at = v_now,
      updated_at = v_now
  where id = v_order.id
  returning * into v_order;

  if v_design_task_id is not null then
    update public.leader_design_tasks
    set production_job_id = v_job.id,
        updated_by = v_actor_id,
        updated_at = v_now
    where id = v_design_task_id
    returning * into v_design;
  end if;

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
      'contractor_id', v_job.contractor_id,
      'contractor_cost', v_job.contractor_cost,
      'client_total', v_job.client_total,
      'file_url', v_job.file_url,
      'technical_task', v_job.technical_task,
      'sent_to_contractor_at', v_job.sent_to_contractor_at,
      'created_at', v_job.created_at,
      'updated_at', v_job.updated_at
    ),
    'order', jsonb_build_object(
      'id', v_order.id,
      'production_status', v_order.production_status,
      'layout_status', v_order.layout_status,
      'layout_link', v_order.layout_link,
      'current_stage', v_order.current_stage,
      'next_action', v_order.next_action,
      'updated_at', v_order.updated_at,
      'stage_updated_at', v_order.stage_updated_at
    ),
    'design_task', case when v_design_task_id is null then null else jsonb_build_object(
      'id', v_design.id,
      'production_job_id', v_design.production_job_id,
      'updated_at', v_design.updated_at
    ) end,
    'events', jsonb_build_array(jsonb_build_object(
      'id', v_event.id,
      'event_type', v_event.event_type,
      'old_status', v_event.old_status,
      'new_status', v_event.new_status,
      'created_at', v_event.created_at
    )),
    'warnings', v_warnings,
    'idempotent_replay', false
  );

  insert into leader_private.leader_command_receipts (
    action, idempotency_key, request_id, request_hash, actor_id,
    state, response, created_at, updated_at, completed_at
  ) values (
    'production_job.create_from_order', v_idempotency_key, v_request_id,
    v_request_hash, v_actor_id, 'success', v_response, v_now, v_now, v_now
  );

  return v_response;
exception
  when unique_violation then
    return leader_private.leader_production_command_error(v_request_id, 'conflict', 'Active production job or command receipt already exists');
  when others then
    get stacked diagnostics v_exception_message = message_text;
    return leader_private.leader_production_command_error(
      v_request_id,
      'persistence_failed',
      'Production job creation could not be persisted'
    );
end
$function$;

revoke all on function public.leader_create_production_job_from_order_rpc(jsonb)
  from public, anon, authenticated;
grant execute on function public.leader_create_production_job_from_order_rpc(jsonb)
  to service_role;

comment on function public.leader_create_production_job_from_order_rpc(jsonb) is
  'STAGING ONLY atomic production_job.create_from_order command for lider-bsk.';

do $verify$
begin
  if to_regprocedure('public.leader_create_production_job_from_order_rpc(jsonb)') is null then
    raise exception 'staging_production_create_rpc_missing';
  end if;
  if has_function_privilege('anon', 'public.leader_create_production_job_from_order_rpc(jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.leader_create_production_job_from_order_rpc(jsonb)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.leader_create_production_job_from_order_rpc(jsonb)', 'EXECUTE') then
    raise exception 'staging_production_create_rpc_grants_invalid';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'leader_production_jobs_one_active_per_order_uidx'
  ) then
    raise exception 'staging_production_active_job_index_missing';
  end if;
end
$verify$;
