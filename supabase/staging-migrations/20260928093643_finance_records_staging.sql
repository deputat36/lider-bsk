-- STAGING ONLY: financial writes for existing CRM tables. Production requires separate approval.
DO $guard$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM leader_staging.environment_guard WHERE singleton AND project_ref='otulfnouybahfnsycxqn' AND environment_name='staging' AND repository='deputat36/lider-bsk') THEN RAISE EXCEPTION 'staging_environment_guard_failed'; END IF;
 IF to_regprocedure('leader_private.leader_actor_has_crm_action(uuid,text)') IS NULL OR to_regclass('leader_private.leader_command_receipts') IS NULL THEN RAISE EXCEPTION 'finance_prerequisites_missing'; END IF;
END $guard$;

-- Column parity from production read-only metadata; contractor table is absent in staging.
CREATE TABLE IF NOT EXISTS public.leader_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  owner_id uuid DEFAULT auth.uid() NOT NULL,
  order_id uuid REFERENCES public.leader_orders(id) ON DELETE CASCADE,
  amount numeric DEFAULT 0 NOT NULL,
  method text,
  payment_date date DEFAULT CURRENT_DATE NOT NULL,
  comment text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  payment_status text DEFAULT 'Проведён'::text NOT NULL,
  receipt_number text,
  created_by uuid DEFAULT auth.uid(),
  created_by_email text,
  payment_type text DEFAULT 'Приход'::text NOT NULL,
  payment_stage text,
  finance_category text,
  counterparty_name text,
  related_entity_type text,
  related_entity_id uuid,
  is_confirmed boolean DEFAULT true NOT NULL
);
CREATE INDEX IF NOT EXISTS leader_payments_order_id_finance_idx ON public.leader_payments(order_id);
ALTER TABLE public.leader_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.leader_payments FROM public,anon,authenticated;
GRANT SELECT ON public.leader_payments TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.leader_payments TO service_role;
DROP POLICY IF EXISTS leader_payments_finance_read ON public.leader_payments;
CREATE POLICY leader_payments_finance_read ON public.leader_payments FOR SELECT TO authenticated USING ((SELECT leader_private.leader_has_crm_action('finance.read')));

CREATE TABLE IF NOT EXISTS public.leader_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  owner_id uuid DEFAULT auth.uid() NOT NULL,
  order_id uuid REFERENCES public.leader_orders(id) ON DELETE SET NULL,
  contractor_id uuid,
  expense_date timestamp with time zone DEFAULT now() NOT NULL,
  category text DEFAULT 'Прочее'::text NOT NULL,
  amount numeric DEFAULT 0 NOT NULL,
  method text,
  status text DEFAULT 'Проведён'::text NOT NULL,
  comment text,
  created_by uuid DEFAULT auth.uid(),
  created_by_email text DEFAULT auth.email(),
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS leader_expenses_order_id_finance_idx ON public.leader_expenses(order_id);
ALTER TABLE public.leader_expenses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.leader_expenses FROM public,anon,authenticated;
GRANT SELECT ON public.leader_expenses TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.leader_expenses TO service_role;
DROP POLICY IF EXISTS leader_expenses_finance_read ON public.leader_expenses;
CREATE POLICY leader_expenses_finance_read ON public.leader_expenses FOR SELECT TO authenticated USING ((SELECT leader_private.leader_has_crm_action('finance.read')));

CREATE TABLE IF NOT EXISTS public.leader_activity_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, action text NOT NULL,
 entity text, entity_id text, data jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.leader_activity_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.leader_activity_log FROM public,anon,authenticated;
GRANT SELECT ON public.leader_activity_log TO authenticated;
GRANT SELECT,INSERT ON public.leader_activity_log TO service_role;
CREATE INDEX IF NOT EXISTS leader_activity_log_finance_entity_idx ON public.leader_activity_log(entity,entity_id);
DROP POLICY IF EXISTS leader_activity_log_finance_read ON public.leader_activity_log;
CREATE POLICY leader_activity_log_finance_read ON public.leader_activity_log FOR SELECT TO authenticated
 USING (action LIKE 'finance.%' AND (SELECT leader_private.leader_has_crm_action('finance.read')));

