-- #526: staging only until backend production prerequisites and approval.
-- Preserve owner, grants, invoker security, receipts and stored versions.
begin;
do $preflight$
begin
  if to_regprocedure('public.leader_create_initial_calculation_rpc(jsonb)') is null or md5(pg_get_functiondef(to_regprocedure('public.leader_create_initial_calculation_rpc(jsonb)'))) <> '669e7194403ccbeeb95a3930f4145093' then raise exception 'calculation_rollback_preflight_failed'; end if;
  if to_regprocedure('leader_private.leader_create_calculation_version_rpc_internal_v1(jsonb)') is null or md5(pg_get_functiondef(to_regprocedure('leader_private.leader_create_calculation_version_rpc_internal_v1(jsonb)'))) <> '1a445859b21068b24263d3cb2d408738' then raise exception 'calculation_rollback_preflight_failed'; end if;
end $preflight$;
CREATE OR REPLACE FUNCTION public.leader_create_initial_calculation_rpc(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_actor uuid; v_request jsonb := p_payload->'request'; v_payload jsonb;
  v_request_id uuid; v_expected timestamptz; v_lead_id uuid; v_need_id uuid;
  v_key text; v_hash text; v_title text; v_public text; v_internal text;
  v_receipt leader_private.leader_command_receipts%rowtype;
  v_lead public.leader_leads%rowtype; v_need public.leader_lead_needs%rowtype;
  v_calc public.leader_lead_calculations%rowtype; v_item jsonb; v_row public.leader_lead_calculation_items%rowtype;
  v_items jsonb := '[]'::jsonb; v_count int; v_qty numeric; v_cost numeric; v_price numeric;
  v_cost_sum numeric := 0; v_client_sum numeric := 0; v_profit numeric; v_margin numeric;
  v_now timestamptz := clock_timestamp(); v_response jsonb;
begin
  begin
    v_actor := nullif(p_payload->>'actor_id','')::uuid;
    v_request_id := nullif(v_request->>'request_id','')::uuid;
    v_expected := nullif(v_request->>'expected_updated_at','')::timestamptz;
    v_payload := v_request->'payload';
    v_lead_id := nullif(v_payload->>'lead_id','')::uuid;
    v_need_id := nullif(v_payload->>'need_id','')::uuid;
  exception when others then return jsonb_build_object('ok',false,'error',jsonb_build_object('code','validation_error')); end;
  v_key := btrim(coalesce(v_payload->>'idempotency_key',''));
  v_title := btrim(coalesce(v_payload->>'title',''));
  v_public := nullif(btrim(coalesce(v_payload->>'public_comment','')),'');
  v_internal := nullif(btrim(coalesce(v_payload->>'internal_comment','')),'');
  if v_actor is null or v_request_id is null or v_expected is null or v_lead_id is null or v_need_id is null
     or v_request->>'action' <> 'calculation.create_initial' or char_length(v_key) not between 1 and 160
     or char_length(v_title) not between 1 and 500 or jsonb_typeof(v_payload->'items') <> 'array'
     or jsonb_array_length(v_payload->'items') not between 1 and 200 then
    return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','validation_error'));
  end if;
  if not leader_private.leader_actor_has_crm_action(v_actor,'calculations.write') then
    return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','forbidden'));
  end if;
  v_hash := encode(extensions.digest(convert_to((jsonb_build_object('actor_id',v_actor,'action','calculation.create_initial','expected',v_expected,'payload',v_payload))::text,'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('calculation.create_initial:key:'||v_key,0));
  perform pg_advisory_xact_lock(hashtextextended('calculation.create_initial:lead:'||v_lead_id::text,0));
  select * into v_receipt from leader_private.leader_command_receipts where action='calculation.create_initial' and idempotency_key=v_key for update;
  if found then
    if v_receipt.request_hash<>v_hash then return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','conflict')); end if;
    if v_receipt.state='success' and v_receipt.response is not null then return v_receipt.response||jsonb_build_object('idempotent_replay',true); end if;
    return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','duplicate_request'));
  end if;
  select * into v_lead from public.leader_leads where id=v_lead_id for update;
  if not found then return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','not_found')); end if;
  if v_lead.updated_at is distinct from v_expected then return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','conflict')); end if;
  select * into v_need from public.leader_lead_needs where id=v_need_id and lead_id=v_lead_id;
  if not found then return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','not_found')); end if;
  if exists(select 1 from public.leader_lead_calculations where need_id=v_need_id and is_current_revision=true) then
    return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','conflict'));
  end if;
  for v_item in select value from jsonb_array_elements(v_payload->'items') loop
    begin v_qty := (v_item->>'qty')::numeric; v_cost := (v_item->>'contractor_price')::numeric; v_price := (v_item->>'client_price')::numeric;
    exception when others then return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','validation_error')); end;
    if btrim(coalesce(v_item->>'name',''))='' or v_qty<=0 or v_cost<0 or v_price<0 then
      return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','validation_error'));
    end if;
    v_cost_sum := v_cost_sum + v_qty*v_cost; v_client_sum := v_client_sum + v_qty*v_price;
  end loop;
  if v_client_sum<=0 or v_client_sum<v_cost_sum then return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','validation_error')); end if;
  v_profit := v_client_sum-v_cost_sum; v_margin := case when v_client_sum>0 then v_profit/v_client_sum*100 else 0 end;
  select coalesce(max(version_number),0)+1 into v_count from public.leader_lead_calculations where lead_id=v_lead_id;
  insert into public.leader_lead_calculations(lead_id,need_id,client_id,title,status,version_number,client_total,contractor_cost,profit,margin_percent,warning_level,warnings,public_comment,internal_comment,created_by,updated_by,is_current_revision,created_at,updated_at)
    values(v_lead_id,v_need_id,v_need.client_id,v_title,'Черновик',v_count,v_client_sum,v_cost_sum,v_profit,v_margin,'ok','[]'::jsonb,v_public,v_internal,v_actor,v_actor,true,v_now,v_now) returning * into v_calc;
  for v_item in select value from jsonb_array_elements(v_payload->'items') loop
    v_qty := (v_item->>'qty')::numeric; v_cost := (v_item->>'contractor_price')::numeric; v_price := (v_item->>'client_price')::numeric;
    insert into public.leader_lead_calculation_items(calculation_id,lead_id,category,item_type,name,unit,qty,contractor_price,contractor_sum,markup_percent,client_price,client_sum,profit,margin_percent,comment,data,sort_order,created_at,updated_at)
      values(v_calc.id,v_lead_id,nullif(v_item->>'category',''),nullif(v_item->>'item_type',''),left(v_item->>'name',500),nullif(v_item->>'unit',''),v_qty,v_cost,v_qty*v_cost,case when v_cost>0 then (v_price-v_cost)/v_cost*100 else 0 end,v_price,v_qty*v_price,v_qty*(v_price-v_cost),case when v_price>0 then (v_price-v_cost)/v_price*100 else 0 end,nullif(v_item->>'comment',''),coalesce(v_item->'data','{}'::jsonb),coalesce((v_item->>'sort_order')::int,0),v_now,v_now)
      returning * into v_row;
    v_items := v_items||jsonb_build_array(to_jsonb(v_row));
  end loop;
  update public.leader_leads set status='Расчёт подготовлен',updated_at=v_now where id=v_lead_id returning * into v_lead;
  v_response := jsonb_build_object('ok',true,'request_id',v_request_id,'calculation',to_jsonb(v_calc),'items',v_items,'lead',to_jsonb(v_lead),'idempotent_replay',false);
  insert into leader_private.leader_command_receipts(action,idempotency_key,request_id,request_hash,actor_id,state,response,created_at,updated_at,completed_at)
    values('calculation.create_initial',v_key,v_request_id,v_hash,v_actor,'success',v_response,v_now,v_now,v_now);
  return v_response;
exception when others then return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','persistence_failed'));
end
$function$;
CREATE OR REPLACE FUNCTION leader_private.leader_create_calculation_version_rpc_internal_v1(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_actor_id uuid;
  v_request jsonb;
  v_request_id uuid;
  v_expected_updated_at timestamptz;
  v_payload jsonb;
  v_action text;
  v_source_calculation_id uuid;
  v_need_id uuid;
  v_idempotency_key text;
  v_items jsonb;
  v_item jsonb;
  v_item_index integer := 0;
  v_item_count integer;
  v_profile public.leader_user_profiles%rowtype;
  v_source public.leader_lead_calculations%rowtype;
  v_new_calculation public.leader_lead_calculations%rowtype;
  v_item_row public.leader_lead_calculation_items%rowtype;
  v_receipt leader_private.leader_command_receipts%rowtype;
  v_request_hash text;
  v_canonical jsonb;
  v_response jsonb;
  v_next_version integer;
  v_duplicate_versions integer[];
  v_title text;
  v_public_comment text;
  v_internal_comment text;
  v_catalog_id uuid;
  v_category text;
  v_item_type text;
  v_name text;
  v_unit text;
  v_qty numeric;
  v_contractor_price numeric;
  v_contractor_sum numeric;
  v_client_price numeric;
  v_client_sum numeric;
  v_item_profit numeric;
  v_item_markup numeric;
  v_item_margin numeric;
  v_comment text;
  v_data jsonb;
  v_sort_order integer;
  v_contractor_total numeric := 0;
  v_client_total numeric := 0;
  v_profit_total numeric := 0;
  v_margin_total numeric := 0;
  v_warning_level text := 'ok';
  v_warnings jsonb := '[]'::jsonb;
  v_items_response jsonb := '[]'::jsonb;
  v_calculation_response jsonb;
  v_exception_state text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return jsonb_build_object('ok', false, 'request_id', null,
      'error', jsonb_build_object('code', 'invalid_payload', 'message', 'RPC payload must be an object'));
  end if;

  if exists (
    select 1 from jsonb_object_keys(p_payload) as k(key)
    where key not in ('actor_id', 'actor_email', 'request')
  ) then
    return jsonb_build_object('ok', false, 'request_id', null,
      'error', jsonb_build_object('code', 'invalid_payload', 'message', 'Unknown RPC payload field'));
  end if;

  begin
    v_actor_id := nullif(btrim(p_payload ->> 'actor_id'), '')::uuid;
  exception when others then
    return jsonb_build_object('ok', false, 'request_id', null,
      'error', jsonb_build_object('code', 'invalid_payload', 'message', 'actor_id must be UUID'));
  end;

  v_request := p_payload -> 'request';
  if v_request is null or jsonb_typeof(v_request) <> 'object' then
    return jsonb_build_object('ok', false, 'request_id', null,
      'error', jsonb_build_object('code', 'invalid_payload', 'message', 'request must be an object'));
  end if;

  if exists (
    select 1 from jsonb_object_keys(v_request) as k(key)
    where key not in ('action', 'request_id', 'expected_updated_at', 'payload')
  ) then
    return jsonb_build_object('ok', false, 'request_id', v_request ->> 'request_id',
      'error', jsonb_build_object('code', 'invalid_payload', 'message', 'Unknown request field'));
  end if;

  v_action := btrim(v_request ->> 'action');
  if v_action <> 'calculation.create_version' then
    return jsonb_build_object('ok', false, 'request_id', v_request ->> 'request_id',
      'error', jsonb_build_object('code', 'unknown_action', 'message', 'Unsupported action'));
  end if;

  begin
    v_request_id := nullif(btrim(v_request ->> 'request_id'), '')::uuid;
    v_expected_updated_at := nullif(btrim(v_request ->> 'expected_updated_at'), '')::timestamptz;
  exception when others then
    return jsonb_build_object('ok', false, 'request_id', v_request ->> 'request_id',
      'error', jsonb_build_object('code', 'invalid_payload', 'message', 'Invalid request_id or expected_updated_at'));
  end;

  v_payload := v_request -> 'payload';
  if v_payload is null or jsonb_typeof(v_payload) <> 'object' then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'invalid_payload', 'message', 'payload must be an object'));
  end if;

  if exists (
    select 1 from jsonb_object_keys(v_payload) as k(key)
    where key not in (
      'source_calculation_id', 'idempotency_key', 'title', 'need_id',
      'public_comment', 'internal_comment', 'items'
    )
  ) then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'invalid_payload', 'message', 'Unknown business payload field'));
  end if;

  begin
    v_source_calculation_id := nullif(btrim(v_payload ->> 'source_calculation_id'), '')::uuid;
    v_need_id := nullif(btrim(v_payload ->> 'need_id'), '')::uuid;
  exception when others then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'invalid_payload', 'message', 'Invalid source_calculation_id or need_id'));
  end;

  v_idempotency_key := nullif(btrim(v_payload ->> 'idempotency_key'), '');
  v_items := v_payload -> 'items';

  if v_actor_id is null or v_request_id is null or v_expected_updated_at is null
     or v_source_calculation_id is null or v_idempotency_key is null
     or char_length(v_idempotency_key) > 160 then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'invalid_payload', 'message', 'Required command fields are missing or invalid'));
  end if;

  if v_items is null or jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) < 1 then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'empty_items', 'message', 'items must be a non-empty array'));
  end if;

  v_item_count := jsonb_array_length(v_items);
  if v_item_count > 200 then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'invalid_payload', 'message', 'items limit exceeded'));
  end if;

  select * into v_profile
  from public.leader_user_profiles
  where user_id = v_actor_id and is_active = true
  for share;

  if not found then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'inactive_profile', 'message', 'Active profile is required'));
  end if;

  if lower(btrim(v_profile.role)) not in ('owner', 'admin', 'manager') then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'forbidden', 'message', 'calculation.write is required'));
  end if;

  v_canonical := jsonb_build_object(
    'action', v_action,
    'request_id', v_request_id,
    'expected_updated_at', to_char(v_expected_updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'payload', v_payload,
    'actor_id', v_actor_id
  );
  v_request_hash := encode(extensions.digest(convert_to(v_canonical::text, 'UTF8'), 'sha256'), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(v_action || ':receipt:' || v_idempotency_key, 0));

  select * into v_receipt
  from leader_private.leader_command_receipts
  where action = v_action and idempotency_key = v_idempotency_key
  for update;

  if found then
    if v_receipt.request_hash <> v_request_hash then
      return jsonb_build_object('ok', false, 'request_id', v_request_id,
        'error', jsonb_build_object('code', 'idempotency_conflict', 'message', 'Idempotency key was used with another payload'));
    end if;

    if v_receipt.state = 'success' and v_receipt.response is not null then
      return v_receipt.response || jsonb_build_object('idempotent_replay', true);
    end if;

    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'idempotency_conflict', 'message', 'Command is already in progress'));
  end if;

  select * into v_source
  from public.leader_lead_calculations
  where id = v_source_calculation_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'source_calculation_not_found', 'message', 'Source calculation was not found'));
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_action || ':lead:' || v_source.lead_id::text, 0));

  if v_source.updated_at is distinct from v_expected_updated_at then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'source_changed', 'message', 'Source calculation changed; reload before creating a version'));
  end if;

  select array_agg(version_number order by version_number)
  into v_duplicate_versions
  from (
    select version_number
    from public.leader_lead_calculations
    where lead_id = v_source.lead_id
    group by version_number
    having count(*) > 1
  ) as duplicates;

  if coalesce(array_length(v_duplicate_versions, 1), 0) > 0 then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'duplicate_version_inventory',
        'message', 'Existing duplicate version numbers require audited remediation'));
  end if;

  if v_need_id is not null and not exists (
    select 1 from public.leader_lead_needs
    where id = v_need_id and lead_id = v_source.lead_id
  ) then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'invalid_payload', 'message', 'need_id does not belong to the source lead'));
  end if;

  for v_item in select value from jsonb_array_elements(v_items)
  loop
    v_item_index := v_item_index + 1;

    if jsonb_typeof(v_item) <> 'object' or exists (
      select 1 from jsonb_object_keys(v_item) as k(key)
      where key not in (
        'catalog_id', 'category', 'item_type', 'name', 'unit', 'qty',
        'contractor_price', 'client_price', 'comment', 'data', 'sort_order'
      )
    ) then
      return jsonb_build_object('ok', false, 'request_id', v_request_id,
        'error', jsonb_build_object('code', 'invalid_item', 'message', 'Item contains unknown or server-owned fields'));
    end if;

    begin
      v_catalog_id := nullif(btrim(v_item ->> 'catalog_id'), '')::uuid;
      v_qty := nullif(v_item ->> 'qty', '')::numeric;
      v_contractor_price := nullif(v_item ->> 'contractor_price', '')::numeric;
      v_client_price := nullif(v_item ->> 'client_price', '')::numeric;
      v_sort_order := coalesce(nullif(v_item ->> 'sort_order', '')::integer, v_item_index - 1);
    exception when others then
      return jsonb_build_object('ok', false, 'request_id', v_request_id,
        'error', jsonb_build_object('code', 'invalid_item', 'message', 'Item numeric or UUID field is invalid'));
    end;

    v_name := btrim(v_item ->> 'name');
    v_category := nullif(btrim(v_item ->> 'category'), '');
    v_item_type := nullif(btrim(v_item ->> 'item_type'), '');
    v_unit := nullif(btrim(v_item ->> 'unit'), '');
    v_comment := nullif(btrim(v_item ->> 'comment'), '');
    v_data := coalesce(v_item -> 'data', '{}'::jsonb);

    if v_name is null or v_name = '' or char_length(v_name) > 500
       or char_length(coalesce(v_category, '')) > 300
       or char_length(coalesce(v_item_type, '')) > 200
       or char_length(coalesce(v_unit, '')) > 80
       or char_length(coalesce(v_comment, '')) > 2000
       or v_qty is null or v_qty <= 0 or v_qty > 1000000
       or v_contractor_price is null or v_contractor_price < 0 or v_contractor_price > 1000000000
       or v_client_price is null or v_client_price < 0 or v_client_price > 1000000000
       or v_sort_order < 0 or v_sort_order > 1000000
       or jsonb_typeof(v_data) <> 'object'
       or pg_column_size(v_data) > 65536 then
      return jsonb_build_object('ok', false, 'request_id', v_request_id,
        'error', jsonb_build_object('code', 'invalid_item', 'message', 'Item values are outside allowed bounds'));
    end if;

    v_contractor_sum := round(v_qty * v_contractor_price, 2);
    v_client_sum := round(v_qty * v_client_price, 2);
    v_item_profit := round(v_client_sum - v_contractor_sum, 2);
    v_contractor_total := v_contractor_total + v_contractor_sum;
    v_client_total := v_client_total + v_client_sum;
  end loop;

  v_contractor_total := round(v_contractor_total, 2);
  v_client_total := round(v_client_total, 2);
  v_profit_total := round(v_client_total - v_contractor_total, 2);
  v_margin_total := case when v_client_total > 0
    then round((v_profit_total / v_client_total) * 100, 2) else 0 end;

  if v_client_total <= 0 or v_profit_total < 0 then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'invalid_totals',
        'message', 'Client total must be positive and profit must not be negative'));
  end if;

  if v_margin_total < 15 then
    v_warning_level := 'warning';
    v_warnings := jsonb_build_array('Маржа ниже 15%');
  end if;

  select coalesce(max(version_number), 0) + 1 into v_next_version
  from public.leader_lead_calculations
  where lead_id = v_source.lead_id;

  v_title := left(coalesce(nullif(btrim(v_payload ->> 'title'), ''),
    v_source.title || ' — версия ' || v_next_version::text), 500);
  v_public_comment := left(coalesce(v_payload ->> 'public_comment', v_source.public_comment), 4000);
  v_internal_comment := left(coalesce(v_payload ->> 'internal_comment', v_source.internal_comment), 8000);
  v_need_id := coalesce(v_need_id, v_source.need_id);

  insert into leader_private.leader_command_receipts (
    action, idempotency_key, request_id, request_hash, actor_id, state
  ) values (
    v_action, v_idempotency_key, v_request_id, v_request_hash, v_actor_id, 'in_progress'
  ) returning * into v_receipt;

  insert into public.leader_lead_calculations (
    lead_id, need_id, client_id, title, status, version_number,
    client_total, contractor_cost, profit, margin_percent,
    warning_level, warnings, public_comment, internal_comment,
    commercial_offer_id, order_id, created_by, updated_by
  ) values (
    v_source.lead_id, v_need_id, v_source.client_id, v_title, 'Черновик', v_next_version,
    v_client_total, v_contractor_total, v_profit_total, v_margin_total,
    v_warning_level, v_warnings, v_public_comment, v_internal_comment,
    null, null, v_actor_id, v_actor_id
  ) returning * into v_new_calculation;

  v_item_index := 0;
  for v_item in select value from jsonb_array_elements(v_items)
  loop
    v_item_index := v_item_index + 1;
    v_catalog_id := nullif(btrim(v_item ->> 'catalog_id'), '')::uuid;
    v_category := nullif(btrim(v_item ->> 'category'), '');
    v_item_type := nullif(btrim(v_item ->> 'item_type'), '');
    v_name := btrim(v_item ->> 'name');
    v_unit := nullif(btrim(v_item ->> 'unit'), '');
    v_qty := (v_item ->> 'qty')::numeric;
    v_contractor_price := (v_item ->> 'contractor_price')::numeric;
    v_client_price := (v_item ->> 'client_price')::numeric;
    v_comment := nullif(btrim(v_item ->> 'comment'), '');
    v_data := coalesce(v_item -> 'data', '{}'::jsonb);
    v_sort_order := coalesce(nullif(v_item ->> 'sort_order', '')::integer, v_item_index - 1);
    v_contractor_sum := round(v_qty * v_contractor_price, 2);
    v_client_sum := round(v_qty * v_client_price, 2);
    v_item_profit := round(v_client_sum - v_contractor_sum, 2);
    v_item_markup := case when v_contractor_price > 0
      then round(((v_client_price - v_contractor_price) / v_contractor_price) * 100, 2) else 0 end;
    v_item_margin := case when v_client_sum > 0
      then round((v_item_profit / v_client_sum) * 100, 2) else 0 end;

    insert into public.leader_lead_calculation_items (
      calculation_id, lead_id, catalog_id, category, item_type, name, unit, qty,
      contractor_price, contractor_sum, markup_percent, client_price, client_sum,
      profit, margin_percent, comment, data, sort_order
    ) values (
      v_new_calculation.id, v_new_calculation.lead_id, v_catalog_id, v_category,
      v_item_type, v_name, v_unit, v_qty, v_contractor_price, v_contractor_sum,
      v_item_markup, v_client_price, v_client_sum, v_item_profit, v_item_margin,
      v_comment, v_data, v_sort_order
    ) returning * into v_item_row;

    v_items_response := v_items_response || jsonb_build_array(jsonb_build_object(
      'id', v_item_row.id,
      'catalog_id', v_item_row.catalog_id,
      'category', v_item_row.category,
      'item_type', v_item_row.item_type,
      'name', v_item_row.name,
      'unit', v_item_row.unit,
      'qty', v_item_row.qty,
      'contractor_price', v_item_row.contractor_price,
      'contractor_sum', v_item_row.contractor_sum,
      'markup_percent', v_item_row.markup_percent,
      'client_price', v_item_row.client_price,
      'client_sum', v_item_row.client_sum,
      'profit', v_item_row.profit,
      'margin_percent', v_item_row.margin_percent,
      'comment', v_item_row.comment,
      'data', v_item_row.data,
      'sort_order', v_item_row.sort_order,
      'created_at', v_item_row.created_at,
      'updated_at', v_item_row.updated_at
    ));
  end loop;

  v_calculation_response := jsonb_build_object(
    'id', v_new_calculation.id,
    'lead_id', v_new_calculation.lead_id,
    'need_id', v_new_calculation.need_id,
    'client_id', v_new_calculation.client_id,
    'title', v_new_calculation.title,
    'status', v_new_calculation.status,
    'version_number', v_new_calculation.version_number,
    'client_total', v_new_calculation.client_total,
    'contractor_cost', v_new_calculation.contractor_cost,
    'profit', v_new_calculation.profit,
    'margin_percent', v_new_calculation.margin_percent,
    'warning_level', v_new_calculation.warning_level,
    'warnings', v_new_calculation.warnings,
    'public_comment', v_new_calculation.public_comment,
    'internal_comment', v_new_calculation.internal_comment,
    'created_at', v_new_calculation.created_at,
    'updated_at', v_new_calculation.updated_at
  );

  v_response := jsonb_build_object(
    'ok', true,
    'request_id', v_request_id,
    'source_calculation_id', v_source.id,
    'calculation', v_calculation_response,
    'items', v_items_response,
    'idempotent_replay', false
  );

  update leader_private.leader_command_receipts
  set state = 'success', response = v_response, updated_at = now(), completed_at = now()
  where id = v_receipt.id;

  return v_response;
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'version_conflict', 'message', 'Calculation version could not be assigned'));
  when others then
    get stacked diagnostics v_exception_state = returned_sqlstate;
    raise log 'leader_create_calculation_version_rpc_internal_v1 failed request_id=% sqlstate=%',
      v_request_id, v_exception_state;
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'calculation_version_create_failed',
        'message', 'Calculation version could not be persisted'));
end
$function$;
commit;
