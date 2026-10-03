-- Production Leader-only design commands. Existing canonical RBAC/receipts preserved.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='45s';
DO $preflight$ BEGIN
 IF to_regclass('leader_staging.environment_guard') IS NOT NULL THEN RAISE EXCEPTION 'production_only';END IF;
 IF to_regprocedure('leader_private.leader_actor_has_crm_action(uuid,text)') IS NULL THEN RAISE EXCEPTION 'canonical_core_missing';END IF;
 IF to_regprocedure('public.leader_create_design_task_from_order_rpc(jsonb)') IS NOT NULL OR to_regprocedure('public.leader_transition_design_task_rpc(jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'commands_already_installed';END IF;
 IF has_table_privilege('authenticated','leader_private.leader_rollout_backups','SELECT') OR has_table_privilege('service_role','leader_private.leader_rollout_backups','SELECT') THEN RAISE EXCEPTION 'backup_exposed';END IF;
END $preflight$;
LOCK TABLE public.leader_orders,public.leader_design_tasks,public.leader_design_task_events IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO leader_private.leader_rollout_backups(id,project_ref,data_snapshot,metadata_snapshot,edge_snapshot)
SELECT 'design-commands-20261003-v1','ofewxuqfjhamgerwzull',jsonb_build_object(
 'leader_orders',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM public.leader_orders t),
 'leader_design_tasks',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM public.leader_design_tasks t),
 'leader_design_task_events',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM public.leader_design_task_events t)),
 jsonb_build_object('tables',(SELECT jsonb_agg(jsonb_build_object('name',relname,'acl',relacl,'rls',relrowsecurity)) FROM pg_class WHERE oid IN ('public.leader_design_tasks'::regclass,'public.leader_design_task_events'::regclass))),jsonb_build_object('leader-crm-design','absent-before-rollout');
