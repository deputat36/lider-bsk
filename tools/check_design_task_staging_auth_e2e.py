#!/usr/bin/env python3

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / 'contracts' / 'design-task-staging-auth-e2e-v1.json'
READ_CONTRACT = ROOT / 'contracts' / 'design-task-staging-read-path-v1.json'
RUNNER = ROOT / 'tools' / 'design-task-staging-auth-e2e.mjs'
TEST = ROOT / 'tools' / 'test_design_task_staging_auth_e2e.mjs'
POWERSHELL = ROOT / 'tools' / 'run_design_task_staging_auth_e2e.ps1'
PREVIEW = ROOT / 'crm' / 'v4' / 'assets' / 'v4' / 'design-task-draft-preview-v1.js'
TRANSPORT = ROOT / 'crm' / 'v4' / 'assets' / 'v4' / 'design-task-staging-transport-v1.js'
CONFIG = ROOT / 'supabase' / 'config.toml'
DOC = ROOT / 'docs' / 'CRM_DESIGN_TASK_STAGING_AUTH_E2E_OPERATOR_KIT_2026-07-14.md'
RUNBOOK = ROOT / 'docs' / 'CRM_DESIGN_TASK_STAGING_TRANSPORT_RUNBOOK_2026-07-14.md'
WORKFLOW = ROOT / '.github' / 'workflows' / 'crm-design-auth-e2e-kit-check.yml'

STAGING = 'otulfnouybahfnsycxqn'
PRODUCTION = 'ofewxuqfjhamgerwzull'
EXPECTED_PROJECTIONS = {
    'leader_orders': [
        'id', 'order_number', 'lead_id', 'project_name', 'status', 'priority',
        'deadline', 'layout_status', 'layout_link', 'is_archived', 'updated_at',
    ],
    'leader_lead_needs': [
        'id', 'lead_id', 'need_type', 'title', 'need_design', 'design_reason',
        'deadline_date', 'status', 'completeness_score',
    ],
    'leader_design_tasks': [
        'id', 'order_id', 'task_status', 'layout_status', 'designer_name',
        'deadline', 'layout_link', 'created_at', 'updated_at',
    ],
}

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


def preview_fields(source: str, constant: str):
    match = re.search(rf"const\s+{re.escape(constant)}\s*=\s*'([^']+)'", source)
    return match.group(1).split(',') if match else []


contract_text = read(CONTRACT, 'authenticated E2E contract')
read_contract_text = read(READ_CONTRACT, 'staging read-path contract')
runner = read(RUNNER, 'authenticated E2E runner')
test = read(TEST, 'authenticated E2E behavior test')
powershell = read(POWERSHELL, 'PowerShell launcher')
preview = read(PREVIEW, 'design preview')
transport = read(TRANSPORT, 'staging transport')
config = read(CONFIG, 'Supabase config')
doc = read(DOC, 'operator kit documentation')
runbook = read(RUNBOOK, 'staging transport runbook')
workflow = read(WORKFLOW, 'authenticated E2E workflow')

try:
    contract = json.loads(contract_text) if contract_text else {}
except json.JSONDecodeError as exc:
    errors.append(f'Authenticated E2E contract JSON is invalid: {exc}')
    contract = {}

try:
    read_contract = json.loads(read_contract_text) if read_contract_text else {}
except json.JSONDecodeError as exc:
    errors.append(f'Read-path contract JSON is invalid: {exc}')
    read_contract = {}

