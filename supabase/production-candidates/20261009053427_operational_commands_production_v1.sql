-- Leader-only operational command installation; reviewed staging runtime 2026-10-09.
-- No business rows, shared Auth, role matrix or existing finance/design functions are rewritten.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='45s';
DO $preflight$ DECLARE fn text; BEGIN
 IF to_regclass('leader_staging.environment_guard') IS NOT NULL THEN RAISE EXCEPTION 'production_only'; END IF;
 IF NOT EXISTS(SELECT 1 FROM leader_private.leader_rollout_backups WHERE id='order-finance-20261001-v1' AND project_ref='ofewxuqfjhamgerwzull') THEN RAISE EXCEPTION 'approved_production_core_missing'; END IF;
 IF to_regprocedure('leader_private.leader_actor_has_crm_action(uuid,text)') IS NULL OR to_regprocedure('leader_private.leader_has_crm_action(text)') IS NULL THEN RAISE EXCEPTION 'canonical_rbac_missing'; END IF;
 IF EXISTS(SELECT 1 FROM leader_private.leader_rollout_backups WHERE id='operational-commands-20261009-v1') THEN RAISE EXCEPTION 'already_installed'; END IF;
 IF has_table_privilege('authenticated','leader_private.leader_rollout_backups','SELECT') OR has_table_privilege('service_role','leader_private.leader_rollout_backups','SELECT') OR has_table_privilege('anon','leader_private.leader_rollout_backups','SELECT') THEN RAISE EXCEPTION 'backup_exposed'; END IF;
 FOREACH fn IN ARRAY ARRAY['leader_private.leader_installation_command_error(uuid,text,text)','leader_private.leader_installation_status_key(text)','leader_private.leader_installation_status_label(text)','leader_private.leader_installation_transition_allowed(text,text)','leader_private.leader_production_command_error(uuid,text,text)','leader_private.leader_production_is_installation_ready(text)','leader_private.leader_production_status_key(text)','leader_private.leader_production_status_label(text)','leader_private.leader_production_transition_allowed(text,text)','public.leader_create_installation_job_from_order_rpc(jsonb)','public.leader_create_production_job_from_order_impl_rpc(jsonb)','public.leader_create_production_job_from_order_rpc(jsonb)','public.leader_read_installation_job_rpc(uuid,uuid)','public.leader_update_installation_job_rpc(jsonb)','public.leader_update_production_job_rpc(jsonb)','leader_private.leader_layout_is_approved(text)'] LOOP
  IF to_regprocedure(fn) IS NOT NULL THEN RAISE EXCEPTION 'unexpected_existing_function:%',fn; END IF;
 END LOOP;
