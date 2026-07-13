#!/usr/bin/env python3
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / 'contracts' / 'crm-v4-backend-command-contract-v1.json'
ACTIONS = ROOT / 'crm' / 'v4' / 'assets' / 'v4' / 'action-permissions-v1.js'
STATUSES = ROOT / 'crm' / 'v4' / 'assets' / 'v4' / 'status-transitions-v1.js'
DOC = ROOT / 'docs' / 'CRM_V4_BACKEND_COMMAND_CONTRACT_2026-07-10.md'
ADDENDUM = ROOT / 'docs' / 'CRM_BACKEND_COMMAND_CONTRACT_EXECUTION_ADDENDUM_2026-07-10.md'
DETAIL_CHECKER = ROOT / 'tools' / 'check_design_task_create_from_order_contract.py'

errors = []

try:
    data = json.loads(CONTRACT.read_text(encoding='utf-8'))
except FileNotFoundError:
    errors.append('Missing CRM v4 backend command contract')
    data = {}
except json.JSONDecodeError as exc:
    errors.append(f'Invalid backend command contract JSON: {exc}')
    data = {}

if not ACTIONS.exists():
    errors.append('Missing canonical action permission registry')
    action_values = set()
else:
    action_text = ACTIONS.read_text(encoding='utf-8')
    action_values = set(re.findall(r":\s*'([a-z][a-z0-9_.]+)'", action_text))

if not STATUSES.exists():
    errors.append('Missing canonical status transition registry')
    status_text = ''
    status_domains = set()
else:
    status_text = STATUSES.read_text(encoding='utf-8')
    status_domains = set(re.findall(r'^\s{2}([a-z_]+): domain\(\{', status_text, re.MULTILINE))

required_roles = {
    'owner', 'admin', 'manager', 'accountant', 'designer', 'installer', 'contractor'
}
required_errors = {
    'access_denied', 'unknown_action', 'validation_error', 'forbidden',
    'not_found', 'conflict', 'invalid_transition', 'duplicate_request',
    'persistence_failed'
}
required_commands = {
    'calculation.save': ('calculations.write', None),
    'offer.create_from_calculation': ('offers.write', 'offer'),
    'offer.transition': ('offers.transition', 'offer'),
    'order.create_from_offer': ('orders.create', 'order'),
    'order.create_manual': ('orders.create', 'order'),
    'order.transition': ('orders.transition', 'order'),
    'lead.transition': ('leads.transition', 'lead'),
    'design_task.create_from_order': ('design.write', 'design_task'),
    'production_job.update': ('production.write', 'production'),
    'installation_job.update': ('installation.write', 'installation'),
}
allowed_concurrency = {'required', 'required_for_update', 'not_applicable'}
allowed_status_handling = {
    'validate_with_canonical_status_registry',
    'legacy_calculation_status_until_server_contract',
}
allowed_audit_targets = {
    'leader_activity_log',
    'leader_lead_events',
    'leader_commercial_offer_events',
    'leader_design_task_events',
    'leader_production_events',
    'leader_installation_events',
}

