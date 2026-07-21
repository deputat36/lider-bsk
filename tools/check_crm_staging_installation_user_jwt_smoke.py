#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FILES = {
    'runner': ROOT / 'tools/run_crm_staging_installation_user_jwt_smoke.mjs',
    'contract': ROOT / 'contracts/crm-staging-installation-user-jwt-smoke-v1.json',
    'docs': ROOT / 'docs/SUPABASE_STAGING_INSTALLATION_USER_JWT_SMOKE_V1_2026-07-21.md',
    'command_evidence': ROOT / 'contracts/crm-staging-installation-command-edge-v1.json',
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
        if marker not in texts[name]:
            errors.append(f'{name}: missing marker {marker!r}')


try:
    contract = json.loads(texts['contract'])
    command = json.loads(texts['command_evidence'])
except Exception as exc:
    contract = {}
    command = {}
    errors.append(f'Invalid JSON: {exc}')

if contract:
    for key, value in {
        'contract': 'crm-staging-installation-user-jwt-smoke',
        'version': 1,
        'project_ref': 'otulfnouybahfnsycxqn',
        'environment': 'staging',
        'function': 'leader-crm-installation',
        'action': 'installation_job.update',
        'permission': 'installation.write',
        'secrets_in_repository': False,
        'persistent_fixture': False,
        'persistent_receipt': False,
        'working_data_write_expected': False,
    }.items():
        if contract.get(key) != value:
            errors.append(f'contract: {key} must equal {value!r}')

    expected_env = {
        'STAGING_SUPABASE_URL',
        'STAGING_SUPABASE_PUBLISHABLE_KEY',
        'STAGING_INSTALLATION_AUTHORIZED_USER_JWT',
        'STAGING_INSTALLATION_FORBIDDEN_USER_JWT',
    }
    if set(contract.get('runtime_environment', [])) != expected_env:
        errors.append('contract: runtime environment inventory drift')

    cases = {item.get('name'): item for item in contract.get('cases', [])}
    expected_cases = {
        'missing_jwt': (401, 'missing_or_invalid_jwt'),
        'invalid_jwt': (401, 'missing_or_invalid_jwt'),
        'forbidden_role': (403, 'forbidden'),
        'authorized_role': (404, 'not_found'),
    }
    for name, expected in expected_cases.items():
        item = cases.get(name, {})
        if (item.get('expected_http'), item.get('expected_error')) != expected:
            errors.append(f'contract: unexpected {name} expectation')

    gate = contract.get('execution_gate', {})
    for key in (
        'manual_runtime_tokens_required',
        'authorized_and_forbidden_tokens_must_differ',
        'tokens_must_not_be_logged',
        'tokens_must_not_be_committed',
        'run_not_performed_in_source_pr',
    ):
        if gate.get(key) is not True:
            errors.append(f'contract.execution_gate: {key} must be true')

    production = contract.get('production_boundary', {})
    if production.get('production_project_ref') != 'ofewxuqfjhamgerwzull':
        errors.append('contract: wrong production ref')
    if production.get('production_call') is not False or production.get('production_data_change') is not False:
        errors.append('contract: production call/data change must be false')

if command:
    readiness = command.get('readiness', {})
    if readiness.get('schema_reconciliation_ready') is not True:
        errors.append('command evidence: schema reconciliation must be ready')
    if readiness.get('user_jwt_smoke_completed') is not False:
        errors.append('command evidence: user JWT smoke must remain false before runtime')
    if readiness.get('frontend_switch_ready') is not False:
        errors.append('command evidence: frontend switch must remain false before runtime')

require('runner',
    "EXPECTED_PROJECT_REF = 'otulfnouybahfnsycxqn'",
    "FUNCTION_SLUG = 'leader-crm-installation'",
    "ACTION = 'installation_job.update'",
    "PERMISSION = 'installation.write'",
    "env('STAGING_SUPABASE_URL')",
    "env('STAGING_SUPABASE_PUBLISHABLE_KEY')",
    "env('STAGING_INSTALLATION_AUTHORIZED_USER_JWT')",
    "env('STAGING_INSTALLATION_FORBIDDEN_USER_JWT')",
    "assertCase(missing, 401, 'missing_or_invalid_jwt'",
    "assertCase(invalid, 401, 'missing_or_invalid_jwt'",
    "assertCase(forbidden, 403, 'forbidden'",
    "assertCase(authorized, 404, 'not_found'",
    'persistent_fixture_expected: false',
    'receipt_expected: false')

for forbidden in (
    'console.log(authorizedJwt',
    'console.log(forbiddenJwt',
    'console.error(authorizedJwt',
    'console.error(forbiddenJwt',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SECRET_KEYS',
):
    if forbidden in texts['runner']:
        errors.append(f'runner: forbidden marker {forbidden!r}')

require('docs',
    'Staging installation user-JWT smoke v1',
    '`401 missing_or_invalid_jwt`',
    '`403 forbidden`',
    '`404 not_found`',
    'Реальные значения в репозиторий не добавляются',
    'runtime smoke в source PR не запускается',
    'Production `ofewxuqfjhamgerwzull` не изменяется')
require('workflow',
    'CRM staging installation user-JWT smoke check',
    'node --check tools/run_crm_staging_installation_user_jwt_smoke.mjs',
    'python3 -m py_compile tools/check_crm_staging_installation_user_jwt_smoke.py',
    'python3 tools/check_crm_staging_installation_user_jwt_smoke.py')

for name, text in texts.items():
    if re.search(r'sb_secret_[A-Za-z0-9_-]{10,}', text):
        errors.append(f'{name}: possible secret material')
    if re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}', text):
        errors.append(f'{name}: possible JWT material')

if errors:
    print('Installation user-JWT smoke checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('Installation user-JWT smoke runner, contract, no-secret boundary and pre-runtime gate are coherent.')
