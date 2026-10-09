#!/usr/bin/env python3
"""Exercise the exact production candidate in disposable PostgreSQL; never commit fixtures."""
from pathlib import Path
import re
from build_operational_replay_test import setup, scenarios

ROOT=Path(__file__).resolve().parents[1]
candidate=(ROOT/'supabase/production-candidates/20261009053427_operational_commands_production_v1.sql').read_text()
signatures=re.search(r'FOREACH fn IN ARRAY ARRAY\[(.*?)\] LOOP',candidate,re.S)[1]
signatures=re.findall(r"'([^']+)'",signatures)
sql=setup()
for signature in signatures:
    sql+='\nDROP FUNCTION IF EXISTS '+signature+';\n'
sql+='''
DROP SCHEMA leader_staging CASCADE;
CREATE TABLE leader_private.leader_rollout_backups(id text PRIMARY KEY,project_ref text,data_snapshot jsonb,metadata_snapshot jsonb,edge_snapshot jsonb);
INSERT INTO leader_private.leader_rollout_backups VALUES('order-finance-20261001-v1','ofewxuqfjhamgerwzull','{}','{}','{}');
CREATE OR REPLACE FUNCTION leader_private.leader_has_crm_action(p_action text) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$SELECT auth.uid() IS NOT NULL AND leader_private.leader_actor_has_crm_action(auth.uid(),p_action)$$;
REVOKE ALL ON FUNCTION leader_private.leader_has_crm_action(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION leader_private.leader_has_crm_action(text) TO authenticated;
GRANT USAGE ON SCHEMA leader_private,auth TO authenticated;
'''
for table in ['leader_production_jobs','leader_production_events','leader_installation_jobs','leader_installation_job_items','leader_installation_events']:
    sql+=f'''GRANT ALL ON public.{table} TO anon,authenticated;
GRANT UPDATE(title) ON public.{table} TO authenticated;\n''' if table.endswith('_jobs') else f'GRANT ALL ON public.{table} TO anon,authenticated;\n'
    sql+=f'CREATE POLICY legacy_open ON public.{table} FOR ALL TO authenticated USING(true) WITH CHECK(true);\n'
sql+=candidate.replace('BEGIN;','',1).rsplit('COMMIT;',1)[0]
sql+='''
-- Recreate the test-only environment guard for historical fixture scenarios.
CREATE SCHEMA leader_staging;
CREATE TABLE leader_staging.environment_guard(singleton boolean,project_ref text,environment_name text,repository text);
INSERT INTO leader_staging.environment_guard VALUES(true,'otulfnouybahfnsycxqn','staging','deputat36/lider-bsk');
'''
sql+=scenarios().split('ROLLBACK;\nSELECT',1)[0]
sql+="SELECT set_config('request.jwt.claim.sub','b7311000-0000-4000-8000-000000000001',true);\n"
for role in ['owner','admin','manager','designer','installer','contractor','accountant']:
    sql+=f"UPDATE public.leader_user_profiles SET role='{role}',is_active=true WHERE user_id='b7311000-0000-4000-8000-000000000001';\nSET LOCAL ROLE authenticated;\n"
    for kind,allowed in [('production',role in ['owner','admin','manager','designer','contractor']),('installation',role in ['owner','admin','manager','installer'])]:
        comparison='=0' if allowed else '<>0'
        sql+=f"DO $$BEGIN IF (SELECT count(id) FROM public.leader_{kind}_jobs){comparison} THEN RAISE EXCEPTION 'read_role:{role}:{kind}'; END IF;END $$;\n"
    sql+='RESET ROLE;\n'
sql+="""UPDATE public.leader_user_profiles SET role='owner',is_active=false WHERE user_id='b7311000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $$BEGIN IF (SELECT count(id) FROM public.leader_production_jobs)<>0 OR (SELECT count(id) FROM public.leader_installation_jobs)<>0 THEN RAISE EXCEPTION 'inactive_read'; END IF; END $$;
RESET ROLE;
SAVEPOINT operational_stop;
"""
stop=(ROOT/'supabase/production-candidates/leader_operational_commands_stop_rollback.sql').read_text().replace('BEGIN;','',1).replace('COMMIT;','',1)
sql+=stop
for signature in signatures:
    if signature.startswith('public.'):
        sql+=f"DO $$BEGIN IF has_function_privilege('service_role','{signature}','EXECUTE') THEN RAISE EXCEPTION 'stop_failed'; END IF;END $$;\n"
sql+='ROLLBACK TO SAVEPOINT operational_stop;\n'
for signature in signatures:
    if signature.startswith('public.'):
        sql+=f"DO $$BEGIN IF NOT has_function_privilege('service_role','{signature}','EXECUTE') THEN RAISE EXCEPTION 'stop_not_restored'; END IF;END $$;\n"
sql+="ROLLBACK;\nSELECT 'Operational production candidate: commands, replay, RBAC, privacy, legacy ACL, role reads and stop rollback PASS';\n"
out=ROOT/'build/operational-production-test.sql';out.parent.mkdir(exist_ok=True);out.write_text(sql)
print('Built exact production operational candidate proof; disposable PostgreSQL only.')
