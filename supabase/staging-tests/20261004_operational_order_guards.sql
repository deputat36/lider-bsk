-- Called inside the existing ROLLBACK fixtures, before each positive update.
CREATE OR REPLACE FUNCTION pg_temp.check_operational_order_guards(fn text, request jsonb, job uuid, kind text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE response jsonb; parent uuid; original_status text; original_archive boolean;
 original_order jsonb; original_job jsonb; receipts bigint; events bigint; current_events bigint;
 status_case text;
BEGIN
 EXECUTE format('SELECT order_id,to_jsonb(j) FROM public.leader_%I_jobs j WHERE id=$1',kind)
 INTO parent,original_job USING job;
 SELECT status,is_archived,to_jsonb(o) INTO original_status,original_archive,original_order
 FROM public.leader_orders o WHERE id=parent;
 SELECT count(*) INTO receipts FROM leader_private.leader_command_receipts;
 EXECUTE format('SELECT count(*) FROM public.leader_%I_events',kind) INTO events;
 FOREACH status_case IN ARRAY ARRAY['Закрыт','closed','Отменён','archived'] LOOP
  UPDATE public.leader_orders SET status=CASE WHEN status_case='archived' THEN original_status ELSE status_case END,
    is_archived=(status_case='archived') WHERE id=parent;
  EXECUTE format('SELECT public.%I($1)',fn) INTO response USING request;
  IF response#>>'{error,code}' IS DISTINCT FROM 'invalid_transition' THEN
   RAISE EXCEPTION 'closed_order_update_accepted:%:%:%',fn,status_case,response; END IF;
  EXECUTE format('SELECT count(*) FROM public.leader_%I_events',kind) INTO current_events;
  IF current_events<>events OR (SELECT count(*) FROM leader_private.leader_command_receipts)<>receipts THEN
   RAISE EXCEPTION 'rejected_update_left_audit_or_receipt:%',fn; END IF;
  EXECUTE format('SELECT to_jsonb(j) FROM public.leader_%I_jobs j WHERE id=$1',kind) INTO response USING job;
  IF response IS DISTINCT FROM original_job THEN RAISE EXCEPTION 'rejected_update_changed_job:%',fn; END IF;
 END LOOP;
 UPDATE public.leader_orders SET status=original_status,is_archived=original_archive WHERE id=parent;
 IF (SELECT to_jsonb(o) FROM public.leader_orders o WHERE id=parent) IS DISTINCT FROM original_order THEN
  RAISE EXCEPTION 'rejected_update_changed_order:%',fn; END IF;
 -- Wrong revision still fails on an open order without side effects.
 EXECUTE format('SELECT public.%I($1)',fn) INTO response
 USING jsonb_set(request,'{request,expected_updated_at}',to_jsonb('2000-01-01T00:00:00Z'::text));
 IF response#>>'{error,code}' IS DISTINCT FROM 'conflict' THEN RAISE EXCEPTION 'stale_update_accepted:%:%',fn,response; END IF;
END $$;