END $preflight$;
LOCK TABLE public.leader_orders,public.leader_production_jobs,public.leader_production_events,public.leader_installation_jobs,public.leader_installation_job_items,public.leader_installation_events IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO leader_private.leader_rollout_backups(id,project_ref,data_snapshot,metadata_snapshot,edge_snapshot)
SELECT 'operational-commands-20261009-v1','ofewxuqfjhamgerwzull',jsonb_build_object('leader_orders',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM public.leader_orders t),'leader_production_jobs',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM public.leader_production_jobs t),'leader_production_events',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM public.leader_production_events t),'leader_installation_jobs',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM public.leader_installation_jobs t),'leader_installation_job_items',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM public.leader_installation_job_items t),'leader_installation_events',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM public.leader_installation_events t)),jsonb_build_object(
 'policies',(SELECT jsonb_agg(to_jsonb(p)) FROM pg_policies p WHERE schemaname='public' AND tablename IN ('leader_production_jobs','leader_production_events','leader_installation_jobs','leader_installation_job_items','leader_installation_events')),
 'tables',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'acl',c.relacl,'rls',c.relrowsecurity,'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'acl',a.attacl)) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped))) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('leader_production_jobs','leader_production_events','leader_installation_jobs','leader_installation_job_items','leader_installation_events')),
 'legacy_functions',(SELECT jsonb_agg(jsonb_build_object('definition',pg_get_functiondef(p.oid),'acl',p.proacl)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('leader_add_production_event','leader_add_safe_production_note'))),
 '{"leader-crm-production":"absent","leader-crm-production-create":"absent","leader-crm-installation":"absent","leader-crm-installation-create":"absent"}'::jsonb;
CREATE OR REPLACE FUNCTION leader_private.leader_layout_is_approved(p_status text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  with normalized as (
    select lower(replace(btrim(coalesce(p_status, '')), 'ё', 'е')) as value
  )
  select case
    when value = '' then false
    when value like '%на согласовании%'
      or value like '%согласование%'
      or value like '%правк%'
      or value like '%не готов%'
      or value like '%ожид%'
      or value like '%нужен%'
      or value like '%не проверен%'
      then false
    when value like '%не требуется%' then true
    when value like '%согласован%'
      or value like '%утвержден%'
      or value = 'готов'
      or value like '%готовый макет%'
      then true
    else false
  end
  from normalized;
$function$;


CREATE OR REPLACE FUNCTION leader_private.leader_installation_command_error(p_request_id uuid, p_code text, p_message text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'ok', false,
    'request_id', p_request_id,
    'error', jsonb_build_object('code', p_code, 'message', p_message)
  );
$function$;

CREATE OR REPLACE FUNCTION leader_private.leader_installation_status_key(p_status text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case btrim(coalesce(p_status, ''))
    when '' then 'unassigned'
    when 'Не назначен' then 'unassigned'
    when 'Нужно назначить' then 'unassigned'
    when 'Запланирован' then 'scheduled'
    when 'Перенесён' then 'postponed'
    when 'Перенесен' then 'postponed'
    when 'Проблема' then 'postponed'
    when 'В работе' then 'in_progress'
    when 'Выполнен' then 'completed'
    when 'Завершён' then 'completed'
    when 'Завершен' then 'completed'
    when 'Не требуется' then 'not_required'
    when 'Отменён' then 'cancelled'
    when 'Отменен' then 'cancelled'
    else null
  end;
$function$;

CREATE OR REPLACE FUNCTION leader_private.leader_installation_status_label(p_key text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case p_key
    when 'unassigned' then 'Не назначен'
    when 'scheduled' then 'Запланирован'
    when 'postponed' then 'Перенесён'
    when 'in_progress' then 'В работе'
    when 'completed' then 'Выполнен'
    when 'not_required' then 'Не требуется'
    when 'cancelled' then 'Отменён'
    else null
  end;
$function$;

CREATE OR REPLACE FUNCTION leader_private.leader_installation_transition_allowed(p_from_key text, p_to_key text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case p_from_key
    when 'unassigned' then p_to_key = any(array['scheduled','not_required','cancelled'])
    when 'scheduled' then p_to_key = any(array['in_progress','postponed','cancelled'])
    when 'postponed' then p_to_key = any(array['scheduled','in_progress','cancelled'])
    when 'in_progress' then p_to_key = any(array['completed','postponed','cancelled'])
    else false
  end;
$function$;

CREATE OR REPLACE FUNCTION leader_private.leader_production_command_error(p_request_id uuid, p_code text, p_message text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'ok', false,
    'request_id', p_request_id,
    'error', jsonb_build_object('code', p_code, 'message', p_message)
  );
$function$;

CREATE OR REPLACE FUNCTION leader_private.leader_production_is_installation_ready(p_status text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select lower(replace(btrim(coalesce(p_status, '')), 'ё', 'е'))
    in ('готово','выдано','ready','issued');
$function$;

CREATE OR REPLACE FUNCTION leader_private.leader_production_status_key(p_status text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case btrim(coalesce(p_status, ''))
    when 'Не передано' then 'not_sent'
    when 'В очереди' then 'queued'
    when 'Передано в производство' then 'queued'
    when 'В производстве' then 'in_production'
    when 'В работе' then 'in_production'
    when 'Приостановлено' then 'stopped'
    when 'Проблема' then 'stopped'
    when 'Готово' then 'ready'
    when 'Выдано' then 'issued'
    when 'Не требуется' then 'not_required'
    when 'Отменено' then 'cancelled'
    else null
  end;
$function$;

CREATE OR REPLACE FUNCTION leader_private.leader_production_status_label(p_key text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case p_key
    when 'not_sent' then 'Не передано'
    when 'queued' then 'В очереди'
    when 'in_production' then 'В производстве'
    when 'stopped' then 'Приостановлено'
    when 'ready' then 'Готово'
    when 'issued' then 'Выдано'
    when 'not_required' then 'Не требуется'
    when 'cancelled' then 'Отменено'
    else null
  end;
$function$;

CREATE OR REPLACE FUNCTION leader_private.leader_production_transition_allowed(p_from_key text, p_to_key text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case p_from_key
    when 'not_sent' then p_to_key = any(array['queued','in_production','not_required'])
    when 'queued' then p_to_key = any(array['in_production','cancelled'])
    when 'in_production' then p_to_key = any(array['ready','stopped','cancelled'])
    when 'stopped' then p_to_key = any(array['queued','in_production','cancelled'])
    when 'ready' then p_to_key = 'issued'
    else false
  end;
$function$;

CREATE OR REPLACE FUNCTION public.leader_create_installation_job_from_order_rpc(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_actor_id uuid;
  v_request jsonb;
  v_request_id uuid;
  v_expected_updated_at timestamptz;
  v_payload jsonb;
  v_job_input jsonb;
  v_order_id uuid;
  v_production_job_id uuid;
  v_idempotency_key text;
  v_request_hash text;
  v_receipt leader_private.leader_command_receipts%rowtype;
  v_order public.leader_orders%rowtype;
  v_production public.leader_production_jobs%rowtype;
  v_job public.leader_installation_jobs%rowtype;
  v_event public.leader_installation_events%rowtype;
  v_now timestamptz := clock_timestamp();
  v_title text;
  v_priority text;
  v_installer_name text;
  v_installer_phone text;
  v_address text;
  v_scheduled_at timestamptz;
  v_installer_cost numeric;
  v_client_price numeric;
  v_technical_task text;
  v_tools_required text;
  v_order_status_key text;
  v_order_installation_key text;
  v_response jsonb;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return leader_private.leader_installation_command_error(null, 'validation_error', 'RPC payload must be an object');
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_payload) as k(key)
    where key not in ('actor_id','actor_email','request')
  ) then
    return leader_private.leader_installation_command_error(null, 'validation_error', 'Unknown RPC payload field');
  end if;

  begin
    v_actor_id := nullif(btrim(coalesce(p_payload ->> 'actor_id', '')), '')::uuid;
  exception when others then
    return leader_private.leader_installation_command_error(null, 'validation_error', 'actor_id must be a UUID');
  end;
  if v_actor_id is null then
    return leader_private.leader_installation_command_error(null, 'validation_error', 'actor_id is required');
  end if;

  v_request := p_payload -> 'request';
  if v_request is null or jsonb_typeof(v_request) <> 'object' then
    return leader_private.leader_installation_command_error(null, 'validation_error', 'request must be an object');
  end if;
  if exists (
    select 1 from jsonb_object_keys(v_request) as k(key)
    where key not in ('action','request_id','expected_updated_at','payload')
  ) then
    return leader_private.leader_installation_command_error(null, 'validation_error', 'Unknown request field');
  end if;

  begin
    v_request_id := nullif(btrim(coalesce(v_request ->> 'request_id', '')), '')::uuid;
    v_expected_updated_at := nullif(btrim(coalesce(v_request ->> 'expected_updated_at', '')), '')::timestamptz;
  exception when others then
    return leader_private.leader_installation_command_error(null, 'validation_error', 'request_id or expected_updated_at is invalid');
  end;
  if v_request_id is null or v_expected_updated_at is null then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'request_id and expected_updated_at are required');
  end if;
  if btrim(coalesce(v_request ->> 'action', '')) <> 'installation_job.create_from_order' then
    return leader_private.leader_installation_command_error(v_request_id, 'unknown_action', 'Unsupported action');
  end if;

  if not leader_private.leader_actor_has_crm_action(v_actor_id, 'installation.write') then
    return leader_private.leader_installation_command_error(v_request_id, 'forbidden', 'installation.write permission is required');
  end if;

  v_payload := v_request -> 'payload';
  if v_payload is null or jsonb_typeof(v_payload) <> 'object' then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'payload must be an object');
  end if;
  if exists (
    select 1 from jsonb_object_keys(v_payload) as k(key)
    where key not in ('order_id','production_job_id','idempotency_key','job')
  ) then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'Unknown business payload field');
  end if;

  begin
    v_order_id := nullif(btrim(coalesce(v_payload ->> 'order_id', '')), '')::uuid;
    v_production_job_id := nullif(btrim(coalesce(v_payload ->> 'production_job_id', '')), '')::uuid;
  exception when others then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'order_id or production_job_id is invalid');
  end;
  v_idempotency_key := btrim(coalesce(v_payload ->> 'idempotency_key', ''));
  v_job_input := v_payload -> 'job';
  if v_order_id is null or v_production_job_id is null
     or char_length(v_idempotency_key) not between 1 and 180 then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'order_id, production_job_id and valid idempotency_key are required');
  end if;
  if v_job_input is null or jsonb_typeof(v_job_input) <> 'object' then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'job must be an object');
  end if;
  if exists (
    select 1 from jsonb_object_keys(v_job_input) as k(key)
    where key not in (
      'title','priority','installer_name','installer_phone','address','scheduled_at',
      'installer_cost','client_price','technical_task','tools_required'
    )
  ) then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'Job contains unknown or server-owned fields');
  end if;

  v_title := nullif(btrim(coalesce(v_job_input ->> 'title', '')), '');
  v_priority := nullif(btrim(coalesce(v_job_input ->> 'priority', '')), '');
  v_installer_name := nullif(btrim(coalesce(v_job_input ->> 'installer_name', '')), '');
  v_installer_phone := nullif(btrim(coalesce(v_job_input ->> 'installer_phone', '')), '');
  v_address := nullif(btrim(coalesce(v_job_input ->> 'address', '')), '');
  v_technical_task := nullif(btrim(coalesce(v_job_input ->> 'technical_task', '')), '');
  v_tools_required := nullif(btrim(coalesce(v_job_input ->> 'tools_required', '')), '');

  begin
    v_scheduled_at := nullif(btrim(coalesce(v_job_input ->> 'scheduled_at', '')), '')::timestamptz;
    v_installer_cost := nullif(btrim(coalesce(v_job_input ->> 'installer_cost', '')), '')::numeric;
    v_client_price := nullif(btrim(coalesce(v_job_input ->> 'client_price', '')), '')::numeric;
  exception when others then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'scheduled_at or installation prices are invalid');
  end;

  if v_title is null or char_length(v_title) > 500 then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'title must contain 1 to 500 characters');
  end if;
  if v_priority not in ('Обычный','Высокий','Срочно') then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'priority is invalid');
  end if;
  if v_installer_name is null or char_length(v_installer_name) > 300 then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'installer_name is required');
  end if;
  if v_address is null or char_length(v_address) > 1000 then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'address is required');
  end if;
  if v_scheduled_at is null then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'scheduled_at is required');
  end if;
  if v_installer_cost is not null and v_installer_cost < 0
     or v_client_price is not null and v_client_price < 0 then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'installation prices cannot be negative');
  end if;
  if char_length(coalesce(v_installer_phone, '')) > 100
     or char_length(coalesce(v_technical_task, '')) > 12000
     or char_length(coalesce(v_tools_required, '')) > 4000 then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'One or more text fields are too long');
  end if;

  if v_job_input ?| '{installer_cost,client_price}'::text[]
     and not leader_private.leader_actor_has_crm_action(v_actor_id, 'orders.update') then
    return leader_private.leader_installation_command_error(v_request_id, 'forbidden', 'orders.update permission is required to set planned prices');
  end if;

  v_request_hash := encode(
    extensions.digest(
      convert_to((jsonb_build_object(
        'actor_id', v_actor_id,
        'action', 'installation_job.create_from_order',
        'expected_updated_at', v_expected_updated_at,
        'payload', jsonb_build_object(
          'order_id', v_order_id,
          'production_job_id', v_production_job_id,
          'idempotency_key', v_idempotency_key,
          'job', jsonb_build_object(
            'title', v_title,
            'priority', v_priority,
            'installer_name', v_installer_name,
            'installer_phone', v_installer_phone,
            'address', v_address,
            'scheduled_at', v_scheduled_at,
            'installer_cost', v_installer_cost,
            'client_price', v_client_price,
            'technical_task', v_technical_task,
            'tools_required', v_tools_required
          )
        )
      ))::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  perform pg_advisory_xact_lock(hashtextextended('installation_job.create_from_order:key:' || v_idempotency_key, 0));
  perform pg_advisory_xact_lock(hashtextextended('installation_job.create_from_order:request:' || v_request_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('installation_job.create_from_order:order:' || v_order_id::text, 0));

  select * into v_receipt
  from leader_private.leader_command_receipts
  where action = 'installation_job.create_from_order'
    and idempotency_key = v_idempotency_key
  for update;

  if found then
    if v_receipt.actor_id IS DISTINCT FROM v_actor_id or v_receipt.request_hash IS DISTINCT FROM v_request_hash then
      return leader_private.leader_installation_command_error(v_request_id, 'conflict', 'Idempotency key was used with another payload');
    end if;
    if v_receipt.state = 'success' and v_receipt.response is not null then
      return jsonb_set(v_receipt.response, '{entity}', (v_receipt.response->'entity') - ARRAY['contractor_cost','client_total','installer_cost','client_price','profit','internal_comment']) || jsonb_build_object('idempotent_replay', true, 'request_id', v_request_id);
    end if;
    return leader_private.leader_installation_command_error(v_request_id, 'duplicate_request', 'Request is already in progress');
  end if;

  if exists (
    select 1 from leader_private.leader_command_receipts
    where action = 'installation_job.create_from_order'
      and request_id = v_request_id
      and idempotency_key <> v_idempotency_key
  ) then
    return leader_private.leader_installation_command_error(v_request_id, 'duplicate_request', 'request_id was already used');
  end if;

  select * into v_order
  from public.leader_orders
  where id = v_order_id
  for update;
  if not found then
    return leader_private.leader_installation_command_error(v_request_id, 'not_found', 'Order was not found');
  end if;
  if v_order.is_archived is true then
    return leader_private.leader_installation_command_error(v_request_id, 'conflict', 'Archived order cannot enter installation');
  end if;
  if v_order.updated_at is distinct from v_expected_updated_at then
    return leader_private.leader_installation_command_error(v_request_id, 'conflict', 'Order changed after it was loaded');
  end if;

  v_order_status_key := lower(replace(btrim(coalesce(v_order.status, '')), 'ё', 'е'));
  if v_order_status_key in ('закрыт','закрыто','отменен','отменено','отмена','cancelled','closed') then
    return leader_private.leader_installation_command_error(v_request_id, 'conflict', 'Closed or cancelled order cannot enter installation');
  end if;
  v_order_installation_key := lower(replace(btrim(coalesce(v_order.installation_status, '')), 'ё', 'е'));
  if v_order_installation_key like '%не требуется%' then
    return leader_private.leader_installation_command_error(v_request_id, 'conflict', 'Order does not require installation');
  end if;

  select * into v_production
  from public.leader_production_jobs
  where id = v_production_job_id
  for share;
  if not found or v_production.order_id is distinct from v_order.id then
    return leader_private.leader_installation_command_error(v_request_id, 'not_found', 'Production job was not found for this order');
  end if;
  if not leader_private.leader_production_is_installation_ready(v_production.production_status) then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'Production job is not ready for installation');
  end if;

  perform 1
  from public.leader_installation_jobs
  where order_id = v_order.id
    and install_status not in ('Выполнен','Завершён','Завершен','Не требуется','Отменён','Отменен')
  for update;
  if found then
    return leader_private.leader_installation_command_error(v_request_id, 'conflict', 'Active installation job already exists for this order');
  end if;

  insert into public.leader_installation_jobs (
    owner_id, order_id, production_job_id, title, install_status, priority,
    installer_name, installer_phone, address, scheduled_at, installer_cost,
    client_price, technical_task, tools_required, created_by, updated_by,
    created_at, updated_at
  ) values (
    v_actor_id, v_order.id, v_production.id, v_title, 'Запланирован', v_priority,
    v_installer_name, v_installer_phone, v_address, v_scheduled_at,
    coalesce(v_installer_cost, 0), coalesce(v_client_price, 0),
    v_technical_task, v_tools_required, v_actor_id, v_actor_id, v_now, v_now
  ) returning * into v_job;

  insert into public.leader_installation_events (
    job_id, order_id, event_type, old_status, new_status, body, created_by, created_at
  ) values (
    v_job.id, v_order.id, 'created', 'Не назначен', 'Запланирован',
    'Монтажное задание создано из готового производственного задания.',
    v_actor_id, v_now
  ) returning * into v_event;

  update public.leader_orders
  set installation_status = 'Запланирован',
      installation_address = v_address,
      installation_scheduled_at = v_scheduled_at,
      installer_name = v_installer_name,
      installer_phone = v_installer_phone,
      current_stage = 'Монтаж: Запланирован',
      next_action = 'Подготовить и выполнить монтаж',
      stage_updated_at = v_now,
      updated_at = v_now
  where id = v_order.id
  returning * into v_order;

  v_response := jsonb_build_object(
    'ok', true,
    'request_id', v_request_id,
    'entity', jsonb_build_object(
      'id', v_job.id,
      'order_id', v_job.order_id,
      'production_job_id', v_job.production_job_id,
      'title', v_job.title,
      'install_status', v_job.install_status,
      'priority', v_job.priority,
      'installer_name', v_job.installer_name,
      'installer_phone', v_job.installer_phone,
      'address', v_job.address,
      'scheduled_at', v_job.scheduled_at,
      'installer_cost', v_job.installer_cost,
      'client_price', v_job.client_price,
      'technical_task', v_job.technical_task,
      'tools_required', v_job.tools_required,
      'created_at', v_job.created_at,
      'updated_at', v_job.updated_at
    ),
    'order', jsonb_build_object(
      'id', v_order.id,
      'installation_status', v_order.installation_status,
      'installation_address', v_order.installation_address,
      'installation_scheduled_at', v_order.installation_scheduled_at,
      'installer_name', v_order.installer_name,
      'installer_phone', v_order.installer_phone,
      'current_stage', v_order.current_stage,
      'next_action', v_order.next_action,
      'updated_at', v_order.updated_at,
      'stage_updated_at', v_order.stage_updated_at
    ),
    'events', jsonb_build_array(jsonb_build_object(
      'id', v_event.id,
      'event_type', v_event.event_type,
      'old_status', v_event.old_status,
      'new_status', v_event.new_status,
      'created_at', v_event.created_at
    )),
    'idempotent_replay', false
  );

  v_response := jsonb_set(v_response, '{entity}', (v_response->'entity') - ARRAY['contractor_cost','client_total','installer_cost','client_price','profit','internal_comment']);
  insert into leader_private.leader_command_receipts (
    action, idempotency_key, request_id, request_hash, actor_id,
    state, response, created_at, updated_at, completed_at
  ) values (
    'installation_job.create_from_order', v_idempotency_key, v_request_id,
    v_request_hash, v_actor_id, 'success', v_response, v_now, v_now, v_now
  );

  return v_response;
exception
  when unique_violation then
    return leader_private.leader_installation_command_error(v_request_id, 'conflict', 'Active installation job or command receipt already exists');
  when others then
    return leader_private.leader_installation_command_error(
      v_request_id,
      'persistence_failed',
      'Installation job creation could not be persisted'
    );
end
$function$;

CREATE OR REPLACE FUNCTION public.leader_create_production_job_from_order_impl_rpc(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_actor_id uuid;
  v_actor_email text;
  v_request jsonb;
  v_request_id uuid;
  v_expected_updated_at timestamptz;
  v_payload jsonb;
  v_job_input jsonb;
  v_order_id uuid;
  v_design_task_id uuid;
  v_contractor_id uuid;
  v_idempotency_key text;
  v_request_hash text;
  v_receipt leader_private.leader_command_receipts%rowtype;
  v_order public.leader_orders%rowtype;
  v_design public.leader_design_tasks%rowtype;
  v_job public.leader_production_jobs%rowtype;
  v_event public.leader_production_events%rowtype;
  v_now timestamptz := clock_timestamp();
  v_title text;
  v_priority text;
  v_deadline timestamptz;
  v_layout_status text;
  v_file_url text;
  v_technical_task text;
  v_contractor_cost numeric;
  v_order_status_key text;
  v_order_layout_key text;
  v_design_layout_key text;
  v_response jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_exception_message text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return leader_private.leader_production_command_error(null, 'validation_error', 'RPC payload must be an object');
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_payload) as k(key)
    where key not in ('actor_id','actor_email','request')
  ) then
    return leader_private.leader_production_command_error(null, 'validation_error', 'Unknown RPC payload field');
  end if;

  begin
    v_actor_id := nullif(btrim(coalesce(p_payload ->> 'actor_id', '')), '')::uuid;
  exception when others then
    return leader_private.leader_production_command_error(null, 'validation_error', 'actor_id must be a UUID');
  end;
  if v_actor_id is null then
    return leader_private.leader_production_command_error(null, 'validation_error', 'actor_id is required');
  end if;
  v_actor_email := left(nullif(lower(btrim(coalesce(p_payload ->> 'actor_email', ''))), ''), 240);

  v_request := p_payload -> 'request';
  if v_request is null or jsonb_typeof(v_request) <> 'object' then
    return leader_private.leader_production_command_error(null, 'validation_error', 'request must be an object');
  end if;
  if exists (
    select 1 from jsonb_object_keys(v_request) as k(key)
    where key not in ('action','request_id','expected_updated_at','payload')
  ) then
    return leader_private.leader_production_command_error(null, 'validation_error', 'Unknown request field');
  end if;

  begin
    v_request_id := nullif(btrim(coalesce(v_request ->> 'request_id', '')), '')::uuid;
    v_expected_updated_at := nullif(btrim(coalesce(v_request ->> 'expected_updated_at', '')), '')::timestamptz;
  exception when others then
    return leader_private.leader_production_command_error(null, 'validation_error', 'request_id or expected_updated_at is invalid');
  end;
  if v_request_id is null or v_expected_updated_at is null then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'request_id and expected_updated_at are required');
  end if;
  if btrim(coalesce(v_request ->> 'action', '')) <> 'production_job.create_from_order' then
    return leader_private.leader_production_command_error(v_request_id, 'unknown_action', 'Unsupported action');
  end if;

  v_payload := v_request -> 'payload';
  if v_payload is null or jsonb_typeof(v_payload) <> 'object' then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'payload must be an object');
  end if;
  if exists (
    select 1 from jsonb_object_keys(v_payload) as k(key)
    where key not in ('order_id','design_task_id','idempotency_key','job')
  ) then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'Unknown business payload field');
  end if;

  begin
    v_order_id := nullif(btrim(coalesce(v_payload ->> 'order_id', '')), '')::uuid;
    v_design_task_id := nullif(btrim(coalesce(v_payload ->> 'design_task_id', '')), '')::uuid;
  exception when others then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'order_id or design_task_id is invalid');
  end;
  v_idempotency_key := btrim(coalesce(v_payload ->> 'idempotency_key', ''));
  v_job_input := v_payload -> 'job';
  if v_order_id is null or char_length(v_idempotency_key) not between 1 and 180 then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'order_id and valid idempotency_key are required');
  end if;
  if v_job_input is null or jsonb_typeof(v_job_input) <> 'object' then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'job must be an object');
  end if;
  if exists (
    select 1 from jsonb_object_keys(v_job_input) as k(key)
    where key not in (
      'title','priority','deadline','layout_status','file_url','technical_task',
      'contractor_id','contractor_cost'
    )
  ) then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'Job contains unknown or server-owned fields');
  end if;

  v_title := nullif(btrim(coalesce(v_job_input ->> 'title', '')), '');
  v_priority := nullif(btrim(coalesce(v_job_input ->> 'priority', '')), '');
  v_layout_status := nullif(btrim(coalesce(v_job_input ->> 'layout_status', '')), '');
  v_file_url := nullif(btrim(coalesce(v_job_input ->> 'file_url', '')), '');
  v_technical_task := nullif(btrim(coalesce(v_job_input ->> 'technical_task', '')), '');

  begin
    v_deadline := nullif(btrim(coalesce(v_job_input ->> 'deadline', '')), '')::timestamptz;
    v_contractor_id := nullif(btrim(coalesce(v_job_input ->> 'contractor_id', '')), '')::uuid;
    v_contractor_cost := nullif(btrim(coalesce(v_job_input ->> 'contractor_cost', '')), '')::numeric;
  exception when others then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'deadline, contractor_id or contractor_cost is invalid');
  end;

  if v_title is null or char_length(v_title) > 500 then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'title must contain 1 to 500 characters');
  end if;
  if v_priority not in ('Обычная','Высокая','Срочно') then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'priority is invalid');
  end if;
  if v_layout_status <> 'Макет согласован' then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'layout_status must confirm an approved layout');
  end if;
  if char_length(coalesce(v_file_url, '')) > 2000
     or char_length(coalesce(v_technical_task, '')) > 12000 then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'One or more text fields are too long');
  end if;
  if v_contractor_cost is not null and v_contractor_cost < 0 then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'contractor_cost cannot be negative');
  end if;

  if not leader_private.leader_actor_has_crm_action(v_actor_id, 'production.write') then
    return leader_private.leader_production_command_error(v_request_id, 'forbidden', 'production.write permission is required');
  end if;

  if v_job_input ?| '{contractor_cost}'::text[]
     and not leader_private.leader_actor_has_crm_action(v_actor_id, 'orders.update') then
    return leader_private.leader_production_command_error(v_request_id, 'forbidden', 'orders.update permission is required to set planned prices');
  end if;

  v_request_hash := encode(
    extensions.digest(
      convert_to((jsonb_build_object(
        'actor_id', v_actor_id,
        'action', 'production_job.create_from_order',
        'expected_updated_at', v_expected_updated_at,
        'payload', jsonb_build_object(
          'order_id', v_order_id,
          'design_task_id', v_design_task_id,
          'idempotency_key', v_idempotency_key,
          'job', jsonb_build_object(
            'title', v_title,
            'priority', v_priority,
            'deadline', v_deadline,
            'layout_status', v_layout_status,
            'file_url', v_file_url,
            'technical_task', v_technical_task,
            'contractor_id', v_contractor_id,
            'contractor_cost', v_contractor_cost
          )
        )
      ))::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  perform pg_advisory_xact_lock(hashtextextended('production_job.create_from_order:key:' || v_idempotency_key, 0));
  perform pg_advisory_xact_lock(hashtextextended('production_job.create_from_order:request:' || v_request_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('production_job.create_from_order:order:' || v_order_id::text, 0));

  select * into v_receipt
  from leader_private.leader_command_receipts
  where action = 'production_job.create_from_order'
    and idempotency_key = v_idempotency_key
  for update;

  if found then
    if v_receipt.actor_id IS DISTINCT FROM v_actor_id or v_receipt.request_hash IS DISTINCT FROM v_request_hash then
      return leader_private.leader_production_command_error(v_request_id, 'conflict', 'Idempotency key was used with another payload');
    end if;
    if v_receipt.state = 'success' and v_receipt.response is not null then
      return jsonb_set(v_receipt.response, '{entity}', (v_receipt.response->'entity') - ARRAY['contractor_cost','client_total','installer_cost','client_price','profit','internal_comment']) || jsonb_build_object('idempotent_replay', true, 'request_id', v_request_id);
    end if;
    return leader_private.leader_production_command_error(v_request_id, 'duplicate_request', 'Request is already in progress');
  end if;

  if exists (
    select 1
    from leader_private.leader_command_receipts
    where action = 'production_job.create_from_order'
      and request_id = v_request_id
      and idempotency_key <> v_idempotency_key
  ) then
    return leader_private.leader_production_command_error(v_request_id, 'duplicate_request', 'request_id was already used');
  end if;


  select * into v_order
  from public.leader_orders
  where id = v_order_id
  for update;
  if not found then
    return leader_private.leader_production_command_error(v_request_id, 'not_found', 'Order was not found');
  end if;
  if v_order.is_archived is true then
    return leader_private.leader_production_command_error(v_request_id, 'conflict', 'Archived order cannot enter production');
  end if;
  if v_order.updated_at is distinct from v_expected_updated_at then
    return leader_private.leader_production_command_error(v_request_id, 'conflict', 'Order changed after it was loaded');
  end if;

  v_order_status_key := lower(replace(btrim(coalesce(v_order.status, '')), 'ё', 'е'));
  if v_order_status_key in ('закрыт','закрыто','отменен','отменено','отмена','cancelled','closed') then
    return leader_private.leader_production_command_error(v_request_id, 'conflict', 'Closed or cancelled order cannot enter production');
  end if;

  v_order_layout_key := lower(replace(btrim(coalesce(v_order.layout_status, '')), 'ё', 'е'));
  if not (
    v_order_layout_key like '%согласован%'
    or v_order_layout_key like '%утвержден%'
    or v_order_layout_key = 'готов'
    or v_order_layout_key like '%готовый макет%'
    or v_order_layout_key like '%не требуется%'
  ) then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'Order layout is not approved');
  end if;

  if v_design_task_id is not null then
    select * into v_design
    from public.leader_design_tasks
    where id = v_design_task_id
    for update;
    if not found or v_design.order_id is distinct from v_order.id then
      return leader_private.leader_production_command_error(v_request_id, 'not_found', 'Design task was not found for this order');
    end if;
    if v_design.production_job_id is not null then
      return leader_private.leader_production_command_error(v_request_id, 'conflict', 'Design task is already linked to production');
    end if;
    v_design_layout_key := lower(replace(btrim(coalesce(v_design.layout_status, '')), 'ё', 'е'));
    if v_design.approved_at is null
       and not (
         v_design_layout_key like '%согласован%'
         or v_design_layout_key like '%утвержден%'
         or v_design_layout_key = 'готов'
         or v_design_layout_key like '%готовый макет%'
       ) then
      return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'Design task does not prove layout approval');
    end if;
    v_file_url := coalesce(v_file_url, nullif(btrim(coalesce(v_design.layout_link, '')), ''));
  end if;

  v_file_url := coalesce(v_file_url, nullif(btrim(coalesce(v_order.layout_link, '')), ''));
  if v_file_url is null then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('code','layout_file_missing'));
  end if;
  if v_deadline is null and v_order.deadline is not null then
    v_deadline := v_order.deadline::timestamptz;
  end if;
  if v_deadline is null then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('code','production_deadline_missing'));
  end if;
  v_contractor_cost := coalesce(v_contractor_cost, v_order.contractor_cost, 0);

  perform 1
  from public.leader_production_jobs
  where order_id = v_order.id
    and production_status not in ('Готово','Выдано','Не требуется','Отменено')
  for update;
  if found then
    return leader_private.leader_production_command_error(v_request_id, 'conflict', 'Active production job already exists for this order');
  end if;

  insert into public.leader_production_jobs (
    owner_id, order_id, title, production_status, created_by, contractor_id,
    layout_status, priority, deadline, sent_to_contractor_at, contractor_cost,
    client_total, file_url, technical_task, created_at, updated_at
  ) values (
    v_actor_id, v_order.id, v_title, 'В очереди', v_actor_id, v_contractor_id,
    'Макет согласован', v_priority, v_deadline, v_now, v_contractor_cost,
    v_order.client_total, v_file_url, v_technical_task, v_now, v_now
  ) returning * into v_job;

  insert into public.leader_production_events (
    owner_id, job_id, order_id, event_type, old_status, new_status, body,
    created_by, created_by_email, created_at
  ) values (
    v_actor_id, v_job.id, v_order.id, 'Создание задания', 'Не передано', 'В очереди',
    'Производственное задание создано из согласованного заказа.',
    v_actor_id, v_actor_email, v_now
  ) returning * into v_event;

  update public.leader_orders
  set production_status = 'В очереди',
      layout_status = case
        when lower(replace(btrim(coalesce(layout_status, '')), 'ё', 'е')) like '%не требуется%'
          then layout_status
        else 'Макет согласован'
      end,
      layout_link = coalesce(v_file_url, layout_link),
      current_stage = 'Производство: В очереди',
      next_action = 'Контролировать производство',
      stage_updated_at = v_now,
      updated_at = v_now
  where id = v_order.id
  returning * into v_order;

  if v_design_task_id is not null then
    update public.leader_design_tasks
    set production_job_id = v_job.id,
        updated_by = v_actor_id,
        updated_at = v_now
    where id = v_design_task_id
    returning * into v_design;
  end if;

  v_response := jsonb_build_object(
    'ok', true,
    'request_id', v_request_id,
    'entity', jsonb_build_object(
      'id', v_job.id,
      'order_id', v_job.order_id,
      'title', v_job.title,
      'production_status', v_job.production_status,
      'layout_status', v_job.layout_status,
      'priority', v_job.priority,
      'deadline', v_job.deadline,
      'contractor_id', v_job.contractor_id,
      'contractor_cost', v_job.contractor_cost,
      'client_total', v_job.client_total,
      'file_url', v_job.file_url,
      'technical_task', v_job.technical_task,
      'sent_to_contractor_at', v_job.sent_to_contractor_at,
      'created_at', v_job.created_at,
      'updated_at', v_job.updated_at
    ),
    'order', jsonb_build_object(
      'id', v_order.id,
      'production_status', v_order.production_status,
      'layout_status', v_order.layout_status,
      'layout_link', v_order.layout_link,
      'current_stage', v_order.current_stage,
      'next_action', v_order.next_action,
      'updated_at', v_order.updated_at,
      'stage_updated_at', v_order.stage_updated_at
    ),
    'design_task', case when v_design_task_id is null then null else jsonb_build_object(
      'id', v_design.id,
      'production_job_id', v_design.production_job_id,
      'updated_at', v_design.updated_at
    ) end,
    'events', jsonb_build_array(jsonb_build_object(
      'id', v_event.id,
      'event_type', v_event.event_type,
      'old_status', v_event.old_status,
      'new_status', v_event.new_status,
      'created_at', v_event.created_at
    )),
    'warnings', v_warnings,
    'idempotent_replay', false
  );

  v_response := jsonb_set(v_response, '{entity}', (v_response->'entity') - ARRAY['contractor_cost','client_total','installer_cost','client_price','profit','internal_comment']);
  insert into leader_private.leader_command_receipts (
    action, idempotency_key, request_id, request_hash, actor_id,
    state, response, created_at, updated_at, completed_at
  ) values (
    'production_job.create_from_order', v_idempotency_key, v_request_id,
    v_request_hash, v_actor_id, 'success', v_response, v_now, v_now, v_now
  );

  return v_response;
