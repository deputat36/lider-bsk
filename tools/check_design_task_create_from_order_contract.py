#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DETAIL = ROOT / 'contracts' / 'design-task-create-from-order-v1.json'
REGISTRY = ROOT / 'contracts' / 'crm-v4-backend-command-contract-v1.json'
ACTIONS = ROOT / 'crm' / 'v4' / 'assets' / 'v4' / 'action-permissions-v1.js'
STATUSES = ROOT / 'crm' / 'v4' / 'assets' / 'v4' / 'status-transitions-v1.js'
DRAFT = ROOT / 'crm' / 'v4' / 'assets' / 'v4' / 'design-task-draft-model-v1.js'
REFERENCE = ROOT / 'tools' / 'design-task-create-from-order-reference-v1.mjs'
TEST = ROOT / 'tools' / 'test_design_task_create_from_order_contract.mjs'
DOC = ROOT / 'docs' / 'CRM_DESIGN_TASK_CREATE_FROM_ORDER_SERVER_CONTRACT_2026-07-13.md'
WORKFLOW = ROOT / '.github' / 'workflows' / 'crm-design-task-server-contract-check.yml'
EDGE_ORDERS = ROOT / 'supabase' / 'functions' / 'leader-crm-orders' / 'index.ts'
GENERAL_CHECKER = ROOT / 'tools' / 'check_crm_v4_backend_command_contract.py'

errors = []


def read_json(path: Path, label: str):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except FileNotFoundError:
        errors.append(f'Missing {label}: {path.relative_to(ROOT)}')
    except json.JSONDecodeError as exc:
        errors.append(f'Invalid JSON in {path.relative_to(ROOT)}: {exc}')
    return {}


def read_text(path: Path, label: str):
    if not path.exists():
        errors.append(f'Missing {label}: {path.relative_to(ROOT)}')
        return ''
    return path.read_text(encoding='utf-8')


def require_markers(text: str, markers, label: str):
    for marker in markers:
        if marker not in text:
            errors.append(f'{label}: missing marker {marker!r}')


def exact_set(value, expected, label: str):
    actual = set(value or [])
    if actual != set(expected):
        errors.append(f'{label}: expected {sorted(expected)}, found {sorted(actual)}')


detail = read_json(DETAIL, 'design task detail contract')
registry = read_json(REGISTRY, 'backend command registry')
action_text = read_text(ACTIONS, 'canonical action registry')
status_text = read_text(STATUSES, 'canonical status registry')
draft_text = read_text(DRAFT, 'design task draft model')
reference_text = read_text(REFERENCE, 'reference evaluator')
test_text = read_text(TEST, 'behavior test')
doc_text = read_text(DOC, 'server contract document')
workflow_text = read_text(WORKFLOW, 'server contract workflow')
edge_orders_text = read_text(EDGE_ORDERS, 'leader-crm-orders source')
general_checker_text = read_text(GENERAL_CHECKER, 'general backend contract checker')

