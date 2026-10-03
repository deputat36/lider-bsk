-- Staging operational upgrade; no production apply in this change.
do $guard$ begin
 if not exists(select 1 from leader_staging.environment_guard where singleton=true and project_ref='otulfnouybahfnsycxqn') then raise exception 'staging_environment_guard_failed';end if;
end $guard$;
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
     or v_request ->> 'action' <> 'design_task.transition'
     or char_length(v_key) not between 1 and 160
     or v_target not in ('В работе','На согласовании','Согласовано')
     or char_length(coalesce(v_layout_link,'')) > 2000
     or (v_layout_link is not null and v_layout_link !~* '^https?://[^[:space:]/]+(/[^[:space:]]*)?$')
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
    if v_receipt.request_hash <> v_hash then
      return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','conflict'));
    end if;
    if v_receipt.state='success' and v_receipt.response is not null then
      return v_receipt.response || jsonb_build_object('idempotent_replay',true);
    end if;
    return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','duplicate_request'));
  end if;
  select * into v_task from public.leader_design_tasks where id=v_task_id for update;
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