if data:
    if data.get('contract_version') != 'leader-backend-command-contract-v1':
        errors.append('Unexpected backend command contract version')
    if data.get('status') != 'source_only_not_enforced':
        errors.append('Backend command contract must remain source_only_not_enforced')
    if data.get('scope') != 'leader_crm_v4':
        errors.append('Backend command contract scope must be leader_crm_v4')
    if 'transition_domains' in data:
        errors.append('Backend command contract must not duplicate status transition graphs')
    if set(data.get('canonical_roles') or []) != required_roles:
        errors.append('Canonical role set is incomplete or contains unknown roles')
    if not required_errors.issubset(set(data.get('stable_error_codes') or [])):
        errors.append('Stable error code set is incomplete')

    registry = data.get('status_registry') or {}
    if registry.get('path') != 'crm/v4/assets/v4/status-transitions-v1.js':
        errors.append('Backend contract must reference canonical status-transitions-v1.js')
    if registry.get('version_export') != 'CRM_STATUS_REGISTRY_VERSION':
        errors.append('Unexpected status registry version export')
    if registry.get('expected_version') != 1:
        errors.append('Unexpected expected status registry version')
    if registry.get('domains_export') != 'CRM_STATUS_DOMAINS':
        errors.append('Unexpected status registry domains export')
    if registry.get('authoritative') is not True:
        errors.append('Status registry reference must be authoritative')
    if 'CRM_STATUS_REGISTRY_VERSION = 1' not in status_text:
        errors.append('Canonical status registry version marker is missing')
    if 'CRM_STATUS_DOMAINS' not in status_text:
        errors.append('Canonical status registry domains export is missing')

    command_envelope = data.get('command_envelope') or {}
    if not {'action', 'request_id', 'payload'}.issubset(set(command_envelope.get('required') or [])):
        errors.append('Command envelope must require action, request_id and payload')
    if not {'entity_id', 'expected_updated_at'}.issubset(set(command_envelope.get('conditional') or [])):
        errors.append('Command envelope must define entity_id and expected_updated_at')

    success_envelope = data.get('success_envelope') or {}
    if not {'ok', 'request_id', 'entity', 'events'}.issubset(set(success_envelope.get('required') or [])):
        errors.append('Success envelope is incomplete')

    commands = data.get('commands') or {}
    missing = sorted(set(required_commands) - set(commands))
    extra = sorted(set(commands) - set(required_commands))
    if missing:
        errors.append('Missing backend command contracts: ' + ', '.join(missing))
    if extra:
        errors.append('Unexpected backend command contracts: ' + ', '.join(extra))

    for command_name, (expected_permission, expected_domain) in required_commands.items():
        contract = commands.get(command_name) or {}
        permission = contract.get('permission')
        if permission != expected_permission:
            errors.append(f'{command_name}: expected permission {expected_permission}, found {permission}')
        if permission not in action_values:
            errors.append(f'{command_name}: permission is absent from action-permissions-v1.js')

        domain = contract.get('status_domain')
        if domain != expected_domain:
            errors.append(f'{command_name}: expected status domain {expected_domain}, found {domain}')
        if domain is not None and domain not in status_domains:
            errors.append(f'{command_name}: status domain {domain} is absent from canonical registry')

        handling = contract.get('status_handling')
        if handling not in allowed_status_handling:
            errors.append(f'{command_name}: invalid status handling mode')
        if expected_domain is None and handling != 'legacy_calculation_status_until_server_contract':
            errors.append(f'{command_name}: missing explicit legacy calculation status handling')
        if expected_domain is not None and handling != 'validate_with_canonical_status_registry':
            errors.append(f'{command_name}: must use canonical status registry validation')

        if contract.get('transaction_required') is not True:
            errors.append(f'{command_name}: transaction_required must be true')
        if contract.get('optimistic_concurrency') not in allowed_concurrency:
            errors.append(f'{command_name}: invalid optimistic_concurrency mode')
        if contract.get('audit_target') not in allowed_audit_targets:
            errors.append(f'{command_name}: unknown audit target')
        audit_event = str(contract.get('audit_event') or '')
        if '.' not in audit_event:
            errors.append(f'{command_name}: audit event must be a stable dotted key')

        payload_fields = contract.get('required_payload_fields') or []
        if not payload_fields or len(payload_fields) != len(set(payload_fields)):
            errors.append(f'{command_name}: required payload fields must be non-empty and unique')
        result_fields = set(contract.get('result_fields') or [])
        if not {'entity', 'events'}.issubset(result_fields):
            errors.append(f'{command_name}: result fields must include entity and events')
        if not contract.get('side_effects'):
            errors.append(f'{command_name}: side effects must be documented')

    design_command = commands.get('design_task.create_from_order') or {}
    if design_command.get('detail_contract') != 'contracts/design-task-create-from-order-v1.json':
        errors.append('design_task.create_from_order must reference its detail contract')

for path, label, markers in (
    (DOC, 'backend command contract document', [
        'status-transitions-v1.js is the only authoritative status graph',
        'leader-backend-command-contract-v1',
        'source_only_not_enforced',
        'calculation.save',
        'design_task.create_from_order',
        'leader_design_task_events',
        'installation_job.update',
        'No production DDL or DML was executed',
    ]),
    (ADDENDUM, 'backend command execution addendum', [
        'transaction-backed commands from backend inventory',
        'resolved at source-contract level',
        'Server implementation and integration proof remain open',
        'status-transitions-v1.js remains authoritative',
        'No production Edge Function, RPC, RLS, grant or data was changed',
    ]),
):
    if not path.exists():
        errors.append(f'Missing {label}')
        continue
    text = path.read_text(encoding='utf-8')
    for marker in markers:
        if marker not in text:
            errors.append(f'Missing marker in {path.relative_to(ROOT)}: {marker}')

contract_text = CONTRACT.read_text(encoding='utf-8') if CONTRACT.exists() else ''
for forbidden in ('"transition_domains"', 'nav_', 'nav-v2', 'service_role', 'sb_secret_'):
    if forbidden in contract_text:
        errors.append(f'Backend command contract contains forbidden marker: {forbidden}')

if not DETAIL_CHECKER.exists():
    errors.append('Missing design task detail contract checker')
else:
    result = subprocess.run(
        [sys.executable, str(DETAIL_CHECKER)],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        output = (result.stdout + '\n' + result.stderr).strip()
        errors.append('Design task detail contract check failed:\n' + output)

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM v4 backend command contract is complementary to the canonical status registry and internally consistent.')
