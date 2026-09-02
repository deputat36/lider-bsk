-- STAGING ONLY.
-- Target: lider-bsk-staging / otulfnouybahfnsycxqn.
-- Browser-safe read/write surface and atomic offer/design transitions for issue #487.

do $guard$
begin
  if not exists (
    select 1 from leader_staging.environment_guard
    where singleton = true
      and project_ref = 'otulfnouybahfnsycxqn'
      and environment_name = 'staging'
      and repository = 'deputat36/lider-bsk'
  ) then
    raise exception 'staging_environment_guard_failed';
  end if;
  if to_regclass('leader_private.leader_command_receipts') is null
     or to_regprocedure('leader_private.leader_actor_has_crm_action(uuid,text)') is null
     or to_regprocedure('leader_private.leader_has_crm_action(text)') is null then
    raise exception 'staging_authenticated_e2e_dependencies_missing';
  end if;
end
$guard$;

alter table public.leader_lead_needs
  add column if not exists installation_reason text,
  add column if not exists deadline_text text,
  add column if not exists files jsonb not null default '[]'::jsonb;

alter table public.leader_lead_needs
  drop constraint if exists leader_lead_needs_files_array_check;
alter table public.leader_lead_needs
  add constraint leader_lead_needs_files_array_check
  check (jsonb_typeof(files) = 'array');

-- Direct browser reads are still protected by the canonical server-side action matrix.
create policy leader_lead_needs_crm_read_staging on public.leader_lead_needs
  for select to authenticated
  using ((select leader_private.leader_has_crm_action('needs.read')));
create policy leader_lead_needs_crm_insert_staging on public.leader_lead_needs
  for insert to authenticated
  with check ((select leader_private.leader_has_crm_action('needs.write')) and created_by = (select auth.uid()));
create policy leader_lead_needs_crm_update_staging on public.leader_lead_needs
  for update to authenticated
  using ((select leader_private.leader_has_crm_action('needs.write')))
  with check ((select leader_private.leader_has_crm_action('needs.write')) and updated_by = (select auth.uid()));

create policy leader_calculations_crm_read_staging on public.leader_lead_calculations
  for select to authenticated
  using ((select leader_private.leader_has_crm_action('calculations.read')));
create policy leader_calculation_items_crm_read_staging on public.leader_lead_calculation_items
  for select to authenticated
  using ((select leader_private.leader_has_crm_action('calculations.read')));
create policy leader_offers_crm_read_staging on public.leader_commercial_offers
  for select to authenticated
  using ((select leader_private.leader_has_crm_action('offers.read')));
create policy leader_offer_events_crm_read_staging on public.leader_commercial_offer_events
  for select to authenticated
  using ((select leader_private.leader_has_crm_action('offers.read')));
create policy leader_production_jobs_crm_read_staging on public.leader_production_jobs
  for select to authenticated
  using ((select leader_private.leader_has_crm_action('production.read')));
create policy leader_production_events_crm_read_staging on public.leader_production_events
  for select to authenticated
  using ((select leader_private.leader_has_crm_action('production.read')));
create policy leader_installation_jobs_crm_read_staging on public.leader_installation_jobs
  for select to authenticated
  using ((select leader_private.leader_has_crm_action('installation.read')));

grant select, insert, update on public.leader_lead_needs to authenticated;
grant select on public.leader_lead_calculations, public.leader_lead_calculation_items,
  public.leader_commercial_offers, public.leader_commercial_offer_events to authenticated;

grant select (id, order_id, title, production_status, layout_status, priority, deadline,
  sent_to_contractor_at, ready_at, issued_at, file_url, technical_task,
  contractor_comment, created_at, updated_at)
  on public.leader_production_jobs to authenticated;
grant select (id, job_id, order_id, event_type, old_status, new_status, body, created_at)
  on public.leader_production_events to authenticated;
