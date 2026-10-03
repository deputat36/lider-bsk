-- First disable design production frontend gate. Keep all rows, history and receipts.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.leader_create_design_task_from_order_rpc(jsonb),public.leader_transition_design_task_rpc(jsonb) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
-- No legacy browser DML is restored. Read queue remains available.
-- After correcting the server source, verify staging/CI and restore service_role EXECUTE only.
