-- Leader catalog command; exact staging business implementation, scoped ACL cutover.
-- Target: ofewxuqfjhamgerwzull. No business rows or shared Auth/core are rewritten.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';
DO $preflight$ BEGIN
  IF to_regclass('leader_staging.environment_guard') IS NOT NULL THEN RAISE EXCEPTION 'production_only'; END IF;
  IF NOT EXISTS (SELECT 1 FROM leader_private.leader_rollout_backups WHERE id='order-finance-20261001-v1' AND project_ref='ofewxuqfjhamgerwzull') THEN RAISE EXCEPTION 'approved_production_core_missing'; END IF;
  IF EXISTS (SELECT 1 FROM leader_private.leader_rollout_backups WHERE id='catalog-management-20261014-v1') THEN RAISE EXCEPTION 'catalog_already_installed'; END IF;
  IF to_regprocedure('public.leader_manage_catalog_rpc(jsonb)') IS NOT NULL OR to_regprocedure('leader_private.leader_discard_catalog_command_receipt(uuid,uuid)') IS NOT NULL THEN RAISE EXCEPTION 'unexpected_catalog_function'; END IF;
  IF to_regprocedure('leader_private.leader_actor_has_crm_action(uuid,text)') IS NULL OR to_regprocedure('leader_private.leader_has_crm_action(text)') IS NULL THEN RAISE EXCEPTION 'canonical_rbac_missing'; END IF;
  IF has_table_privilege('anon','leader_private.leader_rollout_backups','SELECT') OR has_table_privilege('authenticated','leader_private.leader_rollout_backups','SELECT') OR has_table_privilege('service_role','leader_private.leader_rollout_backups','SELECT') THEN RAISE EXCEPTION 'backup_exposed'; END IF;
  IF (SELECT count(*) FROM leader_private.leader_role_action_matrix_v1 WHERE role IN ('owner','admin') AND 'catalog.manage'=ANY(allowed_actions)) <> 2 THEN RAISE EXCEPTION 'catalog_manage_matrix_mismatch'; END IF;
  IF EXISTS (SELECT 1 FROM leader_private.leader_role_action_matrix_v1 WHERE role NOT IN ('owner','admin') AND 'catalog.manage'=ANY(allowed_actions)) THEN RAISE EXCEPTION 'unexpected_catalog_writer'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='leader_catalog_price_logs' AND policyname='leader catalog price logs select active users' AND cmd='SELECT') THEN RAISE EXCEPTION 'price_log_policy_drift'; END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE oid IN ('public.leader_catalog'::regclass,'public.leader_catalog_price_logs'::regclass) AND NOT relrowsecurity) THEN RAISE EXCEPTION 'catalog_rls_missing'; END IF;
