#!/usr/bin/env python3
"""Exercise the reviewed SQL against TEMP tables, never persistent CRM data.

The generated file is disposable. Run with psql -v ON_ERROR_STOP=1; all changes
are inside an outer transaction ending in ROLLBACK. No Supabase secrets needed.
"""
import json,re
from pathlib import Path
root=Path(__file__).resolve().parents[1]
rows=json.loads((root/'docs/evidence/leader-status-repair-snapshot-2026-09-27.json').read_text())
for name in ('issue381-status-repair-candidate.sql', 'issue381-status-repair-rollback.sql'):
 text=(root/'tools/sql'/name).read_text()
 assert text.rstrip().endswith('ROLLBACK;'), f'{name}: default must roll back'
apply=re.search(r'DO \$repair\$.*?\$repair\$;', (root/'tools/sql/issue381-status-repair-candidate.sql').read_text(), re.S)[0].replace('public.','pg_temp.')
undo=re.search(r'DO \$rollback\$.*?\$rollback\$;', (root/'tools/sql/issue381-status-repair-rollback.sql').read_text(), re.S)[0].replace('public.','pg_temp.')
setup='''-- Isolated candidate exercise. Temporary tables only; transaction rolled back.
BEGIN;
SET LOCAL statement_timeout='30s';
CREATE TEMP TABLE leader_user_profiles(user_id uuid, is_active boolean, role text) ON COMMIT DROP;
INSERT INTO pg_temp.leader_user_profiles VALUES('11111111-1111-4111-8111-111111111111',true,'owner');
CREATE TEMP TABLE leader_leads(id uuid PRIMARY KEY,status text,updated_at timestamptz,converted_order_id uuid) ON COMMIT DROP;
CREATE TEMP TABLE leader_lead_calculations(id uuid PRIMARY KEY,status text,updated_at timestamptz,order_id uuid,is_current_revision boolean DEFAULT true) ON COMMIT DROP;
CREATE TEMP TABLE leader_commercial_offers(id uuid PRIMARY KEY,status text,updated_at timestamptz,order_id uuid,calculation_id uuid) ON COMMIT DROP;
CREATE TEMP TABLE leader_orders(id uuid PRIMARY KEY) ON COMMIT DROP;
CREATE TEMP TABLE leader_backups(id uuid PRIMARY KEY,owner_id uuid,label text,data jsonb,created_at timestamptz DEFAULT now()) ON COMMIT DROP;
CREATE TEMP TABLE leader_activity_log(id uuid DEFAULT gen_random_uuid(),user_id uuid,action text,entity text,entity_id text,data jsonb,created_at timestamptz DEFAULT now()) ON COMMIT DROP;
SET LOCAL lider.repair_actor='11111111-1111-4111-8111-111111111111';
'''
mapping={'lead':'leader_leads','calculation':'leader_lead_calculations','offer':'leader_commercial_offers'}
for r in rows:
 setup+=f"INSERT INTO pg_temp.{mapping[r['entity']]}(id,status,updated_at) VALUES('{r['id']}','{r['status']}','{r['updated_at']}');\n"
# Existing production guard allows agreed status only for a current calculation.
# Pair each offer with one of the five known current calculations in the fixture.
sources=[r['id'] for r in rows if r['entity']=='calculation']
for offer, source in zip((r for r in rows if r['entity']=='offer'),sources):
 setup+=f"UPDATE pg_temp.leader_commercial_offers SET calculation_id='{source}' WHERE id='{offer['id']}';\n"
