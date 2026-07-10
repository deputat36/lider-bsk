#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / 'contracts' / 'crm-v4-command-transition-registry-v1.json'
ACTIONS = ROOT / 'crm' / 'v4' / 'assets' / 'v4' / 'action-permissions-v1.js'

errors = []

if not REGISTRY.exists():
    errors.append('Missing CRM v4 command transition registry')
    data = {}
else:
    try:
        data = json.loads(REGISTRY.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f'Invalid command transition registry JSON: {exc}')
        data = {}

if not ACTIONS.exists():
    errors.append('Missing canonical CRM v4 action permission registry')
    action_values = set()
else:
    action_text = ACTIONS.read_text(encoding='utf-8')
    action_values = set(re.findall(r":\s*'([a-z][a-z0-9_.]+)'", action_text))

required_roles = {
    'owner', 'admin', 'manager', 'accountant', 'designer', 'installer', 'contractor'
}
required_errors = {
    'access_denied', 'unknown_action', 'validation_error', 'forbidden',
    'not_found', 'conflict', 'invalid_transition', 'duplicate_request',
    'persistence_failed'
}
required_commands = {
    'calculation.save': 'calculations.write',
    'offer.create_from_calculation': 'offers.write',
    'offer.transition': 'offers.transition',
    'order.create_from_offer': 'orders.create',
    'order.create_manual': 'orders.create',
    'order.transition': 'orders.transition',
    'lead.transition': 'leads.transition',
    'production_job.update': 'production.write',
    'installation_job.update': 'installation.write',
}
required_domains = {
    'lead', 'calculation', 'offer', 'order', 'production_job', 'installation_job'
}
required_compatibility = {
    'calculation': {'Расчёт подготовлен'},
    'offer': {'Отправлено'},
    'order': {'Макет на согласовании', 'Отмена'},
    'production_job': {'В производстве'},
}
allowed_concurrency = {'required', 'required_for_update', 'not_applicable'}
allowed_audit_targets = {
    'leader_activity_log',
    'leader_lead_events',
    'leader_commercial_offer_events',
    'leader_production_events',
    'leader_installation_events',
}

