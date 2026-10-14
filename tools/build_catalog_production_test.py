#!/usr/bin/env python3
"""Exercise the exact catalog production candidate in disposable PostgreSQL."""
from pathlib import Path
import json
from build_catalog_production_package import CANDIDATE, STOP, package_sql, stop_sql

ROOT = Path(__file__).resolve().parents[1]


def read(name):
    return (ROOT/name).read_text()


def table(source, name):
    start = source.index('create table if not exists '+name+' (')
    return source[start:source.index('\n);',start)+3]


def build():
    assert CANDIDATE.read_text() == package_sql(), 'catalog candidate drift'
    assert STOP.read_text() == stop_sql(), 'catalog stop drift'
    sql = """BEGIN;
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA leader_private; CREATE SCHEMA extensions; CREATE SCHEMA auth;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$SELECT NULL::text$$;
CREATE TABLE public.leader_user_profiles(user_id uuid PRIMARY KEY,email text,full_name text,role text,is_active boolean,permissions jsonb,updated_at timestamptz DEFAULT clock_timestamp());
CREATE TABLE leader_private.leader_role_action_matrix_v1(role text PRIMARY KEY,allowed_actions text[]);
"""
    for role, actions in json.loads(read('contracts/crm-v4-role-action-matrix-v1.json'))['roles'].items():
        sql += "INSERT INTO leader_private.leader_role_action_matrix_v1 VALUES('"+role+"',ARRAY["+','.join("'"+a+"'" for a in actions)+"]);\n"
    core = read('supabase/production-candidates/20260723_01_installation_rbac_receipts_candidate.sql')
    sql += core[core.index('create or replace function leader_private.leader_actor_has_crm_action('):core.index('comment on function leader_private.leader_actor_has_crm_action')]
    start = core.index('create table leader_private.leader_command_receipts (')
    sql += core[start:core.index('\n);',start)+3]
    sql += """
CREATE FUNCTION leader_private.leader_has_crm_action(p_action text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$SELECT leader_private.leader_actor_has_crm_action(auth.uid(),p_action)$$;
CREATE FUNCTION leader_private.leader_has_access() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$SELECT EXISTS(SELECT 1 FROM public.leader_user_profiles WHERE user_id=auth.uid() AND is_active)$$;
CREATE TABLE leader_private.leader_rollout_backups(id text PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),project_ref text NOT NULL,data_snapshot jsonb NOT NULL,metadata_snapshot jsonb NOT NULL,edge_snapshot jsonb NOT NULL);
INSERT INTO leader_private.leader_rollout_backups(id,project_ref,data_snapshot,metadata_snapshot,edge_snapshot) VALUES('order-finance-20261001-v1','ofewxuqfjhamgerwzull','{}','{}','{}');
GRANT USAGE ON SCHEMA public,auth,extensions,leader_private TO service_role,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.leader_user_profiles TO service_role;
GRANT SELECT,INSERT,UPDATE ON leader_private.leader_command_receipts TO service_role;
REVOKE ALL ON FUNCTION leader_private.leader_actor_has_crm_action(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION leader_private.leader_actor_has_crm_action(uuid,text) TO service_role;
"""
    sql += table(read('supabase/staging-migrations/20260904_01_calculation_catalog_harness.sql'),'public.leader_catalog')
    sql += table(read('supabase/staging-migrations/20260904_02_catalog_management_write_harness.sql'),'public.leader_catalog_price_logs')
    sql += """
ALTER TABLE public.leader_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leader_catalog_price_logs ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.leader_catalog,public.leader_catalog_price_logs TO anon,authenticated,service_role;
GRANT UPDATE(name),INSERT(name) ON public.leader_catalog TO authenticated;
GRANT UPDATE(reason),INSERT(reason) ON public.leader_catalog_price_logs TO anon;
CREATE POLICY leader_catalog_select_active ON public.leader_catalog FOR SELECT TO authenticated USING(leader_private.leader_has_access());
CREATE POLICY legacy_catalog_insert ON public.leader_catalog FOR INSERT TO authenticated WITH CHECK(true);
CREATE POLICY legacy_catalog_update ON public.leader_catalog FOR UPDATE TO authenticated USING(true) WITH CHECK(true);
CREATE POLICY legacy_catalog_delete ON public.leader_catalog FOR DELETE TO authenticated USING(true);
CREATE POLICY "leader catalog price logs select active users" ON public.leader_catalog_price_logs FOR SELECT TO authenticated USING(leader_private.leader_has_access());
"""
    sql += CANDIDATE.read_text().replace('BEGIN;','',1).rsplit('COMMIT;',1)[0]
    # Historical acceptance checks the staging fixture marker, after the exact
    # production preflight has already run without that marker.
    sql += """
CREATE SCHEMA leader_staging;
CREATE TABLE leader_staging.environment_guard(singleton boolean,project_ref text,environment_name text,repository text);
INSERT INTO leader_staging.environment_guard VALUES(true,'otulfnouybahfnsycxqn','staging','deputat36/lider-bsk');
GRANT USAGE ON SCHEMA leader_staging TO service_role;
GRANT SELECT ON leader_staging.environment_guard TO service_role;
SET LOCAL ROLE service_role;
"""
    sql += read('supabase/staging-tests/20260904_catalog_management_write_acceptance.sql').replace('begin;','',1).rsplit('rollback;',1)[0]
    sql += """
DO $fresh$ DECLARE a uuid:='15200000-0000-4000-8000-000000000001'; req jsonb;r jsonb;role_name text; BEGIN
 req:=jsonb_build_object('actor_id',a,'request',jsonb_build_object('action','catalog.manage','request_id',gen_random_uuid(),'payload',jsonb_build_object('operation','create','idempotency_key','catalog-fresh-auth','patch',jsonb_build_object('name','Fresh authorization fixture','category','Synthetic','unit','шт'))));
 r:=public.leader_manage_catalog_rpc(req);
 IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'owner_create:%',r;END IF;
 FOREACH role_name IN ARRAY ARRAY['manager','accountant','designer','installer','contractor'] LOOP
  UPDATE public.leader_user_profiles SET role=role_name WHERE user_id=a;
  r:=public.leader_manage_catalog_rpc(req);
  IF r#>>'{error,code}' IS DISTINCT FROM 'forbidden' THEN RAISE EXCEPTION 'revoked_role_replay:% %',role_name,r;END IF;
 END LOOP;
 UPDATE public.leader_user_profiles SET role='owner',is_active=false WHERE user_id=a;
 r:=public.leader_manage_catalog_rpc(req);
 IF r#>>'{error,code}' IS DISTINCT FROM 'forbidden' THEN RAISE EXCEPTION 'inactive_replay:%',r;END IF;
 UPDATE public.leader_user_profiles SET role='admin',is_active=true WHERE user_id=a;
 r:=public.leader_manage_catalog_rpc(req);
 IF r->>'idempotent_replay' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'admin_replay:%',r;END IF;
 r:=public.leader_manage_catalog_rpc(jsonb_set(req,'{request,payload,patch,name}','"Changed replay"'));
 IF r#>>'{error,code}' IS DISTINCT FROM 'idempotency_conflict' THEN RAISE EXCEPTION 'changed_payload_replay:%',r;END IF;
 UPDATE public.leader_user_profiles SET role='admin' WHERE user_id='15200000-0000-4000-8000-000000000002';
 r:=public.leader_manage_catalog_rpc(jsonb_set(req,'{actor_id}','"15200000-0000-4000-8000-000000000002"'));
 IF r#>>'{error,code}' IS DISTINCT FROM 'idempotency_conflict' THEN RAISE EXCEPTION 'other_actor_replay:%',r;END IF;
END $fresh$;
RESET ROLE;
-- A failed price-log write must roll back both catalog mutation and receipt.
CREATE FUNCTION public.catalog_test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic audit failure';END$$;
CREATE TRIGGER catalog_test_audit_failure BEFORE INSERT ON public.leader_catalog_price_logs FOR EACH ROW EXECUTE FUNCTION public.catalog_test_audit_failure();
SET LOCAL ROLE service_role;
DO $atomic$ DECLARE r jsonb;n bigint;l bigint;c bigint;BEGIN
 SELECT count(*) INTO n FROM public.leader_catalog;SELECT count(*) INTO l FROM public.leader_catalog_price_logs;SELECT count(*) INTO c FROM leader_private.leader_command_receipts;
 r:=public.leader_manage_catalog_rpc(jsonb_build_object('actor_id','15200000-0000-4000-8000-000000000001','request',jsonb_build_object('action','catalog.manage','request_id',gen_random_uuid(),'payload',jsonb_build_object('operation','create','idempotency_key','catalog-audit-failure','patch',jsonb_build_object('name','Must roll back','category','Synthetic','unit','шт')))));
 IF r#>>'{error,code}' IS DISTINCT FROM 'catalog_manage_failed' OR (SELECT count(*) FROM public.leader_catalog)<>n OR (SELECT count(*) FROM public.leader_catalog_price_logs)<>l OR (SELECT count(*) FROM leader_private.leader_command_receipts)<>c THEN RAISE EXCEPTION 'atomic_rollback:%',r;END IF;
END $atomic$;
RESET ROLE;
DO $acl$ DECLARE role_name text;tab text;BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF has_function_privilege(role_name,'public.leader_manage_catalog_rpc(jsonb)','EXECUTE') OR has_function_privilege(role_name,'leader_private.leader_discard_catalog_command_receipt(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'browser_catalog_rpc_open';END IF;
  FOREACH tab IN ARRAY ARRAY['public.leader_catalog','public.leader_catalog_price_logs'] LOOP
   IF has_any_column_privilege(role_name,tab,'INSERT') OR has_any_column_privilege(role_name,tab,'UPDATE') OR has_any_column_privilege(role_name,tab,'REFERENCES') OR has_table_privilege(role_name,tab,'DELETE') OR has_table_privilege(role_name,tab,'TRUNCATE') OR has_table_privilege(role_name,tab,'TRIGGER') THEN RAISE EXCEPTION 'browser_catalog_acl_open';END IF;
  END LOOP;
 END LOOP;
 IF has_table_privilege('service_role','leader_private.leader_command_receipts','DELETE') OR has_table_privilege('service_role','leader_private.leader_rollout_backups','SELECT') THEN RAISE EXCEPTION 'private_data_exposed';END IF;
END $acl$;
SELECT set_config('request.jwt.claim.sub','15200000-0000-4000-8000-000000000001',true);
"""
    for role in ['owner','admin','manager','accountant','designer','installer','contractor']:
        sql += f"UPDATE public.leader_user_profiles SET role='{role}' WHERE user_id='15200000-0000-4000-8000-000000000001';\nSET LOCAL ROLE authenticated;\n"
        compare = '=0' if role in ['owner','admin'] else '<>0'
        sql += f"DO $$BEGIN IF (SELECT count(*) FROM public.leader_catalog)=0 OR (SELECT count(*) FROM public.leader_catalog_price_logs){compare} THEN RAISE EXCEPTION 'catalog_read_role:{role}';END IF;END$$;\nRESET ROLE;\n"
    sql += "UPDATE public.leader_user_profiles SET is_active=false;\nSET LOCAL ROLE authenticated;\nDO $$BEGIN IF (SELECT count(*)FROM public.leader_catalog)<>0 OR (SELECT count(*)FROM public.leader_catalog_price_logs)<>0 THEN RAISE EXCEPTION 'inactive_catalog_read';END IF;END$$;\nRESET ROLE;\nSAVEPOINT catalog_stop;\n"
    sql += STOP.read_text().replace('BEGIN;','',1).rsplit('COMMIT;',1)[0]
    sql += """
DO $$BEGIN IF has_function_privilege('service_role','public.leader_manage_catalog_rpc(jsonb)','EXECUTE') OR has_function_privilege('service_role','leader_private.leader_discard_catalog_command_receipt(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'catalog_stop_failed';END IF;END$$;
SET LOCAL ROLE service_role;
DO $$BEGIN
 BEGIN PERFORM public.leader_manage_catalog_rpc('{}');RAISE EXCEPTION 'catalog_stop_callable';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END$$;
RESET ROLE;
ROLLBACK TO SAVEPOINT catalog_stop;
DO $$BEGIN IF NOT has_function_privilege('service_role','public.leader_manage_catalog_rpc(jsonb)','EXECUTE') OR has_any_column_privilege('authenticated','public.leader_catalog','UPDATE') THEN RAISE EXCEPTION 'catalog_stop_restore_failed';END IF;END$$;
ROLLBACK;
SELECT 'Catalog production candidate: atomic create/update, audit failure, replay, fresh RBAC, stale receipt cleanup, table+column ACL, read privacy and executable stop PASS' result;
"""
    return sql


if __name__ == '__main__':
    out=ROOT/'build/catalog-production-test.sql'
    out.parent.mkdir(exist_ok=True)
    out.write_text(build())
    print('Built exact catalog candidate proof for disposable PostgreSQL; no remote writes.')
