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
PARENT_CHECKER = ROOT / 'tools' / 'check_design_task_create_from_order_contract.py'
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


def require_markers(text: str, markers, label: str):
    for marker in markers:
        if marker not in text:
            errors.append(f'{label}: missing marker {marker!r}')


def exact_set(actual, expected, label: str):
    actual_set = set(actual or [])
    expected_set = set(expected)
    if actual_set != expected_set:
        errors.append(f'{label}: expected {sorted(expected_set)}, found {sorted(actual_set)}')


def role_blocks(action_text: str):
    roles = {}
    if re.search(r'^\s*owner:\s*ALL_ACTIONS,', action_text, re.MULTILINE):
        roles['owner'] = {'ALL'}
    if re.search(r'^\s*admin:\s*ALL_ACTIONS,', action_text, re.MULTILINE):
        roles['admin'] = {'ALL'}
    for role in ('manager', 'accountant', 'designer', 'installer', 'contractor'):
        match = re.search(
            rf'^\s*{role}:\s*Object\.freeze\(\[(.*?)^\s*\]\),?',
            action_text,
            re.MULTILINE | re.DOTALL,
        )
        if match:
            roles[role] = set(re.findall(r'CRM_V4_ACTIONS\.([A-Z0-9_]+)', match.group(1)))
    return roles


