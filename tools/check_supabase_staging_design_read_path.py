#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / 'contracts' / 'design-task-staging-read-path-v1.json'
MIGRATION = ROOT / 'supabase' / 'staging-migrations' / '20260714_03_design_task_read_path.sql'
TEST = ROOT / 'supabase' / 'staging-tests' / '20260714_design_task_read_path.sql'
ACTIONS = ROOT / 'crm' / 'v4' / 'assets' / 'v4' / 'action-permissions-v1.js'
PREVIEW = ROOT / 'crm' / 'v4' / 'assets' / 'v4' / 'design-task-draft-preview-v1.js'
CONFIG = ROOT / 'supabase' / 'config.toml'
DOC = ROOT / 'docs' / 'SUPABASE_STAGING_DESIGN_READ_PATH_2026-07-14.md'
RUNBOOK = ROOT / 'docs' / 'CRM_DESIGN_TASK_STAGING_TRANSPORT_RUNBOOK_2026-07-14.md'
WORKFLOW = ROOT / '.github' / 'workflows' / 'crm-design-read-path-check.yml'

STAGING = 'otulfnouybahfnsycxqn'
PRODUCTION = 'ofewxuqfjhamgerwzull'
EXPECTED_ROLES = ['owner', 'admin', 'manager', 'designer']
EXPECTED_PROJECTIONS = {
    'public.leader_orders': [
        'id', 'order_number', 'lead_id', 'project_name', 'status', 'priority',
        'deadline', 'layout_status', 'layout_link', 'is_archived', 'updated_at',
    ],
    'public.leader_lead_needs': [
        'id', 'lead_id', 'need_type', 'title', 'need_design', 'design_reason',
        'deadline_date', 'status', 'completeness_score', 'created_at',
    ],
    'public.leader_design_tasks': [
        'id', 'order_id', 'task_status', 'layout_status', 'designer_name',
        'deadline', 'layout_link', 'created_at',
    ],
}
PREVIEW_CONSTANTS = {
    'public.leader_orders': 'ORDER_FIELDS',
    'public.leader_lead_needs': 'NEED_FIELDS',
    'public.leader_design_tasks': 'TASK_FIELDS',
}

errors = []


def read(path: Path, label: str) -> str:
    if not path.exists():
        errors.append(f'Missing {label}: {path.relative_to(ROOT)}')
        return ''
    return path.read_text(encoding='utf-8')


def require(text: str, markers, label: str):
    for marker in markers:
        if marker not in text:
            errors.append(f'{label}: missing marker {marker!r}')


def parse_preview_fields(source: str, constant: str):
    match = re.search(rf"const\s+{re.escape(constant)}\s*=\s*'([^']+)'", source)
    return match.group(1).split(',') if match else []


def role_block(source: str, role: str) -> str:
    match = re.search(
        rf"\b{re.escape(role)}:\s*(ALL_ACTIONS|Object\.freeze\(\[(.*?)\]\))",
        source,
        re.S,
    )
    return match.group(0) if match else ''


def parse_sql_role_array(source: str):
    match = re.search(
        r"p_action\s*=\s*'design\.read'.*?array\[(.*?)\]::text\[\]",
        source,
        re.S,
    )
    if not match:
        return []
    return re.findall(r"'([^']+)'", match.group(1))


def parse_grant_columns(source: str, table: str):
    match = re.search(
        rf"grant\s+select\s*\((.*?)\)\s+on\s+table\s+{re.escape(table)}\s+to\s+authenticated",
        source,
        re.I | re.S,
    )
    if not match:
        return []
    return [item.strip().strip('"') for item in match.group(1).split(',') if item.strip()]


contract_text = read(CONTRACT, 'read-path contract')
migration = read(MIGRATION, 'read-path migration')
test = read(TEST, 'read-path SQL test')
actions = read(ACTIONS, 'canonical action registry')
preview = read(PREVIEW, 'design preview')
config = read(CONFIG, 'Supabase config')
doc = read(DOC, 'read-path documentation')
runbook = read(RUNBOOK, 'transport runbook')
workflow = read(WORKFLOW, 'read-path workflow')

try:
    contract = json.loads(contract_text) if contract_text else {}
except json.JSONDecodeError as exc:
    errors.append(f'Read-path contract JSON is invalid: {exc}')
    contract = {}

if contract:
    if contract.get('contract_version') != 'leader-design-task-staging-read-path-v1':
        errors.append('Read-path contract version drifted')
    environment = contract.get('environment') or {}
    if environment.get('project_ref') != STAGING:
        errors.append('Read-path staging project ref drifted')
    if environment.get('production_project_ref') != PRODUCTION:
        errors.append('Read-path production project ref drifted')
    if environment.get('production_enabled') is not False:
        errors.append('Production must remain disabled')
    authorization = contract.get('authorization') or {}
    if authorization.get('required_action') != 'design.read':
        errors.append('Read-path action must be design.read')
    if authorization.get('allowed_roles') != EXPECTED_ROLES:
        errors.append('Contract allowed roles drifted from canonical order')
    if authorization.get('auth_uid_required') is not True:
        errors.append('Contract must require auth.uid()')
    if authorization.get('active_profile_required') is not True:
        errors.append('Contract must require active profile')
    if contract.get('read_projections') != EXPECTED_PROJECTIONS:
        errors.append('Contract read projections drifted')
    authenticated = (contract.get('privileges') or {}).get('authenticated') or {}
    for key in ('insert', 'update', 'delete', 'direct_design_rpc_execute', 'receipt_table_access'):
        if authenticated.get(key) is not False:
            errors.append(f'Authenticated privilege {key} must remain false')
    if authenticated.get('column_level_select_only') is not True:
        errors.append('Authenticated read access must remain column-level only')

