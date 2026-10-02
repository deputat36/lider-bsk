-- Stop writes, preserve all business rows/audit/receipts; disable frontend gates too.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.leader_client_registry_rpc(jsonb) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.leader_transition_offer_rpc(jsonb) FROM service_role;
DO $$ BEGIN
 IF has_function_privilege('service_role','public.leader_client_registry_rpc(jsonb)','EXECUTE') OR has_function_privilege('service_role','public.leader_transition_offer_rpc(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'stop_failed'; END IF;
END $$;
COMMIT;
