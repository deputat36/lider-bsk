#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CANDIDATE = ROOT / 'contracts' / 'design-task-database-rpc-candidate-v1.json'
SERVER_CONTRACT = ROOT / 'contracts' / 'design-task-create-from-order-v1.json'
DOC = ROOT / 'docs' / 'CRM_DESIGN_TASK_DATABASE_RPC_CANDIDATE_SPEC_2026-07-13.md'
ACTIONS = ROOT / 'crm' / 'v4' / 'assets' / 'v4' / 'action-permissions-v1.js'
STATUSES = ROOT / 'crm' / 'v4' / 'assets' / 'v4' / 'status-transitions-v1.js'
WORKFLOW = ROOT / '.github' / 'workflows' / 'crm-design-task-server-contract-check.yml'
MIGRATIONS = ROOT / 'supabase' / 'migrations'

errors = []


def read_text(path: Path, label: str) -> str:
    if not path.exists():
        errors.append(f'Missing {label}: {path.relative_to(ROOT)}')
        return ''
    return path.read_text(encoding='utf-8')


def read_json(path: Path, label: str):
    text = read_text(path, label)
    if not text:
        return {}
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        errors.append(f'Invalid JSON in {path.relative_to(ROOT)}: {exc}')
        return {}


def exact_set(value, expected, label: str):
    actual = set(value or [])
    target = set(expected)
    if actual != target:
        errors.append(f'{label}: expected {sorted(target)}, found {sorted(actual)}')


def require_markers(text: str, markers, label: str):
    for marker in markers:
        if marker not in text:
            errors.append(f'{label}: missing marker {marker!r}')


def canonical_design_roles(action_text: str):
    roles = set()
    if re.search(r'^\s*owner:\s*ALL_ACTIONS,', action_text, re.MULTILINE):
        roles.add('owner')
    if re.search(r'^\s*admin:\s*ALL_ACTIONS,', action_text, re.MULTILINE):
        roles.add('admin')
    for role in ('manager', 'accountant', 'designer', 'installer', 'contractor'):
        match = re.search(
            rf'^\s*{role}:\s*Object\.freeze\(\[(.*?)^\s*\]\),?',
            action_text,
            re.MULTILINE | re.DOTALL,
        )
        if match and 'CRM_V4_ACTIONS.DESIGN_WRITE' in match.group(1):
            roles.add(role)
    return roles


candidate = read_json(CANDIDATE, 'database/RPC candidate contract')
server_contract = read_json(SERVER_CONTRACT, 'design task server contract')
doc_text = read_text(DOC, 'database/RPC candidate specification')
action_text = read_text(ACTIONS, 'canonical action registry')
status_text = read_text(STATUSES, 'canonical status registry')
workflow_text = read_text(WORKFLOW, 'design task contract workflow')

