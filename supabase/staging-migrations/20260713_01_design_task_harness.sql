-- STAGING ONLY.
-- Target project: lider-bsk-staging / otulfnouybahfnsycxqn.
-- Depends on 20260713_00_environment_guard.sql.
-- This is an isolated design-task test harness, not a normalized production migration.

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
end
$guard$;

create schema if not exists leader_private;

revoke all on schema leader_private from public;
revoke all on schema leader_private from anon;
revoke all on schema leader_private from authenticated;
grant usage on schema leader_private to service_role;

create sequence if not exists public.leader_order_number_seq start with 1001;

create table if not exists public.leader_user_profiles (
  user_id uuid primary key,
  email text,
  full_name text,
  role text not null default 'manager',
  is_active boolean not null default true,
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leader_leads (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'Новая',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leader_orders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid default auth.uid(),
  order_number bigint default nextval('public.leader_order_number_seq'::regclass),
  lead_id uuid,
  project_name text,
  client_name text,
  client_phone text,
  status text not null default 'Новый',
  priority text not null default 'Обычный',
  deadline date,
  layout_status text,
  layout_link text,
  payment_status text,
  client_total numeric not null default 0,
  contractor_cost numeric not null default 0,
  profit numeric not null default 0,
  prepayment numeric not null default 0,
  balance numeric not null default 0,
  production_status text not null default 'Не передано',
  internal_comment text,
  data jsonb not null default '{}'::jsonb,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leader_orders_lead_id_fkey
    foreign key (lead_id) references public.leader_leads(id) on delete set null
);

create table if not exists public.leader_lead_needs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null,
  need_type text not null default 'Другое',
  title text,
  description text,
  structured_data jsonb not null default '{}'::jsonb,
  need_design boolean not null default false,
  design_reason text,
  deadline_date date,
  status text not null default 'Черновик',
  completeness_score integer not null default 0
    check (completeness_score >= 0 and completeness_score <= 100),
  missing_fields jsonb not null default '[]'::jsonb,
  created_by uuid default auth.uid(),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leader_lead_needs_lead_id_fkey
    foreign key (lead_id) references public.leader_leads(id) on delete cascade
);

create table if not exists public.leader_production_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid default auth.uid(),
  order_id uuid,
  title text not null,
  production_status text not null default 'Не передано',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leader_production_jobs_order_id_fkey
    foreign key (order_id) references public.leader_orders(id) on delete cascade
);

create table if not exists public.leader_design_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid default auth.uid(),
  order_id uuid,
  production_job_id uuid,
  title text not null,
  client_name text,
  client_phone text,
  task_status text not null default 'Новая',
  layout_status text not null default 'Макет не начат',
  priority text not null default 'Обычный',
  designer_name text,
  deadline timestamptz,
  source text,
  layout_link text,
  reference_link text,
  task_text text,
  client_comment text,
  internal_comment text,
  result_comment text,
  created_by uuid default auth.uid(),
  updated_by uuid,
  started_at timestamptz,
  sent_to_client_at timestamptz,
  approved_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leader_design_tasks_order_id_fkey
    foreign key (order_id) references public.leader_orders(id) on delete cascade,
  constraint leader_design_tasks_production_job_id_fkey
    foreign key (production_job_id) references public.leader_production_jobs(id) on delete set null
);

create table if not exists public.leader_design_task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  order_id uuid,
  event_type text not null default 'status',
  old_status text,
  new_status text,
  body text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint leader_design_task_events_task_id_fkey
    foreign key (task_id) references public.leader_design_tasks(id) on delete cascade,
  constraint leader_design_task_events_order_id_fkey
    foreign key (order_id) references public.leader_orders(id) on delete cascade
);