create or replace function public.leader_create_design_task_from_order_rpc(p_payload jsonb)
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
  v_task_input jsonb;
  v_action text;
  v_order_id uuid;
  v_production_job_id uuid;
  v_idempotency_key text;
  v_need_ids uuid[];
  v_need_ids_json jsonb;
  v_need_count integer;
  v_need_distinct_count integer;
  v_profile public.leader_user_profiles%rowtype;
  v_order public.leader_orders%rowtype;
  v_need public.leader_lead_needs%rowtype;
  v_production public.leader_production_jobs%rowtype;
  v_existing_task public.leader_design_tasks%rowtype;
  v_task public.leader_design_tasks%rowtype;
  v_event public.leader_design_task_events%rowtype;
  v_receipt leader_private.leader_command_receipts%rowtype;
  v_request_hash text;
  v_canonical jsonb;
  v_response jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_deadline timestamptz;
  v_need_deadline date;
  v_title text;
  v_priority text;
  v_task_text text;
  v_reference_link text;
  v_order_status text;
  v_need_status text;
  v_exception_detail text;
  v_exception_message text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return jsonb_build_object(
      'ok', false,
      'request_id', null,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'RPC payload must be an object')
    );
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_payload) as k(key)
    where key not in ('actor_id', 'actor_email', 'request')
  ) then
    return jsonb_build_object(
      'ok', false,
      'request_id', null,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'Unknown RPC payload field')
    );
  end if;

  begin
    v_actor_id := nullif(btrim(p_payload ->> 'actor_id'), '')::uuid;
  exception when others then
    return jsonb_build_object(
      'ok', false,
      'request_id', null,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'actor_id must be a UUID')
    );
  end;

  v_request := p_payload -> 'request';
  if v_request is null or jsonb_typeof(v_request) <> 'object' then
    return jsonb_build_object(
      'ok', false,
      'request_id', null,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'request must be an object')
    );
  end if;

  if exists (
    select 1
    from jsonb_object_keys(v_request) as k(key)
    where key not in ('action', 'request_id', 'expected_updated_at', 'payload')
  ) then
    return jsonb_build_object(
      'ok', false,
      'request_id', null,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'Unknown request field')
    );
  end if;

  v_action := btrim(v_request ->> 'action');
  if v_action is distinct from 'design_task.create_from_order' then
    return jsonb_build_object(
      'ok', false,
      'request_id', v_request ->> 'request_id',
      'error', jsonb_build_object('code', 'unknown_action', 'message', 'Unsupported action')
    );
  end if;

  begin
    v_request_id := nullif(btrim(v_request ->> 'request_id'), '')::uuid;
    v_expected_updated_at := nullif(btrim(v_request ->> 'expected_updated_at'), '')::timestamptz;
  exception when others then
    return jsonb_build_object(
      'ok', false,
      'request_id', v_request ->> 'request_id',
      'error', jsonb_build_object('code', 'validation_error', 'message', 'request_id or expected_updated_at is invalid')
    );
  end;

  if v_actor_id is null or v_request_id is null or v_expected_updated_at is null then
    return jsonb_build_object(
      'ok', false,
      'request_id', v_request_id,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'actor_id, request_id and expected_updated_at are required')
    );
  end if;

  select *
  into v_profile
  from public.leader_user_profiles
  where user_id = v_actor_id;

  if not found or v_profile.is_active is not true then
    return jsonb_build_object(
      'ok', false,
      'request_id', v_request_id,
      'error', jsonb_build_object('code', 'access_denied', 'message', 'Active CRM profile is required')
    );
  end if;

  if not leader_private.leader_actor_has_crm_action(v_actor_id, 'design.write') then
    return jsonb_build_object(
      'ok', false,
      'request_id', v_request_id,
      'error', jsonb_build_object('code', 'forbidden', 'message', 'design.write permission is required')
    );
  end if;

  v_payload := v_request -> 'payload';
  if v_payload is null or jsonb_typeof(v_payload) <> 'object' then
    return jsonb_build_object(
      'ok', false,
      'request_id', v_request_id,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'payload must be an object')
    );
  end if;

  if exists (
    select 1
    from jsonb_object_keys(v_payload) as k(key)
    where key not in ('order_id', 'production_job_id', 'idempotency_key', 'need_ids', 'task')
  ) then
    return jsonb_build_object(
      'ok', false,
      'request_id', v_request_id,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'Unknown business payload field')
    );
  end if;

  begin
    v_order_id := nullif(btrim(v_payload ->> 'order_id'), '')::uuid;
    if nullif(btrim(v_payload ->> 'production_job_id'), '') is not null then
      v_production_job_id := btrim(v_payload ->> 'production_job_id')::uuid;
    end if;
  exception when others then
    return jsonb_build_object(
      'ok', false,
      'request_id', v_request_id,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'order_id or production_job_id is invalid')
    );
  end;

  if v_order_id is null then
    return jsonb_build_object(
      'ok', false,
      'request_id', v_request_id,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'order_id is required')
    );
  end if;

  v_idempotency_key := btrim(v_payload ->> 'idempotency_key');
  if v_idempotency_key is null
     or char_length(v_idempotency_key) < 1
     or char_length(v_idempotency_key) > 180 then
    return jsonb_build_object(
      'ok', false,
      'request_id', v_request_id,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'idempotency_key length is invalid')
    );
  end if;

  if jsonb_typeof(v_payload -> 'need_ids') <> 'array'
     or jsonb_array_length(v_payload -> 'need_ids') < 1 then
    return jsonb_build_object(
      'ok', false,
      'request_id', v_request_id,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'need_ids must be a non-empty array')
    );
  end if;

  begin
    select array_agg(value::uuid order by value), count(*), count(distinct value)
    into v_need_ids, v_need_count, v_need_distinct_count
    from jsonb_array_elements_text(v_payload -> 'need_ids') as n(value);
  exception when others then
    return jsonb_build_object(
      'ok', false,
      'request_id', v_request_id,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'need_ids must contain UUID values')
    );
  end;

  if v_need_count <> v_need_distinct_count then
    return jsonb_build_object(
      'ok', false,
      'request_id', v_request_id,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'need_ids must be unique')
    );
  end if;

  v_task_input := v_payload -> 'task';
  if v_task_input is null or jsonb_typeof(v_task_input) <> 'object' then
    return jsonb_build_object(
      'ok', false,
      'request_id', v_request_id,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'task must be an object')
    );
  end if;

  if exists (
    select 1
    from jsonb_object_keys(v_task_input) as k(key)
    where key not in ('title', 'priority', 'deadline', 'task_text', 'reference_link')
  ) then
    return jsonb_build_object(
      'ok', false,
      'request_id', v_request_id,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'Task contains a server-owned or unknown field')
    );
  end if;

  v_title := nullif(btrim(v_task_input ->> 'title'), '');
  if v_title is null then
    return jsonb_build_object(
      'ok', false,
      'request_id', v_request_id,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'Task title is required')
    );
  end if;

  v_priority := nullif(btrim(v_task_input ->> 'priority'), '');
  v_task_text := nullif(btrim(v_task_input ->> 'task_text'), '');
  v_reference_link := nullif(btrim(v_task_input ->> 'reference_link'), '');

  begin
    if nullif(btrim(v_task_input ->> 'deadline'), '') is not null then
      v_deadline := btrim(v_task_input ->> 'deadline')::timestamptz;
    end if;
  exception when others then
    return jsonb_build_object(
      'ok', false,
      'request_id', v_request_id,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'Task deadline is invalid')
    );
  end;

  if v_reference_link is not null and (char_length(v_reference_link)>1000 or v_reference_link !~* '^https?://[^[:space:]/@]+(/[^[:space:]]*)?$') then
    return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','validation_error','message','Invalid reference URL'));
  end if;

  select coalesce(jsonb_agg(to_jsonb(x::text) order by x::text), '[]'::jsonb)
  into v_need_ids_json
  from unnest(v_need_ids) as x;

  v_canonical := jsonb_build_object(
    'action', v_action,
    'actor_id', v_actor_id,
    'expected_updated_at', v_expected_updated_at,
    'payload', jsonb_build_object(
      'order_id', v_order_id,
      'production_job_id', v_production_job_id,
      'idempotency_key', v_idempotency_key,
      'need_ids', v_need_ids_json,
      'task', jsonb_build_object(
        'title', v_title,
        'priority', v_priority,
        'deadline', v_deadline,
        'task_text', v_task_text,
        'reference_link', v_reference_link
      )
    )
  );

  v_request_hash := encode(
    extensions.digest(convert_to(v_canonical::text, 'UTF8'), 'sha256'),
    'hex'
  );

  if not pg_try_advisory_xact_lock(
    hashtextextended(v_action || ':' || v_idempotency_key, 0)
  ) then
    return jsonb_build_object(
      'ok', false,
      'request_id', v_request_id,
      'error', jsonb_build_object('code', 'duplicate_request', 'message', 'Request is already in progress')
    );
  end if;

  select *
  into v_receipt
  from leader_private.leader_command_receipts
  where action = v_action
    and idempotency_key = v_idempotency_key
  for update;

  if found then
    if v_receipt.actor_id is distinct from v_actor_id or v_receipt.request_hash <> v_request_hash then
      return jsonb_build_object(
        'ok', false,
        'request_id', v_request_id,
        'error', jsonb_build_object('code', 'conflict', 'message', 'Idempotency key was used with another request')
      );
    end if;

    if v_receipt.state = 'success' then
      return jsonb_set(
        v_receipt.response || jsonb_build_object('request_id',v_request_id),
        '{idempotent_replay}',
        'true'::jsonb,
        true
      );
    end if;

    return jsonb_build_object(
      'ok', false,
      'request_id', v_request_id,
      'error', jsonb_build_object('code', 'duplicate_request', 'message', 'Request receipt is still in progress')
    );
  end if;

  begin
    insert into leader_private.leader_command_receipts (
      action,
      idempotency_key,
      request_id,
      request_hash,
      actor_id,
      state
    )
    values (
      v_action,
      v_idempotency_key,
      v_request_id,
      v_request_hash,
      v_actor_id,
      'in_progress'
    )
    returning * into v_receipt;

    select *
    into v_order
    from public.leader_orders
    where id = v_order_id
    for update;

    if not found then
      raise exception 'Order not found' using detail = 'not_found';
    end if;

    if v_order.updated_at is distinct from v_expected_updated_at then
      raise exception 'Order changed after draft preparation' using detail = 'conflict';
    end if;

    if v_order.is_archived is true then
      raise exception 'Archived order cannot accept a design task' using detail = 'conflict';
    end if;

    v_order_status := lower(replace(btrim(coalesce(v_order.status, '')), 'ё', 'е'));

    if v_order_status in ('закрыт', 'отменен', 'отмена') then
      raise exception 'Terminal order cannot accept a design task' using detail = 'conflict';
    end if;

    if v_order_status not in (
      'новый',
      'макет на согласовании',
      'в производстве',
      'готово',
      'выдано'
    ) then
      raise exception 'Unknown order status fails closed' using detail = 'conflict';
    end if;

    if v_order.lead_id is null then
      raise exception 'Order has no lead evidence' using detail = 'validation_error';
    end if;

    if (
      select count(*)
      from public.leader_lead_needs
      where id = any(v_need_ids)
        and lead_id = v_order.lead_id
    ) <> cardinality(v_need_ids) then
      raise exception 'Selected need is missing or belongs to another lead' using detail = 'not_found';
    end if;

    for v_need in
      select *
      from public.leader_lead_needs
      where id = any(v_need_ids)
        and lead_id = v_order.lead_id
      order by id
      for share
    loop
      if v_need.need_design is not true then
        raise exception 'Selected need does not require design' using detail = 'validation_error';
      end if;

      v_need_status := lower(replace(btrim(coalesce(v_need.status, '')), 'ё', 'е'));
      if v_need_status in (
        'архив',
        'архивирован',
        'архивировано',
        'отменен',
        'отменено',
        'отмена',
        'archived',
        'cancelled'
      ) then
        raise exception 'Archived or cancelled need cannot be used' using detail = 'validation_error';
      end if;

      if v_need.completeness_score < 80 then
        v_warnings := v_warnings || jsonb_build_array(
          jsonb_build_object(
            'code', 'need_completeness_below_80',
            'need_id', v_need.id,
            'value', v_need.completeness_score
          )
        );
      end if;

      if jsonb_typeof(v_need.missing_fields) = 'array'
         and jsonb_array_length(v_need.missing_fields) > 0 then
        v_warnings := v_warnings || jsonb_build_array(
          jsonb_build_object(
            'code', 'need_missing_fields',
            'need_id', v_need.id,
            'fields', v_need.missing_fields
          )
        );
      end if;

      if nullif(btrim(v_need.design_reason), '') is null then
        v_warnings := v_warnings || jsonb_build_array(
          jsonb_build_object(
            'code', 'design_reason_missing',
            'need_id', v_need.id
          )
        );
      end if;

      if v_need.deadline_date is not null
         and (v_need_deadline is null or v_need.deadline_date < v_need_deadline) then
        v_need_deadline := v_need.deadline_date;
      end if;
    end loop;

    if v_deadline is null and v_need_deadline is not null then
      v_deadline := v_need_deadline::timestamptz;
    end if;

    if v_deadline is null then
      v_warnings := v_warnings || jsonb_build_array(
        jsonb_build_object('code', 'deadline_missing')
      );
    end if;

    if v_production_job_id is not null then
      select *
      into v_production
      from public.leader_production_jobs
      where id = v_production_job_id
        and order_id = v_order.id
      for share;

      if not found then
        raise exception 'Production job does not belong to order' using detail = 'not_found';
      end if;
    end if;

    select *
    into v_existing_task
    from public.leader_design_tasks
    where order_id = v_order.id
      and task_status not in ('Завершено', 'Отменено')
    order by created_at desc
    limit 1
    for update;

    if found then
      raise exception 'Active design task already exists' using detail = 'conflict';
    end if;

    insert into public.leader_design_tasks (
      owner_id,
      order_id,
      production_job_id,
      title,
      task_status,
      layout_status,
      priority,
      designer_name,
      deadline,
      source,
      layout_link,
      reference_link,
      task_text,
      created_by,
      updated_by
    )
    values (
      v_actor_id,
      v_order.id,
      v_production_job_id,
      v_title,
      'Новая',
      'Макет не начат',
      coalesce(v_priority, v_order.priority, 'Обычный'),
      null,
      v_deadline,
      'crm_v4_server_action',
      null,
      v_reference_link,
      v_task_text,
      v_actor_id,
      null
    )
    returning * into v_task;

    insert into public.leader_design_task_events (
      task_id,
      order_id,
      event_type,
      old_status,
      new_status,
      body,
      created_by
    )
    values (
      v_task.id,
      v_order.id,
      'created',
      null,
      'Новая',
      'Дизайн-задача создана из подтверждённой потребности заказа.',
      v_actor_id
    )
    returning * into v_event;

    v_response := jsonb_build_object(
      'ok', true,
      'request_id', v_request_id,
      'entity', jsonb_build_object(
        'id', v_task.id,
        'order_id', v_task.order_id,
        'production_job_id', v_task.production_job_id,
        'title', v_task.title,
        'task_status', v_task.task_status,
        'layout_status', v_task.layout_status,
        'priority', v_task.priority,
        'designer_name', v_task.designer_name,
        'deadline', v_task.deadline,
        'source', v_task.source,
        'layout_link', v_task.layout_link,
        'reference_link', v_task.reference_link,
        'created_at', v_task.created_at,
        'updated_at', v_task.updated_at
      ),
      'order', jsonb_build_object(
        'id', v_order.id,
        'order_number', v_order.order_number,
        'status', v_order.status,
        'deadline', v_order.deadline,
        'layout_status', v_order.layout_status,
        'layout_link', v_order.layout_link
      ),
      'events', jsonb_build_array(
        jsonb_build_object(
          'id', v_event.id,
          'task_id', v_event.task_id,
          'order_id', v_event.order_id,
          'event_type', v_event.event_type,
          'old_status', v_event.old_status,
          'new_status', v_event.new_status,
          'created_at', v_event.created_at
        )
      ),
      'warnings', v_warnings,
      'idempotent_replay', false
    );

    update leader_private.leader_command_receipts
    set state = 'success',
        response = v_response,
        updated_at = now(),
        completed_at = now()
    where id = v_receipt.id;

    return v_response;
  exception
    when unique_violation then
      return jsonb_build_object(
        'ok', false,
        'request_id', v_request_id,
        'error', jsonb_build_object('code', 'conflict', 'message', 'A conflicting active task or receipt already exists')
      );
    when raise_exception then
      get stacked diagnostics
        v_exception_detail = pg_exception_detail,
        v_exception_message = message_text;

      return jsonb_build_object(
        'ok', false,
        'request_id', v_request_id,
        'error', jsonb_build_object(
          'code', coalesce(nullif(v_exception_detail, ''), 'persistence_failed'),
          'message', coalesce(nullif(v_exception_message, ''), 'Request could not be persisted')
        )
      );
    when others then
      return jsonb_build_object(
        'ok', false,
        'request_id', v_request_id,
        'error', jsonb_build_object(
          'code', 'persistence_failed',
          'message', 'Task, event and receipt were rolled back'
        )
      );
  end;
