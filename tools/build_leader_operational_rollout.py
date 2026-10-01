#!/usr/bin/env python3
"""Assemble the reviewed Leader-only rollout, preserving the default rollback rehearsal."""
import hashlib
import json
from pathlib import Path
from generate_crm_finance_production_candidate import main as build_finance

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'build/leader-operational-rollout'
def main():
    build_finance();OUT.mkdir(parents=True,exist_ok=True)
    core=(ROOT/'supabase/production-candidates/20261001082235_leader_operational_production_core.sql').read_text().rsplit('ROLLBACK;',1)[0]
    finance=(ROOT/'build/crm-finance-production-candidate/finance-apply.sql').read_text()
    finance=finance[finance.index('DO $guard$'):finance.rindex('ROLLBACK;')]
    operations=(ROOT/'supabase/staging-migrations/20261001082221_order_operations_v1.sql').read_text().split('-- STAGING CLEANUP UPGRADE',1)[0]
    sql=core+"\nSET LOCAL leader.finance_approval='APPROVED_FINANCE_20260928_ofewxuqfjhamgerwzull';\n"+finance+operations
    sql+='\n-- No existing business row is rewritten by this rollout.\nROLLBACK;\n'
    (OUT/'rehearsal.sql').write_text(sql)
    (OUT/'stop-rollback.sql').write_text("""BEGIN;
-- Stop new commands while retaining valid payments, history, receipts and stronger RLS.
REVOKE EXECUTE ON FUNCTION public.leader_write_finance_rpc(jsonb) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.leader_write_order_operation_rpc(jsonb) FROM service_role;
-- Also set ORDER_FINANCE_PRODUCTION_ENABLED=false and publish the prior read-only UI.
-- Never restore the unsafe arbitrary PATCH endpoint or broad financial ALL policies.
COMMIT;
""")
    (OUT/'manifest.json').write_text(json.dumps({'project_ref':'ofewxuqfjhamgerwzull','owner_authorization':'2026-09-29','default_transaction':'ROLLBACK','backup_id':'order-finance-20261001-v1','backup_table':'leader_private.leader_rollout_backups','rehearsal_sha256':hashlib.sha256(sql.encode()).hexdigest(),'operations_sha256':hashlib.sha256(operations.encode()).hexdigest(),'existing_business_rows_rewritten':False},indent=2)+'\n')
    print('Built guarded production rehearsal, private DB snapshot and command stop rollback.')
if __name__=='__main__':main()