candidate = read_json(CANDIDATE, 'design task database RPC candidate contract')
server_contract = read_json(SERVER_CONTRACT, 'design task create-from-order server contract')
doc_text = read_text(DOC, 'design task database RPC candidate specification')
action_text = read_text(ACTIONS, 'canonical action registry')
status_text = read_text(STATUSES, 'canonical status registry')
workflow_text = read_text(WORKFLOW, 'design task server contract workflow')
parent_checker_text = read_text(PARENT_CHECKER, 'design task parent checker')

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
            errors.append(f'candidate contract must keep {flag}=false')

    sources = candidate.get('canonical_sources') or {}
    if sources.get('permission_registry') != 'crm/v4/assets/v4/action-permissions-v1.js':
        errors.append('candidate must reference canonical action permission registry')
    if sources.get('status_registry') != 'crm/v4/assets/v4/status-transitions-v1.js':
        errors.append('candidate must reference canonical status registry')
    if sources.get('status_registry_version') != 1:
        errors.append('candidate must pin canonical status registry version 1')

    baseline = candidate.get('live_baseline') or {}
    if baseline.get('project_ref') != 'ofewxuqfjhamgerwzull':
        errors.append('candidate live baseline must identify the Leader Supabase project')
    for flag in ('leader_private_schema_present',):
        if baseline.get(flag) is not True:
            errors.append(f'candidate live baseline must confirm {flag}')
    for flag in ('logical_receipt_storage_present', 'active_task_unique_index_present', 'rpc_present'):
        if baseline.get(flag) is not False:
            errors.append(f'candidate live baseline must keep {flag}=false')
    if baseline.get('design_tasks_count') != 0 or baseline.get('design_task_events_count') != 0:
        errors.append('candidate live baseline must preserve observed zero design task rows')
    if baseline.get('orders_requiring_design_without_task') != 2:
        errors.append('candidate live baseline must preserve two unbackfilled orders')

    objects = candidate.get('objects') or {}
    receipt = objects.get('receipt_storage') or {}
    if receipt.get('logical_name') != 'leader_command_receipts':
        errors.append('receipt logical name must remain leader_command_receipts')
    if receipt.get('physical_name') != 'leader_private.leader_command_receipts':
        errors.append('receipt storage must be resolved to leader_private.leader_command_receipts')
    if receipt.get('schema_exposed_to_data_api') is not False:
        errors.append('receipt storage must remain outside the exposed Data API schema')
    if receipt.get('rls_enabled') is not True or receipt.get('direct_browser_access') is not False:
        errors.append('receipt storage must use defense-in-depth RLS and deny direct browser access')

    columns = {item.get('name'): item for item in receipt.get('columns') or []}
    expected_columns = {
        'id', 'action', 'idempotency_key', 'request_id', 'request_hash', 'actor_id',
        'state', 'response', 'created_at', 'updated_at', 'completed_at'
    }
    exact_set(columns, expected_columns, 'receipt columns')
    if not (columns.get('id') or {}).get('primary_key'):
        errors.append('receipt id must be the primary key')
    if (columns.get('state') or {}).get('default') != 'in_progress':
        errors.append('receipt state must start in_progress')

    constraints = receipt.get('constraints') or {}
    exact_set(constraints.get('unique_action_idempotency_key'), {'action', 'idempotency_key'}, 'receipt idempotency uniqueness')
    exact_set(constraints.get('unique_action_request_id'), {'action', 'request_id'}, 'receipt request uniqueness')
    exact_set(constraints.get('allowed_states'), {'in_progress', 'success'}, 'receipt states')
    if constraints.get('request_hash_format') != 'lowercase_sha256_hex_64':
        errors.append('receipt request hash must be lowercase SHA-256 hex')
    if constraints.get('success_requires_object_response') is not True or constraints.get('success_requires_completed_at') is not True:
        errors.append('successful receipt must require object response and completion timestamp')

    grants = receipt.get('grants') or {}
    for role in ('PUBLIC', 'anon', 'authenticated'):
        if grants.get(role) not in ([], None):
            errors.append(f'receipt storage must grant no privileges to {role}')
    exact_set(grants.get('service_role'), {'SELECT', 'INSERT', 'UPDATE'}, 'receipt service_role grants')
    if receipt.get('delete_policy') != 'no_application_delete':
        errors.append('receipt application delete must be forbidden')

    uniqueness = objects.get('active_task_uniqueness') or {}
    if uniqueness.get('table') != 'public.leader_design_tasks':
        errors.append('active task index must target public.leader_design_tasks')
    if uniqueness.get('index_name') != 'leader_design_tasks_one_active_per_order_uidx':
        errors.append('unexpected active task unique index name')
    exact_set(uniqueness.get('unique_columns'), {'order_id'}, 'active task unique columns')
    exact_set(uniqueness.get('terminal_labels_from_registry'), {'Завершено', 'Отменено'}, 'terminal task labels')
    predicate = uniqueness.get('predicate') or ''
    require_markers(predicate, ["order_id IS NOT NULL", "task_status NOT IN ('Завершено','Отменено')"], 'active task predicate')
    for flag in ('unknown_status_is_active', 'approved_status_is_active', 'preflight_duplicate_query_required'):
        if uniqueness.get(flag) is not True:
            errors.append(f'active task uniqueness must require {flag}')
    if uniqueness.get('application_only_duplicate_check_is_sufficient') is not False:
        errors.append('application-only duplicate check must remain insufficient')
    if uniqueness.get('create_concurrently_in_standard_transactional_migration') is not False:
        errors.append('standard transactional migration must not use CREATE INDEX CONCURRENTLY')

    rpc = objects.get('rpc') or {}
    if rpc.get('identity') != 'public.leader_create_design_task_from_order_rpc(p_payload jsonb)':
        errors.append('unexpected RPC identity')
    if rpc.get('security') != 'invoker' or rpc.get('fixed_search_path') != '':
        errors.append('RPC must be SECURITY INVOKER with an empty search_path')
    if rpc.get('direct_browser_call') is not False:
        errors.append('RPC must never be called directly by the browser')
    execute = rpc.get('execute_grants') or {}
    expected_execute = {'PUBLIC': False, 'anon': False, 'authenticated': False, 'service_role': True}
    if execute != expected_execute:
        errors.append(f'RPC execute grants must be {expected_execute!r}')
    if rpc.get('permission') != 'design.write':
        errors.append('RPC permission must be design.write')
    exact_set(rpc.get('allowed_roles_from_canonical_registry'), {'owner', 'admin', 'manager', 'designer'}, 'RPC design.write roles')
    exact_set(rpc.get('denied_roles'), {'accountant', 'installer', 'contractor'}, 'RPC denied roles')
    for flag in ('unknown_role_fails_closed', 'browser_actor_is_never_trusted'):
        if rpc.get(flag) is not True:
            errors.append(f'RPC must require {flag}')

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

    hash_contract = candidate.get('request_hash') or {}
    if hash_contract.get('algorithm') != 'sha256' or hash_contract.get('implementation_dependency') != 'extensions.digest':
        errors.append('request hashing must use extensions.digest SHA-256')
    if hash_contract.get('server_computed') is not True:
        errors.append('request hash must be server-computed')
    canonicalization = hash_contract.get('canonicalization') or {}
    if canonicalization.get('sort_need_ids') is not True or canonicalization.get('reject_unknown_fields_before_hashing') is not True:
        errors.append('request hash canonicalization must sort need IDs and reject unknown fields')

    concurrency = candidate.get('transaction_and_concurrency') or {}
    if concurrency.get('single_database_transaction') is not True:
        errors.append('candidate must require one database transaction')
    require_markers(concurrency.get('idempotency_advisory_lock') or '', ['pg_try_advisory_xact_lock', 'hashtextextended'], 'idempotency advisory lock')
    if concurrency.get('order_row_lock') != 'FOR UPDATE' or concurrency.get('existing_task_rows_lock') != 'FOR UPDATE':
        errors.append('order and existing task rows must be locked FOR UPDATE')
    for key in ('event_insert_failure', 'receipt_success_update_failure'):
        if 'rollback' not in str(concurrency.get(key) or ''):
            errors.append(f'{key} must roll back the transaction')

    response = candidate.get('safe_response') or {}
    if response.get('receipt_stores_safe_projection_only') is not True:
        errors.append('receipt must store safe projection only')
    forbidden_response = set(response.get('forbidden') or [])
    required_forbidden = {
        'client_name', 'client_phone', 'client_total', 'contractor_cost', 'profit',
        'balance', 'prepayment', 'payment_status', 'internal_comment', 'client_comment',
        'owner_id', 'created_by', 'updated_by', 'order.data', 'raw JWT', 'service key'
    }
    if not required_forbidden.issubset(forbidden_response):
        errors.append('candidate safe response does not forbid all sensitive fields')

    preflight = candidate.get('migration_preflight') or []
    for marker in ('development branch', 're-read live columns', 'leader_private schema', 'extensions.pgcrypto', 'duplicate', 'current Supabase CLI'):
        if not any(marker in step for step in preflight):
            errors.append(f'migration preflight missing: {marker}')

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
        errors.append('rollback must be application-first and preserve data')
    if rollback.get('schema_rollback_requires_separate_approval') is not True:
        errors.append('schema rollback must require separate approval')
    if rollback.get('never_delete_created_design_tasks_or_events_as_automatic_rollback') is not True:
        errors.append('automatic rollback must never delete created tasks or events')

    forbidden_stage = set(candidate.get('forbidden_in_this_stage') or [])
    for marker in ('production DDL', 'production DML', 'RPC deploy', 'Edge Function deploy', 'backfill', 'nav object change'):
        if marker not in forbidden_stage:
            errors.append(f'candidate stage boundary missing: {marker}')

