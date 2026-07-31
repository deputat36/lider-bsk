-- STAGING ONLY: reproducible lead -> need -> calculation -> offer -> order acceptance.
-- Target: otulfnouybahfnsycxqn. Synthetic prefix: LIDER-E2E-20260730.
-- Run with psql -v ON_ERROR_STOP=1 against staging only. The transaction is always rolled back.

\set ON_ERROR_STOP on

begin;

do $guard$
declare
  v_missing text[];
begin
  if not exists (
    select 1 from leader_staging.environment_guard
    where singleton = true
      and project_ref = 'otulfnouybahfnsycxqn'
      and environment_name = 'staging'
      and repository = 'deputat36/lider-bsk'
  ) then raise exception 'staging_environment_guard_failed'; end if;

  select array_agg(required.object_name order by required.object_name)
  into v_missing
  from (values
    ('table:leader_clients', to_regclass('public.leader_clients') is not null),
    ('table:leader_order_items', to_regclass('public.leader_order_items') is not null),
    ('column:leader_lead_needs.client_id', exists(select 1 from information_schema.columns where table_schema='public' and table_name='leader_lead_needs' and column_name='client_id')),
    ('column:leader_lead_needs.need_installation', exists(select 1 from information_schema.columns where table_schema='public' and table_name='leader_lead_needs' and column_name='need_installation')),
    ('rpc:leader_create_calculation_version_rpc(jsonb)', to_regprocedure('public.leader_create_calculation_version_rpc(jsonb)') is not null),
    ('rpc:leader_create_offer_from_calculation_rpc(jsonb)', to_regprocedure('public.leader_create_offer_from_calculation_rpc(jsonb)') is not null),
    ('rpc:leader_create_order_from_offer_rpc(jsonb)', to_regprocedure('public.leader_create_order_from_offer_rpc(jsonb)') is not null)
  ) required(object_name,present)
  where not required.present;
  if v_missing is not null then
    raise exception 'lead_to_order_schema_preflight_failed:%', array_to_string(v_missing, ',');
  end if;
end $guard$;

insert into public.leader_user_profiles(user_id,email,full_name,role,is_active,permissions)
values ('a7300000-0000-4000-8000-000000000001','lider-e2e-20260730@example.invalid',
  'LIDER-E2E-20260730 manager','manager',true,
  '{"leads.write":true,"needs.write":true,"calculations.write":true,"offers.write":true,"orders.create":true}'::jsonb);

insert into public.leader_clients(id,owner_id,name,phone,source,comment)
values ('a7300000-0000-4000-8000-000000000002','a7300000-0000-4000-8000-000000000001',
  'LIDER-E2E-20260730 client','+79990007300','staging-e2e','LIDER-E2E-20260730');

insert into public.leader_leads(id,name,phone,source,status,assigned_to,next_contact_at,request_id,created_at,updated_at)
values ('a7300000-0000-4000-8000-000000000003','LIDER-E2E-20260730 client','+79990007300',
  'staging-e2e','В работе','a7300000-0000-4000-8000-000000000001',now() + interval '1 day',
  'LIDER-E2E-20260730-request',clock_timestamp(),clock_timestamp());

insert into public.leader_lead_needs(id,lead_id,client_id,need_type,title,description,structured_data,
  need_design,need_installation,deadline_date,status,completeness_score,created_by,updated_by)
values ('a7300000-0000-4000-8000-000000000004','a7300000-0000-4000-8000-000000000003',
  'a7300000-0000-4000-8000-000000000002','Баннер','LIDER-E2E-20260730 need',
  'Баннер 2x1 м, 2 шт, срок и контакты проверяются повторным SELECT',
  '{"width_m":2,"height_m":1,"quantity":2,"synthetic_run":"LIDER-E2E-20260730"}'::jsonb,
  true,false,current_date + 7,'Готово к расчёту',100,
  'a7300000-0000-4000-8000-000000000001','a7300000-0000-4000-8000-000000000001');

