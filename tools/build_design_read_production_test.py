#!/usr/bin/env python3
"""Real production read candidate, exercised only in disposable CI PostgreSQL."""
from pathlib import Path
import json
from build_finance_rpc_test import setup
ROOT=Path(__file__).resolve().parents[1]
setup=setup.replace('BEGIN;','',1)
extra="""
DROP TABLE leader_staging.environment_guard;
CREATE TABLE leader_private.leader_rollout_backups(id text PRIMARY KEY,project_ref text,data_snapshot jsonb,metadata_snapshot jsonb,edge_snapshot jsonb);
ALTER TABLE leader_private.leader_rollout_backups ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.leader_design_tasks(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,order_id uuid,title text,task_status text,layout_status text,priority text,deadline timestamptz,designer_name text,task_text text,layout_link text,reference_link text,created_at timestamptz,updated_at timestamptz,client_phone text,internal_comment text);
INSERT INTO public.leader_design_tasks(title,task_text,client_phone)VALUES('Synthetic design','Synthetic brief','PRIVATE-FIXTURE');
ALTER TABLE public.leader_design_tasks ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.leader_design_tasks TO authenticated,anon;
CREATE POLICY legacy_read ON public.leader_design_tasks FOR SELECT TO authenticated USING(true);
CREATE POLICY legacy_write ON public.leader_design_tasks FOR ALL TO authenticated USING(true)WITH CHECK(true);
GRANT EXECUTE ON FUNCTION leader_private.leader_has_crm_action(text) TO authenticated;
"""
for role,actions in json.loads((ROOT/'contracts/crm-v4-role-action-matrix-v1.json').read_text())['roles'].items():
 extra+="UPDATE leader_private.leader_role_action_matrix_v1 SET allowed_actions=ARRAY["+','.join("'"+a+"'" for a in actions)+"] WHERE role='"+role+"';\n"
source=(ROOT/'supabase/production-candidates/20261003124938_design_queue_production_read.sql').read_text()
tests="""BEGIN;
DO $$BEGIN
 IF (SELECT count(*) FROM public.leader_design_tasks)<>1 THEN RAISE EXCEPTION 'rows_changed';END IF;
 IF has_column_privilege('authenticated','public.leader_design_tasks','client_phone','SELECT') OR has_any_column_privilege('authenticated','public.leader_design_tasks','UPDATE') OR has_table_privilege('anon','public.leader_design_tasks','INSERT') THEN RAISE EXCEPTION 'legacy_acl_survived';END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000502',true);
"""
for role in ['owner','admin','manager','designer','installer','contractor','accountant']:
 count=1 if role in ['owner','admin','manager','designer'] else 0
 tests+="UPDATE public.leader_user_profiles SET role='"+role+"',is_active=true;\nSET LOCAL ROLE authenticated;\nDO $$BEGIN IF (SELECT count(id) FROM public.leader_design_tasks)<>"+str(count)+" THEN RAISE EXCEPTION 'role_read_failed';END IF;END $$;\nRESET ROLE;\n"
tests+="""UPDATE public.leader_user_profiles SET role='designer',is_active=false;
SET LOCAL ROLE authenticated;
DO $$BEGIN IF (SELECT count(id) FROM public.leader_design_tasks)<>0 THEN RAISE EXCEPTION 'inactive_read';END IF;END $$;
RESET ROLE;
ROLLBACK;
BEGIN;
REVOKE SELECT(id,order_id,title,task_status,layout_status,priority,deadline,designer_name,task_text,layout_link,reference_link,created_at,updated_at) ON public.leader_design_tasks FROM authenticated;
DO $$BEGIN IF has_column_privilege('authenticated','public.leader_design_tasks','id','SELECT') THEN RAISE EXCEPTION 'stop_failed';END IF;END $$;
ROLLBACK;
DO $$BEGIN IF NOT has_column_privilege('authenticated','public.leader_design_tasks','id','SELECT') THEN RAISE EXCEPTION 'rehearsal_not_restored';END IF;END $$;
SELECT 'Production design read candidate: rows, canonical roles, inactive, privacy, DML, stop rollback PASS';
"""
out=ROOT/'build/design-read-production-test.sql';out.parent.mkdir(exist_ok=True);out.write_text(setup+extra+source+tests)
print('Built isolated production design read regression.')
