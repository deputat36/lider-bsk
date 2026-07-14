#!/usr/bin/env python3

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / 'contracts' / 'design-task-staging-profile-probe-sql-bundle-v1.json'
GENERATOR = ROOT / 'tools' / 'create-design-task-staging-profile-probe-sql-bundle.mjs'
TEST = ROOT / 'tools' / 'test_create_design_task_staging_profile_probe_sql_bundle.mjs'
MANIFEST_VALIDATOR = ROOT / 'tools' / 'design-task-staging-auth-e2e-v2.mjs'
PERMISSIONS = ROOT / 'crm' / 'v4' / 'assets' / 'v4' / 'action-permissions-v1.js'
DOC = ROOT / 'docs' / 'CRM_DESIGN_TASK_STAGING_PROFILE_PROBE_SQL_BUNDLE_2026-07-14.md'
WORKFLOW = ROOT / '.github' / 'workflows' / 'crm-design-profile-probe-sql-bundle-check.yml'
GITIGNORE = ROOT / '.gitignore'
CONFIG = ROOT / 'supabase' / 'config.toml'

STAGING = 'otulfnouybahfnsycxqn'
PRODUCTION = 'ofewxuqfjhamgerwzull'
EXPECTED_PROBES = [
    {
        'name': 'forbidden_role',
        'profile_role': 'accountant',
        'profile_is_active': True,
        'runner_mode': 'forbidden_role',
        'expected_http': 403,
    },
    {
        'name': 'inactive_profile',
        'profile_role': 'manager',
        'profile_is_active': False,
        'runner_mode': 'inactive_profile',
        'expected_http': 403,
    },
    {
        'name': 'unknown_role',
        'profile_role': 'staging_unknown_probe',
        'profile_is_active': True,
        'runner_mode': 'unknown_role',
        'expected_http': 403,
    },
    {
        'name': 'restore_manager',
        'profile_role': 'manager',
        'profile_is_active': True,
        'runner_mode': None,
        'expected_http': None,
    },
]
EXPECTED_BUSINESS_COUNTS = [
    'leader_leads',
    'leader_orders',
    'leader_lead_needs',
    'leader_production_jobs',
    'leader_design_tasks',
    'leader_design_task_events',
    'leader_private.leader_command_receipts',
]

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


def parse_json(source: str, label: str):
    try:
        return json.loads(source) if source else {}
    except json.JSONDecodeError as exc:
        errors.append(f'{label} JSON invalid: {exc}')
        return {}


contract_text = read(CONTRACT, 'profile probe SQL bundle contract')
generator = read(GENERATOR, 'profile probe SQL generator')
test = read(TEST, 'profile probe SQL tests')
manifest_validator = read(MANIFEST_VALIDATOR, 'fixture manifest validator')
permissions = read(PERMISSIONS, 'canonical action permissions')
doc = read(DOC, 'profile probe SQL documentation')
workflow = read(WORKFLOW, 'profile probe SQL workflow')
gitignore = read(GITIGNORE, '.gitignore')
config = read(CONFIG, 'Supabase config')
contract = parse_json(contract_text, 'Profile probe SQL bundle contract')

