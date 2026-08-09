-- STAGING ONLY. Atomic initial calculation command for authenticated browser E2E.
do $guard$
begin
  if not exists (select 1 from leader_staging.environment_guard where singleton=true and project_ref='otulfnouybahfnsycxqn') then
    raise exception 'staging_environment_guard_failed';
  end if;
end
$guard$;

grant select, update on public.leader_leads to service_role;
grant select on public.leader_lead_needs to service_role;
grant select, insert on public.leader_lead_calculations, public.leader_lead_calculation_items to service_role;
grant select, insert, update on leader_private.leader_command_receipts to service_role;

create or replace function public.leader_create_initial_calculation_rpc(p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path=''
as $function$
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

revoke all on function public.leader_create_initial_calculation_rpc(jsonb) from public,anon,authenticated;
grant execute on function public.leader_create_initial_calculation_rpc(jsonb) to service_role;
