BEGIN;
-- Stop commands; retain all rows, receipts and hardened read/write ACL.
REVOKE EXECUTE ON FUNCTION public.leader_create_installation_job_from_order_rpc(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.leader_create_production_job_from_order_impl_rpc(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.leader_create_production_job_from_order_rpc(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.leader_read_installation_job_rpc(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.leader_update_installation_job_rpc(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.leader_update_production_job_rpc(jsonb) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
-- Re-enable service_role only after corrected candidate passes staging and CI.
