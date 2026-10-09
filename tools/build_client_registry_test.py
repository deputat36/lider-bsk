#!/usr/bin/env python3
"""Run the actual client RPC and RLS against disposable PostgreSQL in CI."""
from pathlib import Path
from build_finance_rpc_test import setup
ROOT=Path(__file__).resolve().parents[1]
source=(ROOT/'supabase/staging-migrations/20261002050722_client_registry_v1.sql').read_text().split('-- STAGING CLEANUP UPGRADE',1)[0]
extra="""
ALTER TABLE public.leader_orders ADD COLUMN client_id uuid, ADD COLUMN project_name text,ADD COLUMN status text,ADD COLUMN created_at timestamptz DEFAULT now();
CREATE TABLE public.leader_clients(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL,name text,phone text,source text,comment text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT clock_timestamp());
CREATE TABLE public.leader_leads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),converted_client_id uuid,service text,status text,created_at timestamptz DEFAULT now());
CREATE TABLE public.leader_activity_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,action text,entity text,entity_id text,data jsonb,created_at timestamptz DEFAULT clock_timestamp());
ALTER TABLE public.leader_activity_log ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.leader_clients,public.leader_leads,public.leader_activity_log TO service_role;
GRANT ALL ON public.leader_clients,public.leader_activity_log TO authenticated,anon;
-- Deliberately no legacy permissive policy: match a clean staging installation.
CREATE POLICY audit_old ON public.leader_activity_log TO authenticated USING(true) WITH CHECK(true);
UPDATE leader_private.leader_role_action_matrix_v1 SET allowed_actions=allowed_actions||ARRAY['clients.read','clients.write'] WHERE role IN ('owner','admin','manager');
"""
tests=r"""
SET LOCAL ROLE service_role;
DO $tests$
DECLARE a uuid:='90000000-0000-4000-8000-000000000502';req jsonb;r jsonb;c uuid;revision timestamptz;role_name text;
BEGIN
 req:=jsonb_build_object('actor_id',a,'request',jsonb_build_object('action','client.create','request_id','90000000-0000-4000-8000-000000000601'::uuid,'payload',jsonb_build_object('name','Synthetic client','phone','8 (900) 000-05-01','source','Test','comment','No personal data')));
 r:=public.leader_client_registry_rpc(req);
 IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'create:%',r;END IF;
 c:=(r#>>'{client,id}')::uuid;revision:=(r#>>'{client,updated_at}')::timestamptz;
 r:=public.leader_client_registry_rpc(req);
 IF r->>'idempotent_replay' IS DISTINCT FROM 'true' OR (SELECT count(*) FROM public.leader_clients)<>1 OR (SELECT count(*) FROM public.leader_activity_log)<>1 THEN RAISE EXCEPTION 'duplicate_replay:%',r;END IF;
 r:=public.leader_client_registry_rpc(jsonb_set(req,'{request,payload,name}','"different"'));
 IF r#>>'{error,code}' IS DISTINCT FROM 'idempotency_conflict' THEN RAISE EXCEPTION 'idempotency_conflict:%',r;END IF;
 r:=public.leader_client_registry_rpc(jsonb_set(jsonb_set(req,'{request,request_id}',to_jsonb(gen_random_uuid())),'{request,payload,phone}','"+7 900 000 05 01"'));
 IF r#>>'{error,code}' IS DISTINCT FROM 'duplicate_phone' OR r->>'existing_client_id' IS DISTINCT FROM c::text THEN RAISE EXCEPTION 'phone_duplicate:%',r;END IF;
 r:=public.leader_client_registry_rpc(jsonb_set(jsonb_set(req,'{request,request_id}',to_jsonb(gen_random_uuid())),'{request,payload,phone}','"abc"'));
 IF r#>>'{error,code}' IS DISTINCT FROM 'invalid_payload' THEN RAISE EXCEPTION 'invalid_phone:%',r;END IF;
 r:=public.leader_client_registry_rpc(jsonb_build_object('actor_id',a,'request',jsonb_build_object('action','client.list','payload',jsonb_build_object('search','+7 (900) 000-05-01'))));
 IF r->>'total' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'normalized_search:%',r;END IF;
 r:=public.leader_client_registry_rpc(jsonb_build_object('actor_id',a,'request',jsonb_build_object('action','client.list','payload',jsonb_build_object('search','%'))));
 IF r->>'total' IS DISTINCT FROM '0' THEN RAISE EXCEPTION 'wildcard_search:%',r;END IF;
 INSERT INTO public.leader_leads(converted_client_id,service,status)VALUES(c,'Test service','Новая');
 UPDATE public.leader_orders SET client_id=c,project_name='Test order',status='Новый';
 req:=jsonb_build_object('actor_id',a,'request',jsonb_build_object('action','client.update','request_id','90000000-0000-4000-8000-000000000602'::uuid,'expected_updated_at',revision,'payload',jsonb_build_object('client_id',c,'name','Updated client','phone','+7 900 000 05 01','comment','Edited')));
 r:=public.leader_client_registry_rpc(req);
 IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'update:%',r;END IF;
 r:=public.leader_client_registry_rpc(jsonb_set(req,'{request,request_id}',to_jsonb(gen_random_uuid())));
 IF r#>>'{error,code}' IS DISTINCT FROM 'source_changed' THEN RAISE EXCEPTION 'stale:%',r;END IF;
 r:=public.leader_client_registry_rpc(jsonb_build_object('actor_id',a,'request',jsonb_build_object('action','client.get','payload',jsonb_build_object('client_id',c))));
 IF r#>>'{links,lead_count}' IS DISTINCT FROM '1' OR r#>>'{links,order_count}' IS DISTINCT FROM '1' OR jsonb_array_length(r->'history')<>2 OR r#>'{client,owner_id}' IS NOT NULL THEN RAISE EXCEPTION 'links_history:%',r;END IF;
 -- Check the metadata contract, not phone fragments in random request UUIDs.
 -- Fixed request IDs above deliberately contain 900 to reproduce the old false positive.
 IF EXISTS(
  SELECT 1 FROM public.leader_activity_log
  WHERE jsonb_typeof(data) IS DISTINCT FROM 'object'
     OR NOT (data ?& ARRAY['request_id','fields'])
     OR data - ARRAY['request_id','fields'] <> '{}'::jsonb
     OR jsonb_typeof(data->'request_id') IS DISTINCT FROM 'string'
     OR (data->>'request_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}
 FOREACH role_name IN ARRAY ARRAY['accountant','designer','installer','contractor'] LOOP
  UPDATE public.leader_user_profiles SET role=role_name WHERE user_id=a;
  r:=public.leader_client_registry_rpc(req);
  IF r#>>'{error,code}' IS DISTINCT FROM 'forbidden' THEN RAISE EXCEPTION 'wrong_role:% %',role_name,r;END IF;
 END LOOP;
 UPDATE public.leader_user_profiles SET role='owner',is_active=false WHERE user_id=a;
 r:=public.leader_client_registry_rpc(req);
 IF r#>>'{error,code}' IS DISTINCT FROM 'inactive_profile' THEN RAISE EXCEPTION 'inactive_replay:%',r;END IF;
 UPDATE public.leader_user_profiles SET role='manager',is_active=true WHERE user_id=a;
 r:=public.leader_client_registry_rpc(jsonb_build_object('actor_id',a,'request',jsonb_build_object('action','client.list','payload','{}'::jsonb)));
 IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'manager_read:%',r;END IF;
END $tests$;
RESET ROLE;
DO $acl$ BEGIN
 IF has_function_privilege('authenticated','public.leader_client_registry_rpc(jsonb)','EXECUTE') OR has_function_privilege('anon','public.leader_client_registry_rpc(jsonb)','EXECUTE') OR has_any_column_privilege('authenticated','public.leader_clients','UPDATE') OR has_table_privilege('authenticated','public.leader_clients','INSERT') THEN RAISE EXCEPTION 'direct_write_or_rpc_open';END IF;
END $acl$;
SELECT set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000502',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM public.leader_clients)<>1 THEN RAISE EXCEPTION 'manager_rls_read';END IF; END $$;
RESET ROLE;
UPDATE public.leader_user_profiles SET role='designer';
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM public.leader_clients)<>0 THEN RAISE EXCEPTION 'designer_rls_leak';END IF; END $$;
RESET ROLE;
ROLLBACK;
"""
out=ROOT/'build/client-registry-test.sql';out.parent.mkdir(exist_ok=True);out.write_text(setup+extra+source+(ROOT/'supabase/staging-migrations/20261002212947_client_registry_read_and_evidence.sql').read_text().split('-- STAGING CLEANUP UPGRADE',1)[0]+tests)
print('Built client registry SQL transaction, role, replay, search, link and RLS tests.')

     OR jsonb_typeof(data->'fields') IS DISTINCT FROM 'array'
     OR NOT (data->'fields' <@ '["name","phone","source","address","comment"]'::jsonb)
 ) THEN RAISE EXCEPTION 'audit_copied_contact_data';END IF;
 FOREACH role_name IN ARRAY ARRAY['accountant','designer','installer','contractor'] LOOP
  UPDATE public.leader_user_profiles SET role=role_name WHERE user_id=a;
  r:=public.leader_client_registry_rpc(req);
  IF r#>>'{error,code}' IS DISTINCT FROM 'forbidden' THEN RAISE EXCEPTION 'wrong_role:% %',role_name,r;END IF;
 END LOOP;
 UPDATE public.leader_user_profiles SET role='owner',is_active=false WHERE user_id=a;
 r:=public.leader_client_registry_rpc(req);
 IF r#>>'{error,code}' IS DISTINCT FROM 'inactive_profile' THEN RAISE EXCEPTION 'inactive_replay:%',r;END IF;
 UPDATE public.leader_user_profiles SET role='manager',is_active=true WHERE user_id=a;
 r:=public.leader_client_registry_rpc(jsonb_build_object('actor_id',a,'request',jsonb_build_object('action','client.list','payload','{}'::jsonb)));
 IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'manager_read:%',r;END IF;