exception
  when unique_violation then
    return leader_private.leader_production_command_error(v_request_id, 'conflict', 'Active production job or command receipt already exists');
  when others then
    get stacked diagnostics v_exception_message = message_text;
    return leader_private.leader_production_command_error(
      v_request_id,
      'persistence_failed',
      'Production job creation could not be persisted'
    );
end
$function$;

CREATE OR REPLACE FUNCTION public.leader_create_production_job_from_order_rpc(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_request jsonb;
  v_payload jsonb;
  v_request_id uuid;
  v_actor_id uuid;
  v_order_id uuid;
  v_design_task_id uuid;
  v_order_layout_status text;
  v_design_layout_status text;
  v_design_approved_at timestamptz;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return leader_private.leader_production_command_error(null, 'validation_error', 'RPC payload must be an object');
  end if;

  v_request := p_payload -> 'request';
  v_payload := v_request -> 'payload';
  begin
    v_actor_id := nullif(btrim(coalesce(p_payload ->> 'actor_id','')),'')::uuid;
    v_request_id := nullif(btrim(coalesce(v_request ->> 'request_id', '')), '')::uuid;
    v_order_id := nullif(btrim(coalesce(v_payload ->> 'order_id', '')), '')::uuid;
    v_design_task_id := nullif(btrim(coalesce(v_payload ->> 'design_task_id', '')), '')::uuid;
  exception when others then
    return public.leader_create_production_job_from_order_impl_rpc(p_payload);
  end;


  if not leader_private.leader_actor_has_crm_action(v_actor_id, 'production.write') then
    return leader_private.leader_production_command_error(v_request_id, 'forbidden', 'production.write permission is required');
  end if;
  -- Full validation is delegated before looking up any business data.
  if btrim(coalesce(v_request ->> 'action','')) <> 'production_job.create_from_order' then
    return public.leader_create_production_job_from_order_impl_rpc(p_payload);
  end if;
  if v_order_id is not null then
    select layout_status into v_order_layout_status
    from public.leader_orders
    where id = v_order_id;

    if found and not leader_private.leader_layout_is_approved(v_order_layout_status) then
      return leader_private.leader_production_command_error(
        v_request_id,
        'validation_error',
        'Order layout is not approved'
      );
    end if;
  end if;

  if v_design_task_id is not null then
    select layout_status, approved_at
    into v_design_layout_status, v_design_approved_at
    from public.leader_design_tasks
    where id = v_design_task_id;

    if found
       and v_design_approved_at is null
       and not leader_private.leader_layout_is_approved(v_design_layout_status) then
      return leader_private.leader_production_command_error(
        v_request_id,
        'validation_error',
        'Design task does not prove layout approval'
      );
    end if;
  end if;

  return public.leader_create_production_job_from_order_impl_rpc(p_payload);
end
$function$;

CREATE OR REPLACE FUNCTION public.leader_read_installation_job_rpc(p_actor_id uuid, p_job_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_job public.leader_installation_jobs%rowtype;
  v_result jsonb;
begin
  if p_actor_id is null or p_job_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'actor_id and job_id are required')
    );
  end if;

  if not leader_private.leader_actor_has_crm_action(p_actor_id, 'installation.read') then
    return jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'forbidden', 'message', 'installation.read permission is required')
    );
  end if;

  select * into v_job
  from public.leader_installation_jobs
  where id = p_job_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'not_found', 'message', 'Installation job not found')
    );
  end if;

  select jsonb_build_object(
    'ok', true,
    'action', 'installation_job.read',
    'entity', jsonb_build_object(
      'id', v_job.id,
      'order_id', v_job.order_id,
      'production_job_id', v_job.production_job_id,
      'title', v_job.title,
      'install_status', v_job.install_status,
      'priority', v_job.priority,
      'installer_name', v_job.installer_name,
      'installer_phone', v_job.installer_phone,
      'address', v_job.address,
      'scheduled_at', v_job.scheduled_at,
      'started_at', v_job.started_at,
      'completed_at', v_job.completed_at,
      'accepted_at', v_job.accepted_at,
      'technical_task', v_job.technical_task,
      'tools_required', v_job.tools_required,
      'installer_comment', v_job.installer_comment,
      'result_comment', v_job.result_comment,
      'before_photo_url', v_job.before_photo_url,
      'after_photo_url', v_job.after_photo_url,
      'created_at', v_job.created_at,
      'updated_at', v_job.updated_at
    ),
    'order', case when v_job.order_id is null then null else (
      select jsonb_build_object(
        'id', o.id,
        'order_number', o.order_number,
        'project_name', o.project_name,
        'status', o.status,
        'installation_status', o.installation_status,
        'layout_link', o.layout_link,
        'installation_address', o.installation_address,
        'installation_scheduled_at', o.installation_scheduled_at,
        'installation_completed_at', o.installation_completed_at,
        'installer_name', o.installer_name,
        'installer_phone', o.installer_phone,
        'current_stage', o.current_stage,
        'stage_updated_at', o.stage_updated_at,
        'updated_at', o.updated_at
      )
      from public.leader_orders o
      where o.id = v_job.order_id
    ) end,
    'production', case when v_job.production_job_id is null then null else (
      select jsonb_build_object(
        'id', p.id,
        'title', p.title,
        'production_status', p.production_status,
        'layout_status', p.layout_status,
        'priority', p.priority,
        'deadline', p.deadline,
        'ready_at', p.ready_at,
        'file_url', p.file_url,
        'technical_task', p.technical_task,
        'updated_at', p.updated_at
      )
      from public.leader_production_jobs p
      where p.id = v_job.production_job_id
    ) end,
    'items', coalesce((
      select jsonb_agg(item_obj order by created_at asc)
      from (
        select i.created_at,
               jsonb_build_object(
                 'id', i.id,
                 'name', i.name,
                 'unit', i.unit,
                 'qty', i.qty,
                 'width', i.width,
                 'height', i.height,
                 'comment', i.comment,
                 'created_at', i.created_at
               ) as item_obj
        from public.leader_installation_job_items i
        where i.job_id = v_job.id
        order by i.created_at asc
        limit 120
      ) q
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(event_obj order by created_at desc)
      from (
        select e.created_at,
               jsonb_build_object(
                 'id', e.id,
                 'event_type', e.event_type,
                 'old_status', e.old_status,
                 'new_status', e.new_status,
                 'body', e.body,
                 'created_at', e.created_at
               ) as event_obj
        from public.leader_installation_events e
        where e.job_id = v_job.id
        order by e.created_at desc
        limit 30
      ) q
    ), '[]'::jsonb),
    'comments', coalesce((
      select jsonb_agg(comment_obj order by created_at desc)
      from (
        select c.created_at,
               jsonb_build_object(
                 'id', c.id,
                 'comment_type', c.comment_type,
                 'body', c.body,
                 'created_at', c.created_at
               ) as comment_obj
        from public.leader_installation_comments c
        where c.job_id = v_job.id
          and lower(btrim(coalesce(c.comment_type, ''))) <> 'internal'
        order by c.created_at desc
        limit 20
      ) q
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
exception when others then
  return jsonb_build_object(
    'ok', false,
    'error', jsonb_build_object('code', 'read_failed', 'message', 'Installation job could not be read')
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.leader_update_installation_job_rpc(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_actor_id uuid;
  v_request jsonb;
  v_request_id uuid;
  v_expected_updated_at timestamptz;
  v_payload jsonb;
  v_patch jsonb;
  v_job_id uuid;
  v_linked_order_id uuid;
  v_idempotency_key text;
  v_request_hash text;
  v_receipt leader_private.leader_command_receipts%rowtype;
  v_job public.leader_installation_jobs%rowtype;
  v_order public.leader_orders%rowtype;
  v_event public.leader_installation_events%rowtype;
  v_now timestamptz := clock_timestamp();
  v_old_status text;
  v_old_key text;
  v_new_key text;
  v_status text;
  v_title text;
  v_installer_name text;
  v_installer_phone text;
  v_address text;
  v_scheduled_at timestamptz;
  v_before_photo_url text;
  v_after_photo_url text;
  v_technical_task text;
  v_tools_required text;
  v_installer_comment text;
  v_started_at timestamptz;
  v_completed_at timestamptz;
  v_response jsonb;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return leader_private.leader_installation_command_error(null, 'validation_error', 'RPC payload must be an object');
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_payload) as k(key)
    where key not in ('actor_id','actor_email','request')
  ) then
    return leader_private.leader_installation_command_error(null, 'validation_error', 'Unknown RPC payload field');
  end if;

  begin
    v_actor_id := nullif(btrim(coalesce(p_payload ->> 'actor_id', '')), '')::uuid;
  exception when others then
    return leader_private.leader_installation_command_error(null, 'validation_error', 'actor_id must be a UUID');
  end;
  if v_actor_id is null then
    return leader_private.leader_installation_command_error(null, 'validation_error', 'actor_id is required');
  end if;

  v_request := p_payload -> 'request';
  if v_request is null or jsonb_typeof(v_request) <> 'object' then
    return leader_private.leader_installation_command_error(null, 'validation_error', 'request must be an object');
  end if;
  if exists (
    select 1 from jsonb_object_keys(v_request) as k(key)
    where key not in ('action','request_id','expected_updated_at','payload')
  ) then
    return leader_private.leader_installation_command_error(null, 'validation_error', 'Unknown request field');
  end if;

  begin
    v_request_id := nullif(btrim(coalesce(v_request ->> 'request_id', '')), '')::uuid;
    v_expected_updated_at := nullif(btrim(coalesce(v_request ->> 'expected_updated_at', '')), '')::timestamptz;
  exception when others then
    return leader_private.leader_installation_command_error(null, 'validation_error', 'request_id or expected_updated_at is invalid');
  end;
  if v_request_id is null or v_expected_updated_at is null then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'request_id and expected_updated_at are required');
  end if;
  if btrim(coalesce(v_request ->> 'action', '')) <> 'installation_job.update' then
    return leader_private.leader_installation_command_error(v_request_id, 'unknown_action', 'Unsupported action');
  end if;

  if not leader_private.leader_actor_has_crm_action(v_actor_id, 'installation.write') then
    return leader_private.leader_installation_command_error(v_request_id, 'forbidden', 'installation.write permission is required');
  end if;

  v_payload := v_request -> 'payload';
  if v_payload is null or jsonb_typeof(v_payload) <> 'object' then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'payload must be an object');
  end if;
  if exists (
    select 1 from jsonb_object_keys(v_payload) as k(key)
    where key not in ('job_id','idempotency_key','patch')
  ) then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'Unknown business payload field');
  end if;

  begin
    v_job_id := nullif(btrim(coalesce(v_payload ->> 'job_id', '')), '')::uuid;
  exception when others then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'job_id must be a UUID');
  end;
  v_idempotency_key := btrim(coalesce(v_payload ->> 'idempotency_key', ''));
  v_patch := v_payload -> 'patch';
  if v_job_id is null or char_length(v_idempotency_key) not between 1 and 160 then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'job_id and valid idempotency_key are required');
  end if;
  if v_patch is null or jsonb_typeof(v_patch) <> 'object' or v_patch = '{}'::jsonb then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'patch must be a non-empty object');
  end if;
  if exists (
    select 1 from jsonb_object_keys(v_patch) as k(key)
    where key not in (
      'title','install_status','installer_name','installer_phone','address','scheduled_at',
      'before_photo_url','after_photo_url','technical_task','tools_required','installer_comment'
    )
  ) then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'Patch contains unknown or server-owned fields');
  end if;

  v_request_hash := encode(
    extensions.digest(
      convert_to((jsonb_build_object(
        'actor_id', v_actor_id,
        'action', 'installation_job.update',
        'expected_updated_at', v_expected_updated_at,
        'payload', v_payload
      ))::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  perform pg_advisory_xact_lock(hashtextextended('installation_job.update:key:' || v_idempotency_key, 0));
  perform pg_advisory_xact_lock(hashtextextended('installation_job.update:request:' || v_request_id::text, 0));

  select * into v_receipt
  from leader_private.leader_command_receipts
  where action = 'installation_job.update'
    and idempotency_key = v_idempotency_key
  for update;

  if found then
    if v_receipt.actor_id IS DISTINCT FROM v_actor_id or v_receipt.request_hash IS DISTINCT FROM v_request_hash then
      return leader_private.leader_installation_command_error(v_request_id, 'conflict', 'Idempotency key was used with another payload');
    end if;
    if v_receipt.state = 'success' and v_receipt.response is not null then
      return v_receipt.response || jsonb_build_object('idempotent_replay', true, 'request_id', v_request_id);
    end if;
    return leader_private.leader_installation_command_error(v_request_id, 'duplicate_request', 'Request is already in progress');
  end if;

  if exists (
    select 1 from leader_private.leader_command_receipts
    where action = 'installation_job.update'
      and request_id = v_request_id
  ) then
    return leader_private.leader_installation_command_error(v_request_id, 'duplicate_request', 'request_id was already used');
  end if;

  -- Read only the parent id before acquiring row locks. Revalidate after locking the job.
  select order_id into v_linked_order_id
  from public.leader_installation_jobs where id = v_job_id;
  if not found then
    return leader_private.leader_installation_command_error(v_request_id, 'not_found', 'Job not found');
  end if;
  if v_linked_order_id is not null then
    select * into v_order from public.leader_orders
    where id = v_linked_order_id for update;
    if not found then
      return leader_private.leader_installation_command_error(v_request_id, 'not_found', 'Linked order not found');
    end if;
    if v_order.is_archived is true
       or lower(replace(btrim(coalesce(v_order.status,'')), 'ё', 'е'))
          in ('закрыт','закрыто','отменен','отменено','отмена','cancelled','closed') then
      return leader_private.leader_installation_command_error(v_request_id, 'invalid_transition', 'Closed or archived order cannot accept job changes');
    end if;
  end if;
  select * into v_job
  from public.leader_installation_jobs
  where id = v_job_id
  for update;
  if found and v_job.order_id is distinct from v_linked_order_id then
    return leader_private.leader_installation_command_error(v_request_id, 'conflict', 'Linked order changed while locking the job');
  end if;

  if not found then
    return leader_private.leader_installation_command_error(v_request_id, 'not_found', 'Installation job not found');
  end if;
  if v_job.updated_at is distinct from v_expected_updated_at then
    return leader_private.leader_installation_command_error(v_request_id, 'conflict', 'Installation job changed since it was loaded');
  end if;


  v_old_status := v_job.install_status;
  v_old_key := leader_private.leader_installation_status_key(v_old_status);
  v_status := v_old_status;

  if jsonb_exists(v_patch, 'install_status') then
    if jsonb_typeof(v_patch -> 'install_status') <> 'string' then
      return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'install_status must be a string');
    end if;
    v_status := btrim(v_patch ->> 'install_status');
    if v_status = '' then
      return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'install_status cannot be empty');
    end if;
    v_new_key := leader_private.leader_installation_status_key(v_status);

    if v_old_key is null then
      if v_status is distinct from v_old_status then
        return leader_private.leader_installation_command_error(v_request_id, 'invalid_transition', 'Unknown current installation status can only be preserved');
      end if;
    elsif v_new_key is null then
      return leader_private.leader_installation_command_error(v_request_id, 'invalid_transition', 'Unknown target installation status');
    elsif v_new_key = v_old_key then
      v_status := v_old_status;
    elsif not leader_private.leader_installation_transition_allowed(v_old_key, v_new_key) then
      return leader_private.leader_installation_command_error(v_request_id, 'invalid_transition', 'Installation status transition is not allowed');
    else
      v_status := leader_private.leader_installation_status_label(v_new_key);
    end if;
  else
    v_new_key := v_old_key;
  end if;

  if jsonb_exists(v_patch, 'title') then
    if jsonb_typeof(v_patch -> 'title') <> 'string' then
      return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'title must be a string');
    end if;
    v_title := btrim(v_patch ->> 'title');
    if v_title = '' or char_length(v_title) > 500 then
      return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'title must contain 1 to 500 characters');
    end if;
  else
    v_title := v_job.title;
  end if;

  if jsonb_exists(v_patch, 'scheduled_at') then
    if v_patch -> 'scheduled_at' = 'null'::jsonb then
      v_scheduled_at := null;
    elsif jsonb_typeof(v_patch -> 'scheduled_at') = 'string' then
      begin
        v_scheduled_at := nullif(btrim(v_patch ->> 'scheduled_at'), '')::timestamptz;
      exception when others then
        return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'scheduled_at must be ISO datetime or null');
      end;
    else
      return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'scheduled_at must be ISO datetime or null');
    end if;
  else
    v_scheduled_at := v_job.scheduled_at;
  end if;

  if jsonb_exists(v_patch, 'installer_name') and v_patch -> 'installer_name' <> 'null'::jsonb and jsonb_typeof(v_patch -> 'installer_name') <> 'string' then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'installer_name must be string or null');
  end if;
  if jsonb_exists(v_patch, 'installer_phone') and v_patch -> 'installer_phone' <> 'null'::jsonb and jsonb_typeof(v_patch -> 'installer_phone') <> 'string' then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'installer_phone must be string or null');
  end if;
  if jsonb_exists(v_patch, 'address') and v_patch -> 'address' <> 'null'::jsonb and jsonb_typeof(v_patch -> 'address') <> 'string' then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'address must be string or null');
  end if;
  if jsonb_exists(v_patch, 'before_photo_url') and v_patch -> 'before_photo_url' <> 'null'::jsonb and jsonb_typeof(v_patch -> 'before_photo_url') <> 'string' then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'before_photo_url must be string or null');
  end if;
  if jsonb_exists(v_patch, 'after_photo_url') and v_patch -> 'after_photo_url' <> 'null'::jsonb and jsonb_typeof(v_patch -> 'after_photo_url') <> 'string' then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'after_photo_url must be string or null');
  end if;
  if jsonb_exists(v_patch, 'technical_task') and v_patch -> 'technical_task' <> 'null'::jsonb and jsonb_typeof(v_patch -> 'technical_task') <> 'string' then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'technical_task must be string or null');
  end if;
  if jsonb_exists(v_patch, 'tools_required') and v_patch -> 'tools_required' <> 'null'::jsonb and jsonb_typeof(v_patch -> 'tools_required') <> 'string' then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'tools_required must be string or null');
  end if;
  if jsonb_exists(v_patch, 'installer_comment') and v_patch -> 'installer_comment' <> 'null'::jsonb and jsonb_typeof(v_patch -> 'installer_comment') <> 'string' then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'installer_comment must be string or null');
  end if;

  v_installer_name := case when jsonb_exists(v_patch, 'installer_name') then nullif(btrim(coalesce(v_patch ->> 'installer_name', '')), '') else v_job.installer_name end;
  v_installer_phone := case when jsonb_exists(v_patch, 'installer_phone') then nullif(btrim(coalesce(v_patch ->> 'installer_phone', '')), '') else v_job.installer_phone end;
  v_address := case when jsonb_exists(v_patch, 'address') then nullif(btrim(coalesce(v_patch ->> 'address', '')), '') else v_job.address end;
  v_before_photo_url := case when jsonb_exists(v_patch, 'before_photo_url') then nullif(btrim(coalesce(v_patch ->> 'before_photo_url', '')), '') else v_job.before_photo_url end;
  v_after_photo_url := case when jsonb_exists(v_patch, 'after_photo_url') then nullif(btrim(coalesce(v_patch ->> 'after_photo_url', '')), '') else v_job.after_photo_url end;
  v_technical_task := case when jsonb_exists(v_patch, 'technical_task') then nullif(btrim(coalesce(v_patch ->> 'technical_task', '')), '') else v_job.technical_task end;
  v_tools_required := case when jsonb_exists(v_patch, 'tools_required') then nullif(btrim(coalesce(v_patch ->> 'tools_required', '')), '') else v_job.tools_required end;
  v_installer_comment := case when jsonb_exists(v_patch, 'installer_comment') then nullif(btrim(coalesce(v_patch ->> 'installer_comment', '')), '') else v_job.installer_comment end;

  if char_length(coalesce(v_installer_name, '')) > 500
     or char_length(coalesce(v_installer_phone, '')) > 120
     or char_length(coalesce(v_address, '')) > 2000
     or char_length(coalesce(v_before_photo_url, '')) > 2000
     or char_length(coalesce(v_after_photo_url, '')) > 2000
     or char_length(coalesce(v_technical_task, '')) > 12000
     or char_length(coalesce(v_tools_required, '')) > 8000
     or char_length(coalesce(v_installer_comment, '')) > 8000 then
    return leader_private.leader_installation_command_error(v_request_id, 'validation_error', 'One or more patch fields exceed maximum length');
  end if;

  v_started_at := v_job.started_at;
  v_completed_at := v_job.completed_at;
  if v_new_key is distinct from v_old_key then
    if v_new_key = 'in_progress' and v_started_at is null then
      v_started_at := v_now;
    end if;
    if v_new_key = 'completed' and v_completed_at is null then
      v_completed_at := v_now;
    end if;
  end if;

  insert into leader_private.leader_command_receipts (
    action, idempotency_key, request_id, request_hash, actor_id, state
  ) values (
    'installation_job.update', v_idempotency_key, v_request_id, v_request_hash, v_actor_id, 'in_progress'
  ) returning * into v_receipt;

  update public.leader_installation_jobs
  set title = v_title,
      install_status = v_status,
      installer_name = v_installer_name,
      installer_phone = v_installer_phone,
      address = v_address,
      scheduled_at = v_scheduled_at,
      started_at = v_started_at,
      completed_at = v_completed_at,
      before_photo_url = v_before_photo_url,
      after_photo_url = v_after_photo_url,
      technical_task = v_technical_task,
      tools_required = v_tools_required,
      installer_comment = v_installer_comment,
      updated_by = v_actor_id,
      updated_at = v_now
  where id = v_job_id
  returning * into v_job;

  if v_job.order_id is not null then
    update public.leader_orders
    set installation_status = v_status,
        installation_address = v_address,
        installation_scheduled_at = v_scheduled_at,
        installation_completed_at = v_completed_at,
        installer_name = v_installer_name,
        installer_phone = v_installer_phone,
        current_stage = 'Монтаж: ' || coalesce(v_status, 'Не назначен'),
        updated_at = v_now,
        stage_updated_at = v_now
    where id = v_job.order_id
    returning * into v_order;
  end if;

  insert into public.leader_installation_events (
    job_id, order_id, event_type, old_status, new_status, body, created_by
  ) values (
    v_job.id, v_job.order_id, 'Обновление монтажа', v_old_status, v_status,
    'Монтажное задание обновлено атомарной командой CRM v4', v_actor_id
  ) returning * into v_event;

  v_response := jsonb_build_object(
    'ok', true,
    'request_id', v_request_id,
    'entity', jsonb_build_object(
      'id', v_job.id,
      'order_id', v_job.order_id,
      'production_job_id', v_job.production_job_id,
      'title', v_job.title,
      'install_status', v_job.install_status,
      'installer_name', v_job.installer_name,
      'installer_phone', v_job.installer_phone,
      'address', v_job.address,
      'scheduled_at', v_job.scheduled_at,
      'started_at', v_job.started_at,
      'completed_at', v_job.completed_at,
      'before_photo_url', v_job.before_photo_url,
      'after_photo_url', v_job.after_photo_url,
      'technical_task', v_job.technical_task,
      'tools_required', v_job.tools_required,
      'installer_comment', v_job.installer_comment,
      'updated_at', v_job.updated_at
    ),
    'order', case when v_job.order_id is null then null else jsonb_build_object(
      'id', v_order.id,
      'installation_status', v_order.installation_status,
      'installation_address', v_order.installation_address,
      'installation_scheduled_at', v_order.installation_scheduled_at,
      'installation_completed_at', v_order.installation_completed_at,
      'installer_name', v_order.installer_name,
      'installer_phone', v_order.installer_phone,
      'current_stage', v_order.current_stage,
      'updated_at', v_order.updated_at,
      'stage_updated_at', v_order.stage_updated_at
    ) end,
    'events', jsonb_build_array(jsonb_build_object(
      'id', v_event.id,
      'event_type', v_event.event_type,
      'old_status', v_event.old_status,
      'new_status', v_event.new_status,
      'body', v_event.body,
      'created_at', v_event.created_at
    )),
    'idempotent_replay', false
  );

  update leader_private.leader_command_receipts
  set state = 'success', response = v_response, updated_at = v_now, completed_at = v_now
  where id = v_receipt.id;

  return v_response;
