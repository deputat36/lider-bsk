#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGING = 'otulfnouybahfnsycxqn'
PRODUCTION = 'ofewxuqfjhamgerwzull'
EDGE_SHA = '6ee051d0c8db9154c87bdd3b49b1d60b8bf27f6407c9a2843403886b4999868a'
RPC_MD5 = '6236711baa1a4ba45c9724fb2fe2d2a4'

FILES = {
    'migration': ROOT / 'supabase/staging-migrations/20260723_01_lead_workflow_update_rpc.sql',
    'acceptance': ROOT / 'supabase/staging-tests/20260723_lead_workflow_update_acceptance.sql',
    'edge': ROOT / 'supabase/staging-functions/leader-crm-leads-staging/index.ts',
    'wrapper': ROOT / 'supabase/staging-functions/_shared/canonical-edge-wrapper-v1.js',
    'implementation': ROOT / 'supabase/staging-functions/leader-crm-leads-staging-impl/index.ts',
    'contract': ROOT / 'contracts/crm-staging-lead-workflow-command-v1.json',
    'deployment': ROOT / 'contracts/crm-staging-edge-action-gate-deployment-v1.json',
    'docs': ROOT / 'docs/SUPABASE_STAGING_LEAD_WORKFLOW_COMMAND_V1_2026-07-23.md',
    'workflow': ROOT / '.github/workflows/crm-staging-lead-workflow-command-check.yml',
}

errors = []
texts = {}
for name, path in FILES.items():
    if not path.is_file():
        errors.append(f'Missing file: {path.relative_to(ROOT)}')
        texts[name] = ''
    else:
        texts[name] = path.read_text(encoding='utf-8')


def require(name, *markers):
    for marker in markers:
        if marker not in texts.get(name, ''):
            errors.append(f'{name}: missing marker {marker!r}')


def ordered(name, markers):
    position = -1
    for marker in markers:
        position = texts.get(name, '').find(marker, position + 1)
        if position < 0:
            errors.append(f'{name}: execution marker missing {marker!r}')
            return


try:
    contract = json.loads(texts['contract'])
    deployment = json.loads(texts['deployment'])
except Exception as exc:
    contract, deployment = {}, {}
    errors.append(f'Invalid JSON evidence: {exc}')

for key, value in {
    'contract': 'crm-staging-lead-workflow-command',
    'version': 1,
    'environment': 'staging',
    'project_ref': STAGING,
}.items():
    if contract.get(key) != value:
        errors.append(f'contract: {key} drifted')

database = contract.get('database', {})
for key, value in {
    'migration_version': '20260723153001',
    'migration_name': 'staging_lead_workflow_update_rpc_20260723',
    'rpc': 'public.leader_update_lead_workflow_rpc(jsonb)',
    'rpc_md5': RPC_MD5,
    'rpc_bytes': 12510,
    'security_invoker': True,
    'empty_search_path': True,
    'execute_grantees': ['service_role'],
}.items():
    if database.get(key) != value:
        errors.append(f'contract.database: {key} drifted')

edge = contract.get('edge', {})
for key, value in {
    'slug': 'leader-crm-leads-staging',
    'version': 4,
    'status': 'ACTIVE',
    'verify_jwt': True,
    'sha256': EDGE_SHA,
    'implementation_slug': 'leader-crm-leads-staging-impl',
}.items():
    if edge.get(key) != value:
        errors.append(f'contract.edge: {key} drifted')

workflow = contract.get('workflow', {})
if workflow.get('canonical_permission') != 'leads.update':
    errors.append('contract.workflow: canonical permission drifted')
if workflow.get('guarded_fields') != ['status', 'next_contact_at', 'assigned_to']:
    errors.append('contract.workflow: guarded fields drifted')
if workflow.get('mixed_workflow_and_legacy_fields') != 'fail_closed':
    errors.append('contract.workflow: mixed fields must fail closed')
for key in ('requires_request_id', 'requires_expected_updated_at', 'requires_idempotency_key', 'self_assignment_only'):
    if workflow.get(key) is not True:
        errors.append(f'contract.workflow: {key} must be true')
if workflow.get('takeover_of_other_assignee') is not False:
    errors.append('contract.workflow: takeover must remain false')

acceptance = contract.get('acceptance', {})
for key in (
    'assignee_required', 'accountant_forbidden', 'other_employee_assignment_forbidden',
    'self_assignment_success', 'future_contact_required', 'future_contact_success',
    'stale_conflict', 'replay_without_duplicate_event',
):
    if acceptance.get(key) is not True:
        errors.append(f'contract.acceptance: {key} must be true')