end
$function$;

revoke all on function public.leader_create_design_task_from_order_rpc(jsonb) from public;
revoke all on function public.leader_create_design_task_from_order_rpc(jsonb) from anon;
revoke all on function public.leader_create_design_task_from_order_rpc(jsonb) from authenticated;
grant execute on function public.leader_create_design_task_from_order_rpc(jsonb) to service_role;


create or replace function public.leader_transition_design_task_rpc(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_actor uuid;
  v_request jsonb := p_payload -> 'request';
  v_payload jsonb;
  v_request_id uuid;
  v_expected timestamptz;
  v_task_id uuid;
  v_key text;
  v_target text;
  v_layout_link text;
  v_hash text;
  v_receipt leader_private.leader_command_receipts%rowtype;
  v_task public.leader_design_tasks%rowtype;
  v_order public.leader_orders%rowtype;
  v_now timestamptz := clock_timestamp();
  v_response jsonb;
  v_old_status text;
begin
  if jsonb_typeof(p_payload) is distinct from 'object'
     or jsonb_typeof(v_request) is distinct from 'object'
     or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('actor_id','actor_email','request'))
     or exists(select 1 from jsonb_object_keys(v_request) k where k not in ('action','request_id','expected_updated_at','payload'))
     or jsonb_typeof(v_request->'payload') is distinct from 'object' then
    return jsonb_build_object('ok',false,'error',jsonb_build_object('code','validation_error'));
  end if;
  if exists(select 1 from jsonb_object_keys(v_request->'payload') k where k not in ('task_id','idempotency_key','status','layout_link')) then
    return jsonb_build_object('ok',false,'error',jsonb_build_object('code','validation_error'));
  end if;
  begin
    v_actor := nullif(p_payload ->> 'actor_id','')::uuid;
    v_request_id := nullif(v_request ->> 'request_id','')::uuid;
    v_expected := nullif(v_request ->> 'expected_updated_at','')::timestamptz;
    v_payload := v_request -> 'payload';
    v_task_id := nullif(v_payload ->> 'task_id','')::uuid;
  exception when others then
    return jsonb_build_object('ok',false,'error',jsonb_build_object('code','validation_error'));
  end;
  v_key := btrim(coalesce(v_payload ->> 'idempotency_key',''));
  v_target := btrim(coalesce(v_payload ->> 'status',''));
  v_layout_link := nullif(btrim(coalesce(v_payload ->> 'layout_link','')),'');
  if v_actor is null or v_request_id is null or v_expected is null or v_task_id is null
     or (v_request ->> 'action') is distinct from 'design_task.transition'
     or char_length(v_key) not between 1 and 160
     or v_target not in ('В работе','На согласовании','Согласовано')
     or char_length(coalesce(v_layout_link,'')) > 2000
     or (v_layout_link is not null and v_layout_link !~* '^https?://[^[:space:]/@]+(/[^[:space:]]*)?$')
     or (v_target='Согласовано' and v_layout_link is null) then
    return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','validation_error'));
  end if;
  if not leader_private.leader_actor_has_crm_action(v_actor,'design.write') then
    return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','forbidden'));
  end if;
  v_hash := encode(extensions.digest(convert_to((jsonb_build_object('actor_id',v_actor,'action','design_task.transition','expected',v_expected,'payload',v_payload))::text,'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('design_task.transition:key:'||v_key,0));
  perform pg_advisory_xact_lock(hashtextextended('design_task.transition:task:'||v_task_id::text,0));
  select * into v_receipt from leader_private.leader_command_receipts
    where action='design_task.transition' and idempotency_key=v_key for update;
  if found then
    if v_receipt.actor_id is distinct from v_actor or v_receipt.request_hash <> v_hash then
      return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','conflict'));
    end if;
    if v_receipt.state='success' and v_receipt.response is not null then
      return v_receipt.response || jsonb_build_object('idempotent_replay',true,'request_id',v_request_id);
    end if;
    return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','duplicate_request'));
  end if;
  select * into v_task from public.leader_design_tasks where id=v_task_id;
  if not found then return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','not_found')); end if;
  if v_task.updated_at is distinct from v_expected then
    return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','conflict'));
  end if;
  if not ((v_task.task_status='Новая' and v_target='В работе')
       or (v_task.task_status='В работе' and v_target='На согласовании')
       or (v_task.task_status='На согласовании' and v_target='Согласовано')) then
    return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','invalid_transition'));
  end if;
  if v_target='Согласовано' and v_layout_link is null then
    return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','validation_error'));
  end if;
  if v_task.order_id is null then
    return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','not_found'));
  end if;
  select * into v_order from public.leader_orders where id=v_task.order_id for update;
  if not found then
    return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','not_found'));
  end if;
  select * into v_task from public.leader_design_tasks where id=v_task_id and order_id=v_order.id for update;
  if not found or v_task.updated_at is distinct from v_expected then
    return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','conflict'));
  end if;
  if v_order.is_archived is true or v_order.status in ('Закрыт','Закрыт успешно','Завершён','Завершен','Отменён','Отменен','Отменено') then
    return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','conflict'));
  end if;
  v_old_status := v_task.task_status;
  update public.leader_design_tasks set task_status=v_target,
    layout_status=case when v_target='Согласовано' then 'Макет согласован' else v_target end,
    layout_link=coalesce(v_layout_link,layout_link),
    started_at=case when v_target='В работе' then coalesce(started_at,v_now) else started_at end,
    sent_to_client_at=case when v_target='На согласовании' then coalesce(sent_to_client_at,v_now) else sent_to_client_at end,
    approved_at=case when v_target='Согласовано' then coalesce(approved_at,v_now) else null end,
    updated_by=v_actor,updated_at=v_now where id=v_task.id returning * into v_task;
  if v_task.order_id is not null then
    update public.leader_orders set
      layout_status=case when v_target='Согласовано' then 'Макет согласован' else v_target end,
      layout_link=coalesce(v_layout_link,layout_link),
      status=case when v_target='На согласовании' then 'Макет на согласовании' else status end,
      current_stage=case when v_target='Согласовано' then 'Макет согласован' else 'Дизайн: '||v_target end,
      next_action=case when v_target='Согласовано' then 'Передать в производство' else 'Завершить согласование макета' end,
      updated_at=v_now,stage_updated_at=v_now where id=v_task.order_id returning * into v_order;
  end if;
  insert into public.leader_design_task_events(task_id,order_id,event_type,old_status,new_status,body,created_by,created_at)
    values(v_task.id,v_task.order_id,'status',v_old_status,v_target,'Переход дизайн-задачи',v_actor,v_now);
  v_response := jsonb_build_object('ok',true,'request_id',v_request_id,'task',jsonb_build_object('id',v_task.id,'order_id',v_task.order_id,'task_status',v_task.task_status,'layout_status',v_task.layout_status,'layout_link',v_task.layout_link,'updated_at',v_task.updated_at),
    'order',jsonb_build_object('id',v_order.id,'layout_status',v_order.layout_status,'layout_link',v_order.layout_link,'current_stage',v_order.current_stage,'next_action',v_order.next_action,'updated_at',v_order.updated_at),'idempotent_replay',false);
  insert into leader_private.leader_command_receipts(action,idempotency_key,request_id,request_hash,actor_id,state,response,created_at,updated_at,completed_at)
    values('design_task.transition',v_key,v_request_id,v_hash,v_actor,'success',v_response,v_now,v_now,v_now);
  return v_response;
exception when others then
  return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','persistence_failed'));
end
$function$;


revoke all on function public.leader_transition_design_task_rpc(jsonb) from public, anon, authenticated;
grant execute on function public.leader_transition_design_task_rpc(jsonb) to service_role;

-- Browser mutations remain closed; audit rows must be server-created only.
REVOKE INSERT,UPDATE,DELETE ON public.leader_design_tasks,public.leader_design_task_events FROM PUBLIC,anon,authenticated;
DO $columns$ DECLARE t text;names text;BEGIN
 FOREACH t IN ARRAY ARRAY['leader_design_tasks','leader_design_task_events'] LOOP
 SELECT string_agg(format('%I',attname),',' ORDER BY attnum) INTO names FROM pg_attribute WHERE attrelid=('public.'||t)::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE format('REVOKE INSERT(%s),UPDATE(%s) ON public.%I FROM PUBLIC,anon,authenticated',names,names,t);
 END LOOP;
END $columns$;
DO $postflight$ DECLARE saved jsonb;BEGIN
 SELECT data_snapshot INTO saved FROM leader_private.leader_rollout_backups WHERE id='design-commands-20261003-v1';
 IF saved->'leader_orders' IS DISTINCT FROM (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM public.leader_orders t)
 OR saved->'leader_design_tasks' IS DISTINCT FROM (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM public.leader_design_tasks t)
 OR saved->'leader_design_task_events' IS DISTINCT FROM (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM public.leader_design_task_events t) THEN RAISE EXCEPTION 'business_rows_changed';END IF;
 IF has_function_privilege('authenticated','public.leader_create_design_task_from_order_rpc(jsonb)','EXECUTE') OR has_function_privilege('authenticated','public.leader_transition_design_task_rpc(jsonb)','EXECUTE') OR has_table_privilege('authenticated','public.leader_design_task_events','INSERT') THEN RAISE EXCEPTION 'browser_write_open';END IF;
END $postflight$;
COMMIT;