if contract:
    if contract.get('contract_version') != 'leader-design-task-staging-auth-e2e-v1':
        errors.append('Authenticated E2E contract version drifted')
    environment = contract.get('environment') or {}
    if environment.get('project_ref') != STAGING:
        errors.append('Authenticated E2E staging project ref drifted')
    if environment.get('supabase_url') != f'https://{STAGING}.supabase.co':
        errors.append('Authenticated E2E exact staging URL drifted')
    if environment.get('production_project_ref') != PRODUCTION:
        errors.append('Authenticated E2E production ref drifted')
    if environment.get('production_enabled') is not False:
        errors.append('Authenticated E2E must remain disabled for production')
    if environment.get('exact_environment_guard_required') is not True:
        errors.append('Authenticated E2E exact environment guard is required')

    network = contract.get('network_allowlist') or {}
    if network.get('edge_function') != '/functions/v1/leader-crm-design':
        errors.append('Edge Function allowlist drifted')
    if network.get('read_tables') != list(EXPECTED_PROJECTIONS):
        errors.append('Read-table allowlist drifted')
    if contract.get('safe_read_projections') != EXPECTED_PROJECTIONS:
        errors.append('Authenticated E2E safe projections drifted')

    suite = contract.get('allowed_suite') or {}
    expected_steps = [
        'authenticate', 'safe_read_before', 'create', 'exact_replay',
        'same_key_modified_payload', 'new_key_active_task',
        'safe_read_after', 'logout_current_session',
    ]
    actual_steps = [step.get('name') for step in suite.get('steps') or []]
    if actual_steps != expected_steps:
        errors.append(f'Allowed suite steps drifted: {actual_steps!r}')

    evidence = contract.get('evidence') or {}
    if evidence.get('format') != 'leader-design-task-staging-auth-e2e-evidence-v1':
        errors.append('Evidence version drifted')
    cleanup = contract.get('cleanup') or {}
    if cleanup.get('runner_deletes_auth_user') is not False:
        errors.append('Runner must not delete Auth users')
    if cleanup.get('runner_deletes_database_fixtures') is not False:
        errors.append('Runner must not delete database fixtures')

if read_contract:
    source_projections = read_contract.get('read_projections') or {}
    normalized = {key.replace('public.', ''): value for key, value in source_projections.items()}
    allowed_read_path_extras = {'leader_lead_needs': {'created_at'}}
    for table, expected in EXPECTED_PROJECTIONS.items():
        granted = normalized.get(table) or []
        if not set(expected).issubset(granted):
            errors.append(f'Authenticated E2E projection exceeds staging read-path grant: {table}')
        extras = set(granted) - set(expected)
        if extras != allowed_read_path_extras.get(table, set()):
            errors.append(f'Unexpected staging read-path projection extras for {table}: {sorted(extras)!r}')

for table, constant in {
    'leader_orders': 'ORDER_FIELDS',
    'leader_lead_needs': 'NEED_FIELDS',
    'leader_design_tasks': 'TASK_FIELDS',
}.items():
    if preview_fields(preview, constant) != EXPECTED_PROJECTIONS[table]:
        errors.append(f'Authenticated E2E projection drifted from preview: {table}')

require(runner, [
    f"STAGING_PROJECT_REF = '{STAGING}'",
    f"STAGING_URL = `https://${{STAGING_PROJECT_REF}}.supabase.co`",
    f"PRODUCTION_PROJECT_REF = '{PRODUCTION}'",
    "FUNCTION_SLUG = 'leader-crm-design'",
    "ACTION = 'design_task.create_from_order'",
    "EVIDENCE_VERSION = 'leader-design-task-staging-auth-e2e-evidence-v1'",
    'assertExactStagingUrl',
    'STAGING_SUPABASE_PUBLISHABLE_KEY',
    'STAGING_TEST_EMAIL',
    'STAGING_TEST_PASSWORD',
    '/auth/v1/token?grant_type=password',
    '/auth/v1/user',
    '/auth/v1/logout',
    '/functions/v1/${FUNCTION_SLUG}',
    'runAllowedSuite',
    'runDeniedProbe',
    'same_key_modified_payload',
    'new_key_active_task',
    'safe_read_after',
    'sanitizeEvidence',
    "mode: 'create_replay_conflicts'",
    'cleanup_required: true',
    'mode: 0o600',
], 'authenticated E2E runner')
forbid(runner, [
    'SUPABASE_SERVICE_ROLE_KEY',
    '/rest/v1/rpc/leader_create_design_task_from_order_rpc',
    '/rest/v1/leader_command_receipts',
    '.insert(', '.update(', '.upsert(', '.delete(',
], 'authenticated E2E runner boundary')