if data:
    if data.get('registry_version') != 'leader-command-transitions-v1':
        errors.append('Unexpected command transition registry version')
    if data.get('status') != 'source_only_not_enforced':
        errors.append('Registry must explicitly remain source_only_not_enforced')
    if data.get('scope') != 'leader_crm_v4':
        errors.append('Registry scope must be leader_crm_v4')
    if set(data.get('canonical_roles') or []) != required_roles:
        errors.append('Canonical role set is incomplete or contains non-live roles')
    if not required_errors.issubset(set(data.get('stable_error_codes') or [])):
        errors.append('Stable error code set is incomplete')

    command_envelope = data.get('command_envelope') or {}
    if not {'action', 'request_id', 'payload'}.issubset(set(command_envelope.get('required') or [])):
        errors.append('Command envelope must require action, request_id and payload')
    if not {'entity_id', 'expected_updated_at'}.issubset(set(command_envelope.get('conditional') or [])):
        errors.append('Command envelope must define entity_id and expected_updated_at')

    success_envelope = data.get('success_envelope') or {}
    if not {'ok', 'request_id', 'entity', 'events'}.issubset(set(success_envelope.get('required') or [])):
        errors.append('Success envelope is incomplete')

    commands = data.get('commands') or {}
    missing_commands = sorted(set(required_commands) - set(commands))
    if missing_commands:
        errors.append('Missing command contracts: ' + ', '.join(missing_commands))

    domains = data.get('transition_domains') or {}
    missing_domains = sorted(required_domains - set(domains))
    if missing_domains:
        errors.append('Missing transition domains: ' + ', '.join(missing_domains))

    for command_name, expected_permission in required_commands.items():
        contract = commands.get(command_name) or {}
        permission = contract.get('permission')
        if permission != expected_permission:
            errors.append(f'{command_name}: expected permission {expected_permission}, found {permission}')
        if permission not in action_values:
            errors.append(f'{command_name}: permission is absent from action-permissions-v1.js')
        if contract.get('transaction_required') is not True:
            errors.append(f'{command_name}: transaction_required must be true')
        if contract.get('optimistic_concurrency') not in allowed_concurrency:
            errors.append(f'{command_name}: invalid optimistic_concurrency mode')
        domain = contract.get('transition_domain')
        if domain not in domains:
            errors.append(f'{command_name}: unknown transition domain {domain}')
        audit_target = contract.get('audit_target')
        if audit_target not in allowed_audit_targets:
            errors.append(f'{command_name}: unknown audit target {audit_target}')
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

    for domain_name in required_domains:
        domain = domains.get(domain_name) or {}
        canonical = domain.get('canonical_states') or []
        compatibility = domain.get('compatibility_states') or []
        states = canonical + compatibility
        state_set = set(states)
        transitions = domain.get('transitions') or {}

        if not canonical:
            errors.append(f'{domain_name}: canonical state list is empty')
        if len(states) != len(state_set):
            errors.append(f'{domain_name}: duplicate canonical/compatibility state')
        if domain.get('initial_state') not in state_set:
            errors.append(f'{domain_name}: initial state is not declared')
        if domain.get('allow_same_status') is not True:
            errors.append(f'{domain_name}: idempotent same-status retries must be allowed')
        if set(transitions) != state_set:
            missing = sorted(state_set - set(transitions))
            extra = sorted(set(transitions) - state_set)
            errors.append(f'{domain_name}: transition keys mismatch; missing={missing}, extra={extra}')

        for source, targets in transitions.items():
            if len(targets) != len(set(targets)):
                errors.append(f'{domain_name}:{source}: duplicate transition target')
            if source in targets:
                errors.append(f'{domain_name}:{source}: same-status transition belongs to allow_same_status')
            unknown = sorted(set(targets) - state_set)
            if unknown:
                errors.append(f'{domain_name}:{source}: unknown targets {unknown}')

        for terminal in domain.get('terminal_states') or []:
            if terminal not in state_set:
                errors.append(f'{domain_name}: terminal state {terminal} is not declared')
            elif transitions.get(terminal):
                errors.append(f'{domain_name}: terminal state {terminal} has outgoing transitions')

        unknown_reason_targets = sorted(set(domain.get('requires_reason_targets') or []) - state_set)
        if unknown_reason_targets:
            errors.append(f'{domain_name}: unknown reason-required targets {unknown_reason_targets}')

    for domain_name, expected in required_compatibility.items():
        actual = set((domains.get(domain_name) or {}).get('compatibility_states') or [])
        if not expected.issubset(actual):
            errors.append(f'{domain_name}: missing live compatibility states {sorted(expected - actual)}')

source_markers = {
    'crm/v4/assets/v4/leads.js': [
        'Новая', 'В работе', 'Уточнение деталей', 'Расчёт подготовлен',
        'КП отправлено', 'Ждём ответ', 'Нужно пересчитать', 'Согласовано',
        'Создан заказ', 'Отказ', 'Не отвечает', 'Дорого', 'Передумал', 'Спам'
    ],
    'crm/v4/assets/v4/offers.js': [
        'Черновик', 'КП отправлено', 'Согласовано', 'Отклонено',
        'КП сформировано', 'Согласован', 'Отклонён'
    ],
    'crm/v4/assets/v4/orders.js': [
        'Новый', 'В производстве', 'Готово', 'Выдано', 'Закрыт', 'Отменён',
        'Создан заказ'
    ],
    'crm/v4/assets/v4/production-job-card-v2.js': [
        'Не передано', 'Передано в производство', 'В работе', 'Готово', 'Проблема'
    ],
    'crm/v4/assets/v4/installation-job-card-v2.js': [
        'Нужно назначить', 'Запланирован', 'В работе', 'Выполнен', 'Проблема'
    ],
}
for relative, markers in source_markers.items():
    path = ROOT / relative
    if not path.exists():
        errors.append(f'Missing transition source module: {relative}')
        continue
    text = path.read_text(encoding='utf-8')
    missing = [marker for marker in markers if marker not in text]
    if missing:
        errors.append(f'{relative}: missing status markers {missing}')

registry_text = REGISTRY.read_text(encoding='utf-8') if REGISTRY.exists() else ''
if 'nav_' in registry_text or 'nav-v2' in registry_text:
    errors.append('Command transition registry must not reference nav_* contour')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM v4 command contracts, permissions, compatibility states and transitions are internally consistent.')