if acceptance.get('successful_events') != 2 or acceptance.get('successful_receipts') != 2:
    errors.append('contract.acceptance: event/receipt evidence drifted')

postflight = contract.get('postflight', {})
for key in ('lead_rows', 'lead_event_rows', 'workflow_receipts'):
    if postflight.get(key) != 0:
        errors.append(f'contract.postflight: {key} must be zero')
if postflight.get('anon_execute') is not False or postflight.get('authenticated_execute') is not False:
    errors.append('contract.postflight: browser RPC execute must remain closed')
if postflight.get('service_role_execute') is not True:
    errors.append('contract.postflight: service role execute missing')

production = contract.get('production_boundary', {})
if production.get('project_ref') != PRODUCTION:
    errors.append('contract.production: wrong production ref')
for key in ('workflow_rpc_exists', 'workflow_migration_exists', 'receipts_table_exists', 'edge_deployed', 'database_changed', 'frontend_changed'):
    if production.get(key) is not False:
        errors.append(f'contract.production: {key} must be false')

active = (deployment.get('functions') or {}).get('leader-crm-leads-staging', {})
if active.get('version') != 4 or active.get('sha256') != EDGE_SHA:
    errors.append('legacy deployment evidence must point to leads Edge v4')
if active.get('verify_jwt') is not True:
    errors.append('legacy deployment evidence lost verify_jwt')

require('migration',
    '-- STAGING ONLY.', "project_ref = 'otulfnouybahfnsycxqn'",
    'create or replace function public.leader_update_lead_workflow_rpc',
    "'lead_workflow.update'", "'leads.update'",
    'leader_lead_status_requires_assignee', 'leader_lead_status_requires_future_contact',
    'pg_advisory_xact_lock', 'for update', 'leader_command_receipts',
    'leader_lead_events', 'security invoker', "set search_path = ''",
    'grant execute on function public.leader_update_lead_workflow_rpc(jsonb) to service_role')
require('acceptance',
    'assignee gate failed', 'role gate failed', 'self assignment gate failed',
    'replay failed', 'future contact gate failed', 'waiting success failed',
    'stale conflict failed', 'event or receipt count failed', 'rollback;')
if 'commit;' in texts['acceptance'].lower():
    errors.append('acceptance: COMMIT is forbidden')
if not texts['acceptance'].lower().rstrip().endswith('rollback;'):
    errors.append('acceptance: must end with ROLLBACK')

require('edge',
    "const WORKFLOW_FIELDS = Object.freeze(['status', 'next_contact_at', 'assigned_to'])",
    'workflow_fields_must_be_separate', '/rest/v1/rpc/leader_update_lead_workflow_rpc',
    "action: 'lead_workflow.update'", "'X-CRM-Implementation': 'leader_update_lead_workflow_rpc'",
    'implementationSlug: \'leader-crm-leads-staging-impl\'', 'execute: executeLeadWorkflow')
require('wrapper',
    'const auth = await authenticatedUser', 'const decision = await hasCanonicalPermission',
    "typeof options.execute === 'function'", 'if (handled instanceof Response) return handled',
    'return await forwardToImplementation')
ordered('wrapper', [
    'const auth = await authenticatedUser',
    'const plan = options.plan',
    'const decision = await hasCanonicalPermission',
    "typeof options.execute === 'function'",
    'return await forwardToImplementation',
])
if 'body.role' in texts['wrapper'] or 'p_role' in texts['wrapper']:
    errors.append('wrapper must not trust browser role')
require('implementation', '17524ea9ef08c11b18b385b9469778d5b1084ddb')
require('docs',
    'Staging lead workflow command v1', 'leader-crm-leads-staging v4',
    'assignee_required', 'next_contact_required', 'Production boundary')
require('workflow',
    'deno check supabase/staging-functions/leader-crm-leads-staging/index.ts',
    'python3 tools/check_crm_staging_lead_workflow_command.py')

for name in ('migration', 'acceptance', 'edge', 'wrapper'):
    if PRODUCTION in texts[name]:
        errors.append(f'{name}: production ref forbidden in executable staging source')
    if re.search(r'sb_secret_[A-Za-z0-9_-]{10,}', texts[name]):
        errors.append(f'{name}: possible secret material')

for path in (ROOT / 'supabase/migrations').glob('*.sql'):
    text = path.read_text(encoding='utf-8')
    if 'leader_update_lead_workflow_rpc' in text or 'staging_lead_workflow_update_rpc_20260723' in text:
        errors.append(f'production migration boundary violated: {path.relative_to(ROOT)}')

if errors:
    print('CRM staging lead workflow command checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('CRM staging lead workflow command is atomic, fail-closed and production-safe.')
