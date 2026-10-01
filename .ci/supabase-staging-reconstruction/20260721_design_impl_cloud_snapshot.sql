-- LOCAL CI RECONSTRUCTION ONLY.
-- Snapshot of the current hosted lider-bsk-staging design implementation.
-- Captured read-only on 2026-10-01 because the exact implementation is not
-- present in the current Git migration history.
-- Apply only to the ephemeral local staging reconstruction after
-- 20260721_01_canonical_action_rbac.sql has renamed the original implementation.
-- NEVER apply this file to production or the hosted staging project.

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

  if to_regprocedure('public.leader_create_design_task_from_order_impl_rpc(jsonb)') is null then
    raise exception 'staging_design_impl_missing_before_cloud_snapshot';
  end if;
end
$guard$;

CREATE OR REPLACE FUNCTION public.leader_create_design_task_from_order_impl_rpc(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_actor uuid; v_req jsonb; v_payload jsonb; v_task_input jsonb;
  v_request_id uuid; v_expected_at timestamptz; v_order_id uuid; v_production_id uuid;
  v_action text; v_idem text; v_need_ids uuid[]; v_hash text;
  v_profile public.leader_user_profiles%rowtype;
  v_order public.leader_orders%rowtype;
  v_need public.leader_lead_needs%rowtype;
  v_task public.leader_design_tasks%rowtype;
  v_event public.leader_design_task_events%rowtype;
  v_receipt leader_private.leader_command_receipts%rowtype;
  v_title text; v_priority text; v_brief text; v_reference text; v_deadline timestamptz; v_need_deadline date;
  v_warnings jsonb := '[]'::jsonb; v_response jsonb; v_canonical jsonb;
  v_error_detail text; v_error_message text; v_raw_status text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return jsonb_build_object('ok',false,'request_id',null,'error',jsonb_build_object('code','validation_error','message','payload must be object'));
  end if;
  if exists(select 1 from jsonb_object_keys(p_payload) as k(key) where k.key not in ('actor_id','actor_email','request')) then
    return jsonb_build_object('ok',false,'request_id',null,'error',jsonb_build_object('code','validation_error','message','unknown rpc field'));
  end if;
  begin
    v_actor := nullif(btrim(p_payload->>'actor_id'),'')::uuid;
    v_req := p_payload->'request';
    v_request_id := nullif(btrim(v_req->>'request_id'),'')::uuid;
    v_expected_at := nullif(btrim(v_req->>'expected_updated_at'),'')::timestamptz;
  exception when others then
    return jsonb_build_object('ok',false,'request_id',p_payload#>>'{request,request_id}','error',jsonb_build_object('code','validation_error','message','invalid actor or request envelope'));
  end;
  if v_req is null or jsonb_typeof(v_req)<>'object' or exists(select 1 from jsonb_object_keys(v_req) as k(key) where k.key not in ('action','request_id','expected_updated_at','payload')) then
    return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','validation_error','message','invalid request envelope'));
  end if;
  v_action := btrim(v_req->>'action');
  if v_action <> 'design_task.create_from_order' then
    return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','unknown_action','message','unsupported action'));
  end if;
  select p.* into v_profile from public.leader_user_profiles p where p.user_id=v_actor;
  if not found or v_profile.is_active is not true then
    return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','access_denied','message','active profile required'));
  end if;
  if v_profile.role not in ('owner','admin','manager','designer') then
    return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','forbidden','message','design.write required'));
  end if;

  v_payload := v_req->'payload';
  if v_payload is null or jsonb_typeof(v_payload)<>'object' or exists(select 1 from jsonb_object_keys(v_payload) as k(key) where k.key not in ('order_id','production_job_id','idempotency_key','need_ids','task')) then
    return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','validation_error','message','invalid business payload'));
  end if;
  begin
    v_order_id := nullif(btrim(v_payload->>'order_id'),'')::uuid;
    v_production_id := nullif(btrim(v_payload->>'production_job_id'),'')::uuid;
    select array_agg(n.value::uuid order by n.value) into v_need_ids from jsonb_array_elements_text(v_payload->'need_ids') n(value);
  exception when others then
    return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','validation_error','message','invalid ids'));
  end;
  v_idem := btrim(v_payload->>'idempotency_key');
  v_task_input := v_payload->'task';
  if v_order_id is null or v_idem is null or char_length(v_idem) not between 1 and 180 or v_need_ids is null or cardinality(v_need_ids)<1 or cardinality(v_need_ids)<>(select count(distinct x.id) from unnest(v_need_ids) as x(id)) then
    return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','validation_error','message','required ids or idempotency key invalid'));
  end if;
  if v_task_input is null or jsonb_typeof(v_task_input)<>'object' or exists(select 1 from jsonb_object_keys(v_task_input) as k(key) where k.key not in ('title','priority','deadline','task_text','reference_link')) then
    return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','validation_error','message','task has unknown or server-owned field'));
  end if;
  v_title := nullif(btrim(v_task_input->>'title'),'');
  v_priority := nullif(btrim(v_task_input->>'priority'),'');
  v_brief := nullif(btrim(v_task_input->>'task_text'),'');
  v_reference := nullif(btrim(v_task_input->>'reference_link'),'');
  begin v_deadline := nullif(btrim(v_task_input->>'deadline'),'')::timestamptz; exception when others then
    return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','validation_error','message','invalid deadline'));
  end;
  if v_title is null then
    return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','validation_error','message','title required'));
  end if;

  v_canonical := jsonb_build_object('action',v_action,'request_id',v_request_id,'expected_updated_at',v_expected_at,'payload',jsonb_build_object('order_id',v_order_id,'production_job_id',v_production_id,'idempotency_key',v_idem,'need_ids',(select jsonb_agg(x.id::text order by x.id::text) from unnest(v_need_ids) as x(id)),'task',jsonb_build_object('title',v_title,'priority',v_priority,'deadline',v_deadline,'task_text',v_brief,'reference_link',v_reference)));
  v_hash := encode(extensions.digest(convert_to(v_canonical::text,'UTF8'),'sha256'),'hex');
  if not pg_try_advisory_xact_lock(hashtextextended(v_action||':'||v_idem,0)) then
    return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','duplicate_request','message','request in progress'));
  end if;

  select r.* into v_receipt
  from leader_private.leader_command_receipts r
  where r.action=v_action and r.idempotency_key=v_idem
  for update;
  if found then
    if v_receipt.request_hash<>v_hash then return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','conflict','message','idempotency mismatch')); end if;
    if v_receipt.state='success' then return jsonb_set(v_receipt.response,'{idempotent_replay}','true',true); end if;
    return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','duplicate_request','message','receipt in progress'));
  end if;

  begin
    insert into leader_private.leader_command_receipts(action,idempotency_key,request_id,request_hash,actor_id)
    values(v_action,v_idem,v_request_id,v_hash,v_actor) returning * into v_receipt;

    select o.* into v_order from public.leader_orders o where o.id=v_order_id for update;
    if not found then raise exception 'order not found' using detail='not_found'; end if;
    if v_order.updated_at is distinct from v_expected_at or v_order.is_archived then raise exception 'order conflict' using detail='conflict'; end if;
    v_raw_status := lower(replace(btrim(coalesce(v_order.status,'')),'ё','е'));
    if v_raw_status not in ('новый','макет на согласовании','в производстве','готово','выдано') then raise exception 'terminal or unknown order status' using detail='conflict'; end if;
    if v_order.lead_id is null then raise exception 'lead evidence missing' using detail='validation_error'; end if;
    if (select count(*) from public.leader_lead_needs n where n.id=any(v_need_ids) and n.lead_id=v_order.lead_id)<>cardinality(v_need_ids) then raise exception 'need unavailable' using detail='not_found'; end if;

    for v_need in select n.* from public.leader_lead_needs n where n.id=any(v_need_ids) and n.lead_id=v_order.lead_id order by n.id for share loop
      v_raw_status := lower(replace(btrim(coalesce(v_need.status,'')),'ё','е'));
      if v_need.need_design is not true or v_raw_status in ('архив','архивирован','архивировано','отменен','отменено','отмена','archived','cancelled') then raise exception 'design evidence invalid' using detail='validation_error'; end if;
      if v_need.completeness_score<80 then v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','need_completeness_below_80','need_id',v_need.id,'value',v_need.completeness_score)); end if;
      if jsonb_typeof(v_need.missing_fields)='array' and jsonb_array_length(v_need.missing_fields)>0 then v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','need_missing_fields','need_id',v_need.id,'fields',v_need.missing_fields)); end if;
      if nullif(btrim(v_need.design_reason),'') is null then v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','design_reason_missing','need_id',v_need.id)); end if;
      if v_need.deadline_date is not null and (v_need_deadline is null or v_need.deadline_date<v_need_deadline) then v_need_deadline:=v_need.deadline_date; end if;
    end loop;
    if v_deadline is null and v_need_deadline is not null then v_deadline:=v_need_deadline::timestamptz; end if;
    if v_deadline is null then v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','deadline_missing')); end if;
    if v_production_id is not null and not exists(select 1 from public.leader_production_jobs p where p.id=v_production_id and p.order_id=v_order.id) then raise exception 'production unavailable' using detail='not_found'; end if;
    perform 1 from public.leader_design_tasks d where d.order_id=v_order.id and d.task_status not in ('Завершено','Отменено') for update;
    if found then raise exception 'active design task exists' using detail='conflict'; end if;

    insert into public.leader_design_tasks(owner_id,order_id,production_job_id,title,task_status,layout_status,priority,designer_name,deadline,source,layout_link,reference_link,task_text,created_by)
    values(v_actor,v_order.id,v_production_id,v_title,'Новая','Макет не начат',coalesce(v_priority,v_order.priority,'Обычный'),null,v_deadline,'crm_v4_server_action',null,v_reference,v_brief,v_actor)
    returning * into v_task;
    insert into public.leader_design_task_events(task_id,order_id,event_type,new_status,body,created_by)
    values(v_task.id,v_order.id,'created','Новая','Дизайн-задача создана из подтверждённой потребности заказа.',v_actor)
    returning * into v_event;

    v_response:=jsonb_build_object('ok',true,'request_id',v_request_id,'entity',jsonb_build_object('id',v_task.id,'order_id',v_task.order_id,'production_job_id',v_task.production_job_id,'title',v_task.title,'task_status',v_task.task_status,'layout_status',v_task.layout_status,'priority',v_task.priority,'designer_name',v_task.designer_name,'deadline',v_task.deadline,'source',v_task.source,'layout_link',v_task.layout_link,'reference_link',v_task.reference_link,'created_at',v_task.created_at,'updated_at',v_task.updated_at),'order',jsonb_build_object('id',v_order.id,'order_number',v_order.order_number,'status',v_order.status,'deadline',v_order.deadline,'layout_status',v_order.layout_status,'layout_link',v_order.layout_link),'events',jsonb_build_array(jsonb_build_object('id',v_event.id,'task_id',v_event.task_id,'order_id',v_event.order_id,'event_type',v_event.event_type,'old_status',v_event.old_status,'new_status',v_event.new_status,'created_at',v_event.created_at)),'warnings',v_warnings,'idempotent_replay',false);
    update leader_private.leader_command_receipts r set state='success',response=v_response,updated_at=now(),completed_at=now() where r.id=v_receipt.id;
    return v_response;
  exception
    when unique_violation then return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','conflict','message','active task or receipt conflict'));
    when raise_exception then
      get stacked diagnostics v_error_detail=pg_exception_detail,v_error_message=message_text;
      return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code',coalesce(nullif(v_error_detail,''),'persistence_failed'),'message',coalesce(nullif(v_error_message,''),'persistence failed')));
    when others then return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','persistence_failed','message','task event and receipt rolled back'));
  end;
end
$function$;