-- BUSINESS COMMAND BEGIN (shared verbatim with the generated production candidate).
CREATE OR REPLACE FUNCTION public.leader_write_finance_rpc(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $function$
DECLARE
 v_actor uuid; v_request jsonb; v_payload jsonb; v_action text; v_id uuid;
 v_order_id uuid; v_expected timestamptz; v_record_expected timestamptz;
 v_amount numeric; v_date date; v_kind text; v_method text; v_category text; v_comment text; v_reason text;
 v_record_id uuid; v_table text; v_status_field text; v_before jsonb; v_after jsonb;
 v_hash text; v_key text; v_receipt leader_private.leader_command_receipts%rowtype;
 v_order public.leader_orders%rowtype; v_net numeric; v_result jsonb; v_audit_id uuid;
BEGIN
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN ('actor_id','request')) THEN RAISE EXCEPTION 'invalid_payload' USING ERRCODE='22023'; END IF;
 v_actor:=(p_payload->>'actor_id')::uuid;
 IF NOT EXISTS(SELECT 1 FROM public.leader_user_profiles WHERE user_id=v_actor AND is_active) THEN
  RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','inactive_profile'));
 END IF;
 IF NOT leader_private.leader_actor_has_crm_action(v_actor,'finance.write') THEN
  RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','forbidden'));
 END IF;
 v_request:=p_payload->'request';
 IF jsonb_typeof(v_request) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_request) k WHERE k NOT IN ('action','request_id','expected_updated_at','payload')) THEN RAISE EXCEPTION 'invalid_payload' USING ERRCODE='22023'; END IF;
 v_action:=v_request->>'action'; v_id:=(v_request->>'request_id')::uuid;
 v_expected:=(v_request->>'expected_updated_at')::timestamptz;
 v_payload:=v_request->'payload';
 IF v_action IS NULL OR v_action NOT IN ('finance.payment.create','finance.expense.create','finance.record.void') OR v_id IS NULL OR v_expected IS NULL OR jsonb_typeof(v_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_payload' USING ERRCODE='22023'; END IF;
 v_order_id:=(v_payload->>'order_id')::uuid;
 IF v_order_id IS NULL THEN RAISE EXCEPTION 'invalid_payload' USING ERRCODE='22023'; END IF;
 IF v_action='finance.record.void' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(v_payload) k WHERE k NOT IN ('order_id','kind','record_id','expected_record_updated_at','reason')) THEN RAISE EXCEPTION 'invalid_payload' USING ERRCODE='22023'; END IF;
  v_kind:=v_payload->>'kind'; v_record_id:=(v_payload->>'record_id')::uuid;
  v_record_expected:=(v_payload->>'expected_record_updated_at')::timestamptz;
  v_reason:=btrim(v_payload->>'reason');
  IF v_kind IS NULL OR v_kind NOT IN ('payment','expense') OR v_record_id IS NULL OR v_record_expected IS NULL OR coalesce(length(v_reason),0) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'invalid_payload' USING ERRCODE='22023'; END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(v_payload) k WHERE k NOT IN ('order_id','amount','date','method','category','comment')) THEN RAISE EXCEPTION 'invalid_payload' USING ERRCODE='22023'; END IF;
  v_kind:=CASE v_action WHEN 'finance.payment.create' THEN 'payment' ELSE 'expense' END;
  IF jsonb_typeof(v_payload->'amount') IS DISTINCT FROM 'number' OR jsonb_typeof(v_payload->'date') IS DISTINCT FROM 'string' OR (v_payload->>'date') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'invalid_payload' USING ERRCODE='22023'; END IF;
  v_amount:=(v_payload->>'amount')::numeric; v_date:=(v_payload->>'date')::date;
  v_method:=v_payload->>'method'; v_category:=v_payload->>'category'; v_comment:=btrim(coalesce(v_payload->>'comment',''));
  IF v_amount<=0 OR v_amount>1000000000 OR v_amount<>round(v_amount,2) OR v_date<'2000-01-01'::date OR v_date>(current_timestamp AT TIME ZONE 'Europe/Moscow')::date OR
     v_method IS NULL OR v_method NOT IN ('Наличные','Перевод','Безналичный расчёт','Карта','Другое') OR v_category IS NULL OR length(v_comment)>2000 OR
     (v_kind='payment' AND v_category NOT IN ('Предоплата','Доплата','Полная оплата','Прочее')) OR
     (v_kind='expense' AND v_category NOT IN ('Материалы','Подрядчик','Дизайн','Производство','Монтаж','Доставка','Прочее')) THEN RAISE EXCEPTION 'invalid_payload' USING ERRCODE='22023'; END IF;
 END IF;
 v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('actor_id',v_actor,'request',v_request)::text,'UTF8'),'sha256'),'hex');
 v_key:='finance:'||v_id::text;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_key,0));
 SELECT * INTO v_receipt FROM leader_private.leader_command_receipts WHERE action=v_action AND idempotency_key=v_key FOR UPDATE;
 IF FOUND THEN
  IF v_receipt.request_hash IS DISTINCT FROM v_hash OR v_receipt.actor_id IS DISTINCT FROM v_actor THEN
   RETURN jsonb_build_object('ok',false,'request_id',v_id,'error',jsonb_build_object('code','idempotency_conflict'));
  END IF;
  IF v_receipt.state='success' AND v_receipt.response IS NOT NULL THEN RETURN v_receipt.response||jsonb_build_object('idempotent_replay',true); END IF;
  RETURN jsonb_build_object('ok',false,'request_id',v_id,'error',jsonb_build_object('code','idempotency_conflict'));
 END IF;
 SELECT * INTO v_order FROM public.leader_orders WHERE id=v_order_id FOR UPDATE;
 IF NOT FOUND OR coalesce(v_order.is_archived,false) THEN RETURN jsonb_build_object('ok',false,'request_id',v_id,'error',jsonb_build_object('code','order_unavailable')); END IF;
 IF v_order.updated_at IS DISTINCT FROM v_expected THEN RETURN jsonb_build_object('ok',false,'request_id',v_id,'error',jsonb_build_object('code','source_changed')); END IF;
 IF v_action='finance.record.void' THEN
  v_table:=CASE v_kind WHEN 'payment' THEN 'leader_payments' ELSE 'leader_expenses' END;
  v_status_field:=CASE v_kind WHEN 'payment' THEN 'payment_status' ELSE 'status' END;
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 AND order_id=$2 FOR UPDATE',v_table) INTO v_before USING v_record_id,v_order_id;
  IF v_before IS NULL THEN RETURN jsonb_build_object('ok',false,'request_id',v_id,'error',jsonb_build_object('code','record_not_found')); END IF;
  IF (v_before->>'updated_at')::timestamptz IS DISTINCT FROM v_record_expected THEN RETURN jsonb_build_object('ok',false,'request_id',v_id,'error',jsonb_build_object('code','source_changed')); END IF;
  IF v_before->>v_status_field IN ('Отменён','Отменен','cancelled') THEN RETURN jsonb_build_object('ok',false,'request_id',v_id,'error',jsonb_build_object('code','record_already_void')); END IF;
  -- Unknown or planned legacy statuses need separate reviewed transitions.
  IF v_before->>v_status_field NOT IN ('Проведён','Проведен','posted') THEN RAISE EXCEPTION 'invalid_payload' USING ERRCODE='22023'; END IF;
  EXECUTE format('UPDATE public.%I SET %I=$1,updated_at=clock_timestamp() WHERE id=$2 RETURNING to_jsonb(%I.*)',v_table,v_status_field,v_table) INTO v_after USING 'Отменён',v_record_id;
 ELSE
  v_record_id:=gen_random_uuid();
  IF v_kind='payment' THEN
   INSERT INTO public.leader_payments(id,owner_id,order_id,amount,method,payment_date,comment,payment_status,created_by,payment_type,payment_stage,finance_category,related_entity_type,related_entity_id,is_confirmed)
   VALUES(v_record_id,v_actor,v_order_id,v_amount,v_method,v_date,nullif(v_comment,''),'Проведён',v_actor,'Приход',v_category,v_category,'order',v_order_id,true) RETURNING to_jsonb(leader_payments.*) INTO v_after;
  ELSE
   INSERT INTO public.leader_expenses(id,owner_id,order_id,amount,method,expense_date,category,status,comment,created_by)
   VALUES(v_record_id,v_actor,v_order_id,v_amount,v_method,(v_date+time '12:00') AT TIME ZONE 'Europe/Moscow',v_category,'Проведён',nullif(v_comment,''),v_actor) RETURNING to_jsonb(leader_expenses.*) INTO v_after;
  END IF;
 END IF;
 -- Match the existing canonical payment model, including legacy outgoing types.
 SELECT coalesce(sum(CASE WHEN lower(coalesce(payment_type,'')) ~ '(возврат|расход|исход)' THEN -abs(amount) ELSE abs(amount) END),0)
 INTO v_net FROM public.leader_payments WHERE order_id=v_order_id AND is_confirmed AND lower(btrim(payment_status)) IN ('проведён','проведен','posted');
 UPDATE public.leader_orders SET prepayment=v_net,balance=greatest(coalesce(client_total,0)-v_net,0),
  payment_status=CASE WHEN v_net>=coalesce(client_total,0) THEN 'Оплачено' WHEN v_net>0 THEN 'Частично оплачено' ELSE 'Не оплачено' END,
  updated_at=clock_timestamp() WHERE id=v_order_id RETURNING * INTO v_order;
 INSERT INTO public.leader_activity_log(user_id,action,entity,entity_id,data)
 VALUES(v_actor,v_action,v_kind,v_record_id::text,jsonb_build_object('request_id',v_id,'order_id',v_order_id,'reason',v_reason,
  'before_status',CASE v_kind WHEN 'payment' THEN v_before->>'payment_status' ELSE v_before->>'status' END,
  'after_status',CASE v_kind WHEN 'payment' THEN v_after->>'payment_status' ELSE v_after->>'status' END,
  'amount',v_after->'amount','date',coalesce(v_after->'payment_date',v_after->'expense_date'),'method',v_after->'method','category',coalesce(v_after->'finance_category',v_after->'category')))
 RETURNING id INTO v_audit_id;
 v_result:=jsonb_build_object('ok',true,'request_id',v_id,'kind',v_kind,'record_id',v_record_id,'record_updated_at',v_after->'updated_at','audit_id',v_audit_id,
  'order_id',v_order_id,'order_updated_at',v_order.updated_at,'payment_status',v_order.payment_status,'net_receipts',v_net,'debt',v_order.balance);
 -- All writes and receipt commit together; exceptions roll back the entire block.
 INSERT INTO leader_private.leader_command_receipts(action,idempotency_key,request_id,request_hash,actor_id,state,response,completed_at)
 VALUES(v_action,v_key,v_id,v_hash,v_actor,'success',v_result,clock_timestamp());
 RETURN v_result;
EXCEPTION
 WHEN invalid_text_representation OR invalid_parameter_value OR datetime_field_overflow OR numeric_value_out_of_range THEN
  RETURN jsonb_build_object('ok',false,'request_id',v_id,'error',jsonb_build_object('code','invalid_payload'));
 WHEN OTHERS THEN
  RAISE LOG 'leader_finance_write_failed request_id=% sqlstate=%',v_id,SQLSTATE;
  RETURN jsonb_build_object('ok',false,'request_id',v_id,'error',jsonb_build_object('code','finance_write_failed'));
END $function$;
REVOKE ALL ON FUNCTION public.leader_write_finance_rpc(jsonb) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.leader_write_finance_rpc(jsonb) TO service_role;
-- BUSINESS COMMAND END.

-- Preserve the existing full synthetic lifecycle; delete financial children before orders.
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
  delete from public.leader_activity_log where user_id = v_user and action like 'finance.%';
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