require(transport, [
    f"STAGING_PROJECT_REF = '{STAGING}'",
    "FUNCTION_SLUG = 'leader-crm-design'",
    "ACTION = 'design_task.create_from_order'",
], 'existing staging transport')

require(test, [
    'FakeResponse',
    'allowedSuiteFetch',
    'deniedProbeFetch',
    'create_replay_conflicts',
    'same_key_modified_payload',
    'new_key_active_task',
    'safe_read_after',
    'secret leaked',
    'client_phone',
    'contractor_cost',
    'Authenticated staging design-task E2E operator runner is environment-locked, replay-aware and secret-safe.',
], 'authenticated E2E behavior test')

require(powershell, [
    "ValidateSet('plan', 'create_replay_conflicts', 'forbidden_role', 'inactive_profile', 'unknown_role')",
    f"$StagingUrl = 'https://{STAGING}.supabase.co'",
    f"$ProductionRef = '{PRODUCTION}'",
    "Read-Host 'Staging publishable key' -AsSecureString",
    "Read-Host 'Temporary staging Auth password' -AsSecureString",
    'ConvertFrom-SecureValue',
    'Remove-Item "Env:$name"',
    "tools/design-task-staging-auth-e2e-v2.mjs",
    "tools/validate-design-task-staging-auth-e2e-evidence.mjs",
    'STAGING_FIXTURE_MANIFEST_PATH',
    'node $Runner',
    'node $Validator',
], 'PowerShell launcher')
forbid(powershell, [
    'node tools/design-task-staging-auth-e2e.mjs',
    'SUPABASE_SERVICE_ROLE_KEY',
    'service_role',
], 'PowerShell launcher boundary')

if f'project_id = "{PRODUCTION}"' not in config:
    errors.append('supabase/config.toml must continue to identify production')
if STAGING in config:
    errors.append('Staging project ref must not replace standard Supabase config')

require(doc, [
    STAGING, PRODUCTION, 'source-only операторский kit',
    'не предоставляет безопасные create/delete Auth user операции',
    'Windows launcher', 'publishable key', 'service-role',
    'HTTP 201', 'idempotent_replay=false', 'HTTP 200',
    'idempotent_replay=true', 'HTTP 409', 'HTTP 403',
    'Evidence', 'Cleanup', 'Production boundary',
], 'operator kit documentation')
require(runbook, [
    'Auth user', 'safe staging read-path', 'Authenticated positive E2E',
], 'existing staging runbook')
require(workflow, [
    'CRM design authenticated E2E kit check',
    'python3 -m json.tool contracts/design-task-staging-auth-e2e-v1.json',
    'node --check tools/design-task-staging-auth-e2e.mjs',
    'node tools/test_design_task_staging_auth_e2e.mjs',
    'python3 tools/check_design_task_staging_auth_e2e.py',
    'tools/run_design_task_staging_auth_e2e.ps1',
], 'authenticated E2E workflow')

secret_patterns = [
    r'(?i)service[_-]?role\s*[=:]\s*["\']?[A-Za-z0-9._-]{20,}',
    r'(?i)(password|access_token|refresh_token)\s*[=:]\s*["\'][^<\n]{8,}',
    r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}',
    r'sb_secret_[A-Za-z0-9_-]{10,}',
]
for path, source in [
    (CONTRACT, contract_text), (RUNNER, runner), (TEST, test),
    (POWERSHELL, powershell), (DOC, doc), (WORKFLOW, workflow),
]:
    for pattern in secret_patterns:
        if re.search(pattern, source):
            errors.append(f'{path.relative_to(ROOT)} contains possible secret material')

if errors:
    print('Authenticated staging design E2E kit checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('Authenticated staging design E2E kit is environment-locked, projection-synced and secret-safe.')