exception when others then
  return leader_private.leader_installation_command_error(v_request_id, 'persistence_failed', 'Installation job update could not be persisted');
end
$function$;

CREATE OR REPLACE FUNCTION public.leader_update_production_job_rpc(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_actor_id uuid;
  v_actor_email text;
  v_request jsonb;
  v_request_id uuid;
  v_expected_updated_at timestamptz;
  v_payload jsonb;
  v_patch jsonb;
  v_job_id uuid;
  v_linked_order_id uuid;
  v_idempotency_key text;
  v_request_hash text;
  v_receipt leader_private.leader_command_receipts%rowtype;
  v_job public.leader_production_jobs%rowtype;
  v_order public.leader_orders%rowtype;
  v_event public.leader_production_events%rowtype;
  v_now timestamptz := clock_timestamp();
  v_old_status text;
  v_old_key text;
  v_new_key text;
  v_status text;
  v_title text;
  v_layout_status text;
  v_priority text;
  v_deadline timestamptz;
  v_file_url text;
  v_technical_task text;
  v_contractor_comment text;
  v_internal_comment text;
  v_sent_to_contractor_at timestamptz;
  v_ready_at timestamptz;
  v_issued_at timestamptz;
  v_response jsonb;
  v_exception_message text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return leader_private.leader_production_command_error(null, 'validation_error', 'RPC payload must be an object');
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_payload) as k(key)
    where key not in ('actor_id','actor_email','request')
  ) then
    return leader_private.leader_production_command_error(null, 'validation_error', 'Unknown RPC payload field');
  end if;

  begin
    v_actor_id := nullif(btrim(coalesce(p_payload ->> 'actor_id', '')), '')::uuid;
  exception when others then
    return leader_private.leader_production_command_error(null, 'validation_error', 'actor_id must be a UUID');
  end;
  if v_actor_id is null then
    return leader_private.leader_production_command_error(null, 'validation_error', 'actor_id is required');
  end if;
  v_actor_email := left(nullif(lower(btrim(coalesce(p_payload ->> 'actor_email', ''))), ''), 240);

  v_request := p_payload -> 'request';
  if v_request is null or jsonb_typeof(v_request) <> 'object' then
    return leader_private.leader_production_command_error(null, 'validation_error', 'request must be an object');
  end if;
  if exists (
    select 1 from jsonb_object_keys(v_request) as k(key)
    where key not in ('action','request_id','expected_updated_at','payload')
  ) then
    return leader_private.leader_production_command_error(null, 'validation_error', 'Unknown request field');
  end if;

  begin
    v_request_id := nullif(btrim(coalesce(v_request ->> 'request_id', '')), '')::uuid;
    v_expected_updated_at := nullif(btrim(coalesce(v_request ->> 'expected_updated_at', '')), '')::timestamptz;
  exception when others then
    return leader_private.leader_production_command_error(null, 'validation_error', 'request_id or expected_updated_at is invalid');
  end;
  if v_request_id is null or v_expected_updated_at is null then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'request_id and expected_updated_at are required');
  end if;
  if btrim(coalesce(v_request ->> 'action', '')) <> 'production_job.update' then
    return leader_private.leader_production_command_error(v_request_id, 'unknown_action', 'Unsupported action');
  end if;

  v_payload := v_request -> 'payload';
  if v_payload is null or jsonb_typeof(v_payload) <> 'object' then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'payload must be an object');
  end if;
  if exists (
    select 1 from jsonb_object_keys(v_payload) as k(key)
    where key not in ('job_id','idempotency_key','patch')
  ) then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'Unknown business payload field');
  end if;

  begin
    v_job_id := nullif(btrim(coalesce(v_payload ->> 'job_id', '')), '')::uuid;
  exception when others then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'job_id must be a UUID');
  end;
  v_idempotency_key := btrim(coalesce(v_payload ->> 'idempotency_key', ''));
  v_patch := v_payload -> 'patch';
  if v_job_id is null or char_length(v_idempotency_key) not between 1 and 160 then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'job_id and valid idempotency_key are required');
  end if;
  if v_patch is null or jsonb_typeof(v_patch) <> 'object' or v_patch = '{}'::jsonb then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'patch must be a non-empty object');
  end if;
  if exists (
    select 1 from jsonb_object_keys(v_patch) as k(key)
    where key not in (
      'title','production_status','layout_status','priority','deadline','file_url',
      'technical_task','contractor_comment','internal_comment'
    )
  ) then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'Patch contains unknown or server-owned fields');
  end if;

  if not leader_private.leader_actor_has_crm_action(v_actor_id, 'production.write') then
    return leader_private.leader_production_command_error(v_request_id, 'forbidden', 'production.write permission is required');
  end if;
  if v_patch ? 'internal_comment'
     and not leader_private.leader_actor_has_crm_action(v_actor_id, 'orders.update') then
    return leader_private.leader_production_command_error(v_request_id, 'forbidden', 'orders.update permission is required for internal_comment');
  end if;

  v_request_hash := encode(
    extensions.digest(
      convert_to((jsonb_build_object(
        'actor_id', v_actor_id,
        'action', 'production_job.update',
        'expected_updated_at', v_expected_updated_at,
        'payload', v_payload
      ))::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  perform pg_advisory_xact_lock(hashtextextended('production_job.update:key:' || v_idempotency_key, 0));
  perform pg_advisory_xact_lock(hashtextextended('production_job.update:request:' || v_request_id::text, 0));

  select * into v_receipt
  from leader_private.leader_command_receipts
  where action = 'production_job.update'
    and idempotency_key = v_idempotency_key
  for update;

  if found then
    if v_receipt.actor_id IS DISTINCT FROM v_actor_id or v_receipt.request_hash IS DISTINCT FROM v_request_hash then
      return leader_private.leader_production_command_error(v_request_id, 'conflict', 'Idempotency key was used with another payload');
    end if;
    if v_receipt.state = 'success' and v_receipt.response is not null then
      return v_receipt.response || jsonb_build_object('idempotent_replay', true, 'request_id', v_request_id);
    end if;
  end if;

  if exists (
    select 1
    from leader_private.leader_command_receipts
    where action = 'production_job.update'
      and request_id = v_request_id
      and idempotency_key <> v_idempotency_key
  ) then
    return leader_private.leader_production_command_error(v_request_id, 'duplicate_request', 'request_id was already used');
  end if;


  -- Read only the parent id before acquiring row locks. Revalidate after locking the job.
  select order_id into v_linked_order_id
  from public.leader_production_jobs where id = v_job_id;
  if not found then
    return leader_private.leader_production_command_error(v_request_id, 'not_found', 'Job not found');
  end if;
  if v_linked_order_id is not null then
    select * into v_order from public.leader_orders
    where id = v_linked_order_id for update;
    if not found then
      return leader_private.leader_production_command_error(v_request_id, 'not_found', 'Linked order not found');
    end if;
    if v_order.is_archived is true
       or lower(replace(btrim(coalesce(v_order.status,'')), 'ё', 'е'))
          in ('закрыт','закрыто','отменен','отменено','отмена','cancelled','closed') then
      return leader_private.leader_production_command_error(v_request_id, 'invalid_transition', 'Closed or archived order cannot accept job changes');
    end if;
  end if;
  select * into v_job
  from public.leader_production_jobs
  where id = v_job_id
  for update;
  if found and v_job.order_id is distinct from v_linked_order_id then
    return leader_private.leader_production_command_error(v_request_id, 'conflict', 'Linked order changed while locking the job');
  end if;
  if not found then
    return leader_private.leader_production_command_error(v_request_id, 'not_found', 'Production job was not found');
  end if;
  if v_job.updated_at <> v_expected_updated_at then
    return leader_private.leader_production_command_error(v_request_id, 'conflict', 'Production job changed after it was loaded');
  end if;


  v_title := case when v_patch ? 'title'
    then nullif(btrim(coalesce(v_patch ->> 'title', '')), '') else v_job.title end;
  v_layout_status := case when v_patch ? 'layout_status'
    then nullif(btrim(coalesce(v_patch ->> 'layout_status', '')), '') else v_job.layout_status end;
  v_priority := case when v_patch ? 'priority'
    then nullif(btrim(coalesce(v_patch ->> 'priority', '')), '') else v_job.priority end;

  if v_title is null or char_length(v_title) > 500 then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'title must contain 1 to 500 characters');
  end if;
  if v_layout_status is null or v_layout_status not in ('Макет не проверен','На согласовании','Макет согласован','Нужны правки') then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'layout_status is invalid');
  end if;
  if v_priority is null or v_priority not in ('Обычная','Высокая','Срочно') then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'priority is invalid');
  end if;

  begin
    v_deadline := case when v_patch ? 'deadline'
      then nullif(btrim(coalesce(v_patch ->> 'deadline', '')), '')::timestamptz else v_job.deadline end;
  exception when others then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'deadline must be an ISO datetime or null');
  end;

  v_file_url := case when v_patch ? 'file_url'
    then nullif(btrim(coalesce(v_patch ->> 'file_url', '')), '') else v_job.file_url end;
  v_technical_task := case when v_patch ? 'technical_task'
    then nullif(btrim(coalesce(v_patch ->> 'technical_task', '')), '') else v_job.technical_task end;
  v_contractor_comment := case when v_patch ? 'contractor_comment'
    then nullif(btrim(coalesce(v_patch ->> 'contractor_comment', '')), '') else v_job.contractor_comment end;
  v_internal_comment := case when v_patch ? 'internal_comment'
    then nullif(btrim(coalesce(v_patch ->> 'internal_comment', '')), '') else v_job.internal_comment end;

  if char_length(coalesce(v_file_url, '')) > 2000
     or char_length(coalesce(v_technical_task, '')) > 12000
     or char_length(coalesce(v_contractor_comment, '')) > 8000
     or char_length(coalesce(v_internal_comment, '')) > 8000 then
    return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'One or more text fields are too long');
  end if;

  v_old_status := v_job.production_status;
  v_old_key := leader_private.leader_production_status_key(v_old_status);
  v_status := v_old_status;
  if v_patch ? 'production_status' then
    v_status := nullif(btrim(coalesce(v_patch ->> 'production_status', '')), '');
    if v_status is null then
      return leader_private.leader_production_command_error(v_request_id, 'validation_error', 'production_status is required');
    end if;
    v_new_key := leader_private.leader_production_status_key(v_status);
    if v_old_key is null and v_status <> v_old_status then
      return leader_private.leader_production_command_error(v_request_id, 'invalid_transition', 'Unknown current production status cannot be changed');
    elsif v_old_key is not null and v_new_key is null then
      return leader_private.leader_production_command_error(v_request_id, 'invalid_transition', 'Unknown target production status');
    elsif v_old_key = v_new_key then
      v_status := v_old_status;
    elsif not leader_private.leader_production_transition_allowed(v_old_key, v_new_key) then
      return leader_private.leader_production_command_error(v_request_id, 'invalid_transition', 'Production status transition is not allowed');
    else
      v_status := leader_private.leader_production_status_label(v_new_key);
    end if;
  else
    v_new_key := v_old_key;
  end if;

  v_sent_to_contractor_at := v_job.sent_to_contractor_at;
  v_ready_at := v_job.ready_at;
  v_issued_at := v_job.issued_at;
  if v_old_key is distinct from v_new_key then
    if v_new_key in ('queued','in_production') then
      v_sent_to_contractor_at := coalesce(v_sent_to_contractor_at, v_now);
    elsif v_new_key = 'ready' then
      v_ready_at := coalesce(v_ready_at, v_now);
    elsif v_new_key = 'issued' then
      v_issued_at := coalesce(v_issued_at, v_now);
    end if;
  end if;

  update public.leader_production_jobs
  set title = v_title,
      production_status = v_status,
      layout_status = v_layout_status,
      priority = v_priority,
      deadline = v_deadline,
      file_url = v_file_url,
      technical_task = v_technical_task,
      contractor_comment = v_contractor_comment,
      internal_comment = v_internal_comment,
      sent_to_contractor_at = v_sent_to_contractor_at,
      ready_at = v_ready_at,
      issued_at = v_issued_at,
      updated_at = v_now
  where id = v_job_id
  returning * into v_job;

  if v_job.order_id is not null then
    update public.leader_orders
    set production_status = v_status,
        layout_status = v_layout_status,
        layout_link = v_file_url,
        current_stage = 'Производство: ' || v_status,
        updated_at = v_now,
        stage_updated_at = v_now
    where id = v_job.order_id
    returning * into v_order;
  end if;

  insert into public.leader_production_events (
    owner_id, job_id, order_id, event_type, old_status, new_status, body,
    created_by, created_by_email, created_at
  ) values (
    v_actor_id, v_job.id, v_job.order_id, 'Обновление задания',
    v_old_status, v_status,
    'Производственное задание обновлено атомарной командой CRM v4',
    v_actor_id, v_actor_email, v_now
  ) returning * into v_event;

  v_response := jsonb_build_object(
    'ok', true,
    'request_id', v_request_id,
    'entity', jsonb_build_object(
      'id', v_job.id,
      'order_id', v_job.order_id,
      'title', v_job.title,
      'production_status', v_job.production_status,
      'layout_status', v_job.layout_status,
      'priority', v_job.priority,
      'deadline', v_job.deadline,
      'sent_to_contractor_at', v_job.sent_to_contractor_at,
      'ready_at', v_job.ready_at,
      'issued_at', v_job.issued_at,
      'file_url', v_job.file_url,
      'technical_task', v_job.technical_task,
      'contractor_comment', v_job.contractor_comment,
      'updated_at', v_job.updated_at
    ),
    'order', case when v_job.order_id is null then null else jsonb_build_object(
      'id', v_order.id,
      'production_status', v_order.production_status,
      'layout_status', v_order.layout_status,
      'layout_link', v_order.layout_link,
      'current_stage', v_order.current_stage,
      'updated_at', v_order.updated_at,
      'stage_updated_at', v_order.stage_updated_at
    ) end,
    'events', jsonb_build_array(jsonb_build_object(
      'id', v_event.id,
      'event_type', v_event.event_type,
      'old_status', v_event.old_status,
      'new_status', v_event.new_status,
      'body', v_event.body,
      'created_at', v_event.created_at
    )),
    'idempotent_replay', false
  );

  insert into leader_private.leader_command_receipts (
    action, idempotency_key, request_id, request_hash, actor_id,
    state, response, created_at, updated_at, completed_at
  ) values (
    'production_job.update', v_idempotency_key, v_request_id, v_request_hash, v_actor_id,
    'success', v_response, v_now, v_now, v_now
  );

  return v_response;