setup+="""
CREATE FUNCTION pg_temp.guard_historical_offer() RETURNS trigger LANGUAGE plpgsql AS $guard$
BEGIN
 IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
 IF OLD.status='Устарело' AND NEW.status<>'Устарело' THEN RAISE EXCEPTION 'historical_offer_locked'; END IF;
 IF NEW.status IN ('Согласовано','КП отправлено','Отправлено') AND NEW.calculation_id IS NOT NULL AND
    NOT coalesce((SELECT is_current_revision FROM pg_temp.leader_lead_calculations WHERE id=NEW.calculation_id),false)
 THEN RAISE EXCEPTION 'historical_calculation_locked'; END IF;
 RETURN NEW;
END $guard$;
CREATE TRIGGER guard_historical_offer BEFORE UPDATE OF status ON pg_temp.leader_commercial_offers
 FOR EACH ROW EXECUTE FUNCTION pg_temp.guard_historical_offer();
"""
def reject(body,error):
 return f'''DO $test$ BEGIN
 BEGIN EXECUTE $candidate${body}$candidate$; RAISE EXCEPTION 'expected_guard_missing';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '{error}%' THEN RAISE; END IF; END;
END $test$;
'''
sql=setup+reject(apply,'owner_approval_required')
sql+="SET LOCAL lider.repair_approval='381-test-status-reset-2026-09-27';\n"
sql+="UPDATE pg_temp.leader_user_profiles SET is_active=false;\n"+reject(apply,'active_owner_actor_required')+"UPDATE pg_temp.leader_user_profiles SET is_active=true;\n"
first=next(r for r in rows if r['entity']=='lead')
sql+=f"UPDATE pg_temp.leader_leads SET updated_at=updated_at+interval '1 second' WHERE id='{first['id']}';\n"+reject(apply,'repair_row_changed')+f"UPDATE pg_temp.leader_leads SET updated_at='{first['updated_at']}' WHERE id='{first['id']}';\n"
sql+="UPDATE pg_temp.leader_lead_calculations SET is_current_revision=false;\n"+reject(apply,'repair_offer_revision_changed')+"UPDATE pg_temp.leader_lead_calculations SET is_current_revision=true;\n"
sql+=apply+'''
DO $check$ BEGIN
 IF (SELECT count(*) FROM pg_temp.leader_leads WHERE status='В работе')<>5 OR
 (SELECT count(*) FROM pg_temp.leader_lead_calculations WHERE status='КП сформировано')<>5 OR
 (SELECT count(*) FROM pg_temp.leader_commercial_offers WHERE status='Черновик')<>5 OR
 (SELECT count(*) FROM pg_temp.leader_backups)<>1 OR
 (SELECT count(*) FROM pg_temp.leader_activity_log)<>1 THEN RAISE EXCEPTION 'apply_failed'; END IF;
END $check$;
'''+reject(apply,'repair_scope_changed')
sql+="SET LOCAL lider.repair_approval='381-restore-statuses-2026-09-27';\nSELECT set_config('lider.repair_snapshot',(SELECT id::text FROM pg_temp.leader_backups),true);\n"
sql+=f"UPDATE pg_temp.leader_leads SET updated_at=updated_at+interval '1 second' WHERE id='{first['id']}';\n"+reject(undo,'rollback_row_changed')
sql+=f"UPDATE pg_temp.leader_leads SET updated_at=(SELECT (value->'after'->>'updated_at')::timestamptz FROM pg_temp.leader_backups b CROSS JOIN LATERAL jsonb_array_elements(b.data->'rows') WHERE value->>'id'='{first['id']}') WHERE id='{first['id']}';\n"
sql+="UPDATE pg_temp.leader_lead_calculations SET is_current_revision=false;\n"+reject(undo,'rollback_offer_revision_changed')+"UPDATE pg_temp.leader_lead_calculations SET is_current_revision=true;\n"
sql+=undo+'''
DO $check$ BEGIN
 IF (SELECT count(*) FROM pg_temp.leader_leads WHERE status='Создан заказ')<>5 OR
 (SELECT count(*) FROM pg_temp.leader_lead_calculations WHERE status='Создан заказ')<>5 OR
 (SELECT count(*) FROM pg_temp.leader_commercial_offers WHERE status='Согласовано')<>5 OR
 (SELECT count(*) FROM pg_temp.leader_backups WHERE data ? 'rolled_back_at')<>1 OR
 (SELECT count(*) FROM pg_temp.leader_activity_log)<>2 THEN RAISE EXCEPTION 'rollback_failed'; END IF;
END $check$;
'''+reject(undo,'repair_snapshot_invalid')
sql+='''ROLLBACK;
SELECT 'passed' AS candidate_temp_table_test,
 'approval, inactive owner, stale apply, apply 15 rows, duplicate apply, stale rollback, historical offer apply/rollback guards, rollback 15 rows, duplicate rollback; outer ROLLBACK' AS checks;
'''
out=root/'build/issue381-repair-temp-test.sql'
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(sql)
print(out)
