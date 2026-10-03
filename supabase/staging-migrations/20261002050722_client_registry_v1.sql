-- Shared client registry contract. Staging first; production through scoped backup/postflight.
ALTER TABLE public.leader_clients ADD COLUMN IF NOT EXISTS address text;

CREATE OR REPLACE FUNCTION leader_private.leader_normalize_client_phone(value text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path='' AS $$
 SELECT CASE WHEN length(p)=10 THEN '7'||p WHEN length(p)=11 AND left(p,1)='8' THEN '7'||substr(p,2) ELSE p END
 FROM (SELECT regexp_replace(coalesce(value,''),'[^0-9]','','g') p) n;
$$;
REVOKE ALL ON FUNCTION leader_private.leader_normalize_client_phone(text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION leader_private.leader_normalize_client_phone(text) TO service_role;
CREATE INDEX IF NOT EXISTS leader_clients_normalized_phone_idx ON public.leader_clients (leader_private.leader_normalize_client_phone(phone)) WHERE phone IS NOT NULL;

CREATE OR REPLACE FUNCTION public.leader_client_registry_rpc(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $function$
DECLARE
 actor uuid; req jsonb; payload jsonb; act text; rid uuid; cid uuid; expected timestamptz;
 cl public.leader_clients%rowtype; old_cl public.leader_clients%rowtype;
 receipt leader_private.leader_command_receipts%rowtype;
 key text; hash text; result jsonb; phone_key text; duplicate_ids uuid[]; fields jsonb;
 q text; digits text; skip integer; total integer; rows jsonb; links jsonb; history jsonb;
BEGIN
 actor:=(p_payload->>'actor_id')::uuid; req:=p_payload->'request'; payload:=coalesce(req->'payload','{}'); act:=req->>'action';
 IF actor IS NULL OR jsonb_typeof(req) IS DISTINCT FROM 'object' OR jsonb_typeof(payload) IS DISTINCT FROM 'object'
  OR act IS NULL OR act NOT IN ('client.list','client.get','client.create','client.update','client.ensure')
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(req) k WHERE k NOT IN ('action','request_id','expected_updated_at','payload'))
 THEN RAISE EXCEPTION 'invalid_payload' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.leader_user_profiles WHERE user_id=actor AND is_active) THEN RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','inactive_profile')); END IF;
 IF NOT leader_private.leader_actor_has_crm_action(actor,CASE WHEN act IN ('client.list','client.get') THEN 'clients.read' ELSE 'clients.write' END)
 THEN RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','forbidden')); END IF;
 IF act='client.list' THEN
  q:=btrim(coalesce(payload->>'search','')); skip:=coalesce((payload->>'offset')::integer,0);
  IF length(q)>200 OR skip<0 OR skip>100000 OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('search','offset')) THEN RAISE EXCEPTION 'invalid_payload' USING ERRCODE='22023'; END IF;
  digits:=leader_private.leader_normalize_client_phone(q);
  -- strpos treats %, _, commas and filter syntax as literal input.
  SELECT count(*) INTO total FROM public.leader_clients c WHERE q='' OR strpos(lower(coalesce(c.name,'')),lower(q))>0 OR (length(digits)>=3 AND strpos(leader_private.leader_normalize_client_phone(c.phone),digits)>0);
  SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') INTO rows FROM (
   SELECT id,name,phone,source,address,updated_at FROM public.leader_clients c
   WHERE q='' OR strpos(lower(coalesce(c.name,'')),lower(q))>0 OR (length(digits)>=3 AND strpos(leader_private.leader_normalize_client_phone(c.phone),digits)>0)
   ORDER BY lower(coalesce(name,'')),id LIMIT 50 OFFSET skip
  ) t;
  RETURN jsonb_build_object('ok',true,'clients',rows,'total',total,'offset',skip,'limit',50);
 END IF;
 IF act='client.get' THEN
  cid:=(payload->>'client_id')::uuid;
  IF cid IS NULL OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k<>'client_id') THEN RAISE EXCEPTION 'invalid_payload' USING ERRCODE='22023'; END IF;
  SELECT * INTO cl FROM public.leader_clients WHERE id=cid;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','client_not_found')); END IF;
  SELECT jsonb_build_object(
   'leads',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT id,service AS title,status,created_at FROM public.leader_leads WHERE converted_client_id=cid ORDER BY created_at DESC,id LIMIT 20)t),'[]'),
   'orders',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT id,project_name AS title,status,created_at FROM public.leader_orders WHERE client_id=cid ORDER BY created_at DESC,id LIMIT 20)t),'[]'),
   'lead_count',(SELECT count(*) FROM public.leader_leads WHERE converted_client_id=cid),
   'order_count',(SELECT count(*) FROM public.leader_orders WHERE client_id=cid)
  ) INTO links;
  SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') INTO history FROM (SELECT id,user_id,action,data,created_at FROM public.leader_activity_log WHERE entity='client' AND entity_id=cid::text AND action LIKE 'client.%' ORDER BY created_at DESC,id LIMIT 50)t;
  RETURN jsonb_build_object('ok',true,'client',to_jsonb(cl)-'owner_id'-'email','links',links,'history',history);
 END IF;
 rid:=(req->>'request_id')::uuid;
 IF rid IS NULL OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('client_id','name','phone','source','address','comment'))
  OR EXISTS(SELECT 1 FROM jsonb_each(payload) e WHERE e.key<>'client_id' AND jsonb_typeof(e.value) NOT IN ('string','null'))
  OR length(btrim(coalesce(payload->>'name','')))=0 OR length(payload->>'name')>200 OR length(payload->>'phone')>80
  OR length(payload->>'source')>120 OR length(payload->>'address')>500 OR length(payload->>'comment')>2000
 THEN RAISE EXCEPTION 'invalid_payload' USING ERRCODE='22023'; END IF;
 phone_key:=leader_private.leader_normalize_client_phone(payload->>'phone');
 IF btrim(coalesce(payload->>'phone',''))<>'' AND (length(phone_key)<10 OR length(phone_key)>15 OR payload->>'phone' ~ '[^0-9+() .\-]') THEN RAISE EXCEPTION 'invalid_payload' USING ERRCODE='22023'; END IF;
 IF act='client.update' THEN
  cid:=(payload->>'client_id')::uuid; expected:=(req->>'expected_updated_at')::timestamptz;
  IF cid IS NULL OR expected IS NULL THEN RAISE EXCEPTION 'invalid_payload' USING ERRCODE='22023'; END IF;
 ELSIF payload ? 'client_id' OR req ? 'expected_updated_at' THEN RAISE EXCEPTION 'invalid_payload' USING ERRCODE='22023'; END IF;
 key:='client:'||rid::text; hash:=encode(extensions.digest(convert_to(jsonb_build_object('actor',actor,'request',req)::text,'UTF8'),'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(key,0));
 SELECT * INTO receipt FROM leader_private.leader_command_receipts WHERE action=act AND idempotency_key=key;
 IF FOUND THEN
  IF receipt.actor_id<>actor OR receipt.request_hash<>hash THEN RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','idempotency_conflict')); END IF;
  RETURN receipt.response||jsonb_build_object('idempotent_replay',true);
 END IF;
 IF phone_key<>'' THEN PERFORM pg_advisory_xact_lock(hashtextextended('client-phone:'||phone_key,0)); END IF;
 IF act='client.update' THEN
  SELECT * INTO old_cl FROM public.leader_clients WHERE id=cid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','client_not_found')); END IF;
  IF old_cl.updated_at IS DISTINCT FROM expected THEN RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','source_changed')); END IF;
 END IF;
 IF phone_key<>'' AND (act<>'client.update' OR phone_key IS DISTINCT FROM leader_private.leader_normalize_client_phone(old_cl.phone)) THEN
  SELECT array_agg(id ORDER BY created_at,id) INTO duplicate_ids FROM public.leader_clients WHERE leader_private.leader_normalize_client_phone(phone)=phone_key AND (cid IS NULL OR id<>cid);
  IF cardinality(duplicate_ids)>0 THEN
   IF act='client.ensure' AND cardinality(duplicate_ids)=1 THEN SELECT * INTO cl FROM public.leader_clients WHERE id=duplicate_ids[1];
   ELSE RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','duplicate_phone'),'existing_client_id',CASE WHEN cardinality(duplicate_ids)=1 THEN duplicate_ids[1] ELSE NULL END); END IF;
  END IF;
 END IF;
 IF cl.id IS NULL THEN
  IF act='client.update' THEN
   UPDATE public.leader_clients SET name=btrim(payload->>'name'),phone=nullif(btrim(payload->>'phone'),''),source=nullif(btrim(payload->>'source'),''),address=nullif(btrim(payload->>'address'),''),comment=nullif(btrim(payload->>'comment'),''),updated_at=clock_timestamp() WHERE id=cid RETURNING * INTO cl;
   SELECT coalesce(jsonb_agg(k),'[]') INTO fields FROM unnest(ARRAY['name','phone','source','address','comment']) k WHERE to_jsonb(old_cl)->k IS DISTINCT FROM to_jsonb(cl)->k;
  ELSE
   INSERT INTO public.leader_clients(owner_id,name,phone,source,address,comment) VALUES(actor,btrim(payload->>'name'),nullif(btrim(payload->>'phone'),''),nullif(btrim(payload->>'source'),''),nullif(btrim(payload->>'address'),''),nullif(btrim(payload->>'comment'),'')) RETURNING * INTO cl;
   fields:='["name","phone","source","address","comment"]';
  END IF;
  -- Audit records changed fields, never additional copies of contact data.
  INSERT INTO public.leader_activity_log(user_id,action,entity,entity_id,data) VALUES(actor,CASE WHEN act='client.update' THEN act ELSE 'client.create' END,'client',cl.id::text,jsonb_build_object('request_id',rid,'fields',fields));
 END IF;
 result:=jsonb_build_object('ok',true,'request_id',rid,'client',to_jsonb(cl)-'owner_id'-'email','existed',cardinality(duplicate_ids)>0);
 INSERT INTO leader_private.leader_command_receipts(action,idempotency_key,request_id,request_hash,actor_id,state,response,completed_at) VALUES(act,key,rid,hash,actor,'success',result,clock_timestamp());
 RETURN result;
EXCEPTION WHEN invalid_text_representation OR invalid_parameter_value OR datetime_field_overflow OR numeric_value_out_of_range THEN
 RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_payload'));
 WHEN OTHERS THEN
 RAISE LOG 'leader_client_registry_failed action=% request_id=% sqlstate=%',act,rid,SQLSTATE;
 RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','client_operation_failed'));
END $function$;
REVOKE ALL ON FUNCTION public.leader_client_registry_rpc(jsonb) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.leader_client_registry_rpc(jsonb) TO service_role;

-- Keep the existing read API for the client picker and documents, constrained by canonical permission.
ALTER TABLE public.leader_clients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.leader_clients FROM public,anon,authenticated;
GRANT SELECT ON public.leader_clients TO authenticated;
DO $column_writes$ DECLARE c record; BEGIN
 FOR c IN SELECT attname FROM pg_attribute WHERE attrelid='public.leader_clients'::regclass AND attnum>0 AND NOT attisdropped LOOP
  EXECUTE format('REVOKE INSERT (%I), UPDATE (%I), REFERENCES (%I) ON public.leader_clients FROM public,anon,authenticated',c.attname,c.attname,c.attname);
 END LOOP;
END $column_writes$;
DROP POLICY IF EXISTS leader_clients_read_guard ON public.leader_clients;
CREATE POLICY leader_clients_read_guard ON public.leader_clients AS RESTRICTIVE FOR SELECT TO authenticated USING ((SELECT leader_private.leader_has_crm_action('clients.read')));
DROP POLICY IF EXISTS leader_client_audit_insert_guard ON public.leader_activity_log;
CREATE POLICY leader_client_audit_insert_guard ON public.leader_activity_log AS RESTRICTIVE FOR INSERT TO public WITH CHECK(action NOT LIKE 'client.%');
DROP POLICY IF EXISTS leader_client_audit_update_guard ON public.leader_activity_log;
CREATE POLICY leader_client_audit_update_guard ON public.leader_activity_log AS RESTRICTIVE FOR UPDATE TO public USING(action NOT LIKE 'client.%') WITH CHECK(action NOT LIKE 'client.%');
DROP POLICY IF EXISTS leader_client_audit_delete_guard ON public.leader_activity_log;
CREATE POLICY leader_client_audit_delete_guard ON public.leader_activity_log AS RESTRICTIVE FOR DELETE TO public USING(action NOT LIKE 'client.%');

-- STAGING CLEANUP UPGRADE

DO $guard$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM leader_staging.environment_guard WHERE singleton AND project_ref='otulfnouybahfnsycxqn' AND environment_name='staging') THEN RAISE EXCEPTION 'staging_environment_guard_failed'; END IF;
END $guard$;
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
      'catalog_receipts', (select count(*) from leader_private.leader_command_receipts where actor_id = v_user and action = 'catalog.manage'),
      'payments', (select count(*) from public.leader_payments where order_id = v_order or owner_id = v_user),
      'expenses', (select count(*) from public.leader_expenses where order_id = v_order or owner_id = v_user),
      'order_audit', (select count(*) from public.leader_activity_log where user_id = v_user and action like 'order.%' or action like 'client.%'),
      'client_audit', (select count(*) from public.leader_activity_log where user_id = v_user and action like 'client.%'),
      'finance_audit', (select count(*) from public.leader_activity_log where user_id = v_user and action like 'finance.%')
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
  delete from public.leader_payments where order_id = any(v_orders) or owner_id = v_user;
  delete from public.leader_expenses where order_id = any(v_orders) or owner_id = v_user;
  delete from public.leader_activity_log where user_id = v_user and (action like 'finance.%' or action like 'order.%' or action like 'client.%');
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
    'payments', (select count(*) from public.leader_payments where order_id = any(v_orders) or owner_id = v_user),
    'expenses', (select count(*) from public.leader_expenses where order_id = any(v_orders) or owner_id = v_user),
    'order_audit', (select count(*) from public.leader_activity_log where user_id = v_user and action like 'order.%' or action like 'client.%'),
      'client_audit', (select count(*) from public.leader_activity_log where user_id = v_user and action like 'client.%'),
      'finance_audit', (select count(*) from public.leader_activity_log where user_id = v_user and action like 'finance.%'),
    'interactions_followups', 0,
    'command_receipts', (select count(*) from leader_private.leader_command_receipts where actor_id = v_user)
  );

  return jsonb_build_object('ok', true, 'auth_user_id', v_user, 'residue', v_residue);
end
$function$;

comment on function public.leader_inspect_authenticated_e2e_rpc(text) is
  'STAGING ONLY. Service-role inspection of synthetic authenticated E2E fixtures, including catalog and financial rows, audit and receipts.';
comment on function public.leader_cleanup_authenticated_e2e_rpc(text) is
  'STAGING ONLY. Service-role synthetic cleanup including catalog and financial rows, audit and command receipts.';

revoke all on function public.leader_inspect_authenticated_e2e_rpc(text) from public, anon, authenticated;
revoke all on function public.leader_cleanup_authenticated_e2e_rpc(text) from public, anon, authenticated;
grant execute on function public.leader_inspect_authenticated_e2e_rpc(text) to service_role;
grant execute on function public.leader_cleanup_authenticated_e2e_rpc(text) to service_role;
