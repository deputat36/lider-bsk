-- STAGING ONLY. OIDC-controlled synthetic fixture lifecycle for issue #487.
do $guard$
begin
  if not exists (select 1 from leader_staging.environment_guard where singleton=true and project_ref='otulfnouybahfnsycxqn') then
    raise exception 'staging_environment_guard_failed';
  end if;
end
$guard$;

create or replace function public.leader_prepare_authenticated_e2e_rpc(p_run_key text,p_user_id uuid,p_email text,p_marker text)
returns jsonb language plpgsql security invoker set search_path=''
as $function$
declare v_lead public.leader_leads%rowtype;
begin
  if p_user_id is null or p_run_key !~ '^[0-9]+:[0-9]+$' or p_marker !~ '^SYNTH-CRM-E2E-[A-Za-z0-9-]+$'
     or char_length(p_email)>320 then raise exception 'fixture_input_invalid'; end if;
  if exists(select 1 from public.leader_user_profiles where user_id=p_user_id) then raise exception 'fixture_user_exists'; end if;
  insert into public.leader_user_profiles(user_id,email,full_name,role,is_active,permissions)
    values(p_user_id,lower(p_email),p_marker,'manager',true,jsonb_build_object('synthetic_marker',p_marker,'run_key',p_run_key));
  insert into public.leader_leads(status,name,phone,source,message,payload,service,request_id,assigned_to)
    values('Новая',p_marker,null,'Synthetic E2E',p_marker,jsonb_build_object('synthetic_marker',p_marker,'run_key',p_run_key),'Synthetic advertising',p_marker,null)
    returning * into v_lead;
  return jsonb_build_object('ok',true,'lead_id',v_lead.id,'lead_updated_at',v_lead.updated_at,'marker',p_marker,'role','manager');
end
$function$;

create or replace function public.leader_set_authenticated_e2e_role_rpc(p_user_id uuid,p_marker text,p_role text)
returns jsonb language plpgsql security invoker set search_path=''
as $function$
declare v_count int;
begin
  if p_role not in ('owner','admin','manager','designer','contractor','installer','accountant') then raise exception 'role_invalid'; end if;
  update public.leader_user_profiles set role=p_role,updated_at=clock_timestamp()
    where user_id=p_user_id and permissions->>'synthetic_marker'=p_marker;
  get diagnostics v_count=row_count;
  if v_count<>1 then raise exception 'fixture_profile_not_found'; end if;
  return jsonb_build_object('ok',true,'role',p_role);
end
$function$;

create or replace function public.leader_inspect_authenticated_e2e_rpc(p_marker text)
returns jsonb language plpgsql security invoker set search_path=''
as $function$
declare v_user uuid; v_lead uuid; v_order uuid;
begin
  select user_id into v_user from public.leader_user_profiles where permissions->>'synthetic_marker'=p_marker limit 1;
  select id into v_lead from public.leader_leads where payload->>'synthetic_marker'=p_marker limit 1;
  select converted_order_id into v_order from public.leader_leads where id=v_lead;
  return jsonb_build_object('ok',true,'user_id',v_user,'lead_id',v_lead,'order_id',v_order,
    'counts',jsonb_build_object(
      'profiles',(select count(*) from public.leader_user_profiles where permissions->>'synthetic_marker'=p_marker),
      'leads',(select count(*) from public.leader_leads where payload->>'synthetic_marker'=p_marker),
      'needs',(select count(*) from public.leader_lead_needs where lead_id=v_lead),
      'calculations',(select count(*) from public.leader_lead_calculations where lead_id=v_lead),
      'calculation_items',(select count(*) from public.leader_lead_calculation_items where lead_id=v_lead),
      'offers',(select count(*) from public.leader_commercial_offers where lead_id=v_lead),
      'orders',(select count(*) from public.leader_orders where lead_id=v_lead),
      'design_tasks',(select count(*) from public.leader_design_tasks where order_id=v_order),
      'production_jobs',(select count(*) from public.leader_production_jobs where order_id=v_order),
      'installation_jobs',(select count(*) from public.leader_installation_jobs where order_id=v_order)
    ));
end
$function$;

create or replace function public.leader_cleanup_authenticated_e2e_rpc(p_marker text)
returns jsonb language plpgsql security invoker set search_path=''
as $function$
declare v_user uuid; v_leads uuid[]; v_orders uuid[]; v_offers uuid[]; v_calcs uuid[];
  v_design uuid[]; v_production uuid[]; v_installation uuid[]; v_clients uuid[]; v_residue jsonb;