if detail:
    expected_scalars = {
        'contract_version': 'leader-design-task-create-from-order-v1',
        'status': 'source_only_not_enforced',
        'scope': 'leader_crm_v4',
        'action': 'design_task.create_from_order',
        'permission': 'design.write',
        'entity': 'design_task',
        'status_domain': 'design_task',
    }
    for key, expected in expected_scalars.items():
        if detail.get(key) != expected:
            errors.append(f'detail contract: {key} must be {expected!r}')

    sources = detail.get('canonical_sources') or {}
    if sources.get('command_registry') != 'contracts/crm-v4-backend-command-contract-v1.json':
        errors.append('detail contract must reference canonical command registry')
    if sources.get('permission_registry') != 'crm/v4/assets/v4/action-permissions-v1.js':
        errors.append('detail contract must reference canonical action registry')
    if sources.get('status_registry') != 'crm/v4/assets/v4/status-transitions-v1.js':
        errors.append('detail contract must reference canonical status registry')
    if sources.get('status_registry_version') != 1:
        errors.append('detail contract must pin status registry version 1')

    runtime = detail.get('runtime_boundary') or {}
    for flag in (
        'edge_verify_jwt',
        'authenticated_user_required',
        'active_profile_required',
        'permission_check_before_business_reads',
        'permission_check_before_service_role_calls',
        'unknown_role_fails_closed',
        'generic_order_update_forbidden',
        'transaction_backed_rpc_or_database_function_required',
    ):
        if runtime.get(flag) is not True:
            errors.append(f'runtime boundary must require {flag}')
    if runtime.get('sequential_service_role_rest_writes_compliant') is not False:
        errors.append('sequential service-role REST writes must be non-compliant')

    request = detail.get('request') or {}
    exact_set(request.get('envelope_required'), {'action', 'request_id', 'expected_updated_at', 'payload'}, 'request envelope')
    exact_set(request.get('payload_required'), {'order_id', 'idempotency_key', 'need_ids', 'task'}, 'required payload')
    exact_set(request.get('payload_optional'), {'production_job_id'}, 'optional payload')
    exact_set(request.get('task_allowed_fields'), {'title', 'priority', 'deadline', 'task_text', 'reference_link'}, 'allowed task fields')
    rejected = set(request.get('task_rejected_client_fields') or [])
    required_rejected = {
        'task_status', 'layout_status', 'designer_name', 'layout_link', 'source',
        'owner_id', 'created_by', 'updated_by', 'client_name', 'client_phone',
        'client_comment', 'internal_comment', 'result_comment'
    }
    if not required_rejected.issubset(rejected):
        errors.append('server-owned and sensitive task fields are not fully rejected')
    if request.get('expected_updated_at_semantics') != 'leader_orders.updated_at':
        errors.append('expected_updated_at must represent leader_orders.updated_at')
    if request.get('request_id_format') != 'uuid':
        errors.append('request_id format must be uuid')
    if request.get('need_ids_min_items') != 1 or request.get('need_ids_unique') is not True:
        errors.append('need_ids must be non-empty and unique')

    defaults = detail.get('server_owned_defaults') or {}
    task_status = defaults.get('task_status') or {}
    if task_status.get('status_key') != 'new' or task_status.get('label_from_canonical_registry') != 'Новая':
        errors.append('server-owned initial design task status must be canonical new/Новая')
    if (defaults.get('layout_status') or {}).get('value') != 'Макет не начат':
        errors.append('server-owned compatibility layout status is missing')
    if defaults.get('source') != 'crm_v4_server_action':
        errors.append('server-owned source must be crm_v4_server_action')
    if defaults.get('owner_id') != 'authenticated_user_id' or defaults.get('created_by') != 'authenticated_user_id':
        errors.append('actor fields must come from authenticated user')
    if defaults.get('designer_name', 'unexpected') is not None or defaults.get('layout_link', 'unexpected') is not None:
        errors.append('designer_name and layout_link must start null')

    reads = detail.get('minimal_read_sets') or {}
    expected_read_sets = {
        'leader_user_profiles': {'user_id', 'role', 'is_active'},
        'leader_orders': {'id', 'order_number', 'lead_id', 'status', 'priority', 'deadline', 'layout_status', 'layout_link', 'is_archived', 'updated_at'},
        'leader_lead_needs': {'id', 'lead_id', 'need_type', 'title', 'need_design', 'design_reason', 'deadline_date', 'status', 'completeness_score', 'missing_fields', 'updated_at'},
        'leader_production_jobs': {'id', 'order_id', 'production_status'},
        'leader_design_tasks': {'id', 'order_id', 'production_job_id', 'task_status', 'updated_at'},
    }
    for table, fields in expected_read_sets.items():
        exact_set(reads.get(table), fields, f'minimal read set {table}')
    sensitive_reads = {'client_name', 'client_phone', 'client_total', 'contractor_cost', 'profit', 'balance', 'prepayment', 'payment_status', 'internal_comment', 'data'}
    if any(sensitive_reads.intersection(set(fields or [])) for fields in reads.values()):
        errors.append('minimal read sets contain sensitive or financial fields')

    validation = detail.get('validation_order') or []
    required_validation_markers = [
        'require canonical permission design.write',
        'reserve idempotency receipt',
        'compare expected_updated_at',
        'require every selected need to have need_design=true',
        'treat unknown design task status as active',
        'insert design task',
        'insert design_task.created audit event',
        'commit transaction',
    ]
    for marker in required_validation_markers:
        if not any(marker in step for step in validation):
            errors.append(f'validation order missing semantic step: {marker}')

    readiness = detail.get('need_readiness_policy') or {}
    if readiness.get('mode') != 'advisory_v1':
        errors.append('need readiness mode must be advisory_v1')
    if readiness.get('warnings_returned_in_success_envelope') is not True:
        errors.append('need readiness warnings must be returned')

    active = detail.get('active_task_rule') or {}
    exact_set(active.get('terminal_status_keys'), {'completed', 'cancelled'}, 'terminal design task statuses')
    exact_set(active.get('nonterminal_status_keys'), {'new', 'in_progress', 'review', 'revisions', 'approved'}, 'nonterminal design task statuses')
    if active.get('unknown_raw_status_behavior') != 'block_creation_as_active_conflict':
        errors.append('unknown design task status must fail closed as active conflict')
    if active.get('approved_is_active_until_completed') is not True:
        errors.append('approved design task must remain active until completed')
    if active.get('database_uniqueness_required_before_production') is not True:
        errors.append('database active-task uniqueness must be required')
    if active.get('application_only_duplicate_check_is_sufficient') is not False:
        errors.append('application-only duplicate check must be explicitly insufficient')

    idempotency = detail.get('idempotency') or {}
    for flag in ('request_id_required', 'idempotency_key_required', 'request_hash_required', 'durable_receipt_storage_required_before_enforcement'):
        if idempotency.get(flag) is not True:
            errors.append(f'idempotency must require {flag}')
    if idempotency.get('live_receipt_storage_present') is not False:
        errors.append('live receipt storage must remain documented as absent')
    if idempotency.get('candidate_receipt_table') != 'leader_command_receipts':
        errors.append('candidate receipt table must be leader_command_receipts')
    exact_set(idempotency.get('receipt_unique_scope'), {'action', 'idempotency_key'}, 'idempotency receipt uniqueness')
    if idempotency.get('browser_generated_author_or_status_trusted') is not False:
        errors.append('browser-generated author/status must never be trusted')

    transaction = detail.get('transaction') or {}
    if transaction.get('required') is not True or transaction.get('lock_order_before_existing_task_check') is not True:
        errors.append('transaction and order lock are mandatory')
    exact_set(transaction.get('atomic_writes'), {
        'idempotency receipt reservation',
        'leader_design_tasks insert',
        'leader_design_task_events insert',
        'idempotency success projection persistence',
    }, 'atomic writes')
    if transaction.get('rollback_if_event_insert_fails') is not True:
        errors.append('event failure must roll back task creation')
    if transaction.get('rollback_if_receipt_persistence_fails') is not True:
        errors.append('receipt failure must roll back task creation')
    if transaction.get('best_effort_audit_allowed') is not False:
        errors.append('best-effort audit must be forbidden')

    audit = detail.get('audit') or {}
    if audit.get('target') != 'leader_design_task_events':
        errors.append('audit target must be leader_design_task_events')
    if audit.get('event_type') != 'created' or audit.get('stable_event_key') != 'design_task.created_from_order':
        errors.append('design task creation audit event is incomplete')
    if audit.get('new_status_from_canonical_registry') != 'Новая':
        errors.append('audit new status must use canonical initial label')

    projection = detail.get('success_projection') or {}
    exact_set(projection.get('envelope_required'), {'ok', 'request_id', 'entity', 'order', 'events', 'warnings', 'idempotent_replay'}, 'success envelope')
    forbidden_projection = set(projection.get('forbidden_fields') or [])
    required_forbidden_projection = {
        'client_name', 'client_phone', 'client_total', 'contractor_cost', 'profit',
        'balance', 'prepayment', 'payment_status', 'internal_comment', 'client_comment',
        'owner_id', 'created_by', 'updated_by', 'order.data'
    }
    if not required_forbidden_projection.issubset(forbidden_projection):
        errors.append('safe success projection does not forbid all sensitive fields')

    error_contract = detail.get('error_contract') or {}
    exact_set(error_contract.keys(), {
        'access_denied', 'forbidden', 'unknown_action', 'validation_error', 'not_found',
        'conflict', 'duplicate_request', 'persistence_failed'
    }, 'stable design action errors')

    forbidden_effects = set(detail.get('forbidden_side_effects') or [])
    for marker in (
        'change order status',
        'change order layout_status',
        'change production status',
        'change payment status',
        'assign designer automatically',
        'overwrite an approved layout',
    ):
        if marker not in forbidden_effects:
            errors.append(f'forbidden side effects missing: {marker}')

    evidence = detail.get('live_schema_evidence') or {}
    for key in ('idempotency_column_present', 'active_task_unique_index_present', 'command_receipt_table_present', 'current_action_level_design_write_enforced'):
        if evidence.get(key) is not False:
            errors.append(f'live evidence must keep {key}=false')
    if evidence.get('current_design_rls_is_active_profile_only') is not True:
        errors.append('live RLS drift must be documented')