if candidate:
    expected_scalars = {
        'contract_version': 'leader-design-task-database-rpc-candidate-v1',
        'status': 'source_only_not_deployable',
        'scope': 'leader_crm_v4_design_task_create_from_order',
        'related_command_contract': 'contracts/design-task-create-from-order-v1.json',
        'related_action': 'design_task.create_from_order',
    }
    for key, expected in expected_scalars.items():
        if candidate.get(key) != expected:
            errors.append(f'candidate contract: {key} must be {expected!r}')

    for flag in ('production_mutation_performed', 'migration_file_created', 'supabase_development_branch_created'):
        if candidate.get(flag) is not False:
            errors.append(f'candidate stage must keep {flag}=false')

    sources = candidate.get('canonical_sources') or {}
    if sources.get('permission_registry') != 'crm/v4/assets/v4/action-permissions-v1.js':
        errors.append('candidate must reference canonical permission registry')
    if sources.get('status_registry') != 'crm/v4/assets/v4/status-transitions-v1.js':
        errors.append('candidate must reference canonical status registry')
    if sources.get('status_registry_version') != 1:
        errors.append('candidate must pin status registry version 1')

    baseline = candidate.get('live_baseline') or {}
    if baseline.get('project_ref') != 'ofewxuqfjhamgerwzull':
        errors.append('candidate must identify the Leader production project')
    if baseline.get('postgres_major') != 17:
        errors.append('candidate must record Postgres 17 baseline')
    if baseline.get('leader_private_schema_present') is not True:
        errors.append('candidate must confirm leader_private schema')
    for flag in ('logical_receipt_storage_present', 'active_task_unique_index_present', 'rpc_present'):
        if baseline.get(flag) is not False:
            errors.append(f'candidate live baseline must keep {flag}=false')
    if baseline.get('design_tasks_count') != 0 or baseline.get('design_task_events_count') != 0:
        errors.append('candidate must preserve observed zero design task rows')
    if baseline.get('orders_requiring_design_without_task') != 2:
        errors.append('candidate must preserve two unbackfilled design orders')
    edge_versions = baseline.get('live_edge_versions_unchanged') or {}
    if edge_versions != {'leader-crm-leads': 12, 'leader-crm-orders': 2}:
        errors.append('candidate must preserve live Edge version evidence')

    objects = candidate.get('objects') or {}
    receipt = objects.get('receipt_storage') or {}
    if receipt.get('logical_name') != 'leader_command_receipts':
        errors.append('receipt logical name must remain leader_command_receipts')
    if receipt.get('physical_name') != 'leader_private.leader_command_receipts':
        errors.append('receipt must be placed in leader_private')
    if receipt.get('schema_exposed_to_data_api') is not False:
        errors.append('receipt schema must remain outside Data API exposure')
    if receipt.get('rls_enabled') is not True or receipt.get('direct_browser_access') is not False:
        errors.append('receipt must enable RLS and deny direct browser access')

    columns = {item.get('name'): item for item in receipt.get('columns') or []}
    exact_set(columns, {
        'id', 'action', 'idempotency_key', 'request_id', 'request_hash', 'actor_id',
        'state', 'response', 'created_at', 'updated_at', 'completed_at'
    }, 'receipt columns')
    if not (columns.get('id') or {}).get('primary_key'):
        errors.append('receipt id must be primary key')
    if (columns.get('state') or {}).get('default') != 'in_progress':
        errors.append('receipt state must default to in_progress')

    constraints = receipt.get('constraints') or {}
    exact_set(constraints.get('unique_action_idempotency_key'), {'action', 'idempotency_key'}, 'receipt idempotency uniqueness')
    exact_set(constraints.get('unique_action_request_id'), {'action', 'request_id'}, 'receipt request uniqueness')
    exact_set(constraints.get('allowed_states'), {'in_progress', 'success'}, 'receipt states')
    if constraints.get('request_hash_format') != 'lowercase_sha256_hex_64':
        errors.append('receipt request hash must be lowercase SHA-256 hex')
    if constraints.get('success_requires_object_response') is not True:
        errors.append('successful receipt must require an object response')
    if constraints.get('success_requires_completed_at') is not True:
        errors.append('successful receipt must require completed_at')

    grants = receipt.get('grants') or {}
    for role in ('PUBLIC', 'anon', 'authenticated'):
        if grants.get(role) not in ([], None):
            errors.append(f'receipt must grant no table privileges to {role}')
    exact_set(grants.get('service_role'), {'SELECT', 'INSERT', 'UPDATE'}, 'receipt service_role grants')
    if receipt.get('delete_policy') != 'no_application_delete':
        errors.append('receipt application delete must be forbidden')

    uniqueness = objects.get('active_task_uniqueness') or {}
    if uniqueness.get('table') != 'public.leader_design_tasks':
        errors.append('active task uniqueness must target public.leader_design_tasks')
    if uniqueness.get('index_name') != 'leader_design_tasks_one_active_per_order_uidx':
        errors.append('unexpected active task unique index name')
    exact_set(uniqueness.get('unique_columns'), {'order_id'}, 'active task unique columns')
    exact_set(uniqueness.get('terminal_labels_from_registry'), {'Завершено', 'Отменено'}, 'terminal design labels')
    predicate = uniqueness.get('predicate') or ''
    require_markers(predicate, ["order_id IS NOT NULL", "task_status NOT IN ('Завершено','Отменено')"], 'active task predicate')
    for flag in ('unknown_status_is_active', 'approved_status_is_active', 'preflight_duplicate_query_required'):
        if uniqueness.get(flag) is not True:
            errors.append(f'active task rule must require {flag}')
    if uniqueness.get('application_only_duplicate_check_is_sufficient') is not False:
        errors.append('application-only duplicate check must be insufficient')
    if uniqueness.get('create_concurrently_in_standard_transactional_migration') is not False:
        errors.append('standard transaction migration must not use CREATE INDEX CONCURRENTLY')

    rpc = objects.get('rpc') or {}
    if rpc.get('identity') != 'public.leader_create_design_task_from_order_rpc(p_payload jsonb)':
        errors.append('unexpected design task RPC identity')
    if rpc.get('returns') != 'jsonb' or rpc.get('language') != 'plpgsql':
        errors.append('RPC must be plpgsql returning jsonb')
    if rpc.get('security') != 'invoker' or rpc.get('fixed_search_path') != '':
        errors.append('RPC must be SECURITY INVOKER with empty search_path')
    if rpc.get('direct_browser_call') is not False:
        errors.append('RPC must not be called directly from browser')
    expected_execute = {'PUBLIC': False, 'anon': False, 'authenticated': False, 'service_role': True}
    if (rpc.get('execute_grants') or {}) != expected_execute:
        errors.append('RPC EXECUTE must be service-role-only')
    if rpc.get('permission') != 'design.write':
        errors.append('RPC permission must be design.write')
    exact_set(rpc.get('allowed_roles_from_canonical_registry'), {'owner', 'admin', 'manager', 'designer'}, 'RPC design.write roles')
    exact_set(rpc.get('denied_roles'), {'accountant', 'installer', 'contractor'}, 'RPC denied roles')
    if rpc.get('unknown_role_fails_closed') is not True or rpc.get('browser_actor_is_never_trusted') is not True:
        errors.append('RPC must fail closed and reject browser actor identity')

    algorithm = candidate.get('rpc_algorithm') or []
    for marker in (
        'require current database role service_role',
        'require actor role to have canonical design.write',
        'compute server-side SHA-256 hash',
        'nonblocking advisory lock',
        'same key with different hash',
        'lock order row FOR UPDATE',
        'unknown task status',
        'insert design task',
        'insert privacy-safe design_task.created_from_order event',
        'commit receipt task and event atomically',
    ):
        if not any(marker in step for step in algorithm):
            errors.append(f'RPC algorithm missing semantic step: {marker}')

    hashing = candidate.get('request_hash') or {}
    if hashing.get('algorithm') != 'sha256' or hashing.get('implementation_dependency') != 'extensions.digest':
        errors.append('request hash must use extensions.digest SHA-256')
    if hashing.get('server_computed') is not True:
        errors.append('request hash must be server-computed')
    canonicalization = hashing.get('canonicalization') or {}
    if canonicalization.get('sort_need_ids') is not True:
        errors.append('hash canonicalization must sort need IDs')
    if canonicalization.get('reject_unknown_fields_before_hashing') is not True:
        errors.append('hash canonicalization must reject unknown fields')

    concurrency = candidate.get('transaction_and_concurrency') or {}
    if concurrency.get('single_database_transaction') is not True:
        errors.append('candidate must require one database transaction')
    require_markers(concurrency.get('idempotency_advisory_lock') or '', ['pg_try_advisory_xact_lock', 'hashtextextended'], 'idempotency advisory lock')
    if concurrency.get('order_row_lock') != 'FOR UPDATE':
        errors.append('order row must be locked FOR UPDATE')
    if concurrency.get('existing_task_rows_lock') != 'FOR UPDATE':
        errors.append('existing task rows must be locked FOR UPDATE')
    if 'rollback' not in str(concurrency.get('event_insert_failure') or ''):
        errors.append('event insert failure must roll back transaction')
    if 'rollback' not in str(concurrency.get('receipt_success_update_failure') or ''):
        errors.append('receipt completion failure must roll back transaction')

    response = candidate.get('safe_response') or {}
    if response.get('receipt_stores_safe_projection_only') is not True:
        errors.append('receipt must store safe response only')
    forbidden_response = set(response.get('forbidden') or [])
    required_forbidden = {
        'client_name', 'client_phone', 'client_total', 'contractor_cost', 'profit',
        'balance', 'prepayment', 'payment_status', 'internal_comment', 'client_comment',
        'owner_id', 'created_by', 'updated_by', 'order.data', 'raw JWT', 'service key'
    }
    if not required_forbidden.issubset(forbidden_response):
        errors.append('safe response does not forbid all sensitive fields')

    tests = candidate.get('development_branch_tests') or []
    for marker in (
        'RPC is SECURITY INVOKER',
        'PUBLIC anon and authenticated cannot execute RPC',
        'owner admin manager designer positive cases pass',
        'concurrent same key',
        'concurrent different keys',
        'forced event failure',
        'forced receipt completion failure',
        'security and performance advisors',
        'rollback rehearsal',
    ):
        if not any(marker in item for item in tests):
            errors.append(f'development branch test matrix missing: {marker}')

    rollback = candidate.get('rollback') or {}
    if rollback.get('strategy') != 'application_first_keep_data':
        errors.append('rollback must be application-first and data-preserving')
    if rollback.get('schema_rollback_requires_separate_approval') is not True:
        errors.append('schema rollback must require separate approval')
    if rollback.get('never_delete_created_design_tasks_or_events_as_automatic_rollback') is not True:
        errors.append('automatic rollback must never delete task/event evidence')

    forbidden_stage = set(candidate.get('forbidden_in_this_stage') or [])
    for marker in ('production DDL', 'production DML', 'RPC deploy', 'Edge Function deploy', 'backfill', 'nav object change'):
        if marker not in forbidden_stage:
            errors.append(f'candidate stage boundary missing: {marker}')