exception when others then
  get stacked diagnostics v_exception_message = message_text;
  return leader_private.leader_production_command_error(
    v_request_id,
    'persistence_failed',
    'Production job update could not be persisted'
  );
end
$function$;


REVOKE ALL ON FUNCTION leader_private.leader_installation_command_error(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION leader_private.leader_installation_command_error(uuid,text,text) TO service_role;

REVOKE ALL ON FUNCTION leader_private.leader_installation_status_key(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION leader_private.leader_installation_status_key(text) TO service_role;

REVOKE ALL ON FUNCTION leader_private.leader_installation_status_label(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION leader_private.leader_installation_status_label(text) TO service_role;

REVOKE ALL ON FUNCTION leader_private.leader_installation_transition_allowed(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION leader_private.leader_installation_transition_allowed(text,text) TO service_role;

REVOKE ALL ON FUNCTION leader_private.leader_production_command_error(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION leader_private.leader_production_command_error(uuid,text,text) TO service_role;

REVOKE ALL ON FUNCTION leader_private.leader_production_is_installation_ready(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION leader_private.leader_production_is_installation_ready(text) TO service_role;

REVOKE ALL ON FUNCTION leader_private.leader_production_status_key(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION leader_private.leader_production_status_key(text) TO service_role;

REVOKE ALL ON FUNCTION leader_private.leader_production_status_label(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION leader_private.leader_production_status_label(text) TO service_role;

REVOKE ALL ON FUNCTION leader_private.leader_production_transition_allowed(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION leader_private.leader_production_transition_allowed(text,text) TO service_role;

REVOKE ALL ON FUNCTION public.leader_create_installation_job_from_order_rpc(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.leader_create_installation_job_from_order_rpc(jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.leader_create_production_job_from_order_impl_rpc(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.leader_create_production_job_from_order_impl_rpc(jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.leader_create_production_job_from_order_rpc(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.leader_create_production_job_from_order_rpc(jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.leader_read_installation_job_rpc(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.leader_read_installation_job_rpc(uuid,uuid) TO service_role;

REVOKE ALL ON FUNCTION public.leader_update_installation_job_rpc(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.leader_update_installation_job_rpc(jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.leader_update_production_job_rpc(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.leader_update_production_job_rpc(jsonb) TO service_role;

REVOKE ALL ON FUNCTION leader_private.leader_layout_is_approved(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION leader_private.leader_layout_is_approved(text) TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS leader_production_jobs_one_active_per_order_uidx
 ON public.leader_production_jobs(order_id) WHERE order_id IS NOT NULL AND production_status NOT IN ('Готово','Выдано','Не требуется','Отменено');
CREATE UNIQUE INDEX IF NOT EXISTS leader_installation_jobs_one_active_per_order_uidx
 ON public.leader_installation_jobs(order_id) WHERE order_id IS NOT NULL AND install_status NOT IN ('Выполнен','Завершён','Завершен','Не требуется','Отменён','Отменен');
REVOKE ALL ON TABLE public.leader_production_jobs FROM PUBLIC,anon,authenticated;
ALTER TABLE public.leader_production_jobs ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON TABLE public.leader_production_jobs TO service_role;
REVOKE ALL ON TABLE public.leader_production_events FROM PUBLIC,anon,authenticated;
ALTER TABLE public.leader_production_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON TABLE public.leader_production_events TO service_role;
REVOKE ALL ON TABLE public.leader_installation_jobs FROM PUBLIC,anon,authenticated;
ALTER TABLE public.leader_installation_jobs ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON TABLE public.leader_installation_jobs TO service_role;
REVOKE ALL ON TABLE public.leader_installation_job_items FROM PUBLIC,anon,authenticated;
ALTER TABLE public.leader_installation_job_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON TABLE public.leader_installation_job_items TO service_role;
REVOKE ALL ON TABLE public.leader_installation_events FROM PUBLIC,anon,authenticated;
ALTER TABLE public.leader_installation_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON TABLE public.leader_installation_events TO service_role;
DO $columns$ DECLARE tab text; cols text; BEGIN
 FOREACH tab IN ARRAY ARRAY['leader_production_jobs','leader_production_events','leader_installation_jobs','leader_installation_job_items','leader_installation_events'] LOOP
  SELECT string_agg(format('%I',attname),',' ORDER BY attnum) INTO cols FROM pg_attribute WHERE attrelid=('public.'||tab)::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE SELECT(%s),INSERT(%s),UPDATE(%s),REFERENCES(%s) ON TABLE public.%I FROM PUBLIC,anon,authenticated',cols,cols,cols,cols,tab);
 END LOOP;
END $columns$;
GRANT SELECT(id,order_id,title,production_status,layout_status,priority,deadline,sent_to_contractor_at,ready_at,issued_at,file_url,technical_task,contractor_comment,created_at,updated_at) ON public.leader_production_jobs TO authenticated;
CREATE POLICY leader_production_jobs_operational_guard_v1 ON public.leader_production_jobs AS RESTRICTIVE FOR SELECT TO authenticated USING ((SELECT leader_private.leader_has_crm_action('production.read')));
CREATE POLICY leader_production_jobs_operational_allow_v1 ON public.leader_production_jobs AS PERMISSIVE FOR SELECT TO authenticated USING ((SELECT leader_private.leader_has_crm_action('production.read')));
GRANT SELECT(id,job_id,order_id,event_type,old_status,new_status,body,created_at) ON public.leader_production_events TO authenticated;
CREATE POLICY leader_production_events_operational_guard_v1 ON public.leader_production_events AS RESTRICTIVE FOR SELECT TO authenticated USING ((SELECT leader_private.leader_has_crm_action('production.read')));
CREATE POLICY leader_production_events_operational_allow_v1 ON public.leader_production_events AS PERMISSIVE FOR SELECT TO authenticated USING ((SELECT leader_private.leader_has_crm_action('production.read')));
GRANT SELECT(id,order_id,production_job_id,title,install_status,priority,installer_name,address,scheduled_at,started_at,completed_at,accepted_at,technical_task,tools_required,installer_comment,result_comment,before_photo_url,after_photo_url,created_at,updated_at) ON public.leader_installation_jobs TO authenticated;
CREATE POLICY leader_installation_jobs_operational_guard_v1 ON public.leader_installation_jobs AS RESTRICTIVE FOR SELECT TO authenticated USING ((SELECT leader_private.leader_has_crm_action('installation.read')));
CREATE POLICY leader_installation_jobs_operational_allow_v1 ON public.leader_installation_jobs AS PERMISSIVE FOR SELECT TO authenticated USING ((SELECT leader_private.leader_has_crm_action('installation.read')));
DO $legacy$ DECLARE fn regprocedure; BEGIN
 FOR fn IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('leader_add_production_event','leader_add_safe_production_note') LOOP
  EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC,anon,authenticated',fn);
 END LOOP;
END $legacy$;

-- POSTFLIGHT
DO $postflight$ DECLARE fn text; tab text; role_name text; privilege_name text; BEGIN
 IF (SELECT data_snapshot FROM leader_private.leader_rollout_backups WHERE id='operational-commands-20261009-v1') IS DISTINCT FROM jsonb_build_object('leader_orders',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM public.leader_orders t),'leader_production_jobs',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM public.leader_production_jobs t),'leader_production_events',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM public.leader_production_events t),'leader_installation_jobs',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM public.leader_installation_jobs t),'leader_installation_job_items',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM public.leader_installation_job_items t),'leader_installation_events',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM public.leader_installation_events t)) THEN RAISE EXCEPTION 'business_rows_changed'; END IF;
 FOREACH fn IN ARRAY ARRAY['leader_private.leader_installation_command_error(uuid,text,text)','leader_private.leader_installation_status_key(text)','leader_private.leader_installation_status_label(text)','leader_private.leader_installation_transition_allowed(text,text)','leader_private.leader_production_command_error(uuid,text,text)','leader_private.leader_production_is_installation_ready(text)','leader_private.leader_production_status_key(text)','leader_private.leader_production_status_label(text)','leader_private.leader_production_transition_allowed(text,text)','public.leader_create_installation_job_from_order_rpc(jsonb)','public.leader_create_production_job_from_order_impl_rpc(jsonb)','public.leader_create_production_job_from_order_rpc(jsonb)','public.leader_read_installation_job_rpc(uuid,uuid)','public.leader_update_installation_job_rpc(jsonb)','public.leader_update_production_job_rpc(jsonb)','leader_private.leader_layout_is_approved(text)'] LOOP
 IF has_function_privilege('anon',fn,'EXECUTE') OR has_function_privilege('authenticated',fn,'EXECUTE') OR NOT has_function_privilege('service_role',fn,'EXECUTE') THEN RAISE EXCEPTION 'unsafe_rpc_acl:%',fn; END IF;
 END LOOP;
 FOREACH tab IN ARRAY ARRAY['leader_production_jobs','leader_production_events','leader_installation_jobs','leader_installation_job_items','leader_installation_events'] LOOP
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
 FOREACH privilege_name IN ARRAY ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
 IF has_table_privilege(role_name,'public.'||tab,privilege_name) THEN RAISE EXCEPTION 'direct_write_open:%:%:%',tab,role_name,privilege_name; END IF;
 END LOOP;
 IF has_any_column_privilege(role_name,'public.'||tab,'UPDATE') OR has_any_column_privilege(role_name,'public.'||tab,'INSERT') THEN RAISE EXCEPTION 'column_write_open'; END IF;
 END LOOP;
 END LOOP;
 IF has_column_privilege('authenticated','public.leader_production_jobs','contractor_cost','SELECT') OR has_column_privilege('authenticated','public.leader_installation_jobs','client_phone','SELECT') OR has_column_privilege('authenticated','public.leader_installation_jobs','installer_cost','SELECT') THEN RAISE EXCEPTION 'private_read_open'; END IF;
END $postflight$;
DO $$BEGIN IF md5(pg_get_functiondef('leader_private.leader_installation_command_error(uuid,text,text)'::regprocedure)) <> 'd263ee000b817642f549016be44d80de' THEN RAISE EXCEPTION 'runtime_fingerprint:leader_installation_command_error'; END IF;END $$;
DO $$BEGIN IF md5(pg_get_functiondef('leader_private.leader_installation_status_key(text)'::regprocedure)) <> '12243bd5d50a49a8bf7e281d715bba03' THEN RAISE EXCEPTION 'runtime_fingerprint:leader_installation_status_key'; END IF;END $$;
DO $$BEGIN IF md5(pg_get_functiondef('leader_private.leader_installation_status_label(text)'::regprocedure)) <> '3a1082636d166768f2b3334d76e1743d' THEN RAISE EXCEPTION 'runtime_fingerprint:leader_installation_status_label'; END IF;END $$;
DO $$BEGIN IF md5(pg_get_functiondef('leader_private.leader_installation_transition_allowed(text,text)'::regprocedure)) <> '2463ec1b87fa4cf46a04590ac7e97d60' THEN RAISE EXCEPTION 'runtime_fingerprint:leader_installation_transition_allowed'; END IF;END $$;
DO $$BEGIN IF md5(pg_get_functiondef('leader_private.leader_production_command_error(uuid,text,text)'::regprocedure)) <> '775cab4f89b0bb4d55653ed50b5fc50a' THEN RAISE EXCEPTION 'runtime_fingerprint:leader_production_command_error'; END IF;END $$;
DO $$BEGIN IF md5(pg_get_functiondef('leader_private.leader_production_is_installation_ready(text)'::regprocedure)) <> '10efb8a0883f7b139a0c0ad85fe7bfda' THEN RAISE EXCEPTION 'runtime_fingerprint:leader_production_is_installation_ready'; END IF;END $$;
DO $$BEGIN IF md5(pg_get_functiondef('leader_private.leader_production_status_key(text)'::regprocedure)) <> '803405dcbc204a060b8a9df569a55f8d' THEN RAISE EXCEPTION 'runtime_fingerprint:leader_production_status_key'; END IF;END $$;
DO $$BEGIN IF md5(pg_get_functiondef('leader_private.leader_production_status_label(text)'::regprocedure)) <> '4a5a5674c42eb4c403c33c718178a2e7' THEN RAISE EXCEPTION 'runtime_fingerprint:leader_production_status_label'; END IF;END $$;
DO $$BEGIN IF md5(pg_get_functiondef('leader_private.leader_production_transition_allowed(text,text)'::regprocedure)) <> '6bffa45e4fec6fd0cf937da9bd2c6a99' THEN RAISE EXCEPTION 'runtime_fingerprint:leader_production_transition_allowed'; END IF;END $$;
DO $$BEGIN IF md5(pg_get_functiondef('public.leader_create_installation_job_from_order_rpc(jsonb)'::regprocedure)) <> 'c81c3932092b5e2a2c63e0df38568ff0' THEN RAISE EXCEPTION 'runtime_fingerprint:leader_create_installation_job_from_order_rpc'; END IF;END $$;
DO $$BEGIN IF md5(pg_get_functiondef('public.leader_create_production_job_from_order_impl_rpc(jsonb)'::regprocedure)) <> '5ae61afa84c0117edfd78f33e9a3d302' THEN RAISE EXCEPTION 'runtime_fingerprint:leader_create_production_job_from_order_impl_rpc'; END IF;END $$;
DO $$BEGIN IF md5(pg_get_functiondef('public.leader_create_production_job_from_order_rpc(jsonb)'::regprocedure)) <> '545bd184195160db5c6d182d92490d3b' THEN RAISE EXCEPTION 'runtime_fingerprint:leader_create_production_job_from_order_rpc'; END IF;END $$;
DO $$BEGIN IF md5(pg_get_functiondef('public.leader_read_installation_job_rpc(uuid,uuid)'::regprocedure)) <> '5a353818606012d0e657a83f133723b6' THEN RAISE EXCEPTION 'runtime_fingerprint:leader_read_installation_job_rpc'; END IF;END $$;
DO $$BEGIN IF md5(pg_get_functiondef('public.leader_update_installation_job_rpc(jsonb)'::regprocedure)) <> '72be911e2160249b5db08cec8b686982' THEN RAISE EXCEPTION 'runtime_fingerprint:leader_update_installation_job_rpc'; END IF;END $$;
DO $$BEGIN IF md5(pg_get_functiondef('public.leader_update_production_job_rpc(jsonb)'::regprocedure)) <> '14f07030acf8775c15aace2308199c62' THEN RAISE EXCEPTION 'runtime_fingerprint:leader_update_production_job_rpc'; END IF;END $$;

COMMIT;
