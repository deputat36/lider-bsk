-- STAGING ONLY. Extend the synthetic authenticated E2E lifecycle with catalog fixtures.
-- Target project: lider-bsk-staging / otulfnouybahfnsycxqn.

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

  if to_regclass('public.leader_catalog') is null
     or to_regclass('public.leader_catalog_price_logs') is null
     or to_regprocedure('public.leader_cleanup_authenticated_e2e_rpc(text)') is null then
    raise exception 'catalog_e2e_cleanup_dependencies_missing';
  end if;
end
$guard$;

create or replace function public.leader_inspect_authenticated_e2e_rpc(p_marker text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user uuid;
  v_lead uuid;
  v_order uuid;
  v_catalog uuid[];
begin
  select user_id into v_user
  from public.leader_user_profiles
  where permissions ->> 'synthetic_marker' = p_marker
  limit 1;

  select id into v_lead
  from public.leader_leads
  where payload ->> 'synthetic_marker' = p_marker
  limit 1;

  select converted_order_id into v_order
  from public.leader_leads
  where id = v_lead;

  select coalesce(array_agg(id), '{}') into v_catalog
  from public.leader_catalog
  where owner_id = v_user;

  return jsonb_build_object(
    'ok', true,
    'user_id', v_user,
    'lead_id', v_lead,
    'order_id', v_order,
    'counts', jsonb_build_object(
      'profiles', (select count(*) from public.leader_user_profiles where permissions ->> 'synthetic_marker' = p_marker),
      'leads', (select count(*) from public.leader_leads where payload ->> 'synthetic_marker' = p_marker),
      'needs', (select count(*) from public.leader_lead_needs where lead_id = v_lead),
      'calculations', (select count(*) from public.leader_lead_calculations where lead_id = v_lead),
      'calculation_items', (select count(*) from public.leader_lead_calculation_items where lead_id = v_lead),
      'offers', (select count(*) from public.leader_commercial_offers where lead_id = v_lead),
      'orders', (select count(*) from public.leader_orders where lead_id = v_lead),
      'design_tasks', (select count(*) from public.leader_design_tasks where order_id = v_order),
      'production_jobs', (select count(*) from public.leader_production_jobs where order_id = v_order),
      'installation_jobs', (select count(*) from public.leader_installation_jobs where order_id = v_order),
      'catalog', (select count(*) from public.leader_catalog where id = any(v_catalog)),
      'catalog_logs', (select count(*) from public.leader_catalog_price_logs where catalog_id = any(v_catalog) or changed_by = v_user),
      'catalog_receipts', (select count(*) from leader_private.leader_command_receipts where actor_id = v_user and action = 'catalog.manage')
    )
  );
end
$function$;

create or replace function public.leader_cleanup_authenticated_e2e_rpc(p_marker text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid;
  v_leads uuid[];
  v_orders uuid[];
  v_offers uuid[];
  v_calcs uuid[];
  v_design uuid[];
  v_production uuid[];
  v_installation uuid[];
  v_clients uuid[];
  v_catalog uuid[];
  v_residue jsonb;
begin
  if p_marker !~ '^SYNTH-CRM-E2E-[A-Za-z0-9-]+$' then
    raise exception 'marker_invalid';
  end if;

  select user_id into v_user
  from public.leader_user_profiles
  where permissions ->> 'synthetic_marker' = p_marker
  limit 1;

  select coalesce(array_agg(id), '{}') into v_leads
  from public.leader_leads
  where payload ->> 'synthetic_marker' = p_marker;

  select coalesce(array_agg(id), '{}') into v_orders
  from public.leader_orders
  where lead_id = any(v_leads);

  select coalesce(array_agg(id), '{}') into v_offers
  from public.leader_commercial_offers
  where lead_id = any(v_leads);

  select coalesce(array_agg(id), '{}') into v_calcs
  from public.leader_lead_calculations
  where lead_id = any(v_leads);

  select coalesce(array_agg(id), '{}') into v_design
  from public.leader_design_tasks
  where order_id = any(v_orders);

  select coalesce(array_agg(id), '{}') into v_production
  from public.leader_production_jobs
  where order_id = any(v_orders);

  select coalesce(array_agg(id), '{}') into v_installation
  from public.leader_installation_jobs
  where order_id = any(v_orders);

  select coalesce(array_agg(id), '{}') into v_clients
  from public.leader_clients
  where owner_id = v_user
     or id in (select converted_client_id from public.leader_leads where id = any(v_leads));

  select coalesce(array_agg(id), '{}') into v_catalog
  from public.leader_catalog
  where owner_id = v_user;

  delete from public.leader_installation_comments where job_id = any(v_installation);
  delete from public.leader_installation_events where job_id = any(v_installation) or order_id = any(v_orders);
  delete from public.leader_installation_job_items where job_id = any(v_installation) or order_id = any(v_orders);
  delete from public.leader_installation_jobs where id = any(v_installation);
  delete from public.leader_production_events where job_id = any(v_production) or order_id = any(v_orders);
  delete from public.leader_production_jobs where id = any(v_production);
  delete from public.leader_design_task_events where task_id = any(v_design) or order_id = any(v_orders);
  delete from public.leader_design_tasks where id = any(v_design);
  delete from public.leader_order_status_history where order_id = any(v_orders);
  delete from public.leader_order_items where order_id = any(v_orders);
  update public.leader_commercial_offers set order_id = null where id = any(v_offers);
  update public.leader_lead_calculations set order_id = null where id = any(v_calcs);
  update public.leader_leads set converted_order_id = null, converted_client_id = null where id = any(v_leads);
  delete from public.leader_orders where id = any(v_orders);
  delete from public.leader_commercial_offer_events where offer_id = any(v_offers) or lead_id = any(v_leads);
  delete from public.leader_commercial_offers where id = any(v_offers);
  delete from public.leader_lead_calculation_items where calculation_id = any(v_calcs) or lead_id = any(v_leads);
  delete from public.leader_lead_calculations where id = any(v_calcs);
  delete from public.leader_lead_needs where lead_id = any(v_leads);
  delete from public.leader_lead_events where lead_id = any(v_leads);
  delete from public.leader_leads where id = any(v_leads);
  delete from public.leader_clients where id = any(v_clients);

  delete from public.leader_catalog_price_logs
  where catalog_id = any(v_catalog) or changed_by = v_user;
  delete from public.leader_catalog where id = any(v_catalog);

  delete from leader_private.leader_command_receipts where actor_id = v_user;
  delete from public.leader_user_profiles
  where user_id = v_user and permissions ->> 'synthetic_marker' = p_marker;

  v_residue := jsonb_build_object(
    'profiles', (select count(*) from public.leader_user_profiles where permissions ->> 'synthetic_marker' = p_marker),
    'leads', (select count(*) from public.leader_leads where payload ->> 'synthetic_marker' = p_marker),
    'clients', (select count(*) from public.leader_clients where id = any(v_clients)),
    'needs', (select count(*) from public.leader_lead_needs where lead_id = any(v_leads)),
    'calculation_items', (select count(*) from public.leader_lead_calculation_items where calculation_id = any(v_calcs)),
    'calculations', (select count(*) from public.leader_lead_calculations where id = any(v_calcs)),
    'offers', (select count(*) from public.leader_commercial_offers where id = any(v_offers)),
    'offer_events', (select count(*) from public.leader_commercial_offer_events where offer_id = any(v_offers)),
    'orders', (select count(*) from public.leader_orders where id = any(v_orders)),
    'order_items', (select count(*) from public.leader_order_items where order_id = any(v_orders)),
    'order_events', (select count(*) from public.leader_order_status_history where order_id = any(v_orders)),
    'design_tasks', (select count(*) from public.leader_design_tasks where id = any(v_design)),
    'production_jobs', (select count(*) from public.leader_production_jobs where id = any(v_production)),
    'installation_jobs', (select count(*) from public.leader_installation_jobs where id = any(v_installation)),
    'catalog', (select count(*) from public.leader_catalog where id = any(v_catalog)),
    'catalog_logs', (select count(*) from public.leader_catalog_price_logs where catalog_id = any(v_catalog) or changed_by = v_user),
    'catalog_receipts', (select count(*) from leader_private.leader_command_receipts where actor_id = v_user and action = 'catalog.manage'),
    'payments', 0,
    'expenses', 0,
    'interactions_followups', 0,
    'command_receipts', (select count(*) from leader_private.leader_command_receipts where actor_id = v_user)
  );

  return jsonb_build_object('ok', true, 'auth_user_id', v_user, 'residue', v_residue);
end
$function$;

comment on function public.leader_inspect_authenticated_e2e_rpc(text) is
  'STAGING ONLY. Service-role inspection of synthetic authenticated E2E fixtures, including catalog rows/logs/receipts.';
comment on function public.leader_cleanup_authenticated_e2e_rpc(text) is
  'STAGING ONLY. Service-role synthetic cleanup including catalog rows, price logs and command receipts.';

revoke all on function public.leader_inspect_authenticated_e2e_rpc(text) from public, anon, authenticated;
revoke all on function public.leader_cleanup_authenticated_e2e_rpc(text) from public, anon, authenticated;
grant execute on function public.leader_inspect_authenticated_e2e_rpc(text) to service_role;
grant execute on function public.leader_cleanup_authenticated_e2e_rpc(text) to service_role;
