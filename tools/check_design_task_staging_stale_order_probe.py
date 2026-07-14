#!/usr/bin/env python3

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / 'contracts' / 'design-task-staging-stale-order-probe-v1.json'
SQL_GENERATOR = ROOT / 'tools' / 'create-design-task-staging-stale-order-sql-bundle.mjs'
RUNNER = ROOT / 'tools' / 'design-task-staging-stale-order-e2e-v1.mjs'
VALIDATOR = ROOT / 'tools' / 'validate-design-task-staging-stale-order-evidence.mjs'
LAUNCHER = ROOT / 'tools' / 'run_design_task_staging_stale_order_e2e.ps1'
SQL_TEST = ROOT / 'tools' / 'test_create_design_task_staging_stale_order_sql_bundle.mjs'
HTTP_TEST = ROOT / 'tools' / 'test_design_task_staging_stale_order_e2e_v1.mjs'
DOC = ROOT / 'docs' / 'CRM_DESIGN_TASK_STAGING_STALE_ORDER_PROBE_2026-07-14.md'
WORKFLOW = ROOT / '.github' / 'workflows' / 'crm-design-stale-order-probe-check.yml'
GITIGNORE = ROOT / '.gitignore'
PERMISSIONS = ROOT / 'crm' / 'v4' / 'assets' / 'v4' / 'action-permissions-v1.js'
CONFIG = ROOT / 'supabase' / 'config.toml'

STAGING = 'otulfnouybahfnsycxqn'
PRODUCTION = 'ofewxuqfjhamgerwzull'
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


contract_text = read(CONTRACT, 'stale-order contract')
sql_generator = read(SQL_GENERATOR, 'stale-order SQL generator')
runner = read(RUNNER, 'stale-order runner')
validator = read(VALIDATOR, 'stale-order evidence validator')
launcher = read(LAUNCHER, 'stale-order launcher')
sql_test = read(SQL_TEST, 'stale-order SQL tests')
http_test = read(HTTP_TEST, 'stale-order HTTP tests')
doc = read(DOC, 'stale-order documentation')
workflow = read(WORKFLOW, 'stale-order workflow')
gitignore = read(GITIGNORE, '.gitignore')
permissions = read(PERMISSIONS, 'canonical action permissions')
config = read(CONFIG, 'Supabase config')
contract = parse_json(contract_text, 'Stale-order contract')

if contract:
    if contract.get('contract_version') != 'leader-design-task-staging-stale-order-probe-v1':
        errors.append('Stale-order contract version drifted')
    environment = contract.get('environment') or {}
    if environment.get('project_ref') != STAGING:
        errors.append('Stale-order staging ref drifted')
    if environment.get('production_project_ref') != PRODUCTION:
        errors.append('Stale-order production ref drifted')
    if environment.get('production_enabled') is not False:
        errors.append('Stale-order contract must remain production-disabled')
    if environment.get('exact_environment_guard_required') is not True:
        errors.append('Exact staging guard requirement missing')

    source_input = contract.get('input') or {}
    if source_input.get('fixture_manifest_version') != 'leader-design-task-staging-fixture-manifest-v1':
        errors.append('Fixture manifest version drifted')
    for key in [
        'manifest_required', 'manifest_must_be_unexpired',
        'auth_user_must_already_exist', 'auth_user_must_be_email_confirmed',
        'profile_user_id_must_equal_auth_user_id',
    ]:
        if source_input.get(key) is not True:
            errors.append(f'Stale-order input gate missing: {key}')
    if source_input.get('credentials_allowed_in_manifest') is not False:
        errors.append('Credentials must remain forbidden in manifest')

    sync = contract.get('canonical_permission_sync') or {}
    if sync.get('source') != 'crm/v4/assets/v4/action-permissions-v1.js':
        errors.append('Canonical permission source drifted')
    if sync.get('permission') != 'design.write' or sync.get('required_role') != 'manager':
        errors.append('Canonical design.write manager mapping drifted')
    if sync.get('checker_required') is not True:
        errors.append('Canonical permission checker gate missing')

    transition = contract.get('transition_sql') or {}
    if transition.get('bundle_version') != 'leader-design-task-staging-stale-order-sql-bundle-v1':
        errors.append('Stale-order SQL bundle version drifted')
    scripts = transition.get('scripts') or []
    expected_scripts = [
        ('stale_order', 'stale-order.sql'),
        ('restore_order_version', 'restore-order-version.sql'),
    ]
    if [(item.get('name'), item.get('output')) for item in scripts] != expected_scripts:
        errors.append('Stale-order SQL transition sequence drifted')
    for item in scripts:
        if item.get('allowed_update_table') != 'public.leader_orders':
            errors.append('Stale-order SQL may only update public.leader_orders')
        if item.get('allowed_update_columns') != ['updated_at']:
            errors.append('Stale-order SQL may only update updated_at')
    for key in [
        'insert_forbidden', 'delete_forbidden', 'upsert_forbidden', 'ddl_forbidden',
        'grants_and_policies_forbidden', 'rpc_execute_forbidden',
        'auth_user_mutation_forbidden', 'non_version_order_fields_must_not_change',
        'scoped_business_counts_must_not_change', 'requires_zero_tasks_events_receipts',
    ]:
        if transition.get(key) is not True:
            errors.append(f'Stale-order SQL boundary missing: {key}')

    http_probe = contract.get('http_probe') or {}
    expected_http = {
        'runner_version': 'leader-design-task-staging-stale-order-runner-v1',
        'evidence_version': 'leader-design-task-staging-stale-order-evidence-v1',
        'function_slug': 'leader-crm-design',
        'request_action': 'design_task.create_from_order',
        'idempotency_key_suffix': '-stale-order',
        'expected_http': 409,
        'expected_error_code': 'conflict',
        'expected_task_count': 0,
    }
    for key, value in expected_http.items():
        if http_probe.get(key) != value:
            errors.append(f'Stale-order HTTP contract drifted: {key}')
    if http_probe.get('safe_read_tables') != ['leader_orders', 'leader_design_tasks']:
        errors.append('Safe-read table allowlist drifted')
    for key in ['direct_rpc_forbidden', 'browser_write_forbidden', 'service_role_forbidden', 'logout_required']:
        if http_probe.get(key) is not True:
            errors.append(f'Stale-order HTTP boundary missing: {key}')

    evidence = contract.get('evidence') or {}
    expected_steps = [
        'fixture_manifest', 'authenticate', 'auth_user', 'safe_read_stale_version',
        'stale_order', 'safe_read_no_task', 'logout_current_session',
    ]
    if evidence.get('exact_step_order') != expected_steps:
        errors.append('Stale-order evidence step order drifted')
    for key in [
        'independent_validator_required', 'manifest_digest_check', 'credentials_forbidden',
        'production_ref_forbidden', 'cleanup_required', 'restore_order_version_required',
    ]:
        if evidence.get(key) is not True:
            errors.append(f'Stale-order evidence gate missing: {key}')