# Compare candidate role list to canonical JS registry.
blocks = role_blocks(action_text)
canonical_roles = {
    role for role, actions in blocks.items()
    if 'ALL' in actions or 'DESIGN_WRITE' in actions
}
if canonical_roles != {'owner', 'admin', 'manager', 'designer'}:
    errors.append(f'canonical design.write role extraction drifted: {sorted(canonical_roles)}')
if candidate:
    candidate_roles = set((((candidate.get('objects') or {}).get('rpc') or {}).get('allowed_roles_from_canonical_registry') or []))
    if candidate_roles != canonical_roles:
        errors.append('candidate RPC roles differ from canonical action registry')

# Confirm terminal labels and approved semantics from the canonical status registry.
design_match = re.search(r'design_task:\s*domain\(\{(.*?)^\s*\}\),\s*\n\s*document:', status_text, re.MULTILINE | re.DOTALL)
if not design_match:
    errors.append('canonical design_task status domain not found')
else:
    block = design_match.group(1)
    require_markers(block, [
        "approved: status({ key: 'approved', label: 'Согласовано', allowedTo: ['completed']",
        "completed: status({ key: 'completed', label: 'Завершено', terminal: true",
        "cancelled: status({ key: 'cancelled', label: 'Отменено', terminal: true",
    ], 'canonical design_task status domain')

