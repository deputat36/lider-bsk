-- STAGING ONLY.
-- Target: lider-bsk-staging / otulfnouybahfnsycxqn.
-- Atomic installation_job.create_from_order command. Never apply to production.

do $guard$
begin
  if not exists (
    select 1 from leader_staging.environment_guard
    where singleton = true
      and project_ref = 'otulfnouybahfnsycxqn'
      and environment_name = 'staging'
      and repository = 'deputat36/lider-bsk'
  ) then
    raise exception 'staging_environment_guard_failed';
  end if;

  if to_regclass('public.leader_installation_jobs') is null
     or to_regclass('public.leader_installation_events') is null
     or to_regclass('public.leader_production_jobs') is null
     or to_regclass('public.leader_orders') is null
     or to_regclass('public.leader_user_profiles') is null
     or to_regclass('leader_private.leader_command_receipts') is null
     or to_regprocedure('leader_private.leader_actor_has_crm_action(uuid,text)') is null
     or to_regprocedure('leader_private.leader_installation_command_error(uuid,text,text)') is null then
    raise exception 'staging_installation_create_dependencies_missing';
  end if;
end
$guard$;

create unique index if not exists leader_installation_jobs_one_active_per_order_uidx
  on public.leader_installation_jobs(order_id)
  where order_id is not null
    and install_status not in ('Выполнен','Завершён','Завершен','Не требуется','Отменён','Отменен');

grant select, insert on table public.leader_installation_jobs to service_role;
grant select, insert on table public.leader_installation_events to service_role;
grant select on table public.leader_production_jobs to service_role;
grant select, update on table public.leader_orders to service_role;
grant select on table public.leader_user_profiles to service_role;

