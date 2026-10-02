BEGIN READ ONLY;

DO $$ DECLARE expected jsonb; actual jsonb; BEGIN
 SELECT data_snapshot INTO STRICT expected FROM leader_private.leader_rollout_backups WHERE id='clients-offers-20261002-v1';
 SELECT jsonb_build_object('leader_clients',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.leader_clients t),'leader_commercial_offers',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.leader_commercial_offers t),'leader_commercial_offer_events',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.leader_commercial_offer_events t),'leader_lead_calculations',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.leader_lead_calculations t),'leader_leads',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.leader_leads t),'leader_activity_log',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.leader_activity_log t)) INTO actual;
 IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'business_data_changed'; END IF;
 IF has_function_privilege('authenticated','public.leader_client_registry_rpc(jsonb)','EXECUTE') OR has_function_privilege('anon','public.leader_transition_offer_rpc(jsonb)','EXECUTE') OR has_any_column_privilege('authenticated','public.leader_clients','UPDATE') THEN RAISE EXCEPTION 'browser_write_open'; END IF;
 IF NOT has_function_privilege('service_role','public.leader_client_registry_rpc(jsonb)','EXECUTE') OR NOT has_function_privilege('service_role','public.leader_transition_offer_rpc(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'service_rpc_blocked'; END IF;
END $$;
ROLLBACK;
