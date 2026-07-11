#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
model = root / 'crm/v4/assets/v4/production-status-ui-model-v1.js'
card = root / 'crm/v4/assets/v4/production-job-card-v2.js'
test = root / 'tools/test_crm_production_status_ui.mjs'
manual = root / 'docs/CRM_PRODUCTION_STATUS_UI_REGISTRY_MANUAL_TEST_2026-07-11.md'

errors = []

checks = {
    model: [
        "from './status-transitions-v1.js'",
        'LEGACY_PRODUCTION_STATUS_KEYS',
        "'Передано в производство': 'queued'",
        "'В работе': 'in_production'",
        "'Проблема': 'stopped'",
        'STATUS_TIMESTAMP_FIELDS',
        "queued: 'sent_to_contractor_at'",
        "ready: 'ready_at'",
        "issued: 'issued_at'",
        'rawProductionStatus',
        'productionStatusDefinition',
        'productionStatusUiModel',
        'productionStatusSelectOptions',
        'validateProductionStatusTransition',
        'productionStatusTimestampPatch',
        'unknown_status_preserved',
        'Неизвестный статус производства',
        'storedValue: fromRaw',
        'storedValue: to.label',
    ],
    card: [
        "from './production-status-ui-model-v1.js'",
        'productionStatusSelectOptions',
        'productionStatusTimestampPatch',
        'productionStatusUiModel',
        'validateProductionStatusTransition',
        'renderProductionStatusOptions',
        'renderProductionStatusNotice',
        'data-production-status-warning',
        'data-production-status-legacy',
        'data-production-status-terminal',
        'const transition = validateProductionStatusTransition(old.production_status, selectedStatus);',
        'if (!transition.ok) throw new Error',
        'const status = transition.storedValue;',
        '...productionStatusTimestampPatch(transition, old, nowIso())',
        "production_status: status",
        "old_status: old.production_status, new_status: status",
        "'sent_to_contractor_at','ready_at','issued_at'",
    ],
    test: [
        "productionStatusDefinition('Не передано')?.key, 'not_sent'",
        "productionStatusDefinition('Передано в производство')?.key, 'queued'",
        "productionStatusDefinition('В работе')?.key, 'in_production'",
        "productionStatusDefinition('Проблема')?.key, 'stopped'",
        "['Не передано', 'В очереди', 'В производстве', 'Не требуется']",
        "validateProductionStatusTransition('Выдано', 'В производстве').reason, 'terminal_status'",
        "validateProductionStatusTransition(unknown, unknown).storedValue, unknown",
        "{ sent_to_contractor_at: now }",
        "{ ready_at: now }",
        "{ issued_at: now }",
        'CRM production status UI registry behavior is valid.',
    ],
    manual: [
        'leader_production_jobs.production_status',
        '`Не передано` — 1',
        '`В производстве` — 1',
        '`Передано в производство` → canonical `В очереди`',
        '`В работе` → canonical `В производстве`',
        '`Проблема` → canonical `Приостановлено`',
        'Legacy Custom Production',
        'blocked before any Supabase request',
        'It does not have `started_at`.',
        'no historical status backfill is performed',
        '`nav_*`, `nav-*`, `parket-*` and `broker-*` remain untouched',
    ],
}

for path, markers in checks.items():
    if not path.exists():
        errors.append(f'Missing production status UI registry file: {path.relative_to(root)}')
        continue
    text = path.read_text(encoding='utf-8')
    for marker in markers:
        if marker not in text:
            errors.append(f'Missing production status UI marker in {path.relative_to(root)}: {marker}')

if model.exists():
    text = model.read_text(encoding='utf-8')
    for marker in ['supabaseClient', ".from('leader_", '.insert(', '.update(', '.delete(', '.upsert(', '.rpc(', 'fetch(', 'started_at']:
        if marker in text:
            errors.append(f'Production status UI model must remain side-effect/schema safe: {marker}')

if card.exists():
    text = card.read_text(encoding='utf-8')
    forbidden_legacy_options = [
        "job.production_status === 'Передано в производство'",
        "job.production_status === 'В работе'",
        "job.production_status === 'Проблема'",
    ]
    for marker in forbidden_legacy_options:
        if marker in text:
            errors.append(f'Legacy hardcoded production status option remains: {marker}')

    validation_index = text.find('const transition = validateProductionStatusTransition')
    job_update_index = text.find("from('leader_production_jobs').update(patch)")
    order_update_index = text.find("from('leader_orders').update({ production_status: status")
    event_insert_index = text.find("from('leader_production_events').insert(")
    if validation_index < 0:
        errors.append('Production status validation is missing')
    for label, index in [('job update', job_update_index), ('order update', order_update_index), ('event insert', event_insert_index)]:
        if index < 0:
            errors.append(f'Missing existing production {label} path')
        elif validation_index >= index:
            errors.append(f'Production status validation must run before {label}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM production status editor uses the canonical registry, preserves legacy/unknown raw values and validates before writes.')