grant select (id, order_id, production_job_id, title, install_status, priority,
  installer_name, installer_phone, address, scheduled_at, started_at, completed_at,
  technical_task, tools_required, installer_comment, before_photo_url, after_photo_url,
  created_at, updated_at)
  on public.leader_installation_jobs to authenticated;

grant select, update on public.leader_commercial_offers, public.leader_lead_calculations,
  public.leader_leads, public.leader_design_tasks, public.leader_orders to service_role;
grant insert on public.leader_commercial_offer_events, public.leader_design_task_events to service_role;
grant select, insert, update on leader_private.leader_command_receipts to service_role;

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
     or v_request ->> 'action' <> 'offer.transition'
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
    values(v_offer.id,v_offer.lead_id,v_offer.calculation_id,'Изменение статуса КП',null,v_target,'Атомарный переход staging CRM',v_actor,left(lower(p_payload->>'actor_email'),240),v_now);
  v_response := jsonb_build_object('ok',true,'request_id',v_request_id,'offer',to_jsonb(v_offer),'calculation',to_jsonb(v_calc),'lead',to_jsonb(v_lead),'idempotent_replay',false);
  insert into leader_private.leader_command_receipts(action,idempotency_key,request_id,request_hash,actor_id,state,response,created_at,updated_at,completed_at)
    values('offer.transition',v_key,v_request_id,v_hash,v_actor,'success',v_response,v_now,v_now,v_now);
  return v_response;
exception when others then
  return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','persistence_failed'));
end
$function$;

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
     or char_length(coalesce(v_layout_link,'')) > 2000 then
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
  update public.leader_design_tasks set task_status=v_target,
    layout_status=case when v_target='Согласовано' then 'Макет согласован' else v_target end,
    layout_link=coalesce(v_layout_link,layout_link),
    started_at=case when v_target='В работе' then coalesce(started_at,v_now) else started_at end,
    sent_to_client_at=case when v_target='На согласовании' then coalesce(sent_to_client_at,v_now) else sent_to_client_at end,
    approved_at=case when v_target='Согласовано' then coalesce(approved_at,v_now) else null end,
    updated_by=v_actor,updated_at=v_now where id=v_task.id returning * into v_task;
  if v_task.order_id is not null then
    select * into v_order from public.leader_orders where id=v_task.order_id for update;
    update public.leader_orders set
      layout_status=case when v_target='Согласовано' then 'Макет согласован' else v_target end,
      layout_link=coalesce(v_layout_link,layout_link),
      status=case when v_target='На согласовании' then 'Макет на согласовании' else status end,
      current_stage=case when v_target='Согласовано' then 'Макет согласован' else 'Дизайн: '||v_target end,
      next_action=case when v_target='Согласовано' then 'Передать в производство' else 'Завершить согласование макета' end,
      updated_at=v_now,stage_updated_at=v_now where id=v_task.order_id returning * into v_order;
  end if;
  insert into public.leader_design_task_events(task_id,order_id,event_type,old_status,new_status,body,created_by,created_at)
    values(v_task.id,v_task.order_id,'status',null,v_target,'Атомарный переход staging CRM',v_actor,v_now);
  v_response := jsonb_build_object('ok',true,'request_id',v_request_id,'task',to_jsonb(v_task),'order',to_jsonb(v_order),'idempotent_replay',false);
  insert into leader_private.leader_command_receipts(action,idempotency_key,request_id,request_hash,actor_id,state,response,created_at,updated_at,completed_at)
    values('design_task.transition',v_key,v_request_id,v_hash,v_actor,'success',v_response,v_now,v_now,v_now);
  return v_response;
exception when others then
  return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','persistence_failed'));
end
$function$;

revoke all on function public.leader_transition_offer_rpc(jsonb) from public, anon, authenticated;
revoke all on function public.leader_transition_design_task_rpc(jsonb) from public, anon, authenticated;
grant execute on function public.leader_transition_offer_rpc(jsonb) to service_role;
grant execute on function public.leader_transition_design_task_rpc(jsonb) to service_role;
