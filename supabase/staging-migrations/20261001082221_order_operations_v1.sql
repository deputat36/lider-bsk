-- Shared, transactional order commands. Apply to staging first; production via guarded rollout.
ALTER TABLE public.leader_orders ADD COLUMN IF NOT EXISTS sent_to_contractor_at timestamptz, ADD COLUMN IF NOT EXISTS ready_at timestamptz, ADD COLUMN IF NOT EXISTS issued_at timestamptz, ADD COLUMN IF NOT EXISTS completed_at timestamptz;
CREATE OR REPLACE FUNCTION public.leader_write_order_operation_rpc(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $function$
DECLARE
 actor uuid; req jsonb; payload jsonb; v_action text; rid uuid; oid uuid; expected timestamptz;
 profile public.leader_user_profiles%rowtype; ord public.leader_orders%rowtype;
 receipt leader_private.leader_command_receipts%rowtype;
 key text; hash text; result jsonb; old_status text; target text; target_label text;
 note text; allowed boolean; net numeric; debt numeric; event_id uuid;
BEGIN
 actor:=(p_payload->>'actor_id')::uuid; req:=p_payload->'request'; payload:=req->'payload';
 v_action:=req->>'action'; rid:=(req->>'request_id')::uuid;
 oid:=(payload->>'order_id')::uuid; expected:=(req->>'expected_updated_at')::timestamptz;
 IF actor IS NULL OR rid IS NULL OR oid IS NULL OR expected IS NULL
  OR jsonb_typeof(payload) IS DISTINCT FROM 'object'
  OR v_action IS NULL OR v_action NOT IN ('order.transition','order.layout_not_required','order.update')
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(req) k WHERE k NOT IN ('action','request_id','expected_updated_at','payload'))
 THEN RAISE EXCEPTION 'invalid_payload' USING ERRCODE='22023'; END IF;
 SELECT * INTO profile FROM public.leader_user_profiles WHERE user_id=actor AND is_active;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','inactive_profile')); END IF;
 IF NOT leader_private.leader_actor_has_crm_action(actor,CASE WHEN v_action='order.transition' THEN 'orders.transition' ELSE 'orders.update' END)
  OR (v_action='order.layout_not_required' AND NOT leader_private.leader_actor_has_crm_action(actor,'design.write'))
 THEN RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','forbidden')); END IF;
 note:=btrim(coalesce(payload->>'comment',''));
 IF length(note)>2000 OR length(coalesce(payload->>'debt_reason',''))>1000 OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN
  ('order_id','target_status','comment','expenses_reviewed','documents_reviewed','debt_reason','deadline'))
 THEN RAISE EXCEPTION 'invalid_payload' USING ERRCODE='22023'; END IF;
 key:='order:'||rid::text; hash:=encode(extensions.digest(convert_to(jsonb_build_object('actor',actor,'request',req)::text,'UTF8'),'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(key,0));
 SELECT * INTO receipt FROM leader_private.leader_command_receipts WHERE leader_command_receipts.action=v_action AND idempotency_key=key;
 IF FOUND THEN
  IF receipt.actor_id<>actor OR receipt.request_hash<>hash THEN RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','idempotency_conflict')); END IF;
  RETURN receipt.response||jsonb_build_object('idempotent_replay',true);
 END IF;
 SELECT * INTO ord FROM public.leader_orders WHERE id=oid FOR UPDATE;
 IF NOT FOUND OR ord.is_archived THEN RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','order_unavailable')); END IF;
 IF ord.updated_at IS DISTINCT FROM expected THEN RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','source_changed')); END IF;
 old_status:=ord.status;
 IF old_status IN ('Закрыт','Отменён','Отменен','Отмена') THEN RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','order_terminal')); END IF;
 -- Serialize against related task updates as well as concurrent order commands.
 PERFORM id FROM public.leader_design_tasks WHERE order_id=oid FOR UPDATE;
 PERFORM id FROM public.leader_production_jobs WHERE order_id=oid FOR UPDATE;
 PERFORM id FROM public.leader_installation_jobs WHERE order_id=oid FOR UPDATE;
 IF v_action='order.layout_not_required' THEN
  IF old_status NOT IN ('Новый','Макет на согласовании') OR length(note)<3 THEN RAISE EXCEPTION 'invalid_payload' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM public.leader_design_tasks WHERE order_id=oid AND task_status NOT IN ('Завершено','Отменено')) THEN RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','design_task_active')); END IF;
  UPDATE public.leader_orders SET layout_status='Не требуется',layout_comment=note,updated_at=clock_timestamp() WHERE id=oid RETURNING * INTO ord;
 ELSIF v_action='order.update' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('order_id','deadline','comment'))
   OR NOT(payload ? 'deadline' OR payload ? 'comment') THEN RAISE EXCEPTION 'invalid_payload' USING ERRCODE='22023'; END IF;
  IF payload ? 'deadline' AND payload->>'deadline' IS NOT NULL AND (payload->>'deadline')!~'^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'invalid_payload' USING ERRCODE='22023'; END IF;
  UPDATE public.leader_orders SET deadline=CASE WHEN payload ? 'deadline' THEN (payload->>'deadline')::date ELSE deadline END,
   layout_comment=CASE WHEN payload ? 'comment' THEN note ELSE layout_comment END,updated_at=clock_timestamp() WHERE id=oid RETURNING * INTO ord;
 ELSE
  target:=payload->>'target_status';
  target_label:=CASE target WHEN 'production' THEN 'В производстве' WHEN 'ready' THEN 'Готово' WHEN 'issued' THEN 'Выдано' WHEN 'closed' THEN 'Закрыт' WHEN 'cancelled' THEN 'Отменён' END;
  allowed:=CASE old_status WHEN 'Новый' THEN target IN ('production','cancelled') WHEN 'Макет на согласовании' THEN target IN ('production','cancelled')
   WHEN 'В производстве' THEN target IN ('ready','cancelled') WHEN 'Готово' THEN target='issued' WHEN 'Выдано' THEN target='closed' ELSE false END;
  IF target_label IS NULL OR allowed IS DISTINCT FROM true THEN RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_transition')); END IF;
  IF target='production' AND ord.layout_status NOT IN ('Не требуется','Макет согласован','Согласован','Утверждён','Утвержден') OR (target='production' AND ord.layout_status IS NULL)
  THEN RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','layout_not_ready')); END IF;
  IF target IN ('ready','issued','closed') AND (
   EXISTS(SELECT 1 FROM public.leader_design_tasks WHERE order_id=oid AND task_status NOT IN ('Согласовано','Завершено','Отменено')) OR
   EXISTS(SELECT 1 FROM public.leader_production_jobs WHERE order_id=oid AND production_status NOT IN ('Готово','Выдано','Не требуется','Отменено')))
  THEN RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','work_not_completed')); END IF;
  IF target IN ('issued','closed') AND EXISTS(SELECT 1 FROM public.leader_installation_jobs WHERE order_id=oid AND install_status NOT IN ('Выполнен','Завершён','Завершен','Не требуется','Отменён','Отменен'))
  THEN RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','installation_not_completed')); END IF;
  IF target IN ('issued','cancelled') AND length(note)<3 THEN RAISE EXCEPTION 'invalid_payload' USING ERRCODE='22023'; END IF;
  IF target='closed' THEN
   IF ord.issued_at IS NULL OR payload->'expenses_reviewed' IS DISTINCT FROM 'true'::jsonb OR payload->'documents_reviewed' IS DISTINCT FROM 'true'::jsonb
   THEN RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','closing_checklist_required')); END IF;
   SELECT coalesce(sum(CASE WHEN lower(coalesce(payment_type,''))~'(возврат|расход|исход)' THEN -abs(amount) ELSE abs(amount) END),0) INTO net
    FROM public.leader_payments WHERE order_id=oid AND is_confirmed AND lower(btrim(payment_status)) IN ('проведён','проведен','posted');
   debt:=greatest(ord.client_total-net,0);
   IF debt>0 AND (lower(profile.role) NOT IN ('owner','admin') OR length(btrim(coalesce(payload->>'debt_reason','')))<5)
   THEN RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','unpaid_order')); END IF;
   IF net>ord.client_total THEN RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','overpayment_unresolved')); END IF;
  END IF;
  UPDATE public.leader_orders SET status=target_label,
   sent_to_contractor_at=CASE WHEN target='production' THEN clock_timestamp() ELSE sent_to_contractor_at END,
   ready_at=CASE WHEN target='ready' THEN clock_timestamp() ELSE ready_at END,
   issued_at=CASE WHEN target='issued' THEN clock_timestamp() ELSE issued_at END,
   completed_at=CASE WHEN target='closed' THEN clock_timestamp() ELSE completed_at END,
   data=CASE WHEN target='closed' THEN jsonb_set(coalesce(data,'{}'::jsonb),'{closure}',jsonb_build_object('expenses_reviewed',true,'documents_reviewed',true,'reviewed_at',clock_timestamp(),'debt',debt,'debt_reason',nullif(btrim(payload->>'debt_reason'),''))) ELSE data END,
   updated_at=clock_timestamp() WHERE id=oid RETURNING * INTO ord;
 END IF;
 INSERT INTO public.leader_activity_log(user_id,action,entity,entity_id,data)
 VALUES(actor,v_action,'order',oid::text,jsonb_build_object('request_id',rid,'old_status',old_status,'new_status',ord.status,'comment',note,
  'layout_status',ord.layout_status,'deadline',ord.deadline,'expenses_reviewed',payload->'expenses_reviewed','documents_reviewed',payload->'documents_reviewed',
  'debt_exception',CASE WHEN debt>0 THEN true ELSE false END,'debt_reason',payload->>'debt_reason')) RETURNING id INTO event_id;
 result:=jsonb_build_object('ok',true,'request_id',rid,'order_id',oid,'status',ord.status,'order_updated_at',ord.updated_at,'audit_id',event_id);
 INSERT INTO leader_private.leader_command_receipts(action,idempotency_key,request_id,request_hash,actor_id,state,response,completed_at)
 VALUES(v_action,key,rid,hash,actor,'success',result,clock_timestamp());
 RETURN result;
