#!/usr/bin/env python3

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGING = 'otulfnouybahfnsycxqn'
PRODUCTION = 'ofewxuqfjhamgerwzull'

FILES = {
    'generator': ROOT / 'tools/create-calculation-version-staging-profile-probe-bundle.mjs',
    'test': ROOT / 'tools/test_create_calculation_version_staging_profile_probe_bundle.mjs',
    'doc': ROOT / 'docs/CRM_CALCULATION_VERSION_STAGING_PROFILE_PROBES_2026-07-16.md',
    'workflow': ROOT / '.github/workflows/crm-calculation-profile-probe-bundle-check.yml',
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


require('generator', [
    "PROFILE_PROBE_BUNDLE_VERSION = 'leader-calculation-version-staging-profile-probe-bundle-v1'",
    "file: 'allowed.sql'",
    "file: 'forbidden.sql'",
    "file: 'inactive.sql'",
    "file: 'restore-manager.sql'",
    "role: 'manager'",
    "role: 'accountant'",
    "'calculations.write': true",
    'buildProfileTransitionSql',
    'buildProfileProbeBundle',
    'validateFixtureManifest',
    'manifestDigest',
    'leader_staging.environment_guard',
    f"project_ref = '${{STAGING_PROJECT_REF}}'",
    "repository = 'deputat36/lider-bsk'",
    'confirmed_staging_auth_user_required',
    'manifest_bound_profile_required',
    'manifest_bound_source_calculation_required',
    'update public.leader_user_profiles',
    'profile_transition_postcondition_failed',
    'profile_transition_changed_unapproved_fields',
    'profile_transition_business_state_changed',
    "transition_order: ['allowed', 'forbidden', 'inactive', 'restore_manager']",
    'mode: 0o600',
    'auth_user_created_or_deleted_by_sql: false',
    'executes_sql: false',
    'performs_network_calls: false',
])
forbid('generator', [
    PRODUCTION,
    'insert into auth.users',
    'delete from auth.users',
    'SUPABASE_SERVICE_ROLE_KEY',
    'service_role',
    'sb_secret_',
    '/auth/v1/',
    '/functions/v1/',
])

# The generator may contain exactly one intentional profile UPDATE template and no other DML/DDL template.
generator = texts['generator']
if generator.lower().count('update public.leader_user_profiles') != 1:
    errors.append('generator must contain exactly one manifest-bound profile UPDATE template')
for pattern, label in (
    (r'insert\s+into', 'INSERT'),
    (r'delete\s+from', 'DELETE'),
    (r'update\s+(?!public\.leader_user_profiles)', 'non-profile UPDATE'),
    (r'\b(truncate|drop|alter|grant|revoke)\b', 'DDL or privilege change'),
):
    if re.search(pattern, generator, flags=re.I):
        errors.append(f'generator contains forbidden {label} template')

require('test', [
    'PROFILE_PROBE_BUNDLE_VERSION',
    'PROFILE_TRANSITIONS',
    "['allowed', 'forbidden', 'inactive', 'restore_manager']",
    "allowed: 'allowed.sql'",
    "forbidden: 'forbidden.sql'",
    "inactive: 'inactive.sql'",
    "restore_manager: 'restore-manager.sql'",
    'profile_transition_changed_unapproved_fields',
    'profile_transition_business_state_changed',
    'fixture_manifest_invalid:manifest_expired',
    'profile_transition_invalid',
    'Calculation staging profile probes are manifest-bound and change only the synthetic CRM profile.',
])

require('doc', [
    f'`{STAGING}`',
    f'`{PRODUCTION}`',
    'allowed.sql',
    'forbidden.sql',
    'inactive.sql',
    'restore-manager.sql',
    '`calculations.write`',
    'profile_transition_changed_unapproved_fields',
    'profile_transition_business_state_changed',
    'Auth user вручную последним',
    'Production rollout',
])

require('workflow', [
    "'tools/create-calculation-version-staging-profile-probe-bundle.mjs'",
    "'tools/test_create_calculation_version_staging_profile_probe_bundle.mjs'",
    "'tools/check_calculation_version_staging_profile_probe_bundle.py'",
    "'docs/CRM_CALCULATION_VERSION_STAGING_PROFILE_PROBES_2026-07-16.md'",
    'node --check tools/create-calculation-version-staging-profile-probe-bundle.mjs',
    'node tools/test_create_calculation_version_staging_profile_probe_bundle.mjs',
    'python3 -m py_compile tools/check_calculation_version_staging_profile_probe_bundle.py',
    'python3 tools/check_calculation_version_staging_profile_probe_bundle.py',
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
    print('Calculation staging profile probe bundle checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('Calculation staging profile probes are manifest-bound, profile-only and production-locked.')
