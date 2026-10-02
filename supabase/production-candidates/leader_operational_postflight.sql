-- Read-only assertions, also run inside the rollout transaction before commit.
DO $postflight$
DECLARE t text; actual jsonb; snapshot jsonb; expected jsonb;
BEGIN
 SELECT data_snapshot INTO snapshot FROM leader_private.leader_rollout_backups WHERE id='order-finance-20261001-v1' AND project_ref='ofewxuqfjhamgerwzull';
 IF snapshot IS NULL THEN RAISE EXCEPTION 'rollout_backup_missing'; END IF;
 FOREACH t IN ARRAY ARRAY['leader_orders','leader_order_items','leader_payments','leader_expenses','leader_activity_log'] LOOP
  EXECUTE format($query$SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id::text),'[]'::jsonb) FROM public.%I x$query$,t) INTO actual;
  SELECT coalesce(jsonb_agg(value ORDER BY value->>'id'),'[]'::jsonb) INTO expected FROM jsonb_array_elements(snapshot->t);
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'business_data_changed_since_snapshot:%',t; END IF;
 END LOOP;
 FOREACH t IN ARRAY ARRAY['public.leader_write_finance_rpc(jsonb)','public.leader_write_order_operation_rpc(jsonb)','public.leader_actor_has_crm_action_rpc(uuid,text)'] LOOP
  IF NOT has_function_privilege('service_role',t,'EXECUTE') OR has_function_privilege('anon',t,'EXECUTE') OR has_function_privilege('authenticated',t,'EXECUTE') THEN RAISE EXCEPTION 'command_privileges_unsafe:%',t; END IF;
 END LOOP;
 FOREACH t IN ARRAY ARRAY['public.leader_payments','public.leader_expenses','public.leader_orders','public.leader_order_items'] LOOP
  IF has_table_privilege('authenticated',t,'INSERT,UPDATE,DELETE') OR has_any_column_privilege('authenticated',t,'INSERT,UPDATE') OR has_table_privilege('anon',t,'INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'browser_write_grant:%',t; END IF;
 END LOOP;
 IF has_table_privilege('authenticated','leader_private.leader_rollout_backups','SELECT') OR has_table_privilege('service_role','leader_private.leader_rollout_backups','SELECT') THEN RAISE EXCEPTION 'backup_exposed'; END IF;
 IF (SELECT count(*) FROM leader_private.leader_role_action_matrix_v1)<>7 THEN RAISE EXCEPTION 'role_matrix_invalid'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.leader_orders'::regclass AND tgname='leader_order_money_projection_v1' AND tgenabled='O') THEN RAISE EXCEPTION 'money_projection_trigger_missing'; END IF;
 IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND policyname IN('leader_payments_finance_read','leader_expenses_finance_read') AND cmd='SELECT')<>2 THEN RAISE EXCEPTION 'money_rls_missing'; END IF;
END $postflight$;