# The logical receipt storage remains part of the original server contract.
if server_contract:
    idempotency = server_contract.get('idempotency') or {}
    if idempotency.get('candidate_receipt_table') != 'leader_command_receipts':
        errors.append('original server contract logical receipt name drifted')
    if idempotency.get('durable_receipt_storage_required_before_enforcement') is not True:
        errors.append('original server contract must still require durable receipt storage')

require_markers(doc_text, [
    'Статус: `source_only_not_deployable`',
    'Mode: architecture specification only. No migration file was created',
    '`contracts/design-task-database-rpc-candidate-v1.json`',
    '`leader_private.leader_command_receipts`',
    '`leader_design_tasks_one_active_per_order_uidx`',
    "`order_id IS NOT NULL AND task_status NOT IN ('Завершено','Отменено')`",
    '`public.leader_create_design_task_from_order_rpc(p_payload jsonb)`',
    '`SECURITY INVOKER`',
    '`SET search_path = \'\'`',
    'EXECUTE granted only to `service_role`',
    'pg_try_advisory_xact_lock',
    'application_first_keep_data',
    'No production DDL or DML was executed.',
    'No development branch was created.',
    'No `nav_*`, `nav-*`, Parket or Broker object was changed.',
], 'database/RPC candidate specification')

for forbidden_sql in (
    'CREATE TABLE leader_private.leader_command_receipts',
    'CREATE OR REPLACE FUNCTION public.leader_create_design_task_from_order_rpc',
    'DROP TABLE leader_private.leader_command_receipts',
    'BEGIN;\nCREATE',
):
    if forbidden_sql in doc_text:
        errors.append(f'candidate specification must remain non-executable: found {forbidden_sql}')

require_markers(workflow_text, [
    'contracts/design-task-database-rpc-candidate-v1.json',
    'docs/CRM_DESIGN_TASK_DATABASE_RPC_CANDIDATE_SPEC_2026-07-13.md',
    'tools/check_design_task_database_rpc_candidate.py',
    'python3 tools/check_design_task_database_rpc_candidate.py',
], 'design task workflow integration')
require_markers(parent_checker_text, [
    'check_design_task_database_rpc_candidate.py',
    'Design task database/RPC candidate check failed',
], 'parent checker integration')

if MIGRATIONS.exists():
    forbidden_migrations = []
    patterns = ('*design*task*create*order*.sql', '*command*receipt*.sql', '*design*task*rpc*.sql')
    for pattern in patterns:
        forbidden_migrations.extend(MIGRATIONS.glob(pattern))
    if forbidden_migrations:
        unique = sorted({str(path.relative_to(ROOT)) for path in forbidden_migrations})
        errors.append('Approval-gated design task candidate must not be placed in supabase/migrations: ' + ', '.join(unique))

serialized = json.dumps(candidate, ensure_ascii=False) if candidate else ''
for text, label in ((serialized, 'candidate contract'), (doc_text, 'candidate specification')):
    for secret_marker in ('SUPABASE_SERVICE_ROLE_KEY=', 'sb_secret_', 'service_role_key'):
        if secret_marker in text:
            errors.append(f'{label} contains secret-like marker: {secret_marker}')
    for unrelated in ('nav_v2_', 'parket_', 'broker_'):
        if unrelated in text:
            errors.append(f'{label} contains unrelated object marker: {unrelated}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('Design task database/RPC candidate is private-storage, service-role-only, concurrency-safe, rollback-aware and non-deployable.')