roles = canonical_design_roles(action_text)
if roles != {'owner', 'admin', 'manager', 'designer'}:
    errors.append(f'canonical design.write roles drifted: {sorted(roles)}')
if candidate:
    candidate_roles = set((((candidate.get('objects') or {}).get('rpc') or {}).get('allowed_roles_from_canonical_registry') or []))
    if candidate_roles != roles:
        errors.append('candidate RPC roles differ from canonical action registry')

require_markers(status_text, [
    "approved: status({ key: 'approved', label: 'Согласовано', allowedTo: ['completed']",
    "completed: status({ key: 'completed', label: 'Завершено', terminal: true",
    "cancelled: status({ key: 'cancelled', label: 'Отменено', terminal: true",
], 'canonical design_task status registry')

if server_contract:
    idempotency = server_contract.get('idempotency') or {}
    if idempotency.get('candidate_receipt_table') != 'leader_command_receipts':
        errors.append('original server contract logical receipt name drifted')
    if idempotency.get('durable_receipt_storage_required_before_enforcement') is not True:
        errors.append('original server contract must require durable receipt storage')

require_markers(doc_text, [
    'Статус: `source_only_not_deployable`',
    'Mode: architecture specification only. No migration file was created',
    '`contracts/design-task-database-rpc-candidate-v1.json`',
    '`leader_private.leader_command_receipts`',
    '`leader_design_tasks_one_active_per_order_uidx`',
    "`order_id IS NOT NULL AND task_status NOT IN ('Завершено','Отменено')`",
    '`public.leader_create_design_task_from_order_rpc(p_payload jsonb)`',
    '`SECURITY INVOKER`',
    "`SET search_path = ''`",
    'EXECUTE granted only to `service_role`',
    'pg_try_advisory_xact_lock',
    '`application_first_keep_data`',
    'No production DDL or DML was executed.',
    'No development branch was created.',
    'No `nav_*`, `nav-*`, Parket or Broker object was changed.',
], 'database/RPC candidate specification')

