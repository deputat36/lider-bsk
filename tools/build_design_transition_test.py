#!/usr/bin/env python3
"""Exercise the operational design RPC using disposable PostgreSQL, not production."""
import json
from pathlib import Path
from build_finance_rpc_test import setup
ROOT=Path(__file__).resolve().parents[1]
extra="""
ALTER TABLE public.leader_orders ADD COLUMN owner_id uuid,ADD COLUMN project_name text,ADD COLUMN status text DEFAULT 'Новый',ADD COLUMN client_name text,ADD COLUMN client_phone text,ADD COLUMN layout_status text,ADD COLUMN layout_link text,ADD COLUMN current_stage text,ADD COLUMN next_action text,ADD COLUMN stage_updated_at timestamptz;
ALTER TABLE leader_private.leader_command_receipts ADD COLUMN created_at timestamptz DEFAULT now(),ADD COLUMN updated_at timestamptz DEFAULT now();
CREATE TABLE public.leader_design_tasks(id uuid PRIMARY KEY,order_id uuid,title text,task_status text,layout_status text,layout_link text,started_at timestamptz,sent_to_client_at timestamptz,approved_at timestamptz,updated_by uuid,updated_at timestamptz DEFAULT clock_timestamp(),client_phone text,internal_comment text);
CREATE TABLE public.leader_design_task_events(id uuid DEFAULT gen_random_uuid(),task_id uuid,order_id uuid,event_type text,old_status text,new_status text,body text,created_by uuid,created_at timestamptz);
GRANT ALL ON public.leader_design_tasks,public.leader_design_task_events TO service_role;
"""
matrix=json.loads((ROOT/'contracts/crm-v4-role-action-matrix-v1.json').read_text())['roles']
for role,actions in matrix.items():
    extra += "UPDATE leader_private.leader_role_action_matrix_v1 SET allowed_actions=ARRAY["+','.join("'"+a+"'" for a in actions)+"] WHERE role='"+role+"';\n"
source=(ROOT/'supabase/staging-migrations/20261003083718_design_transition_operational_v1.sql').read_text()
tests=(ROOT/'supabase/staging-tests/20261003_design_transition_operational.sql').read_text().replace('BEGIN;','',1)
out=ROOT/'build/design-transition-test.sql';out.parent.mkdir(exist_ok=True)
out.write_text(setup+extra+source+tests)
print('Built disposable PostgreSQL design transition test.')
