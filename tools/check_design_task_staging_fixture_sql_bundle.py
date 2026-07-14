#!/usr/bin/env python3

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / 'contracts' / 'design-task-staging-fixture-sql-bundle-v1.json'
GENERATOR = ROOT / 'tools' / 'create-design-task-staging-fixture-sql-bundle.mjs'
TEST = ROOT / 'tools' / 'test_create_design_task_staging_fixture_sql_bundle.mjs'
MANIFEST_GENERATOR = ROOT / 'tools' / 'create-design-task-staging-fixture-manifest.mjs'
MANIFEST_VALIDATOR = ROOT / 'tools' / 'design-task-staging-auth-e2e-v2.mjs'
DOC = ROOT / 'docs' / 'CRM_DESIGN_TASK_STAGING_FIXTURE_SQL_BUNDLE_2026-07-14.md'
WORKFLOW = ROOT / '.github' / 'workflows' / 'crm-design-fixture-sql-bundle-check.yml'
GITIGNORE = ROOT / '.gitignore'
CONFIG = ROOT / 'supabase' / 'config.toml'

STAGING = 'otulfnouybahfnsycxqn'
PRODUCTION = 'ofewxuqfjhamgerwzull'
EXPECTED_INSERTS = [
    'public.leader_user_profiles',
    'public.leader_leads',
    'public.leader_orders',
    'public.leader_lead_needs',
]
EXPECTED_CLEANUP = [
    'receipt', 'design_event', 'design_task', 'production_job',
    'need', 'order', 'lead', 'profile',
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


def forbid(source: str, markers, label: str) -> None:
    for marker in markers:
        if marker in source:
            errors.append(f'{label}: forbidden marker {marker!r}')


contract_text = read(CONTRACT, 'fixture SQL bundle contract')
generator = read(GENERATOR, 'fixture SQL generator')
test = read(TEST, 'fixture SQL generator tests')
manifest_generator = read(MANIFEST_GENERATOR, 'fixture manifest generator')
manifest_validator = read(MANIFEST_VALIDATOR, 'fixture manifest validator')
doc = read(DOC, 'fixture SQL bundle documentation')
workflow = read(WORKFLOW, 'fixture SQL bundle workflow')
gitignore = read(GITIGNORE, '.gitignore')
config = read(CONFIG, 'Supabase config')

try:
    contract = json.loads(contract_text) if contract_text else {}
except json.JSONDecodeError as exc:
    errors.append(f'Fixture SQL bundle contract JSON invalid: {exc}')
    contract = {}

if contract:
    if contract.get('contract_version') != 'leader-design-task-staging-fixture-sql-bundle-v1':
        errors.append('Fixture SQL bundle contract version drifted')
    environment = contract.get('environment') or {}
    if environment.get('project_ref') != STAGING:
        errors.append('Fixture SQL bundle staging ref drifted')
    if environment.get('production_project_ref') != PRODUCTION:
        errors.append('Fixture SQL bundle production ref drifted')
    if environment.get('production_enabled') is not False:
        errors.append('Fixture SQL bundle must remain production-disabled')
    if environment.get('exact_environment_guard_required') is not True:
        errors.append('Exact staging guard must remain required')

    source_input = contract.get('input') or {}
    if source_input.get('manifest_version') != 'leader-design-task-staging-fixture-manifest-v1':
        errors.append('Fixture manifest version drifted')
    if source_input.get('auth_user_must_already_exist') is not True:
        errors.append('Auth user pre-existence gate missing')
    if source_input.get('credentials_allowed') is not False:
        errors.append('Credentials must remain forbidden')

    seed = contract.get('seed') or {}
    if seed.get('allowed_inserts') != EXPECTED_INSERTS:
        errors.append('Allowed seed inserts drifted')
    if seed.get('transaction_required') is not True:
        errors.append('Seed transaction requirement missing')
    if seed.get('environment_guard_first') is not True:
        errors.append('Seed environment guard requirement missing')
    if seed.get('auth_user_exists_guard_required') is not True:
        errors.append('Seed Auth user guard missing')
    if seed.get('profile', {}).get('role') != 'manager':
        errors.append('Synthetic profile role drifted')
    if seed.get('profile', {}).get('email') is not None:
        errors.append('Synthetic profile email must remain null')

    cleanup = contract.get('cleanup') or {}
    if cleanup.get('delete_order') != EXPECTED_CLEANUP:
        errors.append('Cleanup order drifted')
    if cleanup.get('auth_user_delete_by_sql_forbidden') is not True:
        errors.append('Auth user SQL-delete prohibition missing')
    if cleanup.get('auth_user_deleted_externally_last') is not True:
        errors.append('External Auth user cleanup-last gate missing')

    execution = contract.get('execution') or {}
    if execution.get('generator_performs_network_calls') is not False:
        errors.append('Generator network boundary drifted')
    if execution.get('generator_executes_sql') is not False:
        errors.append('Generator SQL execution boundary drifted')
    if execution.get('post_cleanup_snapshot_validator_required') is not True:
        errors.append('Post-cleanup snapshot gate missing')

require(manifest_generator, [
    'buildFixtureManifest',
    'FIXTURE_MANIFEST_VERSION',
    'contains_credentials: false',
], 'existing fixture manifest generator')

require(manifest_validator, [
    'export function validateFixtureManifest',
    'export function manifestDigest',
    'manifest_expired',
    'profile_auth_identity_mismatch',
    'forbidden_manifest_key',
], 'existing fixture manifest validator')

require(generator, [
    "SQL_BUNDLE_VERSION = 'leader-design-task-staging-fixture-sql-bundle-v1'",
    "DEFAULT_SEED_PATH = 'artifacts/design-task-staging-fixture-seed.sql'",
    "DEFAULT_CLEANUP_PATH = 'artifacts/design-task-staging-fixture-cleanup.sql'",
    "DEFAULT_SUMMARY_PATH = 'artifacts/design-task-staging-fixture-sql-bundle.json'",
    'validateFixtureManifest',
    'manifestDigest',
    'sqlLiteral',
    'buildSeedSql',
    'buildCleanupSql',
    'buildSqlBundle',
    "from leader_staging.environment_guard",
    "project_ref = '${STAGING_PROJECT_REF}'",
    "repository = 'deputat36/lider-bsk'",
    "from auth.users",
    "email_confirmed_at is not null",
    "raise exception 'confirmed_staging_auth_user_required'",
    "raise exception 'fixture_collision_detected'",
    'insert into public.leader_user_profiles',
    'insert into public.leader_leads',
    'insert into public.leader_orders',
    'insert into public.leader_lead_needs',
    'delete from leader_private.leader_command_receipts',
    'delete from public.leader_design_task_events',
    'delete from public.leader_design_tasks',
    'delete from public.leader_production_jobs',
    'delete from public.leader_lead_needs',
    'delete from public.leader_orders',
    'delete from public.leader_leads',
    'delete from public.leader_user_profiles',
    "auth_user_created_by_sql', false",
    "auth_user_delete_required', true",
    "post_cleanup_snapshot_required', true",
    'mode: 0o600',
], 'fixture SQL generator')

for forbidden in [
    'insert into auth.users',
    'delete from auth.users',
    'insert into public.leader_design_tasks',
    'insert into public.leader_design_task_events',
    'insert into leader_private.leader_command_receipts',
    'SUPABASE_SERVICE_ROLE_KEY',
    'sb_secret_',
    '/auth/v1/',
    '/functions/v1/',
    '/rest/v1/',
    'fetch(',
]:
    if forbidden.lower() in generator.lower():
        errors.append(f'Fixture SQL generator contains forbidden boundary marker: {forbidden}')

if PRODUCTION in generator:
    errors.append('Production project ref must not appear in generated SQL source')

require(test, [
    'buildSqlBundle',
    'buildSeedSql',
    'buildCleanupSql',
    "assert.doesNotMatch(seed, /insert into auth\\.users/i)",
    "assert.doesNotMatch(cleanup, /delete from auth\\.users/i)",
    "fixture-''quoted''; select 1",
    'manifest_expired',
    'profile_auth_identity_mismatch',
    'forbidden_manifest_key',
    'never mutates auth.users',
], 'fixture SQL generator tests')

require(doc, [
    STAGING,
    PRODUCTION,
    'fixture SQL bundle',
    'подтверждённого Auth user',
    'не создаёт строк в `auth.users`',
    'Seed SQL',
    'Cleanup SQL',
    'delete from auth.users',
    'Post-cleanup',
    'Production boundary',
], 'fixture SQL bundle documentation')

require(workflow, [
    'CRM design staging fixture SQL bundle check',
    'python3 -m json.tool contracts/design-task-staging-fixture-sql-bundle-v1.json',
    'node --check tools/create-design-task-staging-fixture-sql-bundle.mjs',
    'node tools/test_create_design_task_staging_fixture_sql_bundle.mjs',
    'python3 tools/check_design_task_staging_fixture_sql_bundle.py',
    'design-task-staging-fixture-seed.sql',
    'design-task-staging-fixture-cleanup.sql',
], 'fixture SQL bundle workflow')

for ignored in [
    '/artifacts/design-task-staging-fixture-seed.sql',
    '/artifacts/design-task-staging-fixture-cleanup.sql',
    '/artifacts/design-task-staging-fixture-sql-bundle.json',
]:
    if ignored not in gitignore:
        errors.append(f'Generated fixture artifact must be ignored: {ignored}')

if f'project_id = "{PRODUCTION}"' not in config:
    errors.append('supabase/config.toml must continue to point to production')
if STAGING in config:
    errors.append('Staging ref must not replace production config')

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
    print('Staging fixture SQL bundle checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('Staging fixture SQL bundle is manifest-bound, transaction-safe, credential-free and production-locked.')