EXCEPTION WHEN invalid_text_representation OR invalid_parameter_value OR datetime_field_overflow THEN
 RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_payload'));
 WHEN OTHERS THEN
 RAISE LOG 'leader_order_command_failed request_id=% sqlstate=%',rid,SQLSTATE;
 RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','order_write_failed'));
END $function$;
REVOKE ALL ON FUNCTION public.leader_write_order_operation_rpc(jsonb) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.leader_write_order_operation_rpc(jsonb) TO service_role;

-- Audit events cannot be forged or changed through direct browser writes.
DROP POLICY IF EXISTS leader_order_audit_insert_guard ON public.leader_activity_log;
CREATE POLICY leader_order_audit_insert_guard ON public.leader_activity_log AS RESTRICTIVE FOR INSERT TO public WITH CHECK (action NOT LIKE 'order.%');
DROP POLICY IF EXISTS leader_order_audit_update_guard ON public.leader_activity_log;
CREATE POLICY leader_order_audit_update_guard ON public.leader_activity_log AS RESTRICTIVE FOR UPDATE TO public USING(action NOT LIKE 'order.%') WITH CHECK(action NOT LIKE 'order.%');
DROP POLICY IF EXISTS leader_order_audit_delete_guard ON public.leader_activity_log;
CREATE POLICY leader_order_audit_delete_guard ON public.leader_activity_log AS RESTRICTIVE FOR DELETE TO public USING(action NOT LIKE 'order.%');

