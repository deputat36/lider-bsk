#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
registry = root / 'crm/v4/assets/v4/status-transitions-v1.js'
test = root / 'tools/test_crm_status_transitions.mjs'
doc = root / 'docs/CRM_STATUS_TRANSITION_REGISTRY_2026-07-10.md'
addendum = root / 'docs/CRM_STATUS_TRANSITION_EXECUTION_ADDENDUM_2026-07-10.md'
quality_panel = root / 'crm/v4/assets/v4/lead-operational-quality-v1.js'
lead_ui_model = root / 'crm/v4/assets/v4/lead-status-ui-model-v1.js'
lead_ui_adapter = root / 'crm/v4/assets/v4/lead-status-ui-registry-v1.js'

errors = []

if not registry.exists():
    errors.append('Missing CRM status transition registry')
else:
    text = registry.read_text(encoding='utf-8')
    required = [
        'CRM_STATUS_REGISTRY_VERSION = 1',
        'CRM_STATUS_DOMAINS',
        "lead: domain({",
        "offer: domain({",
        "order: domain({",
        "layout: domain({",
        "production: domain({",
        "installation: domain({",
        "payment: domain({",
        "payment_record: domain({",
        "design_task: domain({",
        "document: domain({",
        "label: 'Новая'",
        "label: 'Расчёт подготовлен'",
        "label: 'КП отправлено'",
        "label: 'Создан заказ'",
        "label: 'Черновик'",
        "label: 'Отправлено'",
        "label: 'Согласовано'",
        "label: 'Макет на согласовании'",
        "label: 'В производстве'",
        "label: 'Выдано'",
        "label: 'Не оплачено'",
        "label: 'Частично оплачено'",
        "label: 'Макета нет'",
        "label: 'Макет согласован'",
        "label: 'Не передано'",
        "label: 'Не назначен'",
        "label: 'Запланирован'",
        "label: 'Не требуется'",
        "label: 'Проведён'",
        "label: 'Подписан'",
        "CRM_V4_ACTIONS.DOCUMENTS_SIGN",
        "CRM_V4_ACTIONS.DOCUMENTS_VOID",
        'canonicalStatusKey',
        'canTransitionStatus',
        'transitionPermission',
        'validateStatusTransition',
        "reason: from.terminal ? 'terminal_status' : 'transition_not_allowed'",
        'auditEvent',
        'timestampField',
    ]
    for marker in required:
        if marker not in text:
            errors.append(f'Missing status registry marker: {marker}')

    forbidden = [
        ".insert(",
        ".update(",
        ".delete(",
        ".upsert(",
        "supabaseClient",
        "leader_",
        "fetch(",
    ]
    for marker in forbidden:
        if marker in text:
            errors.append(f'Status registry must remain side-effect free: {marker}')

if not test.exists():
    errors.append('Missing CRM status transition behavior test')
else:
    text = test.read_text(encoding='utf-8')
    required = [
        "canonicalStatusKey('lead', 'Расчет подготовлен')",
        "canonicalStatusKey('installation', null)",
        "canTransitionStatus('lead', 'Новая', 'В работе')",
        "canTransitionStatus('lead', 'Новая', 'Создан заказ')",
        "terminal.reason, 'terminal_status'",
        "signed.permission, 'documents.sign'",
        "transitionPermission('document', 'Аннулирован'), 'documents.void'",
        'CRM status transition registry behavior is valid.',
    ]
    for marker in required:
        if marker not in text:
            errors.append(f'Missing status behavior test marker: {marker}')

if not doc.exists():
    errors.append('Missing CRM status transition registry document')
else:
    text = doc.read_text(encoding='utf-8')
    required = [
        'Mode: source contract and read-only Supabase audit only',
        'CRM_STATUS_REGISTRY_VERSION = 1',
        'Read-only production snapshot',
        '| Новая | 3 |',
        '| Создан заказ | 5 |',
        '| Согласовано | 5 |',
        '| Выдано | 1 |',
        '| Частично оплачено | 1 |',
        '| NULL | 2 |',
        '`documents.sign`',
        'A terminal state cannot be changed merely by editing a select element.',
        'no historical status rewrite',
        'no `nav_*` changes',
        'node tools/test_crm_status_transitions.mjs',
    ]
    for marker in required:
        if marker not in text:
            errors.append(f'Missing status registry document marker: {marker}')

if not addendum.exists():
    errors.append('Missing CRM status transition execution addendum')
else:
    text = addendum.read_text(encoding='utf-8')
    required = [
        'The backlog line `centralized status registry` in the earlier execution snapshot is now resolved in GitHub source.',
        'status registry validation in `.github/workflows/crm-site-full-audit-check.yml`',
        'Distinct production values were read without DML',
        'First module adoption',
        "statusDefinition('lead', lead.status)",
        'The previous duplicate hardcoded terminal-status Set was removed.',
        'Second module adoption — lead status UI',
        'lead-status-ui-model-v1.js',
        'lead-status-ui-registry-v1.js',
        'preserves unknown raw statuses as exact filter values',
        'blocks disallowed status clicks in capture phase',
        'blocks the hidden legacy `Новая → Ждём ответ` transition',
        'Replace duplicated status arrays in orders/production/installation one module at a time.',
        'Third module adoption — commercial-offer status UI',
        'offer-status-ui-model-v1.js',
        'uses canonical new sent status `Отправлено`',
        'keeps legacy `КП отправлено` readable through an alias',
        'Use registry validation in future Edge/RPC transition commands.',
        'No production status rows were changed.',
        'Server-side transition enforcement remains tracked in #202 and #204.',
    ]
    for marker in required:
        if marker not in text:
            errors.append(f'Missing status registry addendum marker: {marker}')

if not quality_panel.exists():
    errors.append('Missing first status registry adopter: lead operational quality panel')
else:
    text = quality_panel.read_text(encoding='utf-8')
    required = [
        "import { statusDefinition } from './status-transitions-v1.js';",
        "statusDefinition('lead', lead?.status || 'Новая')",
        'definition.terminal !== true',
    ]
    for marker in required:
        if marker not in text:
            errors.append(f'Missing status registry adoption marker: {marker}')
    if 'TERMINAL_LEAD_STATUSES' in text:
        errors.append('Duplicate TERMINAL_LEAD_STATUSES set must not remain after registry adoption')

for path, markers in {
    lead_ui_model: [
        "from './status-transitions-v1.js'",
        'leadStatusFilterOptions',
        'leadStatusUiModel',
        'unknownLeadStatuses',
    ],
    lead_ui_adapter: [
        "from './lead-status-ui-model-v1.js'",
        'syncStatusFilter',
        'syncLeadCardStatusActions',
        'guardStatusClicks',
        "document.addEventListener('click', guardStatusClicks, true)",
    ],
}.items():
    if not path.exists():
        errors.append(f'Missing second status registry adopter: {path.relative_to(root)}')
        continue
    text = path.read_text(encoding='utf-8')
    for marker in markers:
        if marker not in text:
            errors.append(f'Missing second adoption marker in {path.relative_to(root)}: {marker}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM status transition registry, three UI adoptions, documentation, addendum and behavior tests are valid.')
