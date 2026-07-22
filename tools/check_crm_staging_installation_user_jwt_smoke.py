#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EDGE_SHA = '24183605aad2c5cfcc84ebe14c348dcfce1b68de41a43dcfb973f65cef8cb369'
FILES = {
    'runner': ROOT / 'tools/run_crm_staging_installation_user_jwt_smoke.mjs',
    'contract': ROOT / 'contracts/crm-staging-installation-user-jwt-smoke-v1.json',
    'docs': ROOT / 'docs/SUPABASE_STAGING_INSTALLATION_USER_JWT_SMOKE_V1_2026-07-21.md',
    'command_evidence': ROOT / 'contracts/crm-staging-installation-command-edge-v1.json',
    'read_evidence': ROOT / 'contracts/crm-staging-installation-read-edge-v1.json',
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


def require(name, markers):
    for marker in markers:
        if marker not in texts.get(name, ''):
            errors.append(f'{name}: missing marker {marker!r}')


try:
    contract = json.loads(texts['contract'])
    command = json.loads(texts['command_evidence'])
    read = json.loads(texts['read_evidence'])
except Exception as exc:
    contract, command, read = {}, {}, {}
    errors.append(f'Invalid JSON: {exc}')

for key, value in {
    'contract': 'crm-staging-installation-user-jwt-smoke',
    'version': 2,
    'project_ref': 'otulfnouybahfnsycxqn',
    'environment': 'staging',
    'function': 'leader-crm-installation',
    'edge_version': 2,
    'edge_sha256': EDGE_SHA,
    'secrets_in_repository': False,
    'persistent_fixture': False,
    'persistent_receipt': False,
    'working_data_write_expected': False,
}.items():
    if contract.get(key) != value:
        errors.append(f'contract: {key} must equal {value!r}')

expected_actions = {
    ('installation_job.read', 'installation.read'),
    ('installation_job.update', 'installation.write'),
}
if {(item.get('action'), item.get('permission')) for item in contract.get('actions', [])} != expected_actions:
    errors.append('contract: read/update action inventory drifted')

expected_env = {
    'STAGING_SUPABASE_URL',
    'STAGING_SUPABASE_PUBLISHABLE_KEY',
    'STAGING_INSTALLATION_AUTHORIZED_USER_JWT',
    'STAGING_INSTALLATION_FORBIDDEN_USER_JWT',
}
if set(contract.get('runtime_environment', [])) != expected_env:
    errors.append('contract: runtime environment inventory drifted')

cases = {item.get('name'): item for item in contract.get('cases', [])}
expected_cases = {
    'missing_jwt': (401, 'missing_or_invalid_jwt'),
    'invalid_jwt': (401, 'missing_or_invalid_jwt'),
    'forbidden_read': (403, 'forbidden'),
    'forbidden_update': (403, 'forbidden'),
    'authorized_read': (404, 'not_found'),
    'authorized_update': (404, 'not_found'),
}
for name, expected in expected_cases.items():
    item = cases.get(name, {})
    if (item.get('expected_http'), item.get('expected_error')) != expected:
        errors.append(f'contract: unexpected {name} expectation')

precondition = contract.get('database_precondition', {})
for key in ('schema_reconciliation_ready','read_rpc_ready','update_rpc_ready','edge_active','verify_jwt'):
    if precondition.get(key) is not True:
        errors.append(f'contract.precondition: {key} must be true')
if precondition.get('read_rpc_md5') != '98fc1e36b2ed8202e6580d7734088df1':
    errors.append('contract.precondition: read RPC fingerprint drifted')
if precondition.get('update_rpc_md5') != '0ed4669197dac1f2695e763d0eec54e1':
    errors.append('contract.precondition: update RPC fingerprint drifted')

gate = contract.get('execution_gate', {})
for key in ('manual_runtime_tokens_required','authorized_and_forbidden_tokens_must_differ','tokens_must_not_be_logged','tokens_must_not_be_committed','run_not_performed_in_source_pr'):
    if gate.get(key) is not True:
        errors.append(f'contract.execution_gate: {key} must be true')
if gate.get('current_auth_users') != 0 or gate.get('current_active_profiles') != 0:
    errors.append('contract.execution_gate: current auth/profile counts must be zero')
if gate.get('blocked_reason') != 'staging_has_no_auth_users_or_active_profiles':
    errors.append('contract.execution_gate: blocked reason drifted')

production = contract.get('production_boundary', {})
if production.get('production_project_ref') != 'ofewxuqfjhamgerwzull':
    errors.append('contract: wrong production ref')
if production.get('production_call') is not False or production.get('production_data_change') is not False:
    errors.append('contract: production call/data change must be false')

if command.get('edge', {}).get('sha256') != EDGE_SHA or command.get('edge', {}).get('version') != 2:
    errors.append('command evidence: deployed Edge v2 mismatch')
if command.get('readiness', {}).get('user_jwt_smoke_completed') is not False:
    errors.append('command evidence: user JWT smoke must remain false')
if command.get('readiness', {}).get('frontend_switch_ready') is not False:
    errors.append('command evidence: frontend switch must remain false')
if read.get('edge', {}).get('sha256') != EDGE_SHA:
    errors.append('read evidence: deployed Edge SHA mismatch')
if read.get('runtime_gate', {}).get('user_jwt_smoke_completed') is not False:
    errors.append('read evidence: user JWT smoke must remain false')

require('runner', [
    "EXPECTED_PROJECT_REF = 'otulfnouybahfnsycxqn'",
    "FUNCTION_SLUG = 'leader-crm-installation'",
    "READ_ACTION = 'installation_job.read'",
    "READ_PERMISSION = 'installation.read'",
    "UPDATE_ACTION = 'installation_job.update'",
    "UPDATE_PERMISSION = 'installation.write'",
    "env('STAGING_SUPABASE_URL')",
    "env('STAGING_SUPABASE_PUBLISHABLE_KEY')",
    "env('STAGING_INSTALLATION_AUTHORIZED_USER_JWT')",
    "env('STAGING_INSTALLATION_FORBIDDEN_USER_JWT')",
    "assertCase(missing, 401, 'missing_or_invalid_jwt'",
    "assertCase(invalid, 401, 'missing_or_invalid_jwt'",
    "assertCase(forbiddenRead, 403, 'forbidden'",
    "assertCase(forbiddenUpdate, 403, 'forbidden'",
    "assertCase(authorizedRead, 404, 'not_found'",
    "assertCase(authorizedUpdate, 404, 'not_found'",
    'persistent_fixture_expected: false',
    'receipt_expected: false',
])

for forbidden in (
    'console.log(authorizedJwt', 'console.log(forbiddenJwt',
    'console.error(authorizedJwt', 'console.error(forbiddenJwt',
    'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEYS',
):
    if forbidden in texts['runner']:
        errors.append(f'runner: forbidden marker {forbidden!r}')

require('docs', [
    'Staging installation user-JWT smoke v2',
    '`installation_job.read`', '`installation_job.update`',
    '`401 missing_or_invalid_jwt`', '`403 forbidden`', '`404 not_found`',
    'Реальные значения в репозиторий не добавляются',
    'Runtime smoke в source PR не запускается',
    'Auth users: `0`',
    'Production `ofewxuqfjhamgerwzull` не изменяется',
])
require('workflow', [
    'CRM staging installation user-JWT smoke check',
    'node --check tools/run_crm_staging_installation_user_jwt_smoke.mjs',
    'python3 -m py_compile tools/check_crm_staging_installation_user_jwt_smoke.py',
    'python3 tools/check_crm_staging_installation_user_jwt_smoke.py',
])

for name, text in texts.items():
    if re.search(r'sb_secret_[A-Za-z0-9_-]{10,}', text):
        errors.append(f'{name}: possible secret material')
    if re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}', text):
        errors.append(f'{name}: possible JWT material')

if errors:
    print('Installation user-JWT smoke v2 checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('Installation user-JWT smoke v2 covers read/update and remains safely runtime-gated.')
