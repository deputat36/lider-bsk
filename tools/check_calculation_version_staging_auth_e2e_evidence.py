#!/usr/bin/env python3

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGING = 'otulfnouybahfnsycxqn'
PRODUCTION = 'ofewxuqfjhamgerwzull'

FILES = {
    'runner': ROOT / 'tools/run_calculation_version_staging_auth_e2e.mjs',
    'launcher': ROOT / 'tools/run_calculation_version_staging_auth_e2e.ps1',
    'validator': ROOT / 'tools/validate-calculation-version-staging-auth-e2e-evidence.mjs',
    'snapshot': ROOT / 'tools/create-calculation-version-staging-post-cleanup-snapshot.mjs',
    'test': ROOT / 'tools/test_calculation_version_staging_auth_e2e_evidence.mjs',
    'doc': ROOT / 'docs/CRM_CALCULATION_VERSION_STAGING_EVIDENCE_AND_CLEANUP_2026-07-16.md',
    'workflow': ROOT / '.github/workflows/crm-calculation-version-staging-evidence-check.yml',
}

errors: list[str] = []
texts: dict[str, str] = {}

for name, path in FILES.items():
    if not path.is_file():
        errors.append(f'Missing file: {path.relative_to(ROOT)}')
        texts[name] = ''
    else:
        texts[name] = path.read_text(encoding='utf-8')


def require(name: str, markers: list[str] | tuple[str, ...]) -> None:
    for marker in markers:
        if marker not in texts[name]:
            errors.append(f'{name}: missing marker {marker!r}')


def forbid(name: str, markers: list[str] | tuple[str, ...]) -> None:
    for marker in markers:
        if marker in texts[name]:
            errors.append(f'{name}: forbidden marker found {marker!r}')


require('runner', [
    "STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'",
    "AUTH_E2E_RUNNER_VERSION = 'leader-calculation-version-staging-auth-e2e-runner-v2'",
    "AUTH_E2E_EVIDENCE_VERSION = 'leader-calculation-version-staging-auth-e2e-evidence-v1'",
    'LIDER_STAGING_EVIDENCE_PATH',
    'buildAuthE2EEvidence',
    'writeAuthE2EEvidence',
    'mode: 0o600',
    'evidence_requires_fixture_manifest',
    'evidence_requires_successful_logout',
    'auth_logout_failed:',
    'safeProjectionValidated: true',
    'logout,',
])
forbid('runner', [
    PRODUCTION,
    'SUPABASE_SERVICE_ROLE_KEY',
    'service_role',
    'console.log(config',
    'console.log(accessToken',
    'console.log(response.body',
])

require('launcher', [
    "[string]$EvidencePath = ''",
    "$Validator = 'tools/validate-calculation-version-staging-auth-e2e-evidence.mjs'",
    'LIDER_STAGING_EVIDENCE_PATH',
    'node $Validator "--evidence=$EvidencePath" "--manifest=$resolvedManifest"',
    'Authenticated staging calculation evidence validation failed',
    'finally',
])
forbid('launcher', [PRODUCTION, 'service_role', 'SUPABASE_SERVICE_ROLE_KEY', 'sb_secret_'])

require('validator', [
    'AUTH_E2E_EVIDENCE_VERSION',
    'AUTH_E2E_RUNNER_VERSION',
    'STAGING_PROJECT_REF',
    'validateAuthE2EEvidence',
    'TOP_LEVEL_FIELDS',
    'network_e2e_required',
    'fixture_manifest_digest_mismatch',
    'statuses_projection_drift',
    'source_calculation_id_manifest_mismatch',
    'logout_not_confirmed',
    'secret_like_material:',
    "'service_role'",
    'evidence_path_required',
    'manifest_path_required',
])
forbid('validator', [
    PRODUCTION,
    'SUPABASE_SERVICE_ROLE_KEY',
    '/auth/v1/',
    '/functions/v1/',
    '.insert(',
    '.update(',
    '.delete(',
    '.rpc(',
])

require('snapshot', [
    "POST_CLEANUP_SNAPSHOT_VERSION = 'leader-calculation-version-staging-post-cleanup-snapshot-v1'",
    'buildPostCleanupSnapshotSql',
    'writePostCleanupSnapshot',
    'mode: 0o600',
    'leader_staging.environment_guard',
    'post_cleanup_auth_user_still_exists',
    'post_cleanup_manifest_bound_rows_remain',
    "'database_fixtures_absent', true",
    "'cleanup_verified', true",
    'performs_network_calls: false',
    'executes_sql: false',
])
forbid('snapshot', [
    PRODUCTION,
    'insert into ',
    'update public.',
    'delete from ',
    'truncate ',
    'drop table',
    'alter table',
    'grant ',
    'revoke ',
    'SUPABASE_SERVICE_ROLE_KEY',
    'service_role',
])

require('test', [
    'buildAuthE2EEvidence',
    'validateAuthE2EEvidence',
    'buildPostCleanupSnapshotSql',
    "['allowed', 'forbidden', 'inactive']",
    'evidence_requires_fixture_manifest',
    'evidence_requires_successful_logout',
    'fixture_manifest.digest_sha256',
    'post_cleanup_auth_user_still_exists',
    'post_cleanup_manifest_bound_rows_remain',
    '0o600',
    'Calculation staging authenticated E2E evidence is manifest-bound, secret-free and cleanup-verifiable.',
])

require('doc', [
    f'`{STAGING}`',
    f'`{PRODUCTION}`',
    'version `3`',
    '`verify_jwt=true`',
    'leader-calculation-version-staging-auth-e2e-evidence-v1',
    'leader-calculation-version-staging-auth-e2e-runner-v2',
    'LIDER_STAGING_EVIDENCE_PATH',
    'validate-calculation-version-staging-auth-e2e-evidence.mjs',
    'post_cleanup_auth_user_still_exists',
    'post_cleanup_manifest_bound_rows_remain',
    'Authenticated HTTP E2E остаётся незавершённым',
    'Production rollout остаётся запрещён',
])

require('workflow', [
    "'tools/run_calculation_version_staging_auth_e2e.mjs'",
    "'tools/run_calculation_version_staging_auth_e2e.ps1'",
    "'tools/validate-calculation-version-staging-auth-e2e-evidence.mjs'",
    "'tools/create-calculation-version-staging-post-cleanup-snapshot.mjs'",
    "'tools/test_calculation_version_staging_auth_e2e_evidence.mjs'",
    "'tools/check_calculation_version_staging_auth_e2e_evidence.py'",
    'node tools/test_calculation_version_staging_auth_e2e_evidence.mjs',
    'PowerShell evidence launcher syntax',
    'python3 tools/check_calculation_version_staging_auth_e2e_evidence.py',
])

secret_patterns = (
    r'sb_secret_[A-Za-z0-9_-]{10,}',
    r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}',
)
for name, source in texts.items():
    for pattern in secret_patterns:
        if re.search(pattern, source):
            errors.append(f'{name}: possible secret material')

for forbidden_prefix in ('nav_', 'parket_', 'broker_'):
    for name in ('runner', 'launcher', 'validator', 'snapshot'):
        if forbidden_prefix in texts[name]:
            errors.append(f'{name}: entered forbidden object scope {forbidden_prefix}')

if errors:
    print('Calculation staging authenticated E2E evidence checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('Calculation staging authenticated E2E evidence is private, manifest-bound, validator-backed and cleanup-verifiable.')