END $preflight$;
LOCK TABLE public.leader_catalog, public.leader_catalog_price_logs IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO leader_private.leader_rollout_backups(id,project_ref,data_snapshot,metadata_snapshot,edge_snapshot)
SELECT 'catalog-management-20261014-v1','ofewxuqfjhamgerwzull',jsonb_build_object(
  'leader_catalog',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM public.leader_catalog t),
  'leader_catalog_price_logs',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM public.leader_catalog_price_logs t)),jsonb_build_object(
  'policies',(SELECT jsonb_agg(to_jsonb(p)) FROM pg_policies p WHERE schemaname='public' AND tablename IN ('leader_catalog','leader_catalog_price_logs')),
  'tables',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'acl',c.relacl,'rls',c.relrowsecurity,'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'acl',a.attacl)) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped))) FROM pg_class c WHERE c.oid IN ('public.leader_catalog'::regclass,'public.leader_catalog_price_logs'::regclass))),
  '{"leader-crm-catalog":"absent"}'::jsonb;
create or replace function leader_private.leader_discard_catalog_command_receipt(
  p_receipt_id uuid,
  p_actor_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_deleted integer := 0;
begin
  if p_receipt_id is null or p_actor_id is null then
    return false;
  end if;

  delete from leader_private.leader_command_receipts
  where id = p_receipt_id
    and actor_id = p_actor_id
    and action = 'catalog.manage'
    and state = 'in_progress';
  get diagnostics v_deleted = row_count;

  return v_deleted = 1;
end
$function$;

comment on function leader_private.leader_discard_catalog_command_receipt(uuid, uuid) is
  'Production candidate private helper. Discards only an in-progress catalog.manage receipt owned by the supplied actor; browser roles cannot execute it.';

revoke all on function leader_private.leader_discard_catalog_command_receipt(uuid, uuid)
  from public, anon, authenticated;
grant execute on function leader_private.leader_discard_catalog_command_receipt(uuid, uuid)
  to service_role;
create or replace function public.leader_manage_catalog_rpc(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_actor_id uuid;
  v_actor_email text;
  v_request jsonb;
  v_payload jsonb;
  v_patch jsonb;
  v_action text;
  v_operation text;
  v_request_id uuid;
  v_expected_updated_at timestamptz;
  v_catalog_id uuid;
  v_idempotency_key text;
  v_reason text;
  v_request_hash text;
  v_canonical jsonb;
  v_receipt leader_private.leader_command_receipts%rowtype;
  v_row public.leader_catalog%rowtype;
  v_before public.leader_catalog%rowtype;
  v_response jsonb;
  v_old_values jsonb;
  v_new_values jsonb;
  v_name text;
  v_category text;
  v_unit text;
  v_description text;
  v_item_type text;
  v_calculation_mode text;
  v_settings jsonb;
  v_contractor_price numeric;
  v_markup_percent numeric;
  v_min_client_price numeric;
  v_default_client_price numeric;
  v_sort_order integer;
  v_is_active boolean;
  v_pricing_changed boolean := false;
  v_status_changed boolean := false;
  v_any_changed boolean := false;
  v_change_type text;
  v_receipt_inserted boolean := false;
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
  v_actor_email := left(nullif(btrim(coalesce(p_payload ->> 'actor_email', '')), ''), 240);

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

  v_action := btrim(coalesce(v_request ->> 'action', ''));
  if v_action <> 'catalog.manage' then
    return jsonb_build_object('ok', false, 'request_id', v_request ->> 'request_id',
      'error', jsonb_build_object('code', 'unknown_action', 'message', 'Unsupported action'));
  end if;

  begin
    v_request_id := nullif(btrim(v_request ->> 'request_id'), '')::uuid;
    if nullif(btrim(coalesce(v_request ->> 'expected_updated_at', '')), '') is not null then
      v_expected_updated_at := (v_request ->> 'expected_updated_at')::timestamptz;
    end if;
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
    where key not in ('operation', 'catalog_id', 'idempotency_key', 'reason', 'patch')
  ) then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'invalid_payload', 'message', 'Unknown business payload field'));
  end if;

  v_operation := lower(btrim(coalesce(v_payload ->> 'operation', '')));
  v_idempotency_key := nullif(btrim(coalesce(v_payload ->> 'idempotency_key', '')), '');
  v_reason := left(nullif(btrim(coalesce(v_payload ->> 'reason', '')), ''), 1000);
  v_patch := v_payload -> 'patch';

  if v_operation not in ('create', 'update')
     or v_actor_id is null
     or v_request_id is null
     or v_idempotency_key is null
     or char_length(v_idempotency_key) > 160
     or v_patch is null
     or jsonb_typeof(v_patch) <> 'object' then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'invalid_payload', 'message', 'Required command fields are missing or invalid'));
  end if;

  if exists (
    select 1 from jsonb_object_keys(v_patch) as k(key)
    where key not in (
      'category', 'name', 'unit', 'contractor_price', 'is_active', 'sort_order',
      'description', 'item_type', 'markup_percent', 'min_client_price',
      'default_client_price', 'calculation_mode', 'settings'
    )
  ) then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'invalid_payload', 'message', 'Patch contains unknown or server-owned fields'));
  end if;

  if v_operation = 'update' then
    begin
      v_catalog_id := nullif(btrim(coalesce(v_payload ->> 'catalog_id', '')), '')::uuid;
    exception when others then
      return jsonb_build_object('ok', false, 'request_id', v_request_id,
        'error', jsonb_build_object('code', 'invalid_payload', 'message', 'catalog_id must be UUID'));
    end;
    if v_catalog_id is null or v_expected_updated_at is null then
      return jsonb_build_object('ok', false, 'request_id', v_request_id,
        'error', jsonb_build_object('code', 'invalid_payload', 'message', 'catalog_id and expected_updated_at are required for update'));
    end if;
  elsif v_expected_updated_at is not null or nullif(btrim(coalesce(v_payload ->> 'catalog_id', '')), '') is not null then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'invalid_payload', 'message', 'Create must not contain catalog_id or expected_updated_at'));
  end if;

  if not leader_private.leader_actor_has_crm_action(v_actor_id, 'catalog.manage') then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'forbidden', 'message', 'catalog.manage permission is required'));
  end if;

  -- Validate supplied scalar values before reserving the idempotency receipt.
  begin
    if v_patch ? 'contractor_price' and (v_patch ->> 'contractor_price') is not null then
      v_contractor_price := (v_patch ->> 'contractor_price')::numeric;
      if v_contractor_price < 0 or v_contractor_price > 1000000000 then raise exception 'invalid_contractor_price'; end if;
    end if;
    if v_patch ? 'markup_percent' and (v_patch ->> 'markup_percent') is not null then
      v_markup_percent := (v_patch ->> 'markup_percent')::numeric;
      if v_markup_percent < 0 or v_markup_percent > 100000 then raise exception 'invalid_markup_percent'; end if;
    end if;
    if v_patch ? 'min_client_price' and (v_patch ->> 'min_client_price') is not null then
      v_min_client_price := (v_patch ->> 'min_client_price')::numeric;
      if v_min_client_price < 0 or v_min_client_price > 1000000000 then raise exception 'invalid_min_client_price'; end if;
    end if;
    if v_patch ? 'default_client_price' and (v_patch ->> 'default_client_price') is not null then
      v_default_client_price := (v_patch ->> 'default_client_price')::numeric;
      if v_default_client_price < 0 or v_default_client_price > 1000000000 then raise exception 'invalid_default_client_price'; end if;
    end if;
    if v_patch ? 'sort_order' and (v_patch ->> 'sort_order') is not null then
      v_sort_order := (v_patch ->> 'sort_order')::integer;
      if v_sort_order < 0 or v_sort_order > 1000000 then raise exception 'invalid_sort_order'; end if;
    end if;
    if v_patch ? 'is_active' and jsonb_typeof(v_patch -> 'is_active') <> 'boolean' then
      raise exception 'invalid_is_active';
    end if;
    if v_patch ? 'settings' and jsonb_typeof(v_patch -> 'settings') <> 'object' then
      raise exception 'invalid_settings';
    end if;
  exception when others then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'invalid_payload', 'message', 'Catalog patch contains invalid numeric, boolean, or settings values'));
  end;

  if v_patch ? 'calculation_mode' then
    v_calculation_mode := lower(btrim(coalesce(v_patch ->> 'calculation_mode', '')));
    if v_calculation_mode not in ('markup', 'fixed', 'area', 'length', 'quantity') then
      return jsonb_build_object('ok', false, 'request_id', v_request_id,
        'error', jsonb_build_object('code', 'invalid_payload', 'message', 'Unsupported calculation_mode'));
    end if;
  end if;

  if v_patch ? 'name' and nullif(btrim(coalesce(v_patch ->> 'name', '')), '') is null then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'invalid_payload', 'message', 'name must not be empty'));
  end if;
  if v_patch ? 'category' and nullif(btrim(coalesce(v_patch ->> 'category', '')), '') is null then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'invalid_payload', 'message', 'category must not be empty'));
  end if;
  if v_patch ? 'unit' and nullif(btrim(coalesce(v_patch ->> 'unit', '')), '') is null then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'invalid_payload', 'message', 'unit must not be empty'));
  end if;

  if v_operation = 'create' and (
    nullif(btrim(coalesce(v_patch ->> 'name', '')), '') is null
    or nullif(btrim(coalesce(v_patch ->> 'category', '')), '') is null
    or nullif(btrim(coalesce(v_patch ->> 'unit', '')), '') is null
  ) then
    return jsonb_build_object('ok', false, 'request_id', v_request_id,
      'error', jsonb_build_object('code', 'invalid_payload', 'message', 'name, category and unit are required for create'));
  end if;

  v_canonical := jsonb_build_object(
    'action', v_action,
    'request_id', v_request_id,
    'expected_updated_at', case when v_expected_updated_at is null then null else to_char(v_expected_updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end,
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

  insert into leader_private.leader_command_receipts (
    action, idempotency_key, request_id, request_hash, actor_id, state
  ) values (
    v_action, v_idempotency_key, v_request_id, v_request_hash, v_actor_id, 'in_progress'
  ) returning * into v_receipt;
  v_receipt_inserted := true;

  if v_operation = 'create' then
    perform pg_advisory_xact_lock(hashtextextended(v_action || ':create:' || v_actor_id::text || ':' || lower(btrim(v_patch ->> 'name')), 0));

    if exists (
      select 1 from public.leader_catalog
      where owner_id = v_actor_id and lower(btrim(name)) = lower(btrim(v_patch ->> 'name'))
    ) then
      perform leader_private.leader_discard_catalog_command_receipt(v_receipt.id, v_actor_id);
      return jsonb_build_object('ok', false, 'request_id', v_request_id,
        'error', jsonb_build_object('code', 'catalog_duplicate', 'message', 'Catalog item with this name already exists'));
    end if;

    begin
      insert into public.leader_catalog (
        owner_id, category, name, unit, contractor_price, is_active, sort_order,
        description, item_type, markup_percent, min_client_price,
        default_client_price, calculation_mode, settings
      ) values (
        v_actor_id,
        btrim(v_patch ->> 'category'),
        btrim(v_patch ->> 'name'),
        btrim(v_patch ->> 'unit'),
        coalesce(v_contractor_price, 0),
        coalesce((v_patch ->> 'is_active')::boolean, true),
        coalesce(v_sort_order, 0),
        left(nullif(btrim(coalesce(v_patch ->> 'description', '')), ''), 4000),
        left(coalesce(nullif(btrim(coalesce(v_patch ->> 'item_type', '')), ''), 'Изготовление'), 200),
        coalesce(v_markup_percent, 70),
        coalesce(v_min_client_price, 0),
        case when v_patch ? 'default_client_price' then v_default_client_price else null end,
        coalesce(v_calculation_mode, case when coalesce(v_default_client_price, 0) > 0 then 'fixed' else 'markup' end),
        coalesce(v_patch -> 'settings', '{}'::jsonb)
      ) returning * into v_row;
    exception when unique_violation then
      perform leader_private.leader_discard_catalog_command_receipt(v_receipt.id, v_actor_id);
      return jsonb_build_object('ok', false, 'request_id', v_request_id,
        'error', jsonb_build_object('code', 'catalog_duplicate', 'message', 'Catalog item with this name already exists'));
    end;

    v_new_values := jsonb_build_object(
      'category', v_row.category, 'name', v_row.name, 'unit', v_row.unit,
      'contractor_price', v_row.contractor_price, 'is_active', v_row.is_active,
      'sort_order', v_row.sort_order, 'description', v_row.description,
      'item_type', v_row.item_type, 'markup_percent', v_row.markup_percent,
      'min_client_price', v_row.min_client_price,
      'default_client_price', v_row.default_client_price,
      'calculation_mode', v_row.calculation_mode, 'settings', v_row.settings
    );

    insert into public.leader_catalog_price_logs (
      catalog_id, owner_id, changed_by, changed_by_email, change_type, reason,
      new_contractor_price, new_markup_percent, new_min_client_price,
      new_default_client_price, new_calculation_mode, new_is_active,
      old_values, new_values
    ) values (
      v_row.id, v_row.owner_id, v_actor_id, v_actor_email, 'created', v_reason,
      v_row.contractor_price, v_row.markup_percent, v_row.min_client_price,
      v_row.default_client_price, v_row.calculation_mode, v_row.is_active,
      '{}'::jsonb, v_new_values
    );
  else
    perform pg_advisory_xact_lock(hashtextextended(v_action || ':catalog:' || v_catalog_id::text, 0));

    select * into v_before
    from public.leader_catalog
    where id = v_catalog_id
    for update;

    if not found then
      perform leader_private.leader_discard_catalog_command_receipt(v_receipt.id, v_actor_id);
      return jsonb_build_object('ok', false, 'request_id', v_request_id,
        'error', jsonb_build_object('code', 'catalog_not_found', 'message', 'Catalog item was not found'));
    end if;

    if v_before.updated_at is distinct from v_expected_updated_at then
      perform leader_private.leader_discard_catalog_command_receipt(v_receipt.id, v_actor_id);
      return jsonb_build_object('ok', false, 'request_id', v_request_id,
        'error', jsonb_build_object('code', 'source_changed', 'message', 'Catalog item changed; reload before saving'));
    end if;

    v_name := case when v_patch ? 'name' then btrim(v_patch ->> 'name') else v_before.name end;
    v_category := case when v_patch ? 'category' then btrim(v_patch ->> 'category') else v_before.category end;
    v_unit := case when v_patch ? 'unit' then btrim(v_patch ->> 'unit') else v_before.unit end;
    v_description := case when v_patch ? 'description' then left(nullif(btrim(coalesce(v_patch ->> 'description', '')), ''), 4000) else v_before.description end;
    v_item_type := case when v_patch ? 'item_type' then left(coalesce(nullif(btrim(coalesce(v_patch ->> 'item_type', '')), ''), 'Изготовление'), 200) else v_before.item_type end;
    v_contractor_price := case when v_patch ? 'contractor_price' then coalesce(v_contractor_price, 0) else v_before.contractor_price end;
    v_markup_percent := case when v_patch ? 'markup_percent' then coalesce(v_markup_percent, 0) else v_before.markup_percent end;
    v_min_client_price := case when v_patch ? 'min_client_price' then coalesce(v_min_client_price, 0) else v_before.min_client_price end;
    v_default_client_price := case when v_patch ? 'default_client_price' then v_default_client_price else v_before.default_client_price end;
    v_calculation_mode := case when v_patch ? 'calculation_mode' then v_calculation_mode else v_before.calculation_mode end;
    v_settings := case when v_patch ? 'settings' then v_patch -> 'settings' else v_before.settings end;
    v_sort_order := case when v_patch ? 'sort_order' then coalesce(v_sort_order, 0) else v_before.sort_order end;
    v_is_active := case when v_patch ? 'is_active' then (v_patch ->> 'is_active')::boolean else v_before.is_active end;

    v_pricing_changed :=
      v_before.contractor_price is distinct from v_contractor_price
      or v_before.markup_percent is distinct from v_markup_percent
      or v_before.min_client_price is distinct from v_min_client_price
      or v_before.default_client_price is distinct from v_default_client_price
      or v_before.calculation_mode is distinct from v_calculation_mode;
    v_status_changed := v_before.is_active is distinct from v_is_active;
    v_any_changed := v_pricing_changed or v_status_changed
      or v_before.category is distinct from v_category
      or v_before.name is distinct from v_name
      or v_before.unit is distinct from v_unit
      or v_before.description is distinct from v_description
      or v_before.item_type is distinct from v_item_type
      or v_before.settings is distinct from v_settings
      or v_before.sort_order is distinct from v_sort_order;

    if not v_any_changed then
      v_row := v_before;
    else
      begin
        update public.leader_catalog
        set category = v_category,
            name = v_name,
            unit = v_unit,
            contractor_price = v_contractor_price,
            is_active = v_is_active,
            sort_order = v_sort_order,
            updated_at = clock_timestamp(),
            description = v_description,
            item_type = v_item_type,
            markup_percent = v_markup_percent,
            min_client_price = v_min_client_price,
            default_client_price = v_default_client_price,
            calculation_mode = v_calculation_mode,
            settings = v_settings
        where id = v_catalog_id
        returning * into v_row;
      exception when unique_violation then
        perform leader_private.leader_discard_catalog_command_receipt(v_receipt.id, v_actor_id);
        return jsonb_build_object('ok', false, 'request_id', v_request_id,
          'error', jsonb_build_object('code', 'catalog_duplicate', 'message', 'Catalog item with this name already exists'));
      end;

      v_old_values := jsonb_build_object(
        'category', v_before.category, 'name', v_before.name, 'unit', v_before.unit,
        'contractor_price', v_before.contractor_price, 'is_active', v_before.is_active,
        'sort_order', v_before.sort_order, 'description', v_before.description,
        'item_type', v_before.item_type, 'markup_percent', v_before.markup_percent,
        'min_client_price', v_before.min_client_price,
        'default_client_price', v_before.default_client_price,
        'calculation_mode', v_before.calculation_mode, 'settings', v_before.settings
      );
      v_new_values := jsonb_build_object(
        'category', v_row.category, 'name', v_row.name, 'unit', v_row.unit,
        'contractor_price', v_row.contractor_price, 'is_active', v_row.is_active,
        'sort_order', v_row.sort_order, 'description', v_row.description,
        'item_type', v_row.item_type, 'markup_percent', v_row.markup_percent,
        'min_client_price', v_row.min_client_price,
        'default_client_price', v_row.default_client_price,
        'calculation_mode', v_row.calculation_mode, 'settings', v_row.settings
      );
      v_change_type := case when v_pricing_changed then 'price_update' when v_status_changed then 'status_update' else 'catalog_update' end;

      insert into public.leader_catalog_price_logs (
        catalog_id, owner_id, changed_by, changed_by_email, change_type, reason,
        old_contractor_price, new_contractor_price,
        old_markup_percent, new_markup_percent,
        old_min_client_price, new_min_client_price,
        old_default_client_price, new_default_client_price,
        old_calculation_mode, new_calculation_mode,
        old_is_active, new_is_active, old_values, new_values
      ) values (
        v_row.id, v_row.owner_id, v_actor_id, v_actor_email, v_change_type, v_reason,
        v_before.contractor_price, v_row.contractor_price,
        v_before.markup_percent, v_row.markup_percent,
        v_before.min_client_price, v_row.min_client_price,
        v_before.default_client_price, v_row.default_client_price,
        v_before.calculation_mode, v_row.calculation_mode,
        v_before.is_active, v_row.is_active, v_old_values, v_new_values
      );
    end if;
  end if;

  v_response := jsonb_build_object(
    'ok', true,
    'request_id', v_request_id,
    'operation', v_operation,
    'changed', case when v_operation = 'create' then true else v_any_changed end,
    'catalog', jsonb_build_object(
      'id', v_row.id,
      'owner_id', v_row.owner_id,
      'category', v_row.category,
      'name', v_row.name,
      'unit', v_row.unit,
      'contractor_price', v_row.contractor_price,
      'is_active', v_row.is_active,
      'sort_order', v_row.sort_order,
      'created_at', v_row.created_at,
      'updated_at', v_row.updated_at,
      'description', v_row.description,
      'item_type', v_row.item_type,
      'markup_percent', v_row.markup_percent,
      'min_client_price', v_row.min_client_price,
      'default_client_price', v_row.default_client_price,
      'calculation_mode', v_row.calculation_mode,
      'settings', v_row.settings
    )
  );

  update leader_private.leader_command_receipts
  set state = 'success', response = v_response, updated_at = clock_timestamp(), completed_at = clock_timestamp()
  where id = v_receipt.id;

  return v_response;
exception when others then
  if v_receipt_inserted and v_receipt.id is not null then
    perform leader_private.leader_discard_catalog_command_receipt(v_receipt.id, v_actor_id);
  end if;
  return jsonb_build_object(
    'ok', false,
    'request_id', v_request_id,
    'error', jsonb_build_object('code', 'catalog_manage_failed', 'message', 'Catalog command could not be persisted')
  );
end
$function$;

comment on function public.leader_manage_catalog_rpc(jsonb) is
  'Production catalog.manage command candidate. SECURITY INVOKER service-role command with narrow private in-progress receipt cleanup helper.';

revoke all on function public.leader_manage_catalog_rpc(jsonb) from public, anon, authenticated;
grant execute on function public.leader_manage_catalog_rpc(jsonb) to service_role;
-- Close legacy browser bypasses at table AND column level; SELECT for calculations remains.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.leader_catalog, public.leader_catalog_price_logs FROM PUBLIC, anon, authenticated;
DO $columns$ DECLARE col record; BEGIN
  FOR col IN SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('leader_catalog','leader_catalog_price_logs') LOOP
    EXECUTE format('REVOKE INSERT (%1$I), UPDATE (%1$I), REFERENCES (%1$I) ON public.%2$I FROM PUBLIC, anon, authenticated', col.column_name,col.table_name);
  END LOOP;
END $columns$;
ALTER POLICY "leader catalog price logs select active users" ON public.leader_catalog_price_logs USING ((SELECT leader_private.leader_has_crm_action('catalog.read')));
DO $postflight$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['public.leader_catalog','public.leader_catalog_price_logs'] LOOP
    IF has_any_column_privilege('anon',tab,'INSERT') OR has_any_column_privilege('anon',tab,'UPDATE') OR has_any_column_privilege('authenticated',tab,'INSERT') OR has_any_column_privilege('authenticated',tab,'UPDATE') OR has_table_privilege('anon',tab,'DELETE') OR has_table_privilege('authenticated',tab,'DELETE') OR has_table_privilege('anon',tab,'TRUNCATE') OR has_table_privilege('authenticated',tab,'TRUNCATE') THEN RAISE EXCEPTION 'browser_catalog_write_open'; END IF;
    IF NOT has_table_privilege('authenticated',tab,'SELECT') THEN RAISE EXCEPTION 'catalog_read_grant_lost'; END IF;
  END LOOP;
  IF has_function_privilege('anon','public.leader_manage_catalog_rpc(jsonb)','EXECUTE') OR has_function_privilege('authenticated','public.leader_manage_catalog_rpc(jsonb)','EXECUTE') OR NOT has_function_privilege('service_role','public.leader_manage_catalog_rpc(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'catalog_rpc_acl'; END IF;
  IF (SELECT data_snapshot FROM leader_private.leader_rollout_backups WHERE id='catalog-management-20261014-v1') IS DISTINCT FROM jsonb_build_object('leader_catalog',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM public.leader_catalog t),'leader_catalog_price_logs',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM public.leader_catalog_price_logs t)) THEN RAISE EXCEPTION 'catalog_business_rows_changed'; END IF;
END $postflight$;
NOTIFY pgrst, 'reload schema';
COMMIT;
