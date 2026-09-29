#!/usr/bin/env python3
"""Source-only package. No connection, credentials, deployment or production writes."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'supabase/staging-migrations/20260928093643_finance_records_staging.sql'
OUT = ROOT / 'build/crm-finance-production-candidate'
PRODUCTION = 'ofewxuqfjhamgerwzull'
STAGING = 'otulfnouybahfnsycxqn'


def business_sql():
    source = SOURCE.read_text()
    return source.split('-- BUSINESS COMMAND BEGIN', 1)[1].split('\n', 1)[1].split('-- BUSINESS COMMAND END.', 1)[0]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    preflight = """-- SOURCE ONLY. Explicit database approval and verified backup required.
-- Target: ofewxuqfjhamgerwzull. Default is ROLLBACK, never an automatic deploy.
BEGIN;
DO $guard$ BEGIN
 IF current_setting('leader.finance_approval',true) IS DISTINCT FROM 'APPROVED_FINANCE_20260928_ofewxuqfjhamgerwzull' THEN RAISE EXCEPTION 'explicit_finance_approval_required'; END IF;
 IF to_regclass('leader_staging.environment_guard') IS NOT NULL THEN RAISE EXCEPTION 'production_candidate_rejected_on_staging'; END IF;
 IF to_regprocedure('leader_private.leader_actor_has_crm_action(uuid,text)') IS NULL OR to_regprocedure('leader_private.leader_has_crm_action(text)') IS NULL OR to_regprocedure('public.leader_actor_has_crm_action_rpc(uuid,text)') IS NULL OR to_regclass('leader_private.leader_command_receipts') IS NULL THEN RAISE EXCEPTION 'canonical_rbac_receipts_prerequisite_missing'; END IF;
 IF to_regprocedure('public.leader_write_finance_rpc(jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'finance_rpc_already_present'; END IF;
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid IN ('public.leader_payments'::regclass,'public.leader_expenses'::regclass) AND attacl IS NOT NULL) THEN RAISE EXCEPTION 'unreviewed_column_grants'; END IF;
 IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('leader_payments','leader_expenses'))<>2 OR
    (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND policyname IN ('leader_payments_app','leader_expenses_app') AND cmd='ALL' AND qual='leader_private.leader_has_access()' AND with_check='leader_private.leader_has_access()')<>2 THEN RAISE EXCEPTION 'finance_policies_changed_review_required'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class WHERE oid IN ('public.leader_payments'::regclass,'public.leader_expenses'::regclass,'public.leader_activity_log'::regclass) AND NOT relrowsecurity) THEN RAISE EXCEPTION 'finance_rls_disabled'; END IF;
 IF EXISTS(SELECT 1 FROM leader_private.leader_role_action_matrix_v1 WHERE ('finance.read'=ANY(allowed_actions) OR 'finance.write'=ANY(allowed_actions)) AND role NOT IN ('owner','admin','accountant')) OR
    (SELECT count(*) FROM leader_private.leader_role_action_matrix_v1 WHERE role IN ('owner','admin','accountant') AND 'finance.read'=ANY(allowed_actions) AND 'finance.write'=ANY(allowed_actions))<>3 THEN RAISE EXCEPTION 'finance_matrix_mismatch'; END IF;
END $guard$;
-- Capture pg_dump schema/ACL/RLS and data externally before approval; no snapshot of PII in source.
DROP POLICY leader_payments_app ON public.leader_payments;
DROP POLICY leader_expenses_app ON public.leader_expenses;
REVOKE ALL ON public.leader_payments,public.leader_expenses FROM public,anon,authenticated;
GRANT SELECT ON public.leader_payments,public.leader_expenses TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.leader_payments,public.leader_expenses TO service_role;
GRANT SELECT,INSERT ON public.leader_activity_log TO service_role;
CREATE POLICY leader_payments_finance_read ON public.leader_payments FOR SELECT TO authenticated USING ((SELECT leader_private.leader_has_crm_action('finance.read')));
CREATE POLICY leader_expenses_finance_read ON public.leader_expenses FOR SELECT TO authenticated USING ((SELECT leader_private.leader_has_crm_action('finance.read')));
-- Preserve unrelated audit behavior; finance events cannot be forged or changed by browsers.
CREATE POLICY leader_finance_audit_read ON public.leader_activity_log AS RESTRICTIVE FOR SELECT TO authenticated USING (action NOT LIKE 'finance.%' OR (SELECT leader_private.leader_has_crm_action('finance.read')));
CREATE POLICY leader_finance_audit_anon ON public.leader_activity_log AS RESTRICTIVE FOR SELECT TO anon USING (action NOT LIKE 'finance.%');
CREATE POLICY leader_finance_audit_insert ON public.leader_activity_log AS RESTRICTIVE FOR INSERT TO public WITH CHECK (action NOT LIKE 'finance.%');
CREATE POLICY leader_finance_audit_update ON public.leader_activity_log AS RESTRICTIVE FOR UPDATE TO public USING (action NOT LIKE 'finance.%') WITH CHECK (action NOT LIKE 'finance.%');
CREATE POLICY leader_finance_audit_delete ON public.leader_activity_log AS RESTRICTIVE FOR DELETE TO public USING (action NOT LIKE 'finance.%');
"""
    rpc = business_sql()
    (OUT / 'finance-apply.sql').write_text(preflight + rpc + '\n-- Review postflight before explicitly replacing this final ROLLBACK.\nROLLBACK;\n')
    (OUT / 'finance-stop-rollback.sql').write_text("""-- Explicit production rollback approval required. Stop new commands; retain committed money and audit.