if contract:
    if contract.get('contract_version') != 'leader-design-task-staging-profile-probe-sql-bundle-v1':
        errors.append('Profile probe SQL contract version drifted')
    environment = contract.get('environment') or {}
    if environment.get('project_ref') != STAGING:
        errors.append('Profile probe staging ref drifted')
    if environment.get('production_project_ref') != PRODUCTION:
        errors.append('Profile probe production ref drifted')
    if environment.get('production_enabled') is not False:
        errors.append('Profile probe SQL must remain production-disabled')
    if environment.get('exact_environment_guard_required') is not True:
        errors.append('Exact staging guard requirement missing')

    source_input = contract.get('input') or {}
    if source_input.get('manifest_version') != 'leader-design-task-staging-fixture-manifest-v1':
        errors.append('Profile probe manifest version drifted')
    if source_input.get('manifest_must_be_unexpired') is not True:
        errors.append('Profile probe manifest expiry gate missing')
    if source_input.get('auth_user_must_already_exist') is not True:
        errors.append('Profile probe Auth user pre-existence gate missing')
    if source_input.get('credentials_allowed') is not False:
        errors.append('Profile probe contract must forbid credentials')

    if contract.get('scripts') != EXPECTED_PROBES:
        errors.append('Profile probe sequence or role states drifted')

    sync = contract.get('canonical_permission_sync') or {}
    if sync.get('source') != 'crm/v4/assets/v4/action-permissions-v1.js':
        errors.append('Canonical permission source drifted')
    if sync.get('permission') != 'design.write':
        errors.append('Canonical permission drifted')
    if sync.get('allowed_control_role') != 'manager':
        errors.append('Control role drifted')
    if sync.get('forbidden_probe_role') != 'accountant':
        errors.append('Forbidden role probe drifted')
    if sync.get('checker_required') is not True:
        errors.append('Canonical sync checker gate missing')

    boundary = contract.get('database_boundary') or {}
    if boundary.get('allowed_update_tables') != ['public.leader_user_profiles']:
        errors.append('Allowed profile probe update table drifted')
    for key in [
        'insert_forbidden', 'delete_forbidden', 'upsert_forbidden', 'ddl_forbidden',
        'grants_and_policies_forbidden', 'rpc_execute_forbidden', 'auth_user_mutation_forbidden',
    ]:
        if boundary.get(key) is not True:
            errors.append(f'Profile probe boundary missing: {key}')
    if boundary.get('business_row_counts_must_not_change') != EXPECTED_BUSINESS_COUNTS:
        errors.append('Profile probe business-count boundary drifted')

    profile = contract.get('profile_boundary') or {}
    if profile.get('required_full_name') != 'Synthetic staging design E2E manager':
        errors.append('Synthetic profile identity marker drifted')
    if profile.get('required_email') is not None:
        errors.append('Synthetic profile email must remain null')
    if profile.get('restore_required_before_allowed_suite') is not True:
        errors.append('Restore-manager gate missing')

require(manifest_validator, [
    'export function validateFixtureManifest',
    'export function manifestDigest',
    'manifest_expired',
    'profile_auth_identity_mismatch',
], 'fixture manifest validator')

require(permissions, [
    "DESIGN_WRITE: 'design.write'",
    'export const CRM_V4_ROLE_ACTIONS',
    'manager: Object.freeze([',
    'accountant: Object.freeze([',
    'CRM_V4_ACTIONS.DESIGN_WRITE',
], 'canonical action permissions')

manager_match = re.search(
    r'manager:\s*Object\.freeze\(\[(.*?)\]\),\s*accountant:',
    permissions,
    flags=re.S,
)
accountant_match = re.search(
    r'accountant:\s*Object\.freeze\(\[(.*?)\]\),\s*designer:',
    permissions,
    flags=re.S,
)
if not manager_match or 'CRM_V4_ACTIONS.DESIGN_WRITE' not in manager_match.group(1):
    errors.append('Canonical manager must retain design.write')
if not accountant_match or 'CRM_V4_ACTIONS.DESIGN_WRITE' in accountant_match.group(1):
    errors.append('Canonical accountant must remain forbidden for design.write')
if re.search(r'^\s*staging_unknown_probe\s*:', permissions, flags=re.M):
    errors.append('Unknown probe role must not become canonical')