begin
  if p_marker !~ '^SYNTH-CRM-E2E-[A-Za-z0-9-]+$' then raise exception 'marker_invalid'; end if;
  select user_id into v_user from public.leader_user_profiles where permissions->>'synthetic_marker'=p_marker limit 1;
  select coalesce(array_agg(id),'{}') into v_leads from public.leader_leads where payload->>'synthetic_marker'=p_marker;
  select coalesce(array_agg(id),'{}') into v_orders from public.leader_orders where lead_id=any(v_leads);
  select coalesce(array_agg(id),'{}') into v_offers from public.leader_commercial_offers where lead_id=any(v_leads);
  select coalesce(array_agg(id),'{}') into v_calcs from public.leader_lead_calculations where lead_id=any(v_leads);
  select coalesce(array_agg(id),'{}') into v_design from public.leader_design_tasks where order_id=any(v_orders);
  select coalesce(array_agg(id),'{}') into v_production from public.leader_production_jobs where order_id=any(v_orders);
  select coalesce(array_agg(id),'{}') into v_installation from public.leader_installation_jobs where order_id=any(v_orders);
  select coalesce(array_agg(id),'{}') into v_clients from public.leader_clients where owner_id=v_user or id in (select converted_client_id from public.leader_leads where id=any(v_leads));

  delete from public.leader_installation_comments where job_id=any(v_installation);
  delete from public.leader_installation_events where job_id=any(v_installation) or order_id=any(v_orders);
  delete from public.leader_installation_job_items where job_id=any(v_installation) or order_id=any(v_orders);
  delete from public.leader_installation_jobs where id=any(v_installation);
  delete from public.leader_production_events where job_id=any(v_production) or order_id=any(v_orders);
  delete from public.leader_production_jobs where id=any(v_production);
  delete from public.leader_design_task_events where task_id=any(v_design) or order_id=any(v_orders);
  delete from public.leader_design_tasks where id=any(v_design);
  delete from public.leader_order_status_history where order_id=any(v_orders);
  delete from public.leader_order_items where order_id=any(v_orders);
  update public.leader_commercial_offers set order_id=null where id=any(v_offers);
  update public.leader_lead_calculations set order_id=null where id=any(v_calcs);
  update public.leader_leads set converted_order_id=null,converted_client_id=null where id=any(v_leads);
  delete from public.leader_orders where id=any(v_orders);
  delete from public.leader_commercial_offer_events where offer_id=any(v_offers) or lead_id=any(v_leads);
  delete from public.leader_commercial_offers where id=any(v_offers);
  delete from public.leader_lead_calculation_items where calculation_id=any(v_calcs) or lead_id=any(v_leads);
  delete from public.leader_lead_calculations where id=any(v_calcs);
  delete from public.leader_lead_needs where lead_id=any(v_leads);
  delete from public.leader_lead_events where lead_id=any(v_leads);
  delete from public.leader_leads where id=any(v_leads);
  delete from public.leader_clients where id=any(v_clients);
  delete from leader_private.leader_command_receipts where actor_id=v_user;
  delete from public.leader_user_profiles where user_id=v_user and permissions->>'synthetic_marker'=p_marker;

  v_residue:=jsonb_build_object(
    'profiles',(select count(*) from public.leader_user_profiles where permissions->>'synthetic_marker'=p_marker),
    'leads',(select count(*) from public.leader_leads where payload->>'synthetic_marker'=p_marker),
    'clients',(select count(*) from public.leader_clients where id=any(v_clients)),
    'needs',(select count(*) from public.leader_lead_needs where lead_id=any(v_leads)),
    'calculation_items',(select count(*) from public.leader_lead_calculation_items where calculation_id=any(v_calcs)),
    'calculations',(select count(*) from public.leader_lead_calculations where id=any(v_calcs)),
    'offers',(select count(*) from public.leader_commercial_offers where id=any(v_offers)),
    'offer_events',(select count(*) from public.leader_commercial_offer_events where offer_id=any(v_offers)),
    'orders',(select count(*) from public.leader_orders where id=any(v_orders)),
    'order_items',(select count(*) from public.leader_order_items where order_id=any(v_orders)),
    'order_events',(select count(*) from public.leader_order_status_history where order_id=any(v_orders)),
    'design_tasks',(select count(*) from public.leader_design_tasks where id=any(v_design)),
    'production_jobs',(select count(*) from public.leader_production_jobs where id=any(v_production)),
    'installation_jobs',(select count(*) from public.leader_installation_jobs where id=any(v_installation)),
    'payments',0,'expenses',0,'interactions_followups',0,
    'command_receipts',(select count(*) from leader_private.leader_command_receipts where actor_id=v_user)
  );
  return jsonb_build_object('ok',true,'auth_user_id',v_user,'residue',v_residue);
end
$function$;

revoke all on function public.leader_prepare_authenticated_e2e_rpc(text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.leader_set_authenticated_e2e_role_rpc(uuid,text,text) from public,anon,authenticated;
revoke all on function public.leader_inspect_authenticated_e2e_rpc(text) from public,anon,authenticated;
revoke all on function public.leader_cleanup_authenticated_e2e_rpc(text) from public,anon,authenticated;
grant execute on function public.leader_prepare_authenticated_e2e_rpc(text,uuid,text,text) to service_role;
grant execute on function public.leader_set_authenticated_e2e_role_rpc(uuid,text,text) to service_role;
grant execute on function public.leader_inspect_authenticated_e2e_rpc(text) to service_role;
grant execute on function public.leader_cleanup_authenticated_e2e_rpc(text) to service_role;