require(permissions, [
    "DESIGN_WRITE: 'design.write'",
    'manager: Object.freeze([',
    'CRM_V4_ACTIONS.DESIGN_WRITE',
], 'canonical action permissions')
manager_match = re.search(
    r'manager:\s*Object\.freeze\(\[(.*?)\]\),\s*accountant:',
    permissions,
    flags=re.S,
)
if not manager_match or 'CRM_V4_ACTIONS.DESIGN_WRITE' not in manager_match.group(1):
    errors.append('Canonical manager must retain design.write')

require(sql_generator, [
    "STALE_ORDER_SQL_BUNDLE_VERSION = 'leader-design-task-staging-stale-order-sql-bundle-v1'",
    "DEFAULT_OUTPUT_DIR = 'artifacts/design-task-staging-stale-order'",
    'stale_order: Object.freeze({',
    'restore_order_version: Object.freeze({',
    'buildStaleOrderTransitionSql',
    'buildStaleOrderSqlBundle',
    'validateFixtureManifest',
    'manifestDigest',
    'from leader_staging.environment_guard',
    "repository = 'deputat36/lider-bsk'",
    'from auth.users',
    'email_confirmed_at is not null',
    "role = 'manager'",
    'stale_order_probe_requires_clean_baseline',
    "to_jsonb(source_order) - 'updated_at'",
    'update public.leader_orders',
    'set updated_at =',
    'stale_order_non_version_fields_changed',
    'stale_order_business_counts_changed',
    'mode: 0o600',
], 'stale-order SQL generator')

for forbidden in [
    'insert into auth.users', 'update auth.users', 'delete from auth.users',
    'insert into public.leader_design_tasks', 'delete from public.leader_design_tasks',
    'SUPABASE_SERVICE_ROLE_KEY', 'sb_secret_', '/auth/v1/', '/functions/v1/',
    '/rest/v1/', 'fetch(',
]:
    if forbidden.lower() in sql_generator.lower():
        errors.append(f'Stale-order SQL generator contains forbidden marker: {forbidden}')
if PRODUCTION in sql_generator:
    errors.append('Production ref must not appear in stale-order SQL generator')