-- Keep tightened financial RLS/grants: restoring the previous broad-write policy is unsafe.
BEGIN;
DO $guard$ BEGIN
 IF current_setting('leader.finance_approval',true) IS DISTINCT FROM 'APPROVED_FINANCE_STOP_ofewxuqfjhamgerwzull' THEN RAISE EXCEPTION 'explicit_finance_stop_approval_required'; END IF;
 IF to_regclass('leader_staging.environment_guard') IS NOT NULL THEN RAISE EXCEPTION 'production_rollback_rejected_on_staging'; END IF;
END $guard$;
REVOKE ALL ON FUNCTION public.leader_write_finance_rpc(jsonb) FROM public,anon,authenticated,service_role;
DROP FUNCTION public.leader_write_finance_rpc(jsonb);
-- Existing payments/expenses/order projections/audit/receipts are deliberately retained.
ROLLBACK;
""")
    (OUT / 'finance-postflight.sql').write_text("""-- READ ONLY. False unexpected predicates block Edge/frontend rollout.
SELECT has_function_privilege('service_role','public.leader_write_finance_rpc(jsonb)','EXECUTE') AS service_command,
 has_function_privilege('authenticated','public.leader_write_finance_rpc(jsonb)','EXECUTE') AS browser_command_must_be_false,
 has_function_privilege('anon','public.leader_write_finance_rpc(jsonb)','EXECUTE') AS anon_command_must_be_false;
SELECT t,has_table_privilege('authenticated',t,'INSERT') AS browser_insert_must_be_false,
 has_table_privilege('authenticated',t,'UPDATE') AS browser_update_must_be_false,
 has_table_privilege('authenticated',t,'DELETE') AS browser_delete_must_be_false
 FROM unnest(ARRAY['public.leader_payments','public.leader_expenses']) t;
SELECT tablename,policyname,permissive,cmd,roles,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename IN ('leader_payments','leader_expenses','leader_activity_log') ORDER BY tablename,policyname;
SELECT count(*) AS orphan_receipts FROM public.leader_payments p LEFT JOIN public.leader_orders o ON o.id=p.order_id WHERE p.order_id IS NOT NULL AND o.id IS NULL;
SELECT count(*) AS orphan_expenses FROM public.leader_expenses e LEFT JOIN public.leader_orders o ON o.id=e.order_id WHERE e.order_id IS NOT NULL AND o.id IS NULL;
SELECT count(*) AS duplicate_keys FROM (SELECT action,idempotency_key FROM leader_private.leader_command_receipts WHERE action LIKE 'finance.%' GROUP BY action,idempotency_key HAVING count(*)>1) d;
""")
    edge = (ROOT / 'supabase/functions/leader-crm-finance/index.ts').read_text().replace(STAGING, PRODUCTION).replace('// Staging-only until an independently approved production rollout.', '// Production candidate. Separate approval required for deployment.')
    target = OUT / 'edge/leader-crm-finance'; target.mkdir(parents=True, exist_ok=True)
    (target / 'index.ts').write_text(edge)
    manifest = {'source_only': True, 'production_mutated': False, 'project_ref': PRODUCTION, 'database_approval_required': True, 'edge_approval_required': True, 'verify_jwt': True, 'frontend_enabled': False, 'rpc_sha256': hashlib.sha256(rpc.encode()).hexdigest(), 'rollback': 'stop_commands_preserve_data_and_hardened_rls', 'prerequisite': 'supabase/production-candidates/20260723_01_installation_rbac_receipts_candidate.sql'}
    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
    print('Generated source-only finance candidate; production remains untouched.')


if __name__ == '__main__':
    main()
