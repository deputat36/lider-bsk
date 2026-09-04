-- STAGING ONLY acceptance test for issue #169.
-- This script is transaction-scoped and leaves no residue.

begin;

do $test$
declare
  v_owner_id uuid := gen_random_uuid();
  v_catalog_id uuid;
  v_lead_id uuid;
  v_calculation_id uuid;
  v_item_id uuid;
  v_saved_catalog_id uuid;
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

  if to_regclass('public.leader_catalog') is null then
    raise exception 'leader_catalog_missing';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'leader_lead_calculation_items_catalog_id_fkey'
      and conrelid = 'public.leader_lead_calculation_items'::regclass
  ) then
    raise exception 'catalog_id_foreign_key_missing';
  end if;

  insert into public.leader_catalog (
    owner_id,
    category,
    name,
    unit,
    contractor_price,
    is_active,
    sort_order,
    description,
    item_type,
    markup_percent,
    min_client_price,
    default_client_price,
    calculation_mode,
    settings
  ) values (
    v_owner_id,
    'STAGING E2E',
    'Synthetic catalog_id acceptance #169',
    'шт',
    1000,
    true,
    169,
    'Synthetic transaction-only fixture',
    'Изготовление',
    50,
    0,
    1500,
    'fixed',
    jsonb_build_object('synthetic', true, 'issue', 169)
  ) returning id into v_catalog_id;

  insert into public.leader_leads (
    name,
    source,
    message,
    payload
  ) values (
    'STAGING synthetic #169',
    'staging_e2e',
    'catalog_id acceptance fixture',
    jsonb_build_object('synthetic', true, 'issue', 169)
  ) returning id into v_lead_id;

  insert into public.leader_lead_calculations (
    lead_id,
    title,
    status,
    version_number,
    client_total,
    contractor_cost,
    profit,
    margin_percent,
    warning_level,
    warnings
  ) values (
    v_lead_id,
    'Catalog-backed staging acceptance #169',
    'Черновик',
    1,
    1500,
    1000,
    500,
    33.3333,
    'ok',
    '[]'::jsonb
  ) returning id into v_calculation_id;

  insert into public.leader_lead_calculation_items (
    calculation_id,
    lead_id,
    catalog_id,
    category,
    item_type,
    name,
    unit,
    qty,
    contractor_price,
    contractor_sum,
    markup_percent,
    client_price,
    client_sum,
    profit,
    margin_percent,
    comment,
    data,
    sort_order
  ) values (
    v_calculation_id,
    v_lead_id,
    v_catalog_id,
    'STAGING E2E',
    'Изготовление',
    'Synthetic catalog_id acceptance #169',
    'шт',
    1,
    1000,
    1000,
    50,
    1500,
    1500,
    500,
    33.3333,
    'Transaction-only acceptance row',
    jsonb_build_object(
      'synthetic', true,
      'issue', 169,
      'price_source', 'catalog',
      'catalog_snapshot', jsonb_build_object(
        'catalog_id', v_catalog_id,
        'contractor_price', 1000,
        'client_price', 1500
      )
    ),
    0
  ) returning id, catalog_id into v_item_id, v_saved_catalog_id;

  if v_saved_catalog_id is distinct from v_catalog_id then
    raise exception 'catalog_id_not_persisted';
  end if;

  if not exists (
    select 1
    from public.leader_lead_calculation_items item
    join public.leader_catalog catalog on catalog.id = item.catalog_id
    where item.id = v_item_id
      and item.calculation_id = v_calculation_id
      and item.lead_id = v_lead_id
      and catalog.id = v_catalog_id
  ) then
    raise exception 'catalog_backed_calculation_join_failed';
  end if;

  raise notice 'PASS: catalog-backed calculation item persisted catalog_id and joined leader_catalog';
end
$test$;

rollback;
