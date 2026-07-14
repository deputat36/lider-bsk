#!/usr/bin/env python3

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / 'contracts' / 'design-task-staging-post-cleanup-snapshot-v1.json'
QUERY = ROOT / 'supabase' / 'staging-queries' / '20260714_design_task_post_cleanup_snapshot.sql'
VALIDATOR = ROOT / 'tools' / 'validate-design-task-staging-post-cleanup-snapshot.mjs'
TEST = ROOT / 'tools' / 'test_design_task_staging_post_cleanup_snapshot.mjs'
DOC = ROOT / 'docs' / 'CRM_DESIGN_TASK_STAGING_POST_CLEANUP_SNAPSHOT_2026-07-14.md'
WORKFLOW = ROOT / '.github' / 'workflows' / 'crm-design-post-cleanup-snapshot-check.yml'
GITIGNORE = ROOT / '.gitignore'
CONFIG = ROOT / 'supabase' / 'config.toml'

STAGING = 'otulfnouybahfnsycxqn'
PRODUCTION = 'ofewxuqfjhamgerwzull'
EXPECTED_COUNTS = {
    'auth_users': 0,
    'profiles': 0,
    'leads': 0,
    'orders': 0,
    'needs': 0,
    'production_jobs': 0,
    'design_tasks': 0,
    'design_events': 0,
    'receipts': 0,
    'environment_guard': 1,
}
EXPECTED_OBJECTS = {
    'design_rpc_present': True,
    'read_helper_present': True,
    'active_index_present': True,
    'select_policy_count': 3,
}
EXPECTED_PRIVILEGES = {
    'authenticated_direct_rpc_execute': False,
    'authenticated_receipt_select': False,
    'authenticated_orders_table_select': False,
    'authenticated_orders_id_select': True,
    'authenticated_orders_client_phone_select': False,
}

errors = []


def read(path: Path, label: str) -> str:
    if not path.exists():
        errors.append(f'Missing {label}: {path.relative_to(ROOT)}')
        return ''
    return path.read_text(encoding='utf-8')


def require(source: str, markers, label: str) -> None:
    for marker in markers:
        if marker not in source:
            errors.append(f'{label}: missing marker {marker!r}')


contract_text = read(CONTRACT, 'snapshot contract')
query = read(QUERY, 'read-only collector')
validator = read(VALIDATOR, 'snapshot validator')
test = read(TEST, 'snapshot validator tests')
doc = read(DOC, 'snapshot runbook')
workflow = read(WORKFLOW, 'snapshot workflow')
gitignore = read(GITIGNORE, '.gitignore')
config = read(CONFIG, 'Supabase config')

try:
    contract = json.loads(contract_text) if contract_text else {}
except json.JSONDecodeError as exc:
    errors.append(f'Contract JSON invalid: {exc}')
    contract = {}

if contract:
    if contract.get('contract_version') != 'leader-design-task-staging-post-cleanup-snapshot-contract-v1':
        errors.append('Contract version drifted')
    if contract.get('snapshot_version') != 'leader-design-task-staging-post-cleanup-snapshot-v1':
        errors.append('Snapshot version drifted')
    environment = contract.get('environment') or {}
    if environment.get('project_ref') != STAGING:
        errors.append('Staging project ref drifted')
    if environment.get('production_project_ref') != PRODUCTION:
        errors.append('Production project ref drifted')
    if environment.get('production_enabled') is not False:
        errors.append('Production must remain disabled')
    if contract.get('expected_counts') != EXPECTED_COUNTS:
        errors.append('Expected counts drifted')
    if contract.get('required_objects') != EXPECTED_OBJECTS:
        errors.append('Required objects drifted')
    if contract.get('required_privileges') != EXPECTED_PRIVILEGES:
        errors.append('Required privileges drifted')
    if contract.get('collector', {}).get('read_only') is not True:
        errors.append('Collector must remain read-only')

