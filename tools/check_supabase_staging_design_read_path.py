#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / 'contracts/design-task-staging-read-path-v1.json'
MIGRATION = ROOT / 'supabase/staging-migrations/20260714_03_design_task_read_path.sql'
TEST = ROOT / 'supabase/staging-tests/20260714_design_task_read_path.sql'
ACTIONS = ROOT / 'crm/v4/assets/v4/action-permissions-v1.js'
PREVIEW = ROOT / 'crm/v4/assets/v4/design-task-draft-preview-v1.js'
CONFIG = ROOT / 'supabase/config.toml'
DOC = ROOT / 'docs/SUPABASE_STAGING_DESIGN_READ_PATH_2026-07-14.md'
RUNBOOK = ROOT / 'docs/CRM_DESIGN_TASK_STAGING_TRANSPORT_RUNBOOK_2026-07-14.md'
WORKFLOW = ROOT / '.github/workflows/crm-design-read-path-check.yml'

STAGING = 'otulfnouybahfnsycxqn'
PRODUCTION = 'ofewxuqfjhamgerwzull'
EXPECTED_ROLES = ['owner', 'admin', 'manager', 'designer']
GRANTS = {
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
PREVIEW_FIELDS = {
    'public.leader_orders': GRANTS['public.leader_orders'],
    'public.leader_lead_needs': [
        'id', 'lead_id', 'need_type', 'title', 'need_design', 'design_reason',
        'deadline_date', 'status', 'completeness_score',
    ],
    'public.leader_design_tasks': GRANTS['public.leader_design_tasks'],
}
SORT_ONLY = {'public.leader_lead_needs': ['created_at']}
CONSTANTS = {
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


def require(text: str, markers, label: str) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f'{label}: missing marker {marker!r}')


def preview_columns(source: str, constant: str):
    match = re.search(rf"const\s+{constant}\s*=\s*'([^']+)'", source)
    return match.group(1).split(',') if match else []


def grant_columns(source: str, table: str):
    match = re.search(
        rf"grant\s+select\s*\(([^)]*)\)\s+on\s+table\s+{re.escape(table)}\s+to\s+authenticated",
        source,
        re.I | re.S,
    )
    if not match:
        return []
    return [part.strip().strip('"') for part in match.group(1).split(',') if part.strip()]


def canonical_design_roles(source: str):
    roles = []
    for role in ('owner', 'admin', 'manager', 'accountant', 'designer', 'installer', 'contractor'):
        match = re.search(
            rf"\b{role}:\s*(ALL_ACTIONS|Object\.freeze\(\[(.*?)\]\))",
            source,
            re.S,
        )
        if not match:
            errors.append(f'Canonical registry role block missing: {role}')
            continue
        block = match.group(0)
        if 'ALL_ACTIONS' in block or 'CRM_V4_ACTIONS.DESIGN_READ' in block:
            roles.append(role)
    return roles


def sql_design_roles(source: str):
    match = re.search(
        r"p_action\s*=\s*'design\.read'.*?array\[(.*?)\]::text\[\]",
        source,
        re.S,
    )
    return re.findall(r"'([^']+)'", match.group(1)) if match else []


contract_text = read(CONTRACT, 'contract')
migration = read(MIGRATION, 'migration')
test = read(TEST, 'SQL test')
actions = read(ACTIONS, 'canonical action registry')
preview = read(PREVIEW, 'preview')
config = read(CONFIG, 'Supabase config')
doc = read(DOC, 'documentation')
runbook = read(RUNBOOK, 'runbook')
workflow = read(WORKFLOW, 'workflow')

try:
    contract = json.loads(contract_text) if contract_text else {}
except json.JSONDecodeError as exc:
    errors.append(f'Contract JSON invalid: {exc}')
    contract = {}

if contract:
    environment = contract.get('environment') or {}
    authorization = contract.get('authorization') or {}
    privileges = (contract.get('privileges') or {}).get('authenticated') or {}
    if contract.get('contract_version') != 'leader-design-task-staging-read-path-v1':
        errors.append('Contract version drifted')
    if environment.get('project_ref') != STAGING or environment.get('production_project_ref') != PRODUCTION:
        errors.append('Environment project refs drifted')
    if environment.get('production_enabled') is not False:
        errors.append('Production must remain disabled')
    if authorization.get('required_action') != 'design.read':
        errors.append('Required action must remain design.read')
    if authorization.get('allowed_roles') != EXPECTED_ROLES:
        errors.append('Contract role set drifted')
    if authorization.get('auth_uid_required') is not True or authorization.get('active_profile_required') is not True:
        errors.append('Auth identity and active profile must remain required')
    if contract.get('read_projections') != GRANTS:
        errors.append('Contract projections drifted')
    if privileges.get('column_level_select_only') is not True:
        errors.append('Read access must remain column-level only')
    for key in ('insert', 'update', 'delete', 'direct_design_rpc_execute', 'receipt_table_access'):
        if privileges.get(key) is not False:
            errors.append(f'Authenticated privilege {key} must remain false')

if canonical_design_roles(actions) != EXPECTED_ROLES:
    errors.append('Canonical design.read role set drifted')
if sql_design_roles(migration) != EXPECTED_ROLES:
    errors.append('SQL design.read role set drifted')

for table, expected_grant in GRANTS.items():
    actual_preview = preview_columns(preview, CONSTANTS[table])
    if actual_preview != PREVIEW_FIELDS[table]:
        errors.append(f'Preview projection mismatch for {table}: {actual_preview!r}')
    covered = actual_preview + SORT_ONLY.get(table, [])
    if sorted(covered) != sorted(expected_grant):
        errors.append(f'Preview/sort coverage mismatch for {table}')
    actual_grant = grant_columns(migration, table)
    if actual_grant != expected_grant:
        errors.append(f'SQL grant projection mismatch for {table}: {actual_grant!r}')

if f'project_id = "{PRODUCTION}"' not in config:
    errors.append('supabase/config.toml must remain bound to production')
if STAGING in config:
    errors.append('Staging project ref must not replace standard config')

for label, source in [('migration', migration), ('test', test)]:
    if PRODUCTION in source:
        errors.append(f'{label}: production project ref forbidden')
    if STAGING not in source:
        errors.append(f'{label}: exact staging guard missing')
    for marker in ('nav_', 'nav-', 'parket_', 'parket-', 'broker_', 'broker-'):
        if marker in source.lower():
            errors.append(f'{label}: out-of-scope marker {marker!r}')

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
    'leader_orders_design_read_staging',
    'leader_lead_needs_design_read_staging',
    'leader_design_tasks_design_read_staging',
    "leader_private.leader_has_crm_action('design.read')",
    'revoke execute on function public.leader_create_design_task_from_order_rpc(jsonb)',
], 'migration')
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
], 'SQL test')
require(doc.lower(), [
    STAGING, PRODUCTION, 'column-level select', 'design.read', 'owner', 'admin',
    'manager', 'designer', 'accountant', 'installer', 'contractor', 'security',
    'performance', 'warn/error', 'auth user', 'production',
], 'documentation')
require(runbook.lower(), [
    'safe staging read-path', 'column-level select', 'authenticated positive e2e',
], 'runbook')
require(workflow, [
    'check_supabase_staging_design_read_path.py',
    'design-task-staging-read-path-v1.json',
    '20260714_03_design_task_read_path.sql',
    '20260714_design_task_read_path.sql',
], 'workflow')

for forbidden_column in (
    'client_phone', 'client_total', 'contractor_cost', 'profit', 'prepayment',
    'balance', 'internal_comment', 'task_text', 'client_comment', 'result_comment',
):
    for table, granted in GRANTS.items():
        if forbidden_column in granted:
            errors.append(f'Forbidden column {forbidden_column} granted on {table}')

secret_patterns = [
    r'(?i)service[_-]?role\s*[=:]\s*["\']?[A-Za-z0-9._-]{20,}',
    r'(?i)database[_-]?password\s*[=:]',
    r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}',
    r'sb_secret_[A-Za-z0-9_-]{10,}',
]
for path, source in ((CONTRACT, contract_text), (MIGRATION, migration), (TEST, test), (DOC, doc), (RUNBOOK, runbook), (WORKFLOW, workflow)):
    for pattern in secret_patterns:
        if re.search(pattern, source):
            errors.append(f'{path.relative_to(ROOT)} contains possible secret material')

if errors:
    print('Supabase staging design read-path checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('Supabase staging design read path is role-synced, column-minimized and write-closed.')
