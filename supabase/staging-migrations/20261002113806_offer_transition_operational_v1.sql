-- Existing offer transition contract promoted with current-version and linked-order guards.
create or replace function public.leader_transition_offer_rpc(p_payload jsonb)
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
  v_offer_id uuid;
  v_key text;
  v_target text;
  v_old_status text;
  v_hash text;
  v_receipt leader_private.leader_command_receipts%rowtype;
  v_offer public.leader_commercial_offers%rowtype;
  v_calc public.leader_lead_calculations%rowtype;
  v_lead public.leader_leads%rowtype;
  v_now timestamptz := clock_timestamp();
  v_response jsonb;
begin
  begin
    v_actor := nullif(p_payload ->> 'actor_id','')::uuid;
    v_request_id := nullif(v_request ->> 'request_id','')::uuid;
    v_expected := nullif(v_request ->> 'expected_updated_at','')::timestamptz;
    v_payload := v_request -> 'payload';
    v_offer_id := nullif(v_payload ->> 'offer_id','')::uuid;
  exception when others then
    return jsonb_build_object('ok',false,'error',jsonb_build_object('code','validation_error'));
  end;
  v_key := btrim(coalesce(v_payload ->> 'idempotency_key',''));
  v_target := btrim(coalesce(v_payload ->> 'status',''));
  if v_actor is null or v_request_id is null or v_expected is null or v_offer_id is null
     or v_request ->> 'action' IS DISTINCT FROM 'offer.transition'
     or jsonb_typeof(v_request) IS DISTINCT FROM 'object'
     or jsonb_typeof(v_payload) IS DISTINCT FROM 'object'
     or exists(select 1 from jsonb_object_keys(v_request) k where k not in ('action','request_id','expected_updated_at','payload'))
     or exists(select 1 from jsonb_object_keys(v_payload) k where k not in ('offer_id','status','idempotency_key'))
     or char_length(v_key) not between 1 and 160
     or v_target not in ('Отправлено','Согласовано','Отклонено') then
    return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','validation_error'));
  end if;
  if not leader_private.leader_actor_has_crm_action(v_actor,'offers.transition') then
    return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','forbidden'));
  end if;
  v_hash := encode(extensions.digest(convert_to((jsonb_build_object('actor_id',v_actor,'action','offer.transition','expected',v_expected,'payload',v_payload))::text,'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('offer.transition:key:'||v_key,0));
  perform pg_advisory_xact_lock(hashtextextended('offer.transition:offer:'||v_offer_id::text,0));
  select * into v_receipt from leader_private.leader_command_receipts
    where action='offer.transition' and idempotency_key=v_key for update;
  if found then
    if v_receipt.request_hash <> v_hash then
      return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','conflict'));
    end if;
    if v_receipt.state='success' and v_receipt.response is not null then
      return v_receipt.response || jsonb_build_object('idempotent_replay',true);
    end if;
    return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','duplicate_request'));
  end if;
  select * into v_offer from public.leader_commercial_offers where id=v_offer_id for update;
  if not found then return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','not_found')); end if;
  select * into v_calc from public.leader_lead_calculations where id=v_offer.calculation_id for update;
  if not found or v_calc.is_current_revision is not true then
    return jsonb_build_object('ok',false,'error',jsonb_build_object('code','source_not_current'));
  end if;
  if v_offer.order_id is not null or v_calc.order_id is not null then
    return jsonb_build_object('ok',false,'error',jsonb_build_object('code','order_already_created'));
  end if;
  select * into v_lead from public.leader_leads where id=v_offer.lead_id for update;
  if not found or v_calc.lead_id is distinct from v_lead.id then
    return jsonb_build_object('ok',false,'error',jsonb_build_object('code','source_not_current'));
  end if;
  if v_lead.converted_order_id is not null then
    return jsonb_build_object('ok',false,'error',jsonb_build_object('code','order_already_created'));
  end if;
  v_old_status:=v_offer.status;
  if v_offer.updated_at is distinct from v_expected then
    return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','conflict'));
  end if;
  if not ((v_offer.status='Черновик' and v_target='Отправлено')
       or (v_offer.status in ('Отправлено','КП отправлено') and v_target in ('Согласовано','Отклонено'))) then
    return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','invalid_transition'));
  end if;
  update public.leader_commercial_offers set status=v_target,
    sent_at=case when v_target='Отправлено' then coalesce(sent_at,v_now) else sent_at end,
    approved_at=case when v_target='Согласовано' then coalesce(approved_at,v_now) else approved_at end,
    rejected_at=case when v_target='Отклонено' then coalesce(rejected_at,v_now) else rejected_at end,
    updated_by=v_actor, updated_at=v_now where id=v_offer.id returning * into v_offer;
  if v_offer.calculation_id is not null then
    update public.leader_lead_calculations set
      status=case v_target when 'Отправлено' then 'КП отправлено' when 'Согласовано' then 'Согласован' else 'Отклонён' end,
      updated_by=v_actor, updated_at=v_now where id=v_offer.calculation_id returning * into v_calc;
  end if;
  update public.leader_leads set
    status=case v_target when 'Отправлено' then 'КП отправлено' when 'Согласовано' then 'Согласовано' else 'Нужно пересчитать' end,
    updated_at=v_now where id=v_offer.lead_id returning * into v_lead;
  insert into public.leader_commercial_offer_events(offer_id,lead_id,calculation_id,event_type,old_status,new_status,comment,created_by,created_by_email,created_at)
    values(v_offer.id,v_offer.lead_id,v_offer.calculation_id,'Изменение статуса КП',v_old_status,v_target,'Изменение статуса из карточки КП',v_actor,left(lower(p_payload->>'actor_email'),240),v_now);
  v_response := jsonb_build_object('ok',true,'request_id',v_request_id,'offer',to_jsonb(v_offer),'calculation',jsonb_build_object('id',v_calc.id,'status',v_calc.status,'updated_at',v_calc.updated_at),'lead',jsonb_build_object('id',v_lead.id,'status',v_lead.status,'updated_at',v_lead.updated_at),'idempotent_replay',false);
  insert into leader_private.leader_command_receipts(action,idempotency_key,request_id,request_hash,actor_id,state,response,created_at,updated_at,completed_at)
    values('offer.transition',v_key,v_request_id,v_hash,v_actor,'success',v_response,v_now,v_now,v_now);
  return v_response;
exception when others then
  raise log 'leader_offer_transition_failed request_id=% sqlstate=%',v_request_id,SQLSTATE;
  return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','persistence_failed'));
end
$function$;


revoke all on function public.leader_transition_offer_rpc(jsonb) from public,anon,authenticated;
grant execute on function public.leader_transition_offer_rpc(jsonb) to service_role;