-- Every legacy insert/update must agree with the actual posted payment ledger.
CREATE OR REPLACE FUNCTION leader_private.leader_order_money_projection_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $function$
DECLARE net numeric;
BEGIN
 IF TG_OP='INSERT' AND (NEW.status<>'Новый' OR NOT leader_private.leader_actor_has_crm_action(NEW.owner_id,'orders.create')) THEN RAISE EXCEPTION 'invalid_order_creation' USING ERRCODE='22023'; END IF;
 SELECT coalesce(sum(CASE WHEN lower(coalesce(payment_type,''))~'(возврат|расход|исход)' THEN -abs(amount) ELSE abs(amount) END),0) INTO net
 FROM public.leader_payments WHERE order_id=NEW.id AND is_confirmed AND lower(btrim(payment_status)) IN ('проведён','проведен','posted');
 NEW.prepayment:=net;
 NEW.balance:=greatest(NEW.client_total-net,0);
 NEW.payment_status:=CASE WHEN net>=NEW.client_total THEN 'Оплачено' WHEN net>0 THEN 'Частично оплачено' ELSE 'Не оплачено' END;
 RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION leader_private.leader_order_money_projection_v1() FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION leader_private.leader_order_money_projection_v1() TO service_role;
DROP TRIGGER IF EXISTS leader_order_money_projection_v1 ON public.leader_orders;
CREATE TRIGGER leader_order_money_projection_v1 BEFORE INSERT OR UPDATE OF client_total,prepayment,balance,payment_status ON public.leader_orders
FOR EACH ROW EXECUTE FUNCTION leader_private.leader_order_money_projection_v1();

REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.leader_orders,public.leader_order_items FROM public,anon,authenticated;
DO $column_writes$
DECLARE t text; cols text;
BEGIN
 FOREACH t IN ARRAY ARRAY['leader_orders','leader_order_items'] LOOP
  SELECT string_agg(quote_ident(column_name),',') INTO cols FROM information_schema.columns WHERE table_schema='public' AND table_name=t;
  EXECUTE format('REVOKE INSERT(%s),UPDATE(%s),REFERENCES(%s) ON public.%I FROM public,anon,authenticated',cols,cols,cols,t);
 END LOOP;
END $column_writes$;

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
      'order_audit', (select count(*) from public.leader_activity_log where user_id = v_user and action like 'order.%'),
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
  delete from public.leader_activity_log where user_id = v_user and (action like 'finance.%' or action like 'order.%');
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
    'order_audit', (select count(*) from public.leader_activity_log where user_id = v_user and action like 'order.%'),
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