normalized_query = re.sub(r'--[^\n]*', '', query).lower()
for forbidden in ('insert', 'update', 'delete', 'truncate', 'alter', 'drop', 'create', 'grant', 'revoke'):
    if re.search(rf'\b{forbidden}\b', normalized_query):
        errors.append(f'Read-only collector contains forbidden SQL verb: {forbidden}')

require(query, [
    STAGING,
    "'snapshot_version', 'leader-design-task-staging-post-cleanup-snapshot-v1'",
    'from auth.users',
    'from public.leader_user_profiles',
    'from public.leader_leads',
    'from public.leader_orders',
    'from public.leader_lead_needs',
    'from public.leader_production_jobs',
    'from public.leader_design_tasks',
    'from public.leader_design_task_events',
    'from leader_private.leader_command_receipts',
    'from leader_staging.environment_guard',
    'leader_design_tasks_one_active_per_order_uidx',
    'leader_has_crm_action(text)',
    'authenticated_orders_client_phone_select',
], 'read-only collector')

require(validator, [
    "SNAPSHOT_VERSION = 'leader-design-task-staging-post-cleanup-snapshot-v1'",
    f"STAGING_PROJECT_REF = '{STAGING}'",
    f"PRODUCTION_PROJECT_REF = '{PRODUCTION}'",
    'EXPECTED_COUNTS',
    'EXPECTED_OBJECTS',
    'EXPECTED_PRIVILEGES',
    'unwrapSnapshot',
    'validateSnapshot',
    'top_level_keys_invalid',
    'production_ref_leaked',
    'secret_like_value',
    'cleanup_complete',
], 'snapshot validator')

require(test, [
    'leftoverAuth.counts.auth_users = 1',
    'leftoverReceipt.counts.receipts = 1',
    'guardMissing.counts.environment_guard = 0',
    'rpcMissing.objects.design_rpc_present = false',
    'authenticated_direct_rpc_execute = true',
    'authenticated_orders_client_phone_select = true',
    'production_ref_leaked',
    'secret_like_value',
    'Staging post-cleanup snapshot validator rejects leftover data',
], 'snapshot tests')

require(doc, [
    STAGING,
    PRODUCTION,
    'post-cleanup snapshot',
    'environment_guard = 1',
    'authenticated_orders_client_phone_select',
    'Auth user через Dashboard',
    'security и performance advisors',
    'Production boundary',
], 'snapshot runbook')

require(workflow, [
    'CRM design post-cleanup snapshot check',
    'python3 -m json.tool contracts/design-task-staging-post-cleanup-snapshot-v1.json',
    'node --check tools/validate-design-task-staging-post-cleanup-snapshot.mjs',
    'node tools/test_design_task_staging_post_cleanup_snapshot.mjs',
    'python3 tools/check_design_task_staging_post_cleanup_snapshot.py',
    '20260714_design_task_post_cleanup_snapshot.sql',
], 'snapshot workflow')

if '/artifacts/design-task-staging-post-cleanup-snapshot.json' not in gitignore:
    errors.append('Local post-cleanup snapshot must be ignored')
if f'project_id = "{PRODUCTION}"' not in config:
    errors.append('supabase/config.toml must continue to point to production')
if STAGING in config:
    errors.append('Staging ref must not replace production config')

secret_patterns = [
    r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}',
    r'sb_secret_[A-Za-z0-9_-]{10,}',
    r'(?i)Bearer\s+[A-Za-z0-9._-]{20,}',
]
for path, source in [
    (CONTRACT, contract_text),
    (QUERY, query),
    (VALIDATOR, validator),
    (TEST, test),
    (DOC, doc),
    (WORKFLOW, workflow),
]:
    for pattern in secret_patterns:
        if re.search(pattern, source):
            errors.append(f'{path.relative_to(ROOT)} contains possible secret material')

if errors:
    print('Staging post-cleanup snapshot checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('Staging post-cleanup snapshot is read-only, zero-count strict, privilege-aware and production-locked.')
