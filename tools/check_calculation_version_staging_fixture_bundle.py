#!/usr/bin/env python3

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGING = 'otulfnouybahfnsycxqn'
PRODUCTION = 'ofewxuqfjhamgerwzull'

FILES = {
    'generator': ROOT / 'tools/create-calculation-version-staging-fixture-bundle.mjs',
    'test': ROOT / 'tools/test_create_calculation_version_staging_fixture_bundle.mjs',
    'doc': ROOT / 'docs/CRM_CALCULATION_VERSION_STAGING_FIXTURE_BUNDLE_2026-07-16.md',
    'workflow': ROOT / '.github/workflows/crm-calculation-fixture-bundle-check.yml',
}

errors: list[str] = []
texts: dict[str, str] = {}

for name, path in FILES.items():
    if not path.is_file():
        errors.append(f'Missing file: {path.relative_to(ROOT)}')
        texts[name] = ''
    else:
        texts[name] = path.read_text(encoding='utf-8')


def require(name: str, markers: tuple[str, ...] | list[str]) -> None:
    for marker in markers:
        if marker not in texts[name]:
            errors.append(f'{name}: missing marker {marker!r}')


def forbid(name: str, markers: tuple[str, ...] | list[str]) -> None:
    for marker in markers:
        if marker in texts[name]:
            errors.append(f'{name}: forbidden marker found {marker!r}')


require('generator', [
    "STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'",
    "ACTION = 'calculation.create_version'",
    "FIXTURE_MANIFEST_VERSION = 'leader-calculation-version-staging-fixture-manifest-v1'",
    "FIXTURE_BUNDLE_VERSION = 'leader-calculation-version-staging-fixture-sql-bundle-v1'",
    'MAX_TTL_HOURS = 24',
    'createFixtureManifest',
    'validateFixtureManifest',
    'manifestDigest',
    'buildSeedSql',
    'buildCleanupSql',
    'buildFixtureBundle',
    'leader_staging.environment_guard',
    "repository = 'deputat36/lider-bsk'",
    'confirmed_staging_auth_user_required',
    'fixture_manifest_expired',
    'fixture_collision_detected',
    'fixture_seed_postcondition_failed',
    'fixture_cleanup_postcondition_failed',
    'auth_user_must_be_deleted_last',
    'auth_user_missing_before_external_delete',
    'insert into public.leader_user_profiles',
    'insert into public.leader_leads',
    'insert into public.leader_lead_needs',
    'insert into public.leader_lead_calculations',
    'insert into public.leader_lead_calculation_items',
    'delete from leader_private.leader_command_receipts',
    'delete from public.leader_lead_calculation_items',
    'delete from public.leader_lead_calculations',
    'delete from public.leader_lead_needs',
    'delete from public.leader_leads',
    'delete from public.leader_user_profiles',
    'auth_user_created_or_deleted_by_sql: false',
    'LIDER_STAGING_SOURCE_CALCULATION_ID',
    'LIDER_STAGING_EXPECTED_UPDATED_AT',
    'LIDER_STAGING_NEED_ID',
    'LIDER_STAGING_IDEMPOTENCY_KEY',
    "mode: 0o600",
    'performs_network_calls: false',
    'executes_sql: false',
])

forbidden_generator_markers = [
    PRODUCTION,
    'fetch(',
    'SUPABASE_SERVICE_ROLE_KEY',
    'LIDER_STAGING_PASSWORD',
    'LIDER_STAGING_EMAIL',
    'LIDER_STAGING_PUBLISHABLE_KEY',
    'insert into auth.users',
    'delete from auth.users',
]
forbid('generator', forbidden_generator_markers)

cleanup_order = [
    'delete from leader_private.leader_command_receipts',
    'delete from public.leader_lead_calculation_items',
    'delete from public.leader_lead_calculations',
    'delete from public.leader_lead_needs',
    'delete from public.leader_leads',
    'delete from public.leader_user_profiles',
]
positions = [texts['generator'].find(marker) for marker in cleanup_order]
if any(position < 0 for position in positions):
    errors.append('generator: cleanup order markers are incomplete')
elif positions != sorted(positions):
    errors.append('generator: cleanup order is unsafe')

require('test', [
    'createFixtureManifest',
    'buildSeedSql',
    'buildCleanupSql',
    'buildFixtureBundle',
    'validateFixtureManifest',
    'manifestDigest',
    f'new RegExp(STAGING_PROJECT_REF)',
    '/ofewxuqfjhamgerwzull/',
    '/insert into auth\\.users/i',
    '/delete from auth\\.users/i',
    'auth_user_must_be_deleted_last',
    'fixture_cleanup_postcondition_failed',
    'profile_auth_identity_mismatch',
    'secret_like_field',
    'Calculation staging fixture bundle is manifest-bound, production-locked and Auth-safe.',
])

require('doc', [
    f'`{STAGING}`',
    f'`{PRODUCTION}`',
    'не выполняет network requests',
    'не создаёт и не удаляет `auth.users`',
    'режимом `0600`',
    '--auth-user-id=<STAGING_AUTH_USER_UUID>',
    'fixture-manifest.json',
    'seed.sql',
    'cleanup.sql',
    'bundle-summary.json',
    'runner_environment',
    'LIDER_STAGING_SOURCE_CALCULATION_ID',
    'LIDER_STAGING_EXPECTED_UPDATED_AT',
    'HTTP 201 create',
    'HTTP 200 exact replay',
    'HTTP 409 `idempotency_conflict`',
    'HTTP 409 `source_changed`',
    'delete from auth.users',
    'Auth user удаляется вручную последним',
    'CI не создаёт Auth user, не запускает SQL и не вызывает Edge Function',
])

require('workflow', [
    "- 'tools/create-calculation-version-staging-fixture-bundle.mjs'",
    "- 'tools/test_create_calculation_version_staging_fixture_bundle.mjs'",
    "- 'tools/check_calculation_version_staging_fixture_bundle.py'",
    "- 'docs/CRM_CALCULATION_VERSION_STAGING_FIXTURE_BUNDLE_2026-07-16.md'",
    'node --check tools/create-calculation-version-staging-fixture-bundle.mjs',
    'node tools/test_create_calculation_version_staging_fixture_bundle.mjs',
    'python3 -m py_compile tools/check_calculation_version_staging_fixture_bundle.py',
    'python3 tools/check_calculation_version_staging_fixture_bundle.py',
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
    if forbidden_prefix in texts['generator']:
        errors.append(f'generator entered forbidden object scope: {forbidden_prefix}')

if errors:
    print('Calculation staging fixture bundle checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('Calculation staging fixture bundle is offline, manifest-bound, production-locked and Auth-safe.')