canonical_roles = []
for role in ('owner', 'admin', 'manager', 'accountant', 'designer', 'installer', 'contractor'):
    block = role_block(actions, role)
    if not block:
        errors.append(f'Canonical registry role block missing: {role}')
        continue
    if block.find('ALL_ACTIONS') >= 0 or 'CRM_V4_ACTIONS.DESIGN_READ' in block:
        canonical_roles.append(role)
if canonical_roles != EXPECTED_ROLES:
    errors.append(f'Canonical design.read roles changed: {canonical_roles!r}')

sql_roles = parse_sql_role_array(migration)
if sql_roles != EXPECTED_ROLES:
    errors.append(f'SQL design.read roles drifted: {sql_roles!r}')

for table, expected in EXPECTED_PROJECTIONS.items():
    contract_projection = (contract.get('read_projections') or {}).get(table) if contract else None
    if contract_projection != expected:
        errors.append(f'Contract projection mismatch for {table}')
    preview_fields = parse_preview_fields(preview, PREVIEW_CONSTANTS[table])
    if preview_fields != expected:
        errors.append(f'Preview projection mismatch for {table}: {preview_fields!r}')
    granted_fields = parse_grant_columns(migration, table)
    if granted_fields != expected:
        errors.append(f'SQL grant projection mismatch for {table}: {granted_fields!r}')

if f'project_id = "{PRODUCTION}"' not in config:
    errors.append('supabase/config.toml must continue to identify production')
if STAGING in config:
    errors.append('Staging project ID must not replace standard config')

for label, source in [('migration', migration), ('test', test)]:
    if PRODUCTION in source:
        errors.append(f'{label}: production project ref is forbidden')
    if STAGING not in source:
        errors.append(f'{label}: exact staging guard is required')
    lowered = source.lower()
    for forbidden in ('nav_', 'nav-', 'parket_', 'parket-', 'broker_', 'broker-'):
        if forbidden in lowered:
            errors.append(f'{label}: out-of-scope marker {forbidden!r}')

require(migration, [
    'staging_environment_guard_failed',
    'leader_private.leader_has_crm_action(p_action text)',
    "p_action = 'design.read'",
    'auth.uid()',
    'security definer',
    "set search_path = ''",
    "array['owner', 'admin', 'manager', 'designer']::text[]",
    'grant usage on schema leader_private to authenticated',
    'revoke all on table leader_private.leader_command_receipts from authenticated',
    'revoke all privileges on table public.leader_orders from authenticated',
    'revoke all privileges on table public.leader_lead_needs from authenticated',
    'revoke all privileges on table public.leader_design_tasks from authenticated',
    'leader_orders_design_read_staging',
    'leader_lead_needs_design_read_staging',
    'leader_design_tasks_design_read_staging',
    "leader_private.leader_has_crm_action('design.read')",
    'revoke execute on function public.leader_create_design_task_from_order_rpc(jsonb)',
], 'read-path migration')

for forbidden_column in (
    'client_phone', 'client_total', 'contractor_cost', 'profit', 'prepayment',
    'balance', 'internal_comment', 'task_text', 'client_comment', 'result_comment',
):
    for table, granted in EXPECTED_PROJECTIONS.items():
        if forbidden_column in granted:
            errors.append(f'Forbidden column {forbidden_column} granted on {table}')

require(test, [
    "'owner'", "'admin'", "'manager'", "'designer'",
    "'accountant'", "'installer'", "'contractor'", "'future_role'",
    "'manager', false", 'auth.uid()', 'has_column_privilege',
    'private_order_columns_unexpectedly_readable',
    'browser_insert_unexpectedly_allowed',
    'direct_design_rpc_unexpectedly_allowed',
    'anon_order_read_unexpectedly_allowed',
    'missing_auth_uid_did_not_fail_closed',
    'PRIVATE_CLIENT_NAME_SENTINEL', 'example.invalid', 'rollback;',
], 'read-path SQL test')

require(doc, [
    STAGING, PRODUCTION, 'column-level SELECT', 'design.read',
    'owner', 'admin', 'manager', 'designer', 'accountant', 'installer',
    'contractor', 'security WARN/ERROR', 'performance WARN/ERROR',
    'Auth user', 'production',
], 'read-path documentation')
require(runbook, ['safe staging read-path', 'column-level SELECT', 'authenticated positive E2E'], 'transport runbook')
require(workflow, [
    'check_supabase_staging_design_read_path.py',
    'design-task-staging-read-path-v1.json',
    '20260714_03_design_task_read_path.sql',
    '20260714_design_task_read_path.sql',
], 'read-path workflow')

secret_patterns = [
    r'(?i)service[_-]?role\s*[=:]\s*["\']?[A-Za-z0-9._-]{20,}',
    r'(?i)database[_-]?password\s*[=:]',
    r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}',
    r'sb_secret_[A-Za-z0-9_-]{10,}',
]
for path, source in [
    (CONTRACT, contract_text), (MIGRATION, migration), (TEST, test),
    (DOC, doc), (RUNBOOK, runbook), (WORKFLOW, workflow),
]:
    for pattern in secret_patterns:
        if re.search(pattern, source):
            errors.append(f'{path.relative_to(ROOT)} contains possible secret material')

if errors:
    print('Supabase staging design read-path checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('Supabase staging design read path is role-synced, column-minimized and write-closed.')
