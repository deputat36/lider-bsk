#!/usr/bin/env python3
"""Exercise the inspected operational SQL with real receipts in isolated PostgreSQL.

--staging-test builds fixture-only SQL for the already upgraded staging database.
Historical acceptance cases are reused, with fresh authorization regression cases.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text()


def scenarios():
    result = read('supabase/staging-tests/20261003_operational_replay_authorization.sql')
    for kind, filename in [('production', 'order_to_production'), ('installation', 'production_to_installation')]:
        source = read(f'supabase/staging-tests/20260731_{filename}_acceptance.sql')
        source = source.replace('\\set ON_ERROR_STOP on', '').replace('begin;', '', 1).replace('rollback;', '', 1)
        source = source.replace('  v_request jsonb;', '  v_update_request jsonb;\n  v_request jsonb;', 1)
        marker = '  v_replay := public.leader_create_' + kind + '_job_from_order_rpc(v_request);'
        assert source.count(marker) == 1
        source = source.replace(marker, f"  perform pg_temp.check_operational_replay('leader_create_{kind}_job_from_order_rpc',v_request);\n" + marker)
        update = f"""
  v_update_request := jsonb_build_object(
    'actor_id',v_request->>'actor_id','actor_email',v_request->>'actor_email',
    'request',jsonb_build_object('action','{kind}_job.update','request_id',gen_random_uuid(),
      'expected_updated_at',(select updated_at from public.leader_{kind}_jobs where id=v_job_id),
      'payload',jsonb_build_object('job_id',v_job_id,'idempotency_key','LIDER-REPLAY-20261003-{kind}-update',
        'patch',jsonb_build_object('title','LIDER replay regression updated title'))));
  v_response := public.leader_update_{kind}_job_rpc(v_update_request);
  if v_response->>'ok' is distinct from 'true' then raise exception 'positive_update_failed:%',v_response; end if;
  perform pg_temp.check_operational_replay('leader_update_{kind}_job_rpc',v_update_request);
"""
        source = source.replace('end\n$scenario$;', update + 'end\n$scenario$;', 1)
        result += source
    result += """
DO $$DECLARE response jsonb; request jsonb; BEGIN
 request:=jsonb_build_object('actor_id','b7311000-0000-4000-8000-000000000001',
   'request',jsonb_build_object('action','production_job.create_from_order',
   'request_id',gen_random_uuid(),'payload',jsonb_build_object('order_id','b7311000-0000-4000-8000-000000000013')));
 UPDATE public.leader_user_profiles SET role='viewer' WHERE user_id='b7311000-0000-4000-8000-000000000001';
 response:=public.leader_create_production_job_from_order_rpc(request);
 IF response#>>'{error,code}' IS DISTINCT FROM 'forbidden' THEN RAISE EXCEPTION 'layout_probe_before_authorization:%',response; END IF;
 request:=jsonb_set(request,'{request,payload,order_id}',to_jsonb(gen_random_uuid()::text));
 response:=public.leader_create_production_job_from_order_rpc(request);
 IF response#>>'{error,code}' IS DISTINCT FROM 'forbidden' THEN RAISE EXCEPTION 'absent_order_probe_differs:%',response; END IF;
END $$;
ROLLBACK;
SELECT 'operational replay authorization: PASS; all synthetic writes rolled back' result;
"""
    return result


def setup():
    sql = """BEGIN;
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA leader_staging; CREATE SCHEMA extensions; CREATE SCHEMA auth;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE TABLE leader_staging.environment_guard(singleton boolean,project_ref text,environment_name text,repository text);
INSERT INTO leader_staging.environment_guard VALUES(true,'otulfnouybahfnsycxqn','staging','deputat36/lider-bsk');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
GRANT USAGE ON SCHEMA public,auth,extensions TO service_role;
""" + read('supabase/staging-migrations/20260713_01_design_task_harness.sql')
    sql += """
ALTER TABLE public.leader_leads ADD COLUMN name text,ADD COLUMN phone text,ADD COLUMN source text,ADD COLUMN assigned_to uuid,ADD COLUMN next_contact_at timestamptz,ADD COLUMN request_id text;
ALTER TABLE public.leader_orders ADD COLUMN current_stage text,ADD COLUMN next_action text,ADD COLUMN source text;
CREATE TABLE leader_private.leader_role_action_matrix_v1(role text PRIMARY KEY,allowed_actions text[]);
"""
    for role, actions in json.loads(read('contracts/crm-v4-role-action-matrix-v1.json'))['roles'].items():
        sql += "INSERT INTO leader_private.leader_role_action_matrix_v1 VALUES('" + role + "',ARRAY[" + ','.join("'"+a+"'" for a in actions) + "]);\n"
    helper = read('supabase/production-candidates/20260723_01_installation_rbac_receipts_candidate.sql')
    sql += helper[helper.index('create or replace function leader_private.leader_actor_has_crm_action('):helper.index('comment on function leader_private.leader_actor_has_crm_action')]
    for filename in ['20260721_04_production_job_update_rpc.sql', '20260721_05_installation_schema_install.sql',
                     '20260721_06_installation_job_update_rpc.sql', '20260731_02_production_job_create_from_order_rpc.sql',
                     '20260731_03_production_job_create_layout_gate_fix.sql', '20260731_04_installation_job_create_from_order_rpc.sql']:
        baseline = read('supabase/staging-migrations/' + filename)
        if filename == '20260721_06_installation_job_update_rpc.sql':
            # Inspected staging runtime differs only in formatting this exception handler.
            # Reproduce the deployed body exactly; keep the migration fingerprint guard strict.
            baseline = baseline.replace("""  return leader_private.leader_installation_command_error(
    v_request_id,
    'persistence_failed',
    'Installation job update could not be persisted'
  );""", "  return leader_private.leader_installation_command_error(v_request_id, 'persistence_failed', 'Installation job update could not be persisted');")
        sql += baseline
    sql += read('supabase/staging-migrations/20261003184404_operational_replay_authorization_v1.sql')
    return sql


output = ROOT / 'build' / ('operational-replay-staging-test.sql' if '--staging-test' in sys.argv else 'operational-replay-test.sql')
output.parent.mkdir(exist_ok=True)
output.write_text(('BEGIN;\n' if '--staging-test' in sys.argv else setup()) + scenarios())
print(f'Built {output.name}; fixture transaction always ROLLBACK.')
