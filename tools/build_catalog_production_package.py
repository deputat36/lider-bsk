#!/usr/bin/env python3
"""Build the Leader-only catalog package from the authenticated staging command.

This script is offline. Installation requires fresh preflight and the reviewed
candidate; it never reapplies the shared RBAC/receipt core or edits catalog rows.
"""
from pathlib import Path
from generate_crm_catalog_production_candidate import extract_rpc, receipt_helper_sql, production_edge_text

ROOT = Path(__file__).resolve().parents[1]
CANDIDATE = ROOT / 'supabase/production-candidates/20261014095201_catalog_management_production_v1.sql'
STOP = ROOT / 'supabase/production-candidates/leader_catalog_management_stop_rollback.sql'
BACKUP = 'catalog-management-20261014-v1'


def package_sql():
    before = f"""-- Leader catalog command; exact staging business implementation, scoped ACL cutover.
-- Target: ofewxuqfjhamgerwzull. No business rows or shared Auth/core are rewritten.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';
DO $preflight$ BEGIN
  IF to_regclass('leader_staging.environment_guard') IS NOT NULL THEN RAISE EXCEPTION 'production_only'; END IF;
  IF NOT EXISTS (SELECT 1 FROM leader_private.leader_rollout_backups WHERE id='order-finance-20261001-v1' AND project_ref='ofewxuqfjhamgerwzull') THEN RAISE EXCEPTION 'approved_production_core_missing'; END IF;
  IF EXISTS (SELECT 1 FROM leader_private.leader_rollout_backups WHERE id='{BACKUP}') THEN RAISE EXCEPTION 'catalog_already_installed'; END IF;
  IF to_regprocedure('public.leader_manage_catalog_rpc(jsonb)') IS NOT NULL OR to_regprocedure('leader_private.leader_discard_catalog_command_receipt(uuid,uuid)') IS NOT NULL THEN RAISE EXCEPTION 'unexpected_catalog_function'; END IF;
  IF to_regprocedure('leader_private.leader_actor_has_crm_action(uuid,text)') IS NULL OR to_regprocedure('leader_private.leader_has_crm_action(text)') IS NULL THEN RAISE EXCEPTION 'canonical_rbac_missing'; END IF;
  IF has_table_privilege('anon','leader_private.leader_rollout_backups','SELECT') OR has_table_privilege('authenticated','leader_private.leader_rollout_backups','SELECT') OR has_table_privilege('service_role','leader_private.leader_rollout_backups','SELECT') THEN RAISE EXCEPTION 'backup_exposed'; END IF;
  IF (SELECT count(*) FROM leader_private.leader_role_action_matrix_v1 WHERE role IN ('owner','admin') AND 'catalog.manage'=ANY(allowed_actions)) <> 2 THEN RAISE EXCEPTION 'catalog_manage_matrix_mismatch'; END IF;
  IF EXISTS (SELECT 1 FROM leader_private.leader_role_action_matrix_v1 WHERE role NOT IN ('owner','admin') AND 'catalog.manage'=ANY(allowed_actions)) THEN RAISE EXCEPTION 'unexpected_catalog_writer'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='leader_catalog_price_logs' AND policyname='leader catalog price logs select active users' AND cmd='SELECT') THEN RAISE EXCEPTION 'price_log_policy_drift'; END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE oid IN ('public.leader_catalog'::regclass,'public.leader_catalog_price_logs'::regclass) AND NOT relrowsecurity) THEN RAISE EXCEPTION 'catalog_rls_missing'; END IF;
END $preflight$;
LOCK TABLE public.leader_catalog, public.leader_catalog_price_logs IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO leader_private.leader_rollout_backups(id,project_ref,data_snapshot,metadata_snapshot,edge_snapshot)
SELECT '{BACKUP}','ofewxuqfjhamgerwzull',jsonb_build_object(
  'leader_catalog',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM public.leader_catalog t),
  'leader_catalog_price_logs',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM public.leader_catalog_price_logs t)),jsonb_build_object(
  'policies',(SELECT jsonb_agg(to_jsonb(p)) FROM pg_policies p WHERE schemaname='public' AND tablename IN ('leader_catalog','leader_catalog_price_logs')),
  'tables',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'acl',c.relacl,'rls',c.relrowsecurity,'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'acl',a.attacl)) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped))) FROM pg_class c WHERE c.oid IN ('public.leader_catalog'::regclass,'public.leader_catalog_price_logs'::regclass))),
  '{{"leader-crm-catalog":"absent"}}'::jsonb;
"""
    source = (ROOT / 'supabase/staging-migrations/20260904_02_catalog_management_write_harness.sql').read_text()
    after = f"""
-- Close legacy browser bypasses at table AND column level; SELECT for calculations remains.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.leader_catalog, public.leader_catalog_price_logs FROM PUBLIC, anon, authenticated;
DO $columns$ DECLARE col record; BEGIN
  FOR col IN SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('leader_catalog','leader_catalog_price_logs') LOOP
    EXECUTE format('REVOKE INSERT (%1$I), UPDATE (%1$I), REFERENCES (%1$I) ON public.%2$I FROM PUBLIC, anon, authenticated', col.column_name,col.table_name);
  END LOOP;
END $columns$;
ALTER POLICY "leader catalog price logs select active users" ON public.leader_catalog_price_logs USING ((SELECT leader_private.leader_has_crm_action('catalog.read')));
DO $postflight$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['public.leader_catalog','public.leader_catalog_price_logs'] LOOP
    IF has_any_column_privilege('anon',tab,'INSERT') OR has_any_column_privilege('anon',tab,'UPDATE') OR has_any_column_privilege('authenticated',tab,'INSERT') OR has_any_column_privilege('authenticated',tab,'UPDATE') OR has_table_privilege('anon',tab,'DELETE') OR has_table_privilege('authenticated',tab,'DELETE') OR has_table_privilege('anon',tab,'TRUNCATE') OR has_table_privilege('authenticated',tab,'TRUNCATE') THEN RAISE EXCEPTION 'browser_catalog_write_open'; END IF;
    IF NOT has_table_privilege('authenticated',tab,'SELECT') THEN RAISE EXCEPTION 'catalog_read_grant_lost'; END IF;
  END LOOP;
  IF has_function_privilege('anon','public.leader_manage_catalog_rpc(jsonb)','EXECUTE') OR has_function_privilege('authenticated','public.leader_manage_catalog_rpc(jsonb)','EXECUTE') OR NOT has_function_privilege('service_role','public.leader_manage_catalog_rpc(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'catalog_rpc_acl'; END IF;
  IF (SELECT data_snapshot FROM leader_private.leader_rollout_backups WHERE id='{BACKUP}') IS DISTINCT FROM jsonb_build_object('leader_catalog',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM public.leader_catalog t),'leader_catalog_price_logs',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM public.leader_catalog_price_logs t)) THEN RAISE EXCEPTION 'catalog_business_rows_changed'; END IF;
END $postflight$;
NOTIFY pgrst, 'reload schema';
COMMIT;
"""
    return before + receipt_helper_sql() + '\n' + extract_rpc(source) + after


def stop_sql():
    return f"""-- Executable emergency stop. Retains functions, audit, data and stronger browser ACL.
-- Restore frontend read-only if stopping. Never restore legacy browser writes.
BEGIN;
DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM leader_private.leader_rollout_backups WHERE id='{BACKUP}' AND project_ref='ofewxuqfjhamgerwzull') THEN RAISE EXCEPTION 'catalog_backup_missing'; END IF;
END $guard$;
REVOKE ALL ON FUNCTION public.leader_manage_catalog_rpc(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION leader_private.leader_discard_catalog_command_receipt(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
"""


def main():
    CANDIDATE.write_text(package_sql())
    STOP.write_text(stop_sql())
    edge = ROOT / 'build/crm-catalog-production-package/edge/leader-crm-catalog'
    edge.mkdir(parents=True, exist_ok=True)
    for name in ('index.ts','contract.ts'):
        (edge/name).write_text(production_edge_text(name))
    print('Built scoped catalog migration, private snapshot, non-destructive stop and JWT Edge.')


if __name__ == '__main__':
    main()