create table if not exists leader_private.leader_command_receipts (
  id uuid primary key default gen_random_uuid(),
  action text not null check (char_length(action) between 1 and 120),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 180),
  request_id uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  actor_id uuid not null,
  state text not null default 'in_progress'
    check (state in ('in_progress', 'success')),
  response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint leader_command_receipts_action_key_uidx
    unique (action, idempotency_key),
  constraint leader_command_receipts_action_request_uidx
    unique (action, request_id),
  constraint leader_command_receipts_state_payload_check
    check (
      (state = 'in_progress' and response is null and completed_at is null)
      or
      (state = 'success' and jsonb_typeof(response) = 'object' and completed_at is not null)
    )
);

create unique index if not exists leader_design_tasks_one_active_per_order_uidx
  on public.leader_design_tasks (order_id)
  where order_id is not null
    and task_status not in ('Завершено', 'Отменено');

create index if not exists leader_lead_needs_lead_id_idx
  on public.leader_lead_needs (lead_id);

create index if not exists leader_production_jobs_order_id_idx
  on public.leader_production_jobs (order_id);

create index if not exists leader_design_task_events_task_id_idx
  on public.leader_design_task_events (task_id);

alter table public.leader_user_profiles enable row level security;
alter table public.leader_leads enable row level security;
alter table public.leader_orders enable row level security;
alter table public.leader_lead_needs enable row level security;
alter table public.leader_production_jobs enable row level security;
alter table public.leader_design_tasks enable row level security;
alter table public.leader_design_task_events enable row level security;
alter table leader_private.leader_command_receipts enable row level security;

revoke all on table public.leader_user_profiles from public, anon, authenticated;
revoke all on table public.leader_leads from public, anon, authenticated;
revoke all on table public.leader_orders from public, anon, authenticated;
revoke all on table public.leader_lead_needs from public, anon, authenticated;
revoke all on table public.leader_production_jobs from public, anon, authenticated;
revoke all on table public.leader_design_tasks from public, anon, authenticated;
revoke all on table public.leader_design_task_events from public, anon, authenticated;
revoke all on table leader_private.leader_command_receipts from public, anon, authenticated;
revoke all on sequence public.leader_order_number_seq from public, anon, authenticated;

grant select, insert, update on table public.leader_user_profiles to service_role;
grant select, insert, update on table public.leader_leads to service_role;
grant select, insert, update on table public.leader_orders to service_role;
grant select, insert, update on table public.leader_lead_needs to service_role;
grant select, insert, update on table public.leader_production_jobs to service_role;
grant select, insert, update on table public.leader_design_tasks to service_role;
grant select, insert on table public.leader_design_task_events to service_role;
grant select, insert, update on table leader_private.leader_command_receipts to service_role;
grant usage, select on sequence public.leader_order_number_seq to service_role;

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
  if v_action <> 'design_task.create_from_order' then
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

  if v_profile.role not in ('owner', 'admin', 'manager', 'designer') then
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

  select coalesce(jsonb_agg(to_jsonb(x::text) order by x::text), '[]'::jsonb)
  into v_need_ids_json
  from unnest(v_need_ids) as x;

  v_canonical := jsonb_build_object(
    'action', v_action,
    'request_id', v_request_id,
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
    if v_receipt.request_hash <> v_request_hash then
      return jsonb_build_object(
        'ok', false,
        'request_id', v_request_id,
        'error', jsonb_build_object('code', 'conflict', 'message', 'Idempotency key was used with another request')
      );
    end if;

    if v_receipt.state = 'success' then
      return jsonb_set(
        v_receipt.response,
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

comment on schema leader_private is
  'РА Лидер: private database objects not exposed to browser clients.';

comment on table leader_private.leader_command_receipts is
  'РА Лидер staging: durable idempotency receipts for server commands.';

comment on table public.leader_design_tasks is
  'РА Лидер staging harness: design tasks matching the production dependency surface.';

comment on table public.leader_design_task_events is
  'РА Лидер staging harness: privacy-safe design task audit events.';

comment on function public.leader_create_design_task_from_order_rpc(jsonb) is
  'STAGING candidate: atomic design_task.create_from_order command. EXECUTE only service_role.';
