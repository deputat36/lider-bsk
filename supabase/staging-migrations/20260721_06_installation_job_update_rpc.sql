-- STAGING ONLY.
-- Reproducible source for the deployment recorded as
-- 20260721191810 / staging_installation_job_update_rpc_20260721.

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

  if to_regclass('leader_private.leader_command_receipts') is null
     or to_regclass('public.leader_user_profiles') is null
     or to_regclass('public.leader_orders') is null
     or to_regclass('public.leader_installation_jobs') is null
     or to_regclass('public.leader_installation_events') is null then
    raise exception 'installation_job_update_requires_staging_installation_schema';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leader_orders'
      and column_name = 'installation_completed_at'
  ) then
    raise exception 'installation_completed_at_missing';
  end if;
end
$guard$;

create or replace function leader_private.leader_installation_command_error(
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

create or replace function leader_private.leader_installation_status_key(p_status text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $function$
  select case btrim(coalesce(p_status, ''))
    when '' then 'unassigned'
    when 'Не назначен' then 'unassigned'
    when 'Нужно назначить' then 'unassigned'
    when 'Запланирован' then 'scheduled'
    when 'Перенесён' then 'postponed'
    when 'Перенесен' then 'postponed'
    when 'Проблема' then 'postponed'
    when 'В работе' then 'in_progress'
    when 'Выполнен' then 'completed'
    when 'Завершён' then 'completed'
    when 'Завершен' then 'completed'
    when 'Не требуется' then 'not_required'
    when 'Отменён' then 'cancelled'
    when 'Отменен' then 'cancelled'
    else null
  end;
$function$;

create or replace function leader_private.leader_installation_status_label(p_key text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $function$
  select case p_key
    when 'unassigned' then 'Не назначен'
    when 'scheduled' then 'Запланирован'
    when 'postponed' then 'Перенесён'
    when 'in_progress' then 'В работе'
    when 'completed' then 'Выполнен'
    when 'not_required' then 'Не требуется'
    when 'cancelled' then 'Отменён'
    else null
  end;
$function$;

create or replace function leader_private.leader_installation_transition_allowed(
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
    when 'unassigned' then p_to_key = any(array['scheduled','not_required','cancelled'])
    when 'scheduled' then p_to_key = any(array['in_progress','postponed','cancelled'])
    when 'postponed' then p_to_key = any(array['scheduled','in_progress','cancelled'])
    when 'in_progress' then p_to_key = any(array['completed','postponed','cancelled'])
    else false
  end;
$function$;

create or replace function public.leader_update_installation_job_rpc(p_payload jsonb)
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
  v_patch jsonb;
  v_job_id uuid;
  v_idempotency_key text;
  v_request_hash text;
  v_receipt leader_private.leader_command_receipts%rowtype;
  v_job public.leader_installation_jobs%rowtype;
  v_order public.leader_orders%rowtype;
  v_event public.leader_installation_events%rowtype;
  v_now timestamptz := clock_timestamp();
  v_old_status text;
  v_old_key text;
  v_new_key text;
  v_status text;
  v_title text;
  v_installer_name text;
  v_installer_phone text;
  v_address text;
  v_scheduled_at timestamptz;
  v_before_photo_url text;
  v_after_photo_url text;
  v_technical_task text;
  v_tools_required text;
  v_installer_comment text;
  v_started_at timestamptz;
  v_completed_at timestamptz;
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
  if btrim(coalesce(v_request ->> 'action', '')) <> 'installation_job.update' then
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
    where key not in ('job_id','idempotency_key','patch')
  ) then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'Unknown business payload field');
  end if;

  begin
    v_job_id := nullif(btrim(coalesce(v_payload ->> 'job_id', '')), '')::uuid;
  exception when others then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'job_id must be a UUID');
  end;
  v_idempotency_key := btrim(coalesce(v_payload ->> 'idempotency_key', ''));
  v_patch := v_payload -> 'patch';
  if v_job_id is null or char_length(v_idempotency_key) not between 1 and 160 then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'job_id and valid idempotency_key are required');
  end if;
  if v_patch is null or jsonb_typeof(v_patch) <> 'object' or v_patch = '{}'::jsonb then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'patch must be a non-empty object');
  end if;
  if exists (
    select 1 from jsonb_object_keys(v_patch) as k(key)
    where key not in (
      'title','install_status','installer_name','installer_phone','address','scheduled_at',
      'before_photo_url','after_photo_url','technical_task','tools_required','installer_comment'
    )
  ) then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'Patch contains unknown or server-owned fields');
  end if;

  v_request_hash := encode(
    extensions.digest(
      convert_to((jsonb_build_object(
        'actor_id', v_actor_id,
        'action', 'installation_job.update',
        'expected_updated_at', v_expected_updated_at,
        'payload', v_payload
      ))::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  perform pg_advisory_xact_lock(hashtextextended('installation_job.update:key:' || v_idempotency_key, 0));
  perform pg_advisory_xact_lock(hashtextextended('installation_job.update:request:' || v_request_id::text, 0));

  select * into v_receipt
  from leader_private.leader_command_receipts
  where action = 'installation_job.update'
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
    where action = 'installation_job.update'
      and request_id = v_request_id
  ) then
    return leader_private.leader_installation_command_error(v_request_id, 'duplicate_request', 'request_id was already used');
  end if;

  select * into v_job
  from public.leader_installation_jobs
  where id = v_job_id
  for update;

  if not found then
    return leader_private.leader_installation_command_error(v_request_id, 'not_found', 'Installation job not found');
  end if;
  if v_job.updated_at is distinct from v_expected_updated_at then
    return leader_private.leader_installation_command_error(v_request_id, 'conflict', 'Installation job changed since it was loaded');
  end if;

  if v_job.order_id is not null then
    select * into v_order
    from public.leader_orders
    where id = v_job.order_id
    for update;
    if not found then
      return leader_private.leader_installation_command_error(v_request_id, 'not_found', 'Linked order not found');
    end if;
  end if;

  v_old_status := v_job.install_status;
  v_old_key := leader_private.leader_installation_status_key(v_old_status);
  v_status := v_old_status;

  if jsonb_exists(v_patch, 'install_status') then
    if jsonb_typeof(v_patch -> 'install_status') <> 'string' then
      return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'install_status must be a string');
    end if;
    v_status := btrim(v_patch ->> 'install_status');
    if v_status = '' then
      return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'install_status cannot be empty');
    end if;
    v_new_key := leader_private.leader_installation_status_key(v_status);

    if v_old_key is null then
      if v_status is distinct from v_old_status then
        return leader_private.leader_installation_command_error(v_request_id, 'invalid_transition', 'Unknown current installation status can only be preserved');
      end if;
    elsif v_new_key is null then
      return leader_private.leader_installation_command_error(v_request_id, 'invalid_transition', 'Unknown target installation status');
    elsif v_new_key = v_old_key then
      v_status := v_old_status;
    elsif not leader_private.leader_installation_transition_allowed(v_old_key, v_new_key) then
      return leader_private.leader_installation_command_error(v_request_id, 'invalid_transition', 'Installation status transition is not allowed');
    else
      v_status := leader_private.leader_installation_status_label(v_new_key);
    end if;
  else
    v_new_key := v_old_key;
  end if;

  if jsonb_exists(v_patch, 'title') then
    if jsonb_typeof(v_patch -> 'title') <> 'string' then
      return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'title must be a string');
    end if;
    v_title := btrim(v_patch ->> 'title');
    if v_title = '' or char_length(v_title) > 500 then
      return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'title must contain 1 to 500 characters');
    end if;
  else
    v_title := v_job.title;
  end if;

  if jsonb_exists(v_patch, 'scheduled_at') then
    if v_patch -> 'scheduled_at' = 'null'::jsonb then
      v_scheduled_at := null;
    elsif jsonb_typeof(v_patch -> 'scheduled_at') = 'string' then
      begin
        v_scheduled_at := nullif(btrim(v_patch ->> 'scheduled_at'), '')::timestamptz;
      exception when others then
        return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'scheduled_at must be ISO datetime or null');
      end;
    else
      return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'scheduled_at must be ISO datetime or null');
    end if;
  else
    v_scheduled_at := v_job.scheduled_at;
  end if;

  if jsonb_exists(v_patch, 'installer_name') and v_patch -> 'installer_name' <> 'null'::jsonb and jsonb_typeof(v_patch -> 'installer_name') <> 'string' then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'installer_name must be string or null');
  end if;
  if jsonb_exists(v_patch, 'installer_phone') and v_patch -> 'installer_phone' <> 'null'::jsonb and jsonb_typeof(v_patch -> 'installer_phone') <> 'string' then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'installer_phone must be string or null');
  end if;
  if jsonb_exists(v_patch, 'address') and v_patch -> 'address' <> 'null'::jsonb and jsonb_typeof(v_patch -> 'address') <> 'string' then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'address must be string or null');
  end if;
  if jsonb_exists(v_patch, 'before_photo_url') and v_patch -> 'before_photo_url' <> 'null'::jsonb and jsonb_typeof(v_patch -> 'before_photo_url') <> 'string' then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'before_photo_url must be string or null');
  end if;
  if jsonb_exists(v_patch, 'after_photo_url') and v_patch -> 'after_photo_url' <> 'null'::jsonb and jsonb_typeof(v_patch -> 'after_photo_url') <> 'string' then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'after_photo_url must be string or null');
  end if;
  if jsonb_exists(v_patch, 'technical_task') and v_patch -> 'technical_task' <> 'null'::jsonb and jsonb_typeof(v_patch -> 'technical_task') <> 'string' then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'technical_task must be string or null');
  end if;
  if jsonb_exists(v_patch, 'tools_required') and v_patch -> 'tools_required' <> 'null'::jsonb and jsonb_typeof(v_patch -> 'tools_required') <> 'string' then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'tools_required must be string or null');
  end if;
  if jsonb_exists(v_patch, 'installer_comment') and v_patch -> 'installer_comment' <> 'null'::jsonb and jsonb_typeof(v_patch -> 'installer_comment') <> 'string' then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'installer_comment must be string or null');
  end if;

  v_installer_name := case when jsonb_exists(v_patch, 'installer_name') then nullif(btrim(coalesce(v_patch ->> 'installer_name', '')), '') else v_job.installer_name end;
  v_installer_phone := case when jsonb_exists(v_patch, 'installer_phone') then nullif(btrim(coalesce(v_patch ->> 'installer_phone', '')), '') else v_job.installer_phone end;
  v_address := case when jsonb_exists(v_patch, 'address') then nullif(btrim(coalesce(v_patch ->> 'address', '')), '') else v_job.address end;
  v_before_photo_url := case when jsonb_exists(v_patch, 'before_photo_url') then nullif(btrim(coalesce(v_patch ->> 'before_photo_url', '')), '') else v_job.before_photo_url end;
  v_after_photo_url := case when jsonb_exists(v_patch, 'after_photo_url') then nullif(btrim(coalesce(v_patch ->> 'after_photo_url', '')), '') else v_job.after_photo_url end;
  v_technical_task := case when jsonb_exists(v_patch, 'technical_task') then nullif(btrim(coalesce(v_patch ->> 'technical_task', '')), '') else v_job.technical_task end;
  v_tools_required := case when jsonb_exists(v_patch, 'tools_required') then nullif(btrim(coalesce(v_patch ->> 'tools_required', '')), '') else v_job.tools_required end;
  v_installer_comment := case when jsonb_exists(v_patch, 'installer_comment') then nullif(btrim(coalesce(v_patch ->> 'installer_comment', '')), '') else v_job.installer_comment end;

  if char_length(coalesce(v_installer_name, '')) > 500
     or char_length(coalesce(v_installer_phone, '')) > 120
     or char_length(coalesce(v_address, '')) > 2000
     or char_length(coalesce(v_before_photo_url, '')) > 2000
     or char_length(coalesce(v_after_photo_url, '')) > 2000
     or char_length(coalesce(v_technical_task, '')) > 12000
     or char_length(coalesce(v_tools_required, '')) > 8000
     or char_length(coalesce(v_installer_comment, '')) > 8000 then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'One or more patch fields exceed maximum length');
  end if;

  v_started_at := v_job.started_at;
  v_completed_at := v_job.completed_at;
  if v_new_key is distinct from v_old_key then
    if v_new_key = 'in_progress' and v_started_at is null then
      v_started_at := v_now;
    end if;
    if v_new_key = 'completed' and v_completed_at is null then
      v_completed_at := v_now;
    end if;
  end if;

  insert into leader_private.leader_command_receipts (
    action, idempotency_key, request_id, request_hash, actor_id, state
  ) values (
    'installation_job.update', v_idempotency_key, v_request_id, v_request_hash, v_actor_id, 'in_progress'
  ) returning * into v_receipt;

  update public.leader_installation_jobs
  set title = v_title,
      install_status = v_status,
      installer_name = v_installer_name,
      installer_phone = v_installer_phone,
      address = v_address,
      scheduled_at = v_scheduled_at,
      started_at = v_started_at,
      completed_at = v_completed_at,
      before_photo_url = v_before_photo_url,
      after_photo_url = v_after_photo_url,
      technical_task = v_technical_task,
      tools_required = v_tools_required,
      installer_comment = v_installer_comment,
      updated_by = v_actor_id,
      updated_at = v_now
  where id = v_job_id
  returning * into v_job;

  if v_job.order_id is not null then
    update public.leader_orders
    set installation_status = v_status,
        installation_address = v_address,
        installation_scheduled_at = v_scheduled_at,
        installation_completed_at = v_completed_at,
        installer_name = v_installer_name,
        installer_phone = v_installer_phone,
        current_stage = 'Монтаж: ' || coalesce(v_status, 'Не назначен'),
        updated_at = v_now,
        stage_updated_at = v_now
    where id = v_job.order_id
    returning * into v_order;
  end if;

  insert into public.leader_installation_events (
    job_id, order_id, event_type, old_status, new_status, body, created_by
  ) values (
    v_job.id, v_job.order_id, 'Обновление монтажа', v_old_status, v_status,
    'Монтажное задание обновлено атомарной командой CRM v4', v_actor_id
  ) returning * into v_event;

  v_response := jsonb_build_object(
    'ok', true,
    'request_id', v_request_id,
    'entity', jsonb_build_object(
      'id', v_job.id,
      'order_id', v_job.order_id,
      'production_job_id', v_job.production_job_id,
      'title', v_job.title,
      'install_status', v_job.install_status,
      'installer_name', v_job.installer_name,
      'installer_phone', v_job.installer_phone,
      'address', v_job.address,
      'scheduled_at', v_job.scheduled_at,
      'started_at', v_job.started_at,
      'completed_at', v_job.completed_at,
      'before_photo_url', v_job.before_photo_url,
      'after_photo_url', v_job.after_photo_url,
      'technical_task', v_job.technical_task,
      'tools_required', v_job.tools_required,
      'installer_comment', v_job.installer_comment,
      'updated_at', v_job.updated_at
    ),
    'order', case when v_job.order_id is null then null else jsonb_build_object(
      'id', v_order.id,
      'installation_status', v_order.installation_status,
      'installation_address', v_order.installation_address,
      'installation_scheduled_at', v_order.installation_scheduled_at,
      'installation_completed_at', v_order.installation_completed_at,
      'installer_name', v_order.installer_name,
      'installer_phone', v_order.installer_phone,
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

  update leader_private.leader_command_receipts
  set state = 'success', response = v_response, updated_at = v_now, completed_at = v_now
  where id = v_receipt.id;

  return v_response;
exception when others then
  return leader_private.leader_installation_command_error(
    v_request_id,
    'persistence_failed',
    'Installation job update could not be persisted'
  );
end
$function$;

revoke execute on function leader_private.leader_installation_command_error(uuid, text, text)
  from public, anon, authenticated;
revoke execute on function leader_private.leader_installation_status_key(text)
  from public, anon, authenticated;
revoke execute on function leader_private.leader_installation_status_label(text)
  from public, anon, authenticated;
revoke execute on function leader_private.leader_installation_transition_allowed(text, text)
  from public, anon, authenticated;
revoke execute on function public.leader_update_installation_job_rpc(jsonb)
  from public, anon, authenticated;

grant execute on function leader_private.leader_installation_command_error(uuid, text, text)
  to service_role;
grant execute on function leader_private.leader_installation_status_key(text)
  to service_role;
grant execute on function leader_private.leader_installation_status_label(text)
  to service_role;
grant execute on function leader_private.leader_installation_transition_allowed(text, text)
  to service_role;
grant execute on function public.leader_update_installation_job_rpc(jsonb)
  to service_role;