END $tests$;
RESET ROLE;
DO $acl$ BEGIN
 IF has_function_privilege('authenticated','public.leader_client_registry_rpc(jsonb)','EXECUTE') OR has_function_privilege('anon','public.leader_client_registry_rpc(jsonb)','EXECUTE') OR has_any_column_privilege('authenticated','public.leader_clients','UPDATE') OR has_table_privilege('authenticated','public.leader_clients','INSERT') THEN RAISE EXCEPTION 'direct_write_or_rpc_open';END IF;
END $acl$;
SELECT set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000502',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM public.leader_clients)<>1 THEN RAISE EXCEPTION 'manager_rls_read';END IF; END $$;
RESET ROLE;
UPDATE public.leader_user_profiles SET role='designer';
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM public.leader_clients)<>0 THEN RAISE EXCEPTION 'designer_rls_leak';END IF; END $$;
RESET ROLE;
ROLLBACK;
"""
out=ROOT/'build/client-registry-test.sql';out.parent.mkdir(exist_ok=True);out.write_text(setup+extra+source+(ROOT/'supabase/staging-migrations/20261002212947_client_registry_read_and_evidence.sql').read_text().split('-- STAGING CLEANUP UPGRADE',1)[0]+tests)
print('Built client registry SQL transaction, role, replay, search, link and RLS tests.')
