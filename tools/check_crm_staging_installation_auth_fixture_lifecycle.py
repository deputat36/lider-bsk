#!/usr/bin/env python3

from pathlib import Path
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    'runner': ROOT / 'tools/run_crm_staging_installation_auth_fixture_lifecycle.mjs',
    'test': ROOT / 'tools/test_crm_staging_installation_auth_fixture_lifecycle.mjs',
    'contract': ROOT / 'contracts/crm-staging-installation-auth-fixture-lifecycle-v1.json',
    'runbook': ROOT / 'docs/SUPABASE_STAGING_INSTALLATION_AUTH_FIXTURE_LIFECYCLE_V1_2026-07-22.md',
    'workflow': ROOT / '.github/workflows/crm-staging-installation-auth-fixture-lifecycle-check.yml',
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
    text = texts.get(name, '')
    for marker in markers:
        if marker not in text:
            errors.append(f'{name}: missing marker {marker!r}')


require('runner', [
    "STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'",
    "PRODUCTION_PROJECT_REF = 'ofewxuqfjhamgerwzull'",
    "MUTATION_CONFIRMATION = 'YES_DELETE_ALL_FIXTURES'",
    "EVIDENCE_VERSION = 'leader-installation-auth-fixture-lifecycle-v1'",
    "FUNCTION_SLUG = 'leader-crm-installation'",
    "READ_ACTION = 'installation_job.read'",
    "UPDATE_ACTION = 'installation_job.update'",
    "['installer', 'accountant']",
    "@example.invalid",
    "secretKey.startsWith('sb_secret_')",
    "if (isJwtApiKey(key)) headers.Authorization = `Bearer ${key}`",
    "ALLOW_STAGING_AUTH_MUTATION",
    "STAGING_SUPABASE_SECRET_KEY",
    "STAGING_SUPABASE_PUBLISHABLE_KEY",
    "async function logout",
    "export async function deleteProfile",
    "export async function deleteAdminUser",
    "export async function verifyProfileRemoved",
    "} finally {",
    "const cleanupPassed = cleanup.every",
    "if (!cleanupPassed) throw new Error",
    "mode === 'plan'",
    "if (mode !== 'run')",
    "mode: 0o600",
    "persistent_fixture_expected: false",
    "receipt_expected: false",
    "production_enabled: false",
])

for forbidden in [
    'SUPABASE_SERVICE_ROLE_KEY=',
    'SUPABASE_SECRET_KEY=',
    'STAGING_SUPABASE_SECRET_KEY=',
    'STAGING_SUPABASE_PUBLISHABLE_KEY=',
    'ALLOW_STAGING_AUTH_MUTATION=YES_DELETE_ALL_FIXTURES',
    'ofewxuqfjhamgerwzull.supabase.co/auth/v1/admin/users',
]:
    if forbidden in texts.get('runner', ''):
        errors.append(f'runner contains hardcoded runtime assignment/production mutation marker: {forbidden}')

require('test', [
    "assertExactStagingUrl(STAGING_URL)",
    "'https://ofewxuqfjhamgerwzull.supabase.co'",
    "adminHeaders('sb_secret_test_key')",
    "legacyKey = 'aaa.bbb.ccc'",
    "buildSyntheticIdentity('installer'",
    "buildSyntheticIdentity('accountant'",
    "runLifecycle({",
    "accountant",
    "token-installer",
    "deletedUsers.length, 2",
    "deletedProfiles.length, 2",
    "logouts.length, 2",
    "Installation staging Auth fixture lifecycle tests passed.",
])

try:
    contract = json.loads(texts.get('contract', '{}'))
except json.JSONDecodeError as exc:
    errors.append(f'Invalid contract JSON: {exc}')
    contract = {}

if contract.get('contract') != 'crm-staging-installation-auth-fixture-lifecycle':
    errors.append('contract identity drifted')
if contract.get('version') != 1:
    errors.append('contract version must be 1')
environment = contract.get('environment', {})
if environment.get('project_ref') != 'otulfnouybahfnsycxqn':
    errors.append('contract staging project ref drifted')
if environment.get('exact_url') != 'https://otulfnouybahfnsycxqn.supabase.co':
    errors.append('contract exact staging URL drifted')
if environment.get('production_enabled') is not False:
    errors.append('contract must keep production disabled')
runtime_gate = contract.get('runtime_gate', {})
if runtime_gate.get('confirmation_value') != 'YES_DELETE_ALL_FIXTURES':
    errors.append('contract confirmation phrase drifted')
if runtime_gate.get('secrets_in_repository') is not False or runtime_gate.get('secrets_in_evidence') is not False:
    errors.append('contract must forbid secrets in repository/evidence')
fixtures = contract.get('fixtures', {})
if fixtures.get('authorized_role') != 'installer' or fixtures.get('forbidden_role') != 'accountant':
    errors.append('contract role matrix drifted')
if fixtures.get('persistent_fixture_expected') is not False:
    errors.append('contract must require zero persistent fixtures')
cleanup = contract.get('cleanup', {})
if cleanup.get('location') != 'finally' or cleanup.get('cleanup_failure_fails_run') is not True:
    errors.append('contract cleanup must be fail-closed in finally')
current_state = contract.get('current_state', {})
if current_state.get('edge_version') != 2 or current_state.get('edge_contract') != 'leader-crm-installation-edge-v2':
    errors.append('contract must target deployed installation Edge v2')
if current_state.get('runtime_executed_in_this_pr') is not False:
    errors.append('contract must not claim runtime execution')

require('runbook', [
    'Auth users: 0',
    'активные `leader_user_profiles`: 0',
    '`leader-crm-installation v2` — ACTIVE',
    '`installer` — имеет `installation.read` и `installation.write`',
    '`accountant` — не имеет этих действий',
    '--mode=plan',
    '--mode=run',
    "ALLOW_STAGING_AUTH_MUTATION='YES_DELETE_ALL_FIXTURES'",
    '`sb_secret_*` передаётся только через `apikey`',
    'Cleanup выполняется в обратном порядке создания внутри `finally`',
    'все значения равны 0',
    'Production не изменялся.',
])

require('workflow', [
    'node --check tools/run_crm_staging_installation_auth_fixture_lifecycle.mjs',
    'node --check tools/test_crm_staging_installation_auth_fixture_lifecycle.mjs',
    'node tools/test_crm_staging_installation_auth_fixture_lifecycle.mjs',
    'python3 tools/check_crm_staging_installation_auth_fixture_lifecycle.py',
])

combined = '\n'.join(texts.values())
secret_patterns = {
    'modern secret key': re.compile(r'sb_secret_[A-Za-z0-9_-]{24,}'),
    'publishable key': re.compile(r'sb_publishable_[A-Za-z0-9_-]{24,}'),
    'JWT-like value': re.compile(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}'),
}
for label, pattern in secret_patterns.items():
    if pattern.search(combined):
        errors.append(f'new lifecycle package contains a possible real {label}')

for forbidden in ['nav_', 'parket_', 'broker_']:
    if forbidden in texts.get('runner', ''):
        errors.append(f'runner contains unrelated project marker: {forbidden}')

if errors:
    print('\n'.join(errors), file=sys.stderr)
    raise SystemExit(1)

print('Installation staging Auth fixture lifecycle is exact-staging, secret-safe and cleanup-closed.')
