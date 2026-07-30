-- STAGING ONLY compatibility for lead -> need -> calculation -> offer -> order acceptance.
-- Target: lider-bsk-staging / otulfnouybahfnsycxqn. Never apply to production.
-- The order RPC below is the canonical definition from
-- supabase/migrations/20260626_06_leader_order_from_offer_rpc.sql.

do $guard$
begin
  if not exists (
    select 1 from leader_staging.environment_guard
    where singleton = true
      and project_ref = 'otulfnouybahfnsycxqn'
      and environment_name = 'staging'
      and repository = 'deputat36/lider-bsk'
  ) then raise exception 'staging_environment_guard_failed'; end if;

  if to_regclass('public.leader_lead_needs') is null
     or to_regclass('public.leader_orders') is null
     or to_regclass('public.leader_leads') is null
     or to_regclass('public.leader_lead_calculations') is null
     or to_regclass('public.leader_lead_calculation_items') is null
     or to_regclass('public.leader_commercial_offers') is null
     or to_regclass('public.leader_commercial_offer_events') is null
     or to_regclass('public.leader_order_status_history') is null
  then raise exception 'staging_order_compat_dependencies_missing'; end if;
end $guard$;

alter table public.leader_lead_needs
  add column if not exists client_id uuid,
  add column if not exists need_installation boolean not null default false;

create table if not exists public.leader_clients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  name text not null,
  phone text,
  email text,
  source text,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leader_clients_phone_idx on public.leader_clients(phone);

create table if not exists public.leader_order_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  order_id uuid not null references public.leader_orders(id) on delete cascade,
  catalog_id uuid,
  category text,
  item_type text,
  calculation_mode text,
  min_client_price numeric,
  default_client_price numeric,
  markup_percent numeric,
  name text not null,
  unit text,
  quantity numeric not null default 1,
  contractor_price numeric not null default 0,
  contractor_sum numeric not null default 0,
  client_sum numeric not null default 0,
  comment text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leader_order_items_order_id_idx on public.leader_order_items(order_id);

alter table public.leader_clients enable row level security;
alter table public.leader_order_items enable row level security;
revoke all on public.leader_clients from anon, authenticated;
revoke all on public.leader_order_items from anon, authenticated;
grant all on public.leader_clients to service_role;
grant all on public.leader_order_items to service_role;

comment on table public.leader_clients is
  'STAGING compatibility table for the canonical lead-to-order contract; contains synthetic staging data only.';
comment on table public.leader_order_items is
  'STAGING compatibility table for the canonical order item snapshot; contains synthetic staging data only.';