create or replace function leader_private.leader_production_is_installation_ready(p_status text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $function$
  select lower(replace(btrim(coalesce(p_status, '')), 'ё', 'е'))
    in ('готово','выдано','ready','issued');
$function$;

revoke all on function leader_private.leader_production_is_installation_ready(text)
  from public, anon, authenticated;
grant execute on function leader_private.leader_production_is_installation_ready(text)
  to service_role;

create or replace function public.leader_create_installation_job_from_order_rpc(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_actor_id uuid;
  v_request jsonb;
  v_request_id uuid;
  v_expected_updated_at timestamptz;
  v_payload jsonb;
  v_job_input jsonb;
  v_order_id uuid;
  v_production_job_id uuid;
  v_idempotency_key text;
  v_request_hash text;
  v_receipt leader_private.leader_command_receipts%rowtype;
  v_order public.leader_orders%rowtype;
  v_production public.leader_production_jobs%rowtype;
  v_job public.leader_installation_jobs%rowtype;
  v_event public.leader_installation_events%rowtype;
  v_now timestamptz := clock_timestamp();
  v_title text;
  v_priority text;
  v_installer_name text;
  v_installer_phone text;
  v_address text;
  v_scheduled_at timestamptz;
  v_installer_cost numeric;
  v_client_price numeric;
  v_technical_task text;
  v_tools_required text;
  v_order_status_key text;
  v_order_installation_key text;
  v_response jsonb;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return leader_private.leader_installation_command_error(null, 'validation_error', 'RPC payload must be an object');
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_payload) as k(key)
    where key not in ('actor_id','actor_email','request')
  ) then
    return leader_private.leader_installation_command_error(null, 'validation_error', 'Unknown RPC payload field');
  end if;

  begin
    v_actor_id := nullif(btrim(coalesce(p_payload ->> 'actor_id', '')), '')::uuid;
  exception when others then
    return leader_private.leader_installation_command_error(null, 'validation_error', 'actor_id must be a UUID');
  end;
  if v_actor_id is null then
    return leader_private.leader_installation_command_error(null, 'validation_error', 'actor_id is required');
  end if;

  v_request := p_payload -> 'request';
  if v_request is null or jsonb_typeof(v_request) <> 'object' then
    return leader_private.leader_installation_command_error(null, 'validation_error', 'request must be an object');
  end if;
  if exists (
    select 1 from jsonb_object_keys(v_request) as k(key)
    where key not in ('action','request_id','expected_updated_at','payload')
  ) then
    return leader_private.leader_installation_command_error(null, 'validation_error', 'Unknown request field');
  end if;

  begin
    v_request_id := nullif(btrim(coalesce(v_request ->> 'request_id', '')), '')::uuid;
    v_expected_updated_at := nullif(btrim(coalesce(v_request ->> 'expected_updated_at', '')), '')::timestamptz;
  exception when others then
    return leader_private.leader_installation_command_error(null, 'validation_error', 'request_id or expected_updated_at is invalid');
  end;
  if v_request_id is null or v_expected_updated_at is null then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'request_id and expected_updated_at are required');
  end if;
  if btrim(coalesce(v_request ->> 'action', '')) <> 'installation_job.create_from_order' then
    return leader_private.leader_installation_command_error(v_request_id, 'unknown_action', 'Unsupported action');
  end if;

  if not leader_private.leader_actor_has_crm_action(v_actor_id, 'installation.write') then
    return leader_private.leader_installation_command_error(v_request_id, 'forbidden', 'installation.write permission is required');
  end if;

  v_payload := v_request -> 'payload';
  if v_payload is null or jsonb_typeof(v_payload) <> 'object' then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'payload must be an object');
  end if;
  if exists (
    select 1 from jsonb_object_keys(v_payload) as k(key)
    where key not in ('order_id','production_job_id','idempotency_key','job')
  ) then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'Unknown business payload field');
  end if;

  begin
    v_order_id := nullif(btrim(coalesce(v_payload ->> 'order_id', '')), '')::uuid;
    v_production_job_id := nullif(btrim(coalesce(v_payload ->> 'production_job_id', '')), '')::uuid;
  exception when others then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'order_id or production_job_id is invalid');
  end;
  v_idempotency_key := btrim(coalesce(v_payload ->> 'idempotency_key', ''));
  v_job_input := v_payload -> 'job';
  if v_order_id is null or v_production_job_id is null
     or char_length(v_idempotency_key) not between 1 and 180 then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'order_id, production_job_id and valid idempotency_key are required');
  end if;
  if v_job_input is null or jsonb_typeof(v_job_input) <> 'object' then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'job must be an object');
  end if;
  if exists (
    select 1 from jsonb_object_keys(v_job_input) as k(key)
    where key not in (
      'title','priority','installer_name','installer_phone','address','scheduled_at',
      'installer_cost','client_price','technical_task','tools_required'
    )
  ) then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'Job contains unknown or server-owned fields');
  end if;

  v_title := nullif(btrim(coalesce(v_job_input ->> 'title', '')), '');
  v_priority := nullif(btrim(coalesce(v_job_input ->> 'priority', '')), '');
  v_installer_name := nullif(btrim(coalesce(v_job_input ->> 'installer_name', '')), '');
  v_installer_phone := nullif(btrim(coalesce(v_job_input ->> 'installer_phone', '')), '');
  v_address := nullif(btrim(coalesce(v_job_input ->> 'address', '')), '');
  v_technical_task := nullif(btrim(coalesce(v_job_input ->> 'technical_task', '')), '');
  v_tools_required := nullif(btrim(coalesce(v_job_input ->> 'tools_required', '')), '');

  begin
    v_scheduled_at := nullif(btrim(coalesce(v_job_input ->> 'scheduled_at', '')), '')::timestamptz;
    v_installer_cost := nullif(btrim(coalesce(v_job_input ->> 'installer_cost', '')), '')::numeric;
    v_client_price := nullif(btrim(coalesce(v_job_input ->> 'client_price', '')), '')::numeric;
  exception when others then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'scheduled_at or installation prices are invalid');
  end;

  if v_title is null or char_length(v_title) > 500 then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'title must contain 1 to 500 characters');
  end if;
  if v_priority not in ('Обычный','Высокий','Срочно') then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'priority is invalid');
  end if;
  if v_installer_name is null or char_length(v_installer_name) > 300 then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'installer_name is required');
  end if;
  if v_address is null or char_length(v_address) > 1000 then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'address is required');
  end if;
  if v_scheduled_at is null then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'scheduled_at is required');
  end if;
  if v_installer_cost is not null and v_installer_cost < 0
     or v_client_price is not null and v_client_price < 0 then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'installation prices cannot be negative');
  end if;
  if char_length(coalesce(v_installer_phone, '')) > 100
     or char_length(coalesce(v_technical_task, '')) > 12000
     or char_length(coalesce(v_tools_required, '')) > 4000 then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'One or more text fields are too long');
  end if;

  v_request_hash := encode(
    extensions.digest(
      convert_to((jsonb_build_object(
        'actor_id', v_actor_id,
        'action', 'installation_job.create_from_order',
        'expected_updated_at', v_expected_updated_at,
        'payload', jsonb_build_object(
          'order_id', v_order_id,
          'production_job_id', v_production_job_id,
          'idempotency_key', v_idempotency_key,
          'job', jsonb_build_object(
            'title', v_title,
            'priority', v_priority,
            'installer_name', v_installer_name,
            'installer_phone', v_installer_phone,
            'address', v_address,
            'scheduled_at', v_scheduled_at,
            'installer_cost', v_installer_cost,
            'client_price', v_client_price,
            'technical_task', v_technical_task,
            'tools_required', v_tools_required
          )
        )
      ))::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  perform pg_advisory_xact_lock(hashtextextended('installation_job.create_from_order:key:' || v_idempotency_key, 0));
  perform pg_advisory_xact_lock(hashtextextended('installation_job.create_from_order:request:' || v_request_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('installation_job.create_from_order:order:' || v_order_id::text, 0));

  select * into v_receipt
  from leader_private.leader_command_receipts
  where action = 'installation_job.create_from_order'
    and idempotency_key = v_idempotency_key
  for update;

  if found then
    if v_receipt.request_hash <> v_request_hash then
      return leader_private.leader_installation_command_error(v_request_id, 'conflict', 'Idempotency key was used with another payload');
    end if;
    if v_receipt.state = 'success' and v_receipt.response is not null then
      return v_receipt.response || jsonb_build_object('idempotent_replay', true);
    end if;
    return leader_private.leader_installation_command_error(v_request_id, 'duplicate_request', 'Request is already in progress');
  end if;

  if exists (
    select 1 from leader_private.leader_command_receipts
    where action = 'installation_job.create_from_order'
      and request_id = v_request_id
      and idempotency_key <> v_idempotency_key
  ) then
    return leader_private.leader_installation_command_error(v_request_id, 'duplicate_request', 'request_id was already used');
  end if;

  select * into v_order
  from public.leader_orders
  where id = v_order_id
  for update;
  if not found then
    return leader_private.leader_installation_command_error(v_request_id, 'not_found', 'Order was not found');
  end if;
  if v_order.is_archived is true then
    return leader_private.leader_installation_command_error(v_request_id, 'conflict', 'Archived order cannot enter installation');
  end if;
  if v_order.updated_at is distinct from v_expected_updated_at then
    return leader_private.leader_installation_command_error(v_request_id, 'conflict', 'Order changed after it was loaded');
  end if;

  v_order_status_key := lower(replace(btrim(coalesce(v_order.status, '')), 'ё', 'е'));
  if v_order_status_key in ('закрыт','закрыто','отменен','отменено','отмена','cancelled','closed') then
    return leader_private.leader_installation_command_error(v_request_id, 'conflict', 'Closed or cancelled order cannot enter installation');
  end if;
  v_order_installation_key := lower(replace(btrim(coalesce(v_order.installation_status, '')), 'ё', 'е'));
  if v_order_installation_key like '%не требуется%' then
    return leader_private.leader_installation_command_error(v_request_id, 'conflict', 'Order does not require installation');
  end if;

  select * into v_production
  from public.leader_production_jobs
  where id = v_production_job_id
  for share;
  if not found or v_production.order_id is distinct from v_order.id then
    return leader_private.leader_installation_command_error(v_request_id, 'not_found', 'Production job was not found for this order');
  end if;
  if not leader_private.leader_production_is_installation_ready(v_production.production_status) then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'Production job is not ready for installation');
  end if;

  perform 1
  from public.leader_installation_jobs
  where order_id = v_order.id
    and install_status not in ('Выполнен','Завершён','Завершен','Не требуется','Отменён','Отменен')
  for update;
  if found then
    return leader_private.leader_installation_command_error(v_request_id, 'conflict', 'Active installation job already exists for this order');
  end if;

  insert into public.leader_installation_jobs (
    owner_id, order_id, production_job_id, title, install_status, priority,
    installer_name, installer_phone, address, scheduled_at, installer_cost,
    client_price, technical_task, tools_required, created_by, updated_by,
    created_at, updated_at
  ) values (
    v_actor_id, v_order.id, v_production.id, v_title, 'Запланирован', v_priority,
    v_installer_name, v_installer_phone, v_address, v_scheduled_at,
    coalesce(v_installer_cost, 0), coalesce(v_client_price, 0),
    v_technical_task, v_tools_required, v_actor_id, v_actor_id, v_now, v_now
  ) returning * into v_job;

  insert into public.leader_installation_events (
    job_id, order_id, event_type, old_status, new_status, body, created_by, created_at
  ) values (
    v_job.id, v_order.id, 'created', 'Не назначен', 'Запланирован',
    'Монтажное задание создано из готового производственного задания.',
    v_actor_id, v_now
  ) returning * into v_event;

  update public.leader_orders
  set installation_status = 'Запланирован',
      installation_address = v_address,
      installation_scheduled_at = v_scheduled_at,
      installer_name = v_installer_name,
      installer_phone = v_installer_phone,
      current_stage = 'Монтаж: Запланирован',
      next_action = 'Подготовить и выполнить монтаж',
      stage_updated_at = v_now,
      updated_at = v_now
  where id = v_order.id
  returning * into v_order;

  v_response := jsonb_build_object(
    'ok', true,
    'request_id', v_request_id,
    'entity', jsonb_build_object(
      'id', v_job.id,
      'order_id', v_job.order_id,
      'production_job_id', v_job.production_job_id,
      'title', v_job.title,
      'install_status', v_job.install_status,
      'priority', v_job.priority,
      'installer_name', v_job.installer_name,
      'installer_phone', v_job.installer_phone,
      'address', v_job.address,
      'scheduled_at', v_job.scheduled_at,
      'installer_cost', v_job.installer_cost,
      'client_price', v_job.client_price,
      'technical_task', v_job.technical_task,
      'tools_required', v_job.tools_required,
      'created_at', v_job.created_at,
      'updated_at', v_job.updated_at
    ),
    'order', jsonb_build_object(
      'id', v_order.id,
      'installation_status', v_order.installation_status,
      'installation_address', v_order.installation_address,
      'installation_scheduled_at', v_order.installation_scheduled_at,
      'installer_name', v_order.installer_name,
      'installer_phone', v_order.installer_phone,
      'current_stage', v_order.current_stage,
      'next_action', v_order.next_action,
      'updated_at', v_order.updated_at,
      'stage_updated_at', v_order.stage_updated_at
    ),
    'events', jsonb_build_array(jsonb_build_object(
      'id', v_event.id,
      'event_type', v_event.event_type,
      'old_status', v_event.old_status,
      'new_status', v_event.new_status,
      'created_at', v_event.created_at
    )),
    'idempotent_replay', false
  );

  insert into leader_private.leader_command_receipts (
    action, idempotency_key, request_id, request_hash, actor_id,
    state, response, created_at, updated_at, completed_at
  ) values (
    'installation_job.create_from_order', v_idempotency_key, v_request_id,
    v_request_hash, v_actor_id, 'success', v_response, v_now, v_now, v_now
  );

  return v_response;
exception
  when unique_violation then
    return leader_private.leader_installation_command_error(v_request_id, 'conflict', 'Active installation job or command receipt already exists');
  when others then
    return leader_private.leader_installation_command_error(
      v_request_id,
      'persistence_failed',
      'Installation job creation could not be persisted'
    );
end
$function$;

revoke all on function public.leader_create_installation_job_from_order_rpc(jsonb)
  from public, anon, authenticated;
grant execute on function public.leader_create_installation_job_from_order_rpc(jsonb)
  to service_role;

comment on function public.leader_create_installation_job_from_order_rpc(jsonb) is
  'STAGING ONLY atomic installation_job.create_from_order command for lider-bsk.';

do $verify$
begin
  if to_regprocedure('public.leader_create_installation_job_from_order_rpc(jsonb)') is null then
    raise exception 'staging_installation_create_rpc_missing';
  end if;
  if has_function_privilege('anon', 'public.leader_create_installation_job_from_order_rpc(jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.leader_create_installation_job_from_order_rpc(jsonb)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.leader_create_installation_job_from_order_rpc(jsonb)', 'EXECUTE') then
    raise exception 'staging_installation_create_rpc_grants_invalid';
  end if;
  if leader_private.leader_production_is_installation_ready('Готово') is not true
     or leader_private.leader_production_is_installation_ready('Выдано') is not true
     or leader_private.leader_production_is_installation_ready('В производстве') is not false then
    raise exception 'staging_production_installation_ready_gate_invalid';
  end if;
end
$verify$;