-- Source version contains base cost, a separately visible extra expense and a discount encoded
-- in the chosen client price. The immutable copy RPC must preserve both line snapshots.
insert into public.leader_lead_calculations(id,lead_id,need_id,client_id,title,status,version_number,
  client_total,contractor_cost,profit,margin_percent,warning_level,warnings,created_by,updated_by)
values ('a7300000-0000-4000-8000-000000000005','a7300000-0000-4000-8000-000000000003',
  'a7300000-0000-4000-8000-000000000004','a7300000-0000-4000-8000-000000000002',
  'LIDER-E2E-20260730 calculation v1','Согласован',1,2500,1700,800,32,'ok','[]',
  'a7300000-0000-4000-8000-000000000001','a7300000-0000-4000-8000-000000000001');

insert into public.leader_lead_calculation_items(calculation_id,lead_id,category,item_type,name,unit,qty,
  contractor_price,contractor_sum,markup_percent,client_price,client_sum,profit,margin_percent,data,sort_order)
values
('a7300000-0000-4000-8000-000000000005','a7300000-0000-4000-8000-000000000003','Печать','Изготовление',
 'LIDER-E2E-20260730 баннер','шт',2,750,1500,60,1200,2400,900,37.5,
 '{"discount_amount":100,"price_before_discount":2500,"synthetic_run":"LIDER-E2E-20260730"}',0),
('a7300000-0000-4000-8000-000000000005','a7300000-0000-4000-8000-000000000003','Расходы','Допрасход',
 'LIDER-E2E-20260730 доставка','усл',1,200,200,-50,100,100,-100,-100,
 '{"additional_expense":true,"synthetic_run":"LIDER-E2E-20260730"}',1);