require(generator, [
    "PROFILE_PROBE_SQL_BUNDLE_VERSION = 'leader-design-task-staging-profile-probe-sql-bundle-v1'",
    "DEFAULT_OUTPUT_DIR = 'artifacts/design-task-staging-profile-probes'",
    'export const PROFILE_PROBES',
    "role: 'accountant'",
    "role: 'manager'",
    "role: 'staging_unknown_probe'",
    'buildProfileProbeSql',
    'buildProfileProbeSqlBundle',
    'validateFixtureManifest',
    'manifestDigest',
    'sqlLiteral',
    'from leader_staging.environment_guard',
    "project_ref = '${STAGING_PROJECT_REF}'",
    "repository = 'deputat36/lider-bsk'",
    'from auth.users',
    'email_confirmed_at is not null',
    "full_name = 'Synthetic staging design E2E manager'",
    'update public.leader_user_profiles',
    "permissions = '{}'::jsonb",
    'profile_probe_business_state_changed',
    'business_rows_mutated',
    'mode: 0o600',
], 'profile probe SQL generator')

for forbidden in [
    'insert into auth.users',
    'update auth.users',
    'delete from auth.users',
    'insert into public.leader_design_tasks',
    'delete from public.leader_design_tasks',
    'SUPABASE_SERVICE_ROLE_KEY',
    'sb_secret_',
    '/auth/v1/',
    '/functions/v1/',
    '/rest/v1/',
    'fetch(',
]:
    if forbidden.lower() in generator.lower():
        errors.append(f'Profile probe generator contains forbidden marker: {forbidden}')
if PRODUCTION in generator:
    errors.append('Production ref must not appear in profile probe generator source')

require(test, [
    'buildProfileProbeSqlBundle',
    "'forbidden_role', 'inactive_profile', 'unknown_role', 'restore_manager'",
    "role: 'accountant'",
    "role: 'staging_unknown_probe'",
    'profile_probe_business_state_changed',
    'assert.doesNotMatch(sql, /insert\\s+into/i)',
    'assert.doesNotMatch(sql, /delete\\s+from/i)',
    "profile-''quoted''; select 1",
    'manifest_expired',
    'profile_auth_identity_mismatch',
    'business-state preserving and production-locked',
], 'profile probe SQL tests')

require(doc, [
    STAGING,
    PRODUCTION,
    'forbidden_role',
    'inactive_profile',
    'unknown_role',
    'restore_manager',
    'action-permissions-v1.js',
    'не создаёт Auth user',
    'не выполняет SQL',
    'Production boundary',
], 'profile probe SQL documentation')

require(workflow, [
    'CRM design staging profile probe SQL bundle check',
    'python3 -m json.tool contracts/design-task-staging-profile-probe-sql-bundle-v1.json',
    'node --check tools/create-design-task-staging-profile-probe-sql-bundle.mjs',
    'node tools/test_create_design_task_staging_profile_probe_sql_bundle.mjs',
    'python3 tools/check_design_task_staging_profile_probe_sql_bundle.py',
    'forbidden-role.sql',
    'inactive-profile.sql',
    'unknown-role.sql',
    'restore-manager.sql',
], 'profile probe SQL workflow')

for ignored in [
    '/artifacts/design-task-staging-profile-probes/',
    '/artifacts/design-task-staging-profile-probe-sql-bundle.json',
]:
    if ignored not in gitignore:
        errors.append(f'Generated profile probe artifact must be ignored: {ignored}')

if f'project_id = "{PRODUCTION}"' not in config:
    errors.append('supabase/config.toml must continue to point to production')
if STAGING in config:
    errors.append('Staging ref must not replace production Supabase config')

secret_patterns = [
    r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}',
    r'sb_secret_[A-Za-z0-9_-]{10,}',
    r'(?i)Bearer\s+[A-Za-z0-9._-]{20,}',
    r'(?i)[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}',
]
for path, source in [
    (CONTRACT, contract_text),
    (GENERATOR, generator),
    (TEST, test),
    (DOC, doc),
    (WORKFLOW, workflow),
]:
    for pattern in secret_patterns:
        if re.search(pattern, source):
            errors.append(f'{path.relative_to(ROOT)} contains possible credential or email material')

if errors:
    print('Staging profile probe SQL bundle checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('Staging profile probe SQL bundle is canonical-role-synced, manifest-bound, business-state preserving and production-locked.')
