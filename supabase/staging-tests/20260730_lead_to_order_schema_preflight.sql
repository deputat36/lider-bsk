-- STAGING ONLY. Read-only catalog preflight for the lead-to-order acceptance test.
-- It creates no fixture and changes no schema or data.

\set ON_ERROR_STOP on

do $preflight$
declare
  v_missing_tables text[];
  v_missing_columns text[];
  v_missing_rpcs text[];
begin
  if not exists (
    select 1 from leader_staging.environment_guard
    where singleton = true
      and project_ref = 'otulfnouybahfnsycxqn'
      and environment_name = 'staging'
      and repository = 'deputat36/lider-bsk'
  ) then raise exception 'staging_environment_guard_failed'; end if;

  select array_agg(name order by name) into v_missing_tables
  from unnest(array[
    'leader_user_profiles','leader_leads','leader_clients','leader_lead_needs',
    'leader_lead_calculations','leader_lead_calculation_items',
    'leader_commercial_offers','leader_commercial_offer_events','leader_orders',
    'leader_order_items','leader_order_status_history'
  ]) name
  where to_regclass('public.' || name) is null;

  select array_agg(format('%s.%s', expected.table_name, expected.column_name) order by 1)
  into v_missing_columns
  from (values
    ('leader_leads','assigned_to'), ('leader_leads','next_contact_at'),
    ('leader_leads','converted_client_id'), ('leader_leads','converted_order_id'),
    ('leader_lead_needs','client_id'), ('leader_lead_needs','need_installation'),
    ('leader_clients','owner_id'), ('leader_clients','name'), ('leader_clients','phone'),
    ('leader_lead_calculations','client_id'), ('leader_lead_calculations','need_id'),
    ('leader_lead_calculations','client_total'), ('leader_lead_calculations','contractor_cost'),
    ('leader_lead_calculations','profit'), ('leader_lead_calculations','order_id'),
    ('leader_lead_calculation_items','catalog_id'), ('leader_lead_calculation_items','category'),
    ('leader_lead_calculation_items','item_type'), ('leader_lead_calculation_items','qty'),
    ('leader_lead_calculation_items','contractor_price'), ('leader_lead_calculation_items','contractor_sum'),
    ('leader_lead_calculation_items','markup_percent'), ('leader_lead_calculation_items','client_sum'),
    ('leader_lead_calculation_items','data'), ('leader_lead_calculation_items','sort_order'),
    ('leader_commercial_offers','calculation_id'), ('leader_commercial_offers','client_id'),
    ('leader_commercial_offers','order_id'), ('leader_commercial_offers','total_sum'),
    ('leader_orders','client_id'), ('leader_orders','source'), ('leader_orders','layout_comment'),
    ('leader_orders','owner_id'), ('leader_orders','lead_id'), ('leader_orders','project_name'),
    ('leader_orders','client_name'), ('leader_orders','client_phone'), ('leader_orders','deadline'),
    ('leader_orders','contractor_cost'), ('leader_orders','client_total'), ('leader_orders','profit'),
    ('leader_orders','prepayment'), ('leader_orders','balance'), ('leader_orders','layout_status'),
    ('leader_orders','production_status'), ('leader_orders','data'),
    ('leader_order_items','order_id'), ('leader_order_items','quantity'),
    ('leader_order_items','contractor_sum'), ('leader_order_items','client_sum'),
    ('leader_commercial_offer_events','offer_id'), ('leader_commercial_offer_events','event_type'),
    ('leader_order_status_history','order_id'), ('leader_order_status_history','new_status')
  ) expected(table_name,column_name)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema='public' and c.table_name=expected.table_name
      and c.column_name=expected.column_name
  );

  select array_agg(signature order by signature) into v_missing_rpcs
  from unnest(array[
    'public.leader_create_calculation_version_rpc(jsonb)',
    'public.leader_create_offer_from_calculation_rpc(jsonb)',
    'public.leader_create_order_from_offer_rpc(jsonb)'
  ]) signature
  where to_regprocedure(signature) is null;

  if v_missing_tables is not null or v_missing_columns is not null or v_missing_rpcs is not null then
    raise exception 'lead_to_order_schema_preflight_failed tables=% columns=% rpcs=%',
      coalesce(array_to_string(v_missing_tables, ','), '-'),
      coalesce(array_to_string(v_missing_columns, ','), '-'),
      coalesce(array_to_string(v_missing_rpcs, ','), '-');
  end if;

  raise notice 'lead-to-order schema preflight: OK';
end $preflight$;
