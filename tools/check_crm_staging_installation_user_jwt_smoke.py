#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EDGE_SHA = '24183605aad2c5cfcc84ebe14c348dcfce1b68de41a43dcfb973f65cef8cb369'
READ_MD5 = '5a353818606012d0e657a83f133723b6'
WRITE_MD5 = '0ed4669197dac1f2695d0eec54e1'

FILES = {
    'runner': ROOT / 'tools/run_crm_staging_installation_user_jwt_smoke.mjs',
    'lifecycle': ROOT / 'tools/run_crm_staging_installation_auth_fixture_lifecycle.mjs',
    'contract': ROOT / 'contracts/crm-staging-installation-user-jwt-smoke-v1.json',
    'runtime': ROOT / 'contracts/crm-staging-installation-runtime-smoke-v1.json',
    'docs': ROOT / 'docs/SUPABASE_STAGING_INSTALLATION_USER_JWT_SMOKE_V1_2026-07-21.md',
    'command': ROOT / 'contracts/crm-staging-installation-command-edge-v1.json',
    'read': ROOT / 'contracts/crm-staging-installation-read-edge-v1.json',
    'workflow': ROOT / '.github/workflows/crm-staging-installation-user-jwt-smoke-check.yml',
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


try:
    contract = json.loads(texts['contract'])
    runtime = json.loads(texts['runtime'])
    command = json.loads(texts['command'])
    read = json.loads(texts['read'])
except Exception as exc:
    contract, runtime, command, read = {}, {}, {}, {}
    errors.append(f'Invalid JSON: {exc}')

for key, value in {
    'contract': 'crm-staging-installation-user-jwt-smoke',
    'version': 3,
    'project_ref': 'otulfnouybahfnsycxqn',
    'environment': 'staging',
    'function': 'leader-crm-installation',
    'edge_version': 2,
    'edge_sha256': EDGE_SHA,
    'secrets_in_repository': False,
    'runtime_status': 'completed_clean',
}.items():
    if contract.get(key) != value:
        errors.append(f'contract: {key} drifted')

if {(row.get('action'), row.get('permission')) for row in contract.get('actions', [])} != {
    ('installation_job.read', 'installation.read'),
    ('installation_job.update', 'installation.write'),
}:
    errors.append('contract: action inventory drifted')

expected_cases = {
    'read_missing_jwt': 401,
    'read_invalid_jwt': 401,
    'read_forbidden': 403,
    'read_authorized': 200,
    'update_forbidden': 403,
    'update_authorized': 201,
    'update_replay': 200,
    'read_after_update': 200,
}
actual_cases = {row.get('name'): row.get('actual_http') for row in contract.get('runtime_cases', [])}
if actual_cases != expected_cases or any(row.get('result') != 'passed' for row in contract.get('runtime_cases', [])):
    errors.append('contract: runtime cases drifted')

assertions = contract.get('runtime_assertions', {})
for key in ('privacy_projection', 'linked_order_consistent', 'single_update_event', 'idempotent_replay'):
    if assertions.get(key) is not True:
        errors.append(f'contract.assertions: {key} must be true')
for key in ('auth_users_after_cleanup', 'active_profiles_after_cleanup', 'working_rows_after_cleanup', 'receipts_after_cleanup'):
    if assertions.get(key) != 0:
        errors.append(f'contract.assertions: {key} must be zero')

post = contract.get('database_postcondition', {})
for key in ('schema_reconciliation_ready', 'read_rpc_ready', 'update_rpc_ready', 'edge_active', 'verify_jwt', 'temporary_pg_net_removed', 'bootstrap_locked'):
    if post.get(key) is not True:
        errors.append(f'contract.postcondition: {key} must be true')
if (post.get('read_rpc_md5'), post.get('update_rpc_md5')) != (READ_MD5, WRITE_MD5):
    errors.append('contract.postcondition: RPC fingerprints drifted')

history = contract.get('execution_history', {})
for key in ('runtime_tokens_were_ephemeral', 'auth_admin_api_used', 'projection_defect_discovered', 'projection_defect_fixed'):
    if history.get(key) is not True:
        errors.append(f'contract.history: {key} must be true')
for key in ('tokens_logged', 'tokens_committed'):
    if history.get(key) is not False:
        errors.append(f'contract.history: {key} must be false')

success = contract.get('success_effect', {})
if success.get('user_jwt_smoke_completed') is not True or success.get('frontend_switch_ready_for_separate_review') is not True or success.get('production_ready') is not False:
    errors.append('contract.success_effect: readiness drifted')

production = contract.get('production_boundary', {})
if production.get('production_project_ref') != 'ofewxuqfjhamgerwzull':
    errors.append('contract.production: wrong ref')
for key in ('production_call', 'production_data_change', 'production_edge_change', 'production_auth_change'):
    if production.get(key) is not False:
        errors.append(f'contract.production: {key} must be false')

if runtime.get('status') != 'completed_clean' or runtime.get('runtime_cases') != expected_cases:
    errors.append('runtime evidence: completed matrix missing')
if command.get('readiness', {}).get('user_jwt_smoke_completed') is not True or command.get('readiness', {}).get('frontend_switch_ready') is not True:
    errors.append('command evidence: staging gate must be ready')
if command.get('readiness', {}).get('production_ready') is not False:
    errors.append('command evidence: production must remain not ready')
if read.get('runtime_gate', {}).get('user_jwt_smoke_completed') is not True:
    errors.append('read evidence: smoke must be complete')

require('runner',
    "EXPECTED_PROJECT_REF = 'otulfnouybahfnsycxqn'",
    "FUNCTION_SLUG = 'leader-crm-installation'",
    "READ_ACTION = 'installation_job.read'",
    "UPDATE_ACTION = 'installation_job.update'")
require('lifecycle',
    "export const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'",
    "export const FUNCTION_SLUG = 'leader-crm-installation'",
    'ALLOW_STAGING_AUTH_MUTATION',
    'finally')
require('docs',
    'Staging installation user-JWT smoke v3',
    'read без JWT → `401`',
    'manager update → `201`',
    'Auth users: `0`',
    'Production `ofewxuqfjhamgerwzull` не вызывался')
require('workflow',
    'CRM staging installation user-JWT smoke check',
    'python3 tools/check_crm_staging_installation_user_jwt_smoke.py')

for name, content in texts.items():
    if re.search(r'sb_secret_[A-Za-z0-9_-]{10,}', content):
        errors.append(f'{name}: possible secret material')
    if re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}', content):
        errors.append(f'{name}: possible JWT material')

if errors:
    print('Installation user-JWT smoke v3 checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('Installation user-JWT smoke v3 is completed, cleaned and production-safe.')
