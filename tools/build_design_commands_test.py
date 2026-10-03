#!/usr/bin/env python3
"""Build a disposable PostgreSQL proof of the exact design command bundle."""
import json
from pathlib import Path
r=Path(__file__).resolve().parents[1]
source=next((r/'supabase/staging-migrations').glob('*_design_commands_operational_v1.sql')).read_text()
harness=(r/'supabase/staging-migrations/20260713_01_design_task_harness.sql').read_text()
helper=(r/'supabase/production-candidates/20260723_01_installation_rbac_receipts_candidate.sql').read_text()
helper=helper[helper.index('create or replace function leader_private.leader_actor_has_crm_action('):helper.index('comment on function leader_private.leader_actor_has_crm_action')]
setup="""BEGIN;
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA leader_staging; CREATE SCHEMA extensions; CREATE SCHEMA auth;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE TABLE leader_staging.environment_guard(singleton boolean,project_ref text,environment_name text,repository text);
INSERT INTO leader_staging.environment_guard VALUES(true,'otulfnouybahfnsycxqn','staging','deputat36/lider-bsk');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
GRANT USAGE ON SCHEMA public,auth,extensions TO service_role;
"""+harness+"""
ALTER TABLE public.leader_orders ADD COLUMN current_stage text,ADD COLUMN next_action text,ADD COLUMN stage_updated_at timestamptz;
CREATE TABLE leader_private.leader_role_action_matrix_v1(role text PRIMARY KEY,allowed_actions text[]);
"""
for role,actions in json.loads((r/'contracts/crm-v4-role-action-matrix-v1.json').read_text())['roles'].items():
 setup+="INSERT INTO leader_private.leader_role_action_matrix_v1 VALUES('"+role+"',ARRAY["+','.join("'"+a+"'" for a in actions)+"]);\n"
setup+=helper+"""
-- Disposable setup only: remove historical harness function before testing a first production installation.
DROP FUNCTION public.leader_create_design_task_from_order_rpc(jsonb);
DROP SCHEMA leader_staging CASCADE;
CREATE TABLE leader_private.leader_rollout_backups(id text PRIMARY KEY,project_ref text,data_snapshot jsonb,metadata_snapshot jsonb,edge_snapshot jsonb);
"""
production=next((r/'supabase/production-candidates').glob('*_design_commands_production_v1.sql')).read_text()
stage_body=source[source.index('create or replace function public.leader_create_design_task_from_order_rpc'):].strip()
production_body=production[production.index('create or replace function public.leader_create_design_task_from_order_rpc'):production.index('-- Browser mutations remain closed;')].strip()
assert stage_body==production_body, 'Staging/production command source drift'
source=production.replace('BEGIN;','',1).replace('COMMIT;','',1)

out=r/'build/design-commands-test.sql';out.parent.mkdir(exist_ok=True)
tests=(r/'supabase/staging-tests/20261003_design_commands.sql').read_text().replace('BEGIN;','',1).replace('ROLLBACK;','',1)
transition=(r/'supabase/staging-tests/20261003_design_transition_operational.sql').read_text().replace('BEGIN;','',1)
rollback="""SAVEPOINT design_stop;
REVOKE EXECUTE ON FUNCTION public.leader_create_design_task_from_order_rpc(jsonb),public.leader_transition_design_task_rpc(jsonb) FROM service_role;
DO $$BEGIN IF has_function_privilege('service_role','public.leader_create_design_task_from_order_rpc(jsonb)','EXECUTE') OR has_function_privilege('service_role','public.leader_transition_design_task_rpc(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'stop_failed';END IF;END $$;
ROLLBACK TO SAVEPOINT design_stop;
DO $$BEGIN IF NOT has_function_privilege('service_role','public.leader_create_design_task_from_order_rpc(jsonb)','EXECUTE') OR NOT has_function_privilege('service_role','public.leader_transition_design_task_rpc(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'stop_not_restored';END IF;END $$;
"""
out.write_text(setup+source+tests+rollback+transition)
print('Built exact design command SQL test, isolated PostgreSQL only.')