for forbidden_sql in (
    'CREATE TABLE leader_private.leader_command_receipts',
    'CREATE OR REPLACE FUNCTION public.leader_create_design_task_from_order_rpc',
    'DROP TABLE leader_private.leader_command_receipts',
):
    if forbidden_sql in doc_text:
        errors.append(f'candidate specification must remain non-executable: found {forbidden_sql}')

require_markers(workflow_text, [
    'contracts/design-task-database-rpc-candidate-v1.json',
    'docs/CRM_DESIGN_TASK_DATABASE_RPC_CANDIDATE_SPEC_2026-07-13.md',
    'tools/check_design_task_database_rpc_candidate.py',
    'python3 tools/check_design_task_database_rpc_candidate.py',
], 'workflow integration')

if MIGRATIONS.exists():
    unexpected = []
    for pattern in ('*design*task*create*order*.sql', '*command*receipt*.sql', '*design*task*rpc*.sql'):
        unexpected.extend(MIGRATIONS.glob(pattern))
    if unexpected:
        paths = sorted({str(path.relative_to(ROOT)) for path in unexpected})
        errors.append('Approval-gated candidate must not be in supabase/migrations: ' + ', '.join(paths))

serialized = json.dumps(candidate, ensure_ascii=False) if candidate else ''
for text, label in ((serialized, 'candidate contract'), (doc_text, 'candidate specification')):
    for secret_marker in ('SUPABASE_SERVICE_ROLE_KEY=', 'sb_secret_', 'service_role_key'):
        if secret_marker in text:
            errors.append(f'{label} contains secret-like marker: {secret_marker}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('Design task database/RPC candidate is private-storage, service-role-only, concurrency-safe, rollback-aware and non-deployable.')