require(runner, [
    "STALE_ORDER_RUNNER_VERSION = 'leader-design-task-staging-stale-order-runner-v1'",
    "STALE_ORDER_EVIDENCE_VERSION = 'leader-design-task-staging-stale-order-evidence-v1'",
    "STALE_ORDER_MODE = 'stale_order'",
    "STALE_ORDER_KEY_SUFFIX = '-stale-order'",
    'authenticate', 'verifyAuthenticatedUser', 'safeRead', 'invokeDesignEdge',
    'logoutCurrentSession',
    "'leader_orders'",
    "'leader_design_tasks'",
    "invokeDesignEdge(fetchImpl, config, session.accessToken, command, 409)",
    "result.body.error?.code === 'conflict'",
    'stale_order_created_task',
    'restore_order_version_required: true',
    'sanitizeEvidence',
    'mode: 0o600',
], 'stale-order runner')
if 'service_role' in runner.lower() or 'SUPABASE_SERVICE_ROLE_KEY' in runner:
    errors.append('Stale-order runner must not use service-role credentials')
if PRODUCTION in runner:
    errors.append('Production ref must not appear in stale-order runner source')

require(validator, [
    'STALE_ORDER_STEP_ORDER',
    "'fixture_manifest'",
    "'safe_read_stale_version'",
    "'stale_order'",
    "'safe_read_no_task'",
    "'logout_current_session'",
    'manifestDigest(manifest)',
    "requireStep(stepMap.get('stale_order'), 409, errors)",
    "responseError?.code !== 'conflict'",
    "noTaskCounts.design_tasks !== 0",
    'scanForbidden(evidence',
], 'stale-order evidence validator')

require(launcher, [
    "[ValidateSet('plan', 'stale_order')]",
    "https://otulfnouybahfnsycxqn.supabase.co",
    "ProductionRef = 'ofewxuqfjhamgerwzull'",
    'Read-Host',
    '-AsSecureString',
    'STAGING_FIXTURE_MANIFEST_PATH',
    'STAGING_EVIDENCE_PATH',
    'validate-design-task-staging-stale-order-evidence.mjs',
    "Remove-Item \"Env:$name\"",
], 'stale-order PowerShell launcher')
if 'SUPABASE_SERVICE_ROLE_KEY' in launcher or 'service role' in launcher.lower():
    errors.append('Stale-order launcher must not request service-role credentials')

require(sql_test, [
    'buildStaleOrderSqlBundle',
    "['stale_order', 'restore_order_version']",
    'stale_order_non_version_fields_changed',
    'stale_order_business_counts_changed',
    'assert.doesNotMatch(sql, /insert\\s+into/i)',
    'assert.doesNotMatch(sql, /delete\\s+from/i)',
    'manifest_expired',
    'profile_auth_identity_mismatch',
], 'stale-order SQL tests')

require(http_test, [
    'runStaleOrderProbe',
    'validateStaleOrderEvidence',
    "'/functions/v1/leader-crm-design'",
    'edgeStatus = 409',
    "errorCode = 'conflict'",
    'taskCountAfter: 1',
    'order_version_not_stale',
    'logout_current_session',
    'includes(SECRET.password), false',
], 'stale-order HTTP tests')

require(doc, [
    STAGING, PRODUCTION,
    'stale-order.sql',
    'restore-order-version.sql',
    'HTTP `409`',
    '`error.code=conflict`',
    'restore_order_version_required=true',
    'Source tests не являются заменой реального authenticated evidence',
    'Production boundary',
], 'stale-order documentation')

require(workflow, [
    'CRM design staging stale-order probe check',
    'python3 -m json.tool contracts/design-task-staging-stale-order-probe-v1.json',
    'node --check tools/create-design-task-staging-stale-order-sql-bundle.mjs',
    'node tools/test_create_design_task_staging_stale_order_sql_bundle.mjs',
    'node tools/test_design_task_staging_stale_order_e2e_v1.mjs',
    'python3 tools/check_design_task_staging_stale_order_probe.py',
    'stale-order.sql',
    'restore-order-version.sql',
], 'stale-order workflow')

for ignored in [
    '/artifacts/design-task-staging-stale-order/',
    '/artifacts/design-task-staging-stale-order-sql-bundle.json',
    '/artifacts/design-task-staging-stale-order-evidence.json',
]:
    if ignored not in gitignore:
        errors.append(f'Generated stale-order artifact must be ignored: {ignored}')

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
    (CONTRACT, contract_text), (SQL_GENERATOR, sql_generator), (RUNNER, runner),
    (VALIDATOR, validator), (LAUNCHER, launcher), (SQL_TEST, sql_test),
    (HTTP_TEST, http_test), (DOC, doc), (WORKFLOW, workflow),
]:
    for pattern in secret_patterns:
        if re.search(pattern, source):
            errors.append(f'{path.relative_to(ROOT)} contains possible credential or email material')

if errors:
    print('Staging stale-order probe checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('Staging stale-order probe is manifest-bound, 409-specific, task-free, restorable and production-locked.')
