-- Executable emergency stop. Retains functions, audit, data and stronger browser ACL.
-- Restore frontend read-only if stopping. Never restore legacy browser writes.
BEGIN;
DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM leader_private.leader_rollout_backups WHERE id='catalog-management-20261014-v1' AND project_ref='ofewxuqfjhamgerwzull') THEN RAISE EXCEPTION 'catalog_backup_missing'; END IF;
END $guard$;
REVOKE ALL ON FUNCTION public.leader_manage_catalog_rpc(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION leader_private.leader_discard_catalog_command_receipt(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