create or replace function public.leader_create_order_from_offer_rpc(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor_id uuid := coalesce(auth.uid(), nullif(p_payload->>'actor_id','')::uuid);
  v_actor_email text := nullif(trim(coalesce(auth.email(), p_payload->>'actor_email','')), '');
  v_offer_id uuid := nullif(p_payload->>'offer_id','')::uuid;
  v_offer public.leader_commercial_offers%rowtype;
  v_calculation public.leader_lead_calculations%rowtype;
  v_lead public.leader_leads%rowtype;
  v_need public.leader_lead_needs%rowtype;
  v_client public.leader_clients%rowtype;
  v_order public.leader_orders%rowtype;
  v_profile public.leader_user_profiles%rowtype;
  v_items_count integer := 0;
  v_client_total numeric := 0;
  v_contractor_cost numeric := 0;
  v_profit numeric := 0;
  v_prepayment numeric := 0;
  v_deadline date := null;
  v_project_name text;
  v_comment text := nullif(trim(coalesce(p_payload->>'comment','')), '');
  v_order_type text := coalesce(nullif(trim(p_payload->>'order_type'), ''), 'Смешанный');
  v_payment_status text := coalesce(nullif(trim(p_payload->>'payment_status'), ''), 'Не оплачено');
  v_layout_status text := nullif(trim(p_payload->>'layout_status'), '');
begin
  if v_actor_id is null then
    raise exception 'Сначала войдите в CRM';
  end if;

  if v_offer_id is null then
    raise exception 'offer_id_required';
  end if;

  select * into v_profile
  from public.leader_user_profiles
  where user_id = v_actor_id
    and is_active = true
  limit 1;

  if not found then
    raise exception 'Профиль пользователя CRM не найден или отключён';
  end if;

  select * into v_offer
  from public.leader_commercial_offers
  where id = v_offer_id
  for update;

  if not found then
    raise exception 'offer_not_found';
  end if;

  if v_offer.order_id is not null then
    select * into v_order from public.leader_orders where id = v_offer.order_id limit 1;
    return jsonb_build_object('ok', true, 'already_created', true, 'order', to_jsonb(v_order), 'items_created', 0);
  end if;

  if v_offer.status <> 'Согласовано' then
    raise exception 'offer_not_approved';
  end if;

  if v_offer.calculation_id is null then
    raise exception 'calculation_required';
  end if;

  select * into v_calculation
  from public.leader_lead_calculations
  where id = v_offer.calculation_id
  for update;

  if not found then
    raise exception 'calculation_not_found';
  end if;

  if v_calculation.order_id is not null then
    update public.leader_commercial_offers
    set order_id = v_calculation.order_id,
        updated_at = now()
    where id = v_offer.id;

    select * into v_order from public.leader_orders where id = v_calculation.order_id limit 1;
    return jsonb_build_object('ok', true, 'already_created', true, 'order', to_jsonb(v_order), 'items_created', 0);
  end if;

  select * into v_lead
  from public.leader_leads
  where id = coalesce(v_calculation.lead_id, v_offer.lead_id)
  for update;

  if not found then
    raise exception 'lead_not_found';
  end if;

  if v_lead.converted_order_id is not null then
    update public.leader_commercial_offers
    set order_id = v_lead.converted_order_id,
        updated_at = now()
    where id = v_offer.id;

    update public.leader_lead_calculations
    set order_id = v_lead.converted_order_id,
        status = 'Создан заказ',
        updated_at = now()
    where id = v_calculation.id;

    select * into v_order from public.leader_orders where id = v_lead.converted_order_id limit 1;
    return jsonb_build_object('ok', true, 'already_created', true, 'order', to_jsonb(v_order), 'items_created', 0);
  end if;

  select count(*) into v_items_count
  from public.leader_lead_calculation_items
  where calculation_id = v_calculation.id;

  if coalesce(v_items_count, 0) = 0 then
    raise exception 'order_items_required';
  end if;

  if v_calculation.need_id is not null then
    select * into v_need
    from public.leader_lead_needs
    where id = v_calculation.need_id
    limit 1;
  end if;

  if nullif(p_payload->>'deadline','') is not null then
    v_deadline := (p_payload->>'deadline')::date;
  else
    v_deadline := v_need.deadline_date;
  end if;

  if v_offer.client_id is not null then
    select * into v_client from public.leader_clients where id = v_offer.client_id limit 1;
  end if;

  if v_client.id is null and v_calculation.client_id is not null then
    select * into v_client from public.leader_clients where id = v_calculation.client_id limit 1;
  end if;

  if v_client.id is null and nullif(trim(coalesce(v_lead.phone,'')), '') is not null then
    select * into v_client
    from public.leader_clients
    where phone = v_lead.phone
    order by created_at asc
    limit 1;
  end if;

  if v_client.id is null then
    insert into public.leader_clients(owner_id, name, phone, source, comment)
    values (
      v_actor_id,
      coalesce(nullif(trim(v_lead.name), ''), nullif(trim(v_lead.phone), ''), 'Клиент из КП'),
      nullif(trim(v_lead.phone), ''),
      coalesce(nullif(trim(v_lead.source), ''), 'CRM v4'),
      coalesce(v_comment, 'Клиент создан при конвертации КП в заказ')
    )
    returning * into v_client;
  end if;

  v_client_total := coalesce(v_calculation.client_total, v_offer.total_sum, 0);
  v_contractor_cost := coalesce(v_calculation.contractor_cost, 0);
  v_profit := coalesce(v_calculation.profit, v_client_total - v_contractor_cost, 0);
  v_prepayment := greatest(coalesce(nullif(p_payload->>'prepayment','')::numeric, 0), 0);
  v_project_name := coalesce(nullif(trim(p_payload->>'project_name'), ''), nullif(trim(v_offer.title), ''), nullif(trim(v_calculation.title), ''), 'Заказ из КП');

  insert into public.leader_orders(
    owner_id,
    client_id,
    lead_id,
    project_name,
    client_name,
    client_phone,
    status,
    payment_status,
    deadline,
    contractor_cost,
    client_total,
    profit,
    prepayment,
    balance,
    source,
    layout_status,
    layout_comment,
    production_status,
    data
  ) values (
    v_actor_id,
    v_client.id,
    v_lead.id,
    v_project_name,
    coalesce(nullif(trim(v_lead.name), ''), v_client.name),
    coalesce(nullif(trim(v_lead.phone), ''), v_client.phone),
    'Новый',
    v_payment_status,
    v_deadline,
    v_contractor_cost,
    v_client_total,
    v_profit,
    v_prepayment,
    greatest(v_client_total - v_prepayment, 0),
    coalesce(nullif(trim(v_lead.source), ''), 'CRM v4'),
    coalesce(v_layout_status, case when coalesce(v_need.need_design, false) then 'Нужен дизайн' else 'Макета нет' end),
    coalesce(v_comment, v_calculation.public_comment, v_need.description),
    'Не передано',
    jsonb_build_object(
      'order_type', v_order_type,
      'source_ui', 'crm_v4',
      'created_from', 'leader_create_order_from_offer_rpc',
      'offer_id', v_offer.id,
      'calculation_id', v_calculation.id,
      'lead_id', v_lead.id,
      'atomic', true
    )
  ) returning * into v_order;

  insert into public.leader_order_items(
    owner_id,
    order_id,
    catalog_id,
    category,
    item_type,
    calculation_mode,
    min_client_price,
    default_client_price,
    markup_percent,
    name,
    unit,
    quantity,
    contractor_price,
    contractor_sum,
    client_sum,
    comment,
    data
  )
  select
    v_actor_id,
    v_order.id,
    i.catalog_id,
    i.category,
    i.item_type,
    nullif(i.data->>'calculation_mode', ''),
    nullif(i.data->>'min_client_price', '')::numeric,
    nullif(i.data->>'default_client_price', '')::numeric,
    i.markup_percent,
    '[' || coalesce(nullif(trim(i.item_type), ''), 'Услуга') || '] ' || coalesce(nullif(trim(i.name), ''), 'Позиция'),
    coalesce(nullif(trim(i.unit), ''), 'шт'),
    i.qty,
    i.contractor_price,
    i.contractor_sum,
    i.client_sum,
    i.comment,
    coalesce(i.data, '{}'::jsonb)
  from public.leader_lead_calculation_items i
  where i.calculation_id = v_calculation.id
  order by i.sort_order asc;

  update public.leader_lead_calculations
  set order_id = v_order.id,
      status = 'Создан заказ',
      updated_at = now(),
      updated_by = v_actor_id
  where id = v_calculation.id;

  update public.leader_commercial_offers
  set order_id = v_order.id,
      updated_at = now(),
      updated_by = v_actor_id
  where id = v_offer.id;

  update public.leader_leads
  set status = 'Создан заказ',
      converted_order_id = v_order.id,
      converted_client_id = v_client.id,
      converted_at = now(),
      estimated_amount = v_client_total,
      updated_at = now()
  where id = v_lead.id;

  insert into public.leader_commercial_offer_events(
    offer_id,
    lead_id,
    calculation_id,
    event_type,
    old_status,
    new_status,
    comment,
    created_by,
    created_by_email
  ) values (
    v_offer.id,
    v_lead.id,
    v_calculation.id,
    'Создан заказ',
    v_offer.status,
    v_offer.status,
    'Создан заказ ' || coalesce(v_order.order_number::text, v_order.id::text),
    v_actor_id,
    v_actor_email
  );

  insert into public.leader_order_status_history(owner_id, order_id, old_status, new_status, comment, changed_by, changed_by_email)
  values (v_actor_id, v_order.id, null, v_order.status, 'Заказ создан из согласованного КП', v_actor_id, v_actor_email);

  return jsonb_build_object(
    'ok', true,
    'already_created', false,
    'order', to_jsonb(v_order),
    'client', to_jsonb(v_client),
    'items_created', v_items_count
  );
end;
$function$;

revoke all on function public.leader_create_order_from_offer_rpc(jsonb) from anon;
revoke all on function public.leader_create_order_from_offer_rpc(jsonb) from authenticated;
revoke all on function public.leader_create_order_from_offer_rpc(jsonb) from public;
grant execute on function public.leader_create_order_from_offer_rpc(jsonb) to service_role;
do $verify$
declare v_missing text[];
begin
  select array_agg(format('%s.%s', expected.table_name, expected.column_name) order by 1)
  into v_missing
  from (values
    ('leader_lead_needs','client_id'), ('leader_lead_needs','need_installation'),
    ('leader_clients','id'), ('leader_clients','owner_id'), ('leader_clients','name'),
    ('leader_clients','phone'), ('leader_clients','source'), ('leader_clients','comment'),
    ('leader_order_items','order_id'), ('leader_order_items','owner_id'),
    ('leader_order_items','name'), ('leader_order_items','quantity'),
    ('leader_order_items','contractor_sum'), ('leader_order_items','client_sum'),
    ('leader_order_items','data')
  ) expected(table_name,column_name)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema='public' and c.table_name=expected.table_name
      and c.column_name=expected.column_name
  );
  if v_missing is not null then
    raise exception 'staging_order_compat_columns_missing:%', array_to_string(v_missing, ',');
  end if;
  if to_regprocedure('public.leader_create_order_from_offer_rpc(jsonb)') is null then
    raise exception 'staging_order_compat_rpc_missing';
  end if;
end $verify$;