commands = (registry.get('commands') or {}) if registry else {}
command = commands.get('design_task.create_from_order') or {}
if not command:
    errors.append('general backend command registry is missing design_task.create_from_order')
else:
    expected = {
        'permission': 'design.write',
        'entity': 'design_task',
        'status_domain': 'design_task',
        'status_handling': 'validate_with_canonical_status_registry',
        'transaction_required': True,
        'optimistic_concurrency': 'required',
        'audit_target': 'leader_design_task_events',
        'audit_event': 'design_task.created_from_order',
        'detail_contract': 'contracts/design-task-create-from-order-v1.json',
    }
    for key, value in expected.items():
        if command.get(key) != value:
            errors.append(f'general registry design command: {key} must be {value!r}')
    exact_set(command.get('required_payload_fields'), {'order_id', 'idempotency_key', 'need_ids', 'task'}, 'general design command payload')
    if not {'entity', 'order', 'events', 'warnings'}.issubset(set(command.get('result_fields') or [])):
        errors.append('general design command result projection is incomplete')

require_markers(action_text, [
    "DESIGN_READ: 'design.read'",
    "DESIGN_WRITE: 'design.write'",
    'CRM_V4_ACTIONS.DESIGN_WRITE',
    'designer: Object.freeze([',
], 'action registry')
require_markers(status_text, [
    'design_task: domain({',
    "new: status({ key: 'new', label: 'Новая'",
    "approved: status({ key: 'approved', label: 'Согласовано'",
    "completed: status({ key: 'completed', label: 'Завершено', terminal: true",
    "cancelled: status({ key: 'cancelled', label: 'Отменено', terminal: true",
], 'status registry')
require_markers(draft_text, [
    "command: 'design_task.create_from_order'",
    'productionCreateEnabled: false',
    'idempotency_key: idempotencyKey',
], 'local draft compatibility')

