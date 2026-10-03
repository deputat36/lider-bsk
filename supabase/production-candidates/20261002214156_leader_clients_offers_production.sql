-- Leader production only. Owner authorization renewed 2026-10-02.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $$ BEGIN
 IF to_regclass('leader_staging.environment_guard') IS NOT NULL THEN RAISE EXCEPTION 'production_only'; END IF;
 IF to_regprocedure('public.leader_client_registry_rpc(jsonb)') IS NOT NULL OR to_regprocedure('public.leader_transition_offer_rpc(jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'already_installed'; END IF;
 IF has_table_privilege('authenticated','leader_private.leader_rollout_backups','SELECT') OR has_table_privilege('service_role','leader_private.leader_rollout_backups','SELECT') THEN RAISE EXCEPTION 'backup_exposed'; END IF;
END $$;
LOCK TABLE public.leader_clients,public.leader_commercial_offers,public.leader_commercial_offer_events,public.leader_lead_calculations,public.leader_leads,public.leader_activity_log IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO leader_private.leader_rollout_backups(id,project_ref,data_snapshot,metadata_snapshot,edge_snapshot)
SELECT 'clients-offers-20261002-v1','ofewxuqfjhamgerwzull',jsonb_build_object('leader_clients',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.leader_clients t),'leader_commercial_offers',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.leader_commercial_offers t),'leader_commercial_offer_events',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.leader_commercial_offer_events t),'leader_lead_calculations',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.leader_lead_calculations t),'leader_leads',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.leader_leads t),'leader_activity_log',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.leader_activity_log t)),jsonb_build_object(
 'policies',(SELECT jsonb_agg(to_jsonb(p)) FROM pg_policies p WHERE schemaname='public' AND tablename IN('leader_clients','leader_commercial_offers','leader_commercial_offer_events','leader_lead_calculations','leader_leads','leader_activity_log')),
 'tables',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,'acl',c.relacl)) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN('leader_clients','leader_commercial_offers','leader_commercial_offer_events','leader_lead_calculations','leader_leads','leader_activity_log')),
 'columns',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'column',a.attname,'acl',a.attacl)) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN('leader_clients','leader_commercial_offers','leader_commercial_offer_events','leader_lead_calculations','leader_leads','leader_activity_log') AND a.attnum>0 AND NOT a.attisdropped),
 'new_functions_previously_absent',true),
 '{"leader-crm-clients":null,"leader-crm-offer-transitions":null}'::jsonb;
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

-- Shared fix: a restrictive guard alone cannot authorize SELECT on a clean installation.
CREATE POLICY leader_clients_read_authorized ON public.leader_clients FOR SELECT TO authenticated USING ((SELECT leader_private.leader_has_crm_action('clients.read')));

-- Existing offer transition contract promoted with current-version and linked-order guards.
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
  v_old_status text;
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
     or v_request ->> 'action' IS DISTINCT FROM 'offer.transition'
     or jsonb_typeof(v_request) IS DISTINCT FROM 'object'
     or jsonb_typeof(v_payload) IS DISTINCT FROM 'object'
     or exists(select 1 from jsonb_object_keys(v_request) k where k not in ('action','request_id','expected_updated_at','payload'))
     or exists(select 1 from jsonb_object_keys(v_payload) k where k not in ('offer_id','status','idempotency_key'))
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
  select * into v_calc from public.leader_lead_calculations where id=v_offer.calculation_id for update;
  if not found or v_calc.is_current_revision is not true then
    return jsonb_build_object('ok',false,'error',jsonb_build_object('code','source_not_current'));
  end if;
  if v_offer.order_id is not null or v_calc.order_id is not null then
    return jsonb_build_object('ok',false,'error',jsonb_build_object('code','order_already_created'));
  end if;
  select * into v_lead from public.leader_leads where id=v_offer.lead_id for update;
  if not found or v_calc.lead_id is distinct from v_lead.id then
    return jsonb_build_object('ok',false,'error',jsonb_build_object('code','source_not_current'));
  end if;
  if v_lead.converted_order_id is not null then
    return jsonb_build_object('ok',false,'error',jsonb_build_object('code','order_already_created'));
  end if;
  v_old_status:=v_offer.status;
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
    values(v_offer.id,v_offer.lead_id,v_offer.calculation_id,'Изменение статуса КП',v_old_status,v_target,'Изменение статуса из карточки КП',v_actor,left(lower(p_payload->>'actor_email'),240),v_now);
  v_response := jsonb_build_object('ok',true,'request_id',v_request_id,'offer',to_jsonb(v_offer),'calculation',jsonb_build_object('id',v_calc.id,'status',v_calc.status,'updated_at',v_calc.updated_at),'lead',jsonb_build_object('id',v_lead.id,'status',v_lead.status,'updated_at',v_lead.updated_at),'idempotent_replay',false);
  insert into leader_private.leader_command_receipts(action,idempotency_key,request_id,request_hash,actor_id,state,response,created_at,updated_at,completed_at)
    values('offer.transition',v_key,v_request_id,v_hash,v_actor,'success',v_response,v_now,v_now,v_now);
  return v_response;
exception when others then
  raise log 'leader_offer_transition_failed request_id=% sqlstate=%',v_request_id,SQLSTATE;
  return jsonb_build_object('ok',false,'request_id',v_request_id,'error',jsonb_build_object('code','persistence_failed'));
end
$function$;


revoke all on function public.leader_transition_offer_rpc(jsonb) from public,anon,authenticated;
grant execute on function public.leader_transition_offer_rpc(jsonb) to service_role;

DO $$ DECLARE expected jsonb; actual jsonb; BEGIN
 SELECT data_snapshot INTO STRICT expected FROM leader_private.leader_rollout_backups WHERE id='clients-offers-20261002-v1';
 SELECT jsonb_build_object('leader_clients',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.leader_clients t),'leader_commercial_offers',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.leader_commercial_offers t),'leader_commercial_offer_events',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.leader_commercial_offer_events t),'leader_lead_calculations',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.leader_lead_calculations t),'leader_leads',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.leader_leads t),'leader_activity_log',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.leader_activity_log t)) INTO actual;
 IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'business_data_changed'; END IF;
 IF has_function_privilege('authenticated','public.leader_client_registry_rpc(jsonb)','EXECUTE') OR has_function_privilege('anon','public.leader_transition_offer_rpc(jsonb)','EXECUTE') OR has_any_column_privilege('authenticated','public.leader_clients','UPDATE') THEN RAISE EXCEPTION 'browser_write_open'; END IF;
 IF NOT has_function_privilege('service_role','public.leader_client_registry_rpc(jsonb)','EXECUTE') OR NOT has_function_privilege('service_role','public.leader_transition_offer_rpc(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'service_rpc_blocked'; END IF;
END $$;
COMMIT;