do $scenario$
declare v_source jsonb; v_version jsonb; v_offer jsonb; v_order jsonb; v_version_id uuid; v_offer_id uuid; v_order_id uuid;
begin
  select to_jsonb(n) into strict v_source from public.leader_lead_needs n
  where id='a7300000-0000-4000-8000-000000000004' and structured_data->>'quantity'='2';

  v_version := public.leader_create_calculation_version_rpc(jsonb_build_object(
    'actor_id','a7300000-0000-4000-8000-000000000001','actor_email','lider-e2e-20260730@example.invalid','request',jsonb_build_object(
      'action','calculation.create_version','request_id','a7300000-0000-4000-8000-000000000006',
      'expected_updated_at',(select updated_at from public.leader_lead_calculations where id='a7300000-0000-4000-8000-000000000005'),
      'payload',jsonb_build_object('source_calculation_id','a7300000-0000-4000-8000-000000000005',
        'idempotency_key','LIDER-E2E-20260730-calc-v2','title','LIDER-E2E-20260730 calculation v2',
        'need_id','a7300000-0000-4000-8000-000000000004','items',jsonb_build_array(
          jsonb_build_object('category','Печать','item_type','Изготовление','name','LIDER-E2E-20260730 баннер','unit','шт','qty',2,'contractor_price',750,'client_price',1150,'data',jsonb_build_object('discount_amount',200,'price_before_discount',2500),'sort_order',0),
          jsonb_build_object('category','Расходы','item_type','Допрасход','name','LIDER-E2E-20260730 доставка','unit','усл','qty',1,'contractor_price',200,'client_price',100,'data',jsonb_build_object('additional_expense',true),'sort_order',1)
        )))));
  if coalesce((v_version->>'ok')::boolean,false) is not true then raise exception 'version_failed: %',v_version; end if;
  v_version_id := (v_version#>>'{calculation,id}')::uuid;
  if (v_version#>>'{calculation,version_number}')::int <> 2 or (v_version#>>'{calculation,client_total}')::numeric <> 2400
     or (v_version#>>'{calculation,contractor_cost}')::numeric <> 1700 then raise exception 'version_totals_or_history_failed: %',v_version; end if;
  if (select count(*) from public.leader_lead_calculations where lead_id='a7300000-0000-4000-8000-000000000003') <> 2
     or (select client_total from public.leader_lead_calculations where id='a7300000-0000-4000-8000-000000000005') <> 2500
    then raise exception 'source_version_was_overwritten'; end if;

  v_offer := public.leader_create_offer_from_calculation_rpc(jsonb_build_object(
    'actor_id','a7300000-0000-4000-8000-000000000001','actor_email','lider-e2e-20260730@example.invalid','request',jsonb_build_object(
      'action','offer.create_from_calculation','request_id','a7300000-0000-4000-8000-000000000007',
      'expected_updated_at',(select updated_at from public.leader_lead_calculations where id=v_version_id),
      'payload',jsonb_build_object('calculation_id',v_version_id,'idempotency_key','LIDER-E2E-20260730-offer',
        'title','LIDER-E2E-20260730 offer','valid_until',(current_date+14)::text))));
  if coalesce((v_offer->>'ok')::boolean,false) is not true then raise exception 'offer_failed: %',v_offer; end if;
  v_offer_id := (v_offer#>>'{entity,id}')::uuid;
  if v_offer_id is null then raise exception 'offer_response_missing_entity_id: %', v_offer; end if;
  if (select calculation_id from public.leader_commercial_offers where id=v_offer_id) <> v_version_id then raise exception 'offer_wrong_version'; end if;
  update public.leader_commercial_offers set status='Согласовано' where id=v_offer_id;

  v_order := public.leader_create_order_from_offer_rpc(jsonb_build_object('actor_id','a7300000-0000-4000-8000-000000000001',
    'actor_email','lider-e2e-20260730@example.invalid','offer_id',v_offer_id,'project_name','LIDER-E2E-20260730 order',
    'deadline',(current_date+7)::text,'comment','LIDER-E2E-20260730'));
  if coalesce((v_order->>'ok')::boolean,false) is not true then raise exception 'order_failed: %',v_order; end if;
  v_order_id := (v_order#>>'{order,id}')::uuid;
  if (select count(*) from public.leader_orders where lead_id='a7300000-0000-4000-8000-000000000003') <> 1
     or (select count(*) from public.leader_clients where phone='+79990007300') <> 1
     or (select count(*) from public.leader_leads where request_id='LIDER-E2E-20260730-request') <> 1
     or (select count(*) from public.leader_order_items where order_id=v_order_id) <> 2
     or (select client_total from public.leader_orders where id=v_order_id) <> 2400
     or (select contractor_cost from public.leader_orders where id=v_order_id) <> 1700
     or (select owner_id from public.leader_orders where id=v_order_id) <> 'a7300000-0000-4000-8000-000000000001'
     or (select source from public.leader_orders where id=v_order_id) <> 'staging-e2e'
    then raise exception 'order_projection_or_duplicate_check_failed'; end if;
  v_order := public.leader_create_order_from_offer_rpc(jsonb_build_object('actor_id','a7300000-0000-4000-8000-000000000001','offer_id',v_offer_id));
  if coalesce((v_order->>'already_created')::boolean,false) is not true
     or (v_order#>>'{order,id}')::uuid <> v_order_id then raise exception 'order_idempotency_failed: %',v_order; end if;
  perform 1 from public.leader_orders where id=v_order_id and project_name='LIDER-E2E-20260730 order'; -- reopen
  if not found then raise exception 'order_reopen_failed'; end if;
end $scenario$;

rollback;

-- Independent cleanup receipt: rollback must leave no row belonging to this run.
do $cleanup$
begin
  if (select count(*) from public.leader_leads where request_id='LIDER-E2E-20260730-request') <> 0
     or (select count(*) from public.leader_clients where phone='+79990007300') <> 0
     or (select count(*) from public.leader_lead_calculations where title like 'LIDER-E2E-20260730%') <> 0
     or (select count(*) from public.leader_commercial_offers where title='LIDER-E2E-20260730 offer') <> 0
     or (select count(*) from public.leader_orders where project_name='LIDER-E2E-20260730 order') <> 0
    then raise exception 'synthetic_cleanup_failed'; end if;
  raise notice 'LIDER-E2E-20260730 cleanup verified: zero residue';
end $cleanup$;