require_markers(reference_text, [
    'buildDesignTaskCreatePlan',
    'canonicalRequestFingerprint',
    "const ACTION = 'design_task.create_from_order'",
    "return error('forbidden', 'design_write_required')",
    "return error('conflict', 'order_stale')",
    "return error('conflict', 'existing_task_unknown_status'",
    "return error('conflict', 'existing_active_task'",
    "target: 'leader_command_receipts'",
    "target: 'leader_design_tasks'",
    "target: 'leader_design_task_events'",
    "task_status: initialStatus.label",
    "source: 'crm_v4_server_action'",
], 'reference evaluator')
for forbidden in ('supabaseClient', '.from(', '.insert(', '.update(', '.delete(', '.upsert(', '.rpc(', 'functions.invoke', 'fetch('):
    if forbidden in reference_text:
        errors.append(f'reference evaluator must remain side-effect free: found {forbidden}')

require_markers(test_text, [
    'Design task create-from-order server contract behavior is valid.',
    "'leader_command_receipts:reserve'",
    "'leader_design_tasks:insert'",
    "'leader_design_task_events:insert'",
    "taskInsert.task_status, 'Новая'",
    "taskInsert.source, 'crm_v4_server_action'",
    "plan({ profileActive: false }).code, 'access_denied'",
    "plan({ canWrite: false }).code, 'forbidden'",
    "reason, 'order_stale'",
    "reason, 'existing_active_task'",
    "reason, 'existing_task_unknown_status'",
    "reason, 'server_owned_task_fields'",
    "idempotentReplay, true",
    "code, 'duplicate_request'",
    "reason, 'idempotency_hash_mismatch'",
], 'behavior test')

require_markers(doc_text, [
    'Статус этапа: `source_only_not_enforced`',
    '`contracts/design-task-create-from-order-v1.json`',
    '`design_task.create_from_order`',
    '`design.write`',
    'Последовательность отдельных service-role REST INSERT не соответствует контракту',
    'Unknown design task status считать active conflict',
    '`leader_command_receipts`',
    'Best-effort audit после успешного task INSERT запрещён',
    'current RLS не проверяет canonical `design.write`',
    'Production Supabase не изменялся',
    'Approval gates',
], 'server contract document')

require_markers(workflow_text, [
    'CRM design task server contract check',
    'python3 tools/check_design_task_create_from_order_contract.py',
    'node --check tools/design-task-create-from-order-reference-v1.mjs',
    'node --check tools/test_design_task_create_from_order_contract.mjs',
    'node tools/test_design_task_create_from_order_contract.mjs',
    'python3 tools/check_crm_v4_backend_command_contract.py',
], 'workflow')

if 'design_task.create_from_order' in edge_orders_text:
    errors.append('leader-crm-orders source must not implement the source-only design action yet')
require_markers(general_checker_text, [
    "'design_task.create_from_order': ('design.write', 'design_task')",
    "'leader_design_task_events'",
    'check_design_task_create_from_order_contract.py',
], 'general backend checker integration')

for text, label in ((detail and json.dumps(detail, ensure_ascii=False) or '', 'detail contract'), (doc_text, 'server contract document')):
    for secret_marker in ('SUPABASE_SERVICE_ROLE_KEY=', 'sb_secret_', 'service_role_key'):
        if secret_marker in text:
            errors.append(f'{label} contains secret-like marker: {secret_marker}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('Design task create-from-order server contract is fail-closed, transactional, idempotent and privacy-minimized.')
