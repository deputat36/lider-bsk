#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
model = root / 'crm/v4/assets/v4/installation-status-ui-model-v1.js'
card = root / 'crm/v4/assets/v4/installation-job-card-v2.js'
test = root / 'tools/test_crm_installation_status_ui.mjs'
manual = root / 'docs/CRM_INSTALLATION_STATUS_UI_REGISTRY_MANUAL_TEST_2026-07-11.md'

errors = []

checks = {
    model: [
        "from './status-transitions-v1.js'",
        'LEGACY_INSTALLATION_STATUS_KEYS',
        "'Нужно назначить': 'unassigned'",
        "'Проблема': 'postponed'",
        'STATUS_TIMESTAMP_FIELDS',
        "in_progress: 'started_at'",
        "completed: 'completed_at'",
        'originalInstallationStatus',
        'rawInstallationStatus',
        'installationStatusDefinition',
        'installationStatusUiModel',
        'installationStatusSelectOptions',
        'validateInstallationStatusTransition',
        'installationStatusTimestampPatch',
        'unknown_status_preserved',
        'Неизвестный статус монтажа',
        'storedValue: fromOriginal',
        'storedValue: to.label',
    ],
    card: [
        "from './installation-status-ui-model-v1.js'",
        'installationStatusSelectOptions',
        'installationStatusTimestampPatch',
        'installationStatusUiModel',
        'validateInstallationStatusTransition',
        'renderInstallationStatusOptions',
        'renderInstallationStatusNotice',
        'data-installation-status-warning',
        'data-installation-status-null',
        'data-installation-status-legacy',
        'data-installation-status-terminal',
        'const transition = validateInstallationStatusTransition(old.install_status, selectedStatus);',
        'if (!transition.ok) throw new Error',
        'const status = transition.storedValue;',
        '...installationStatusTimestampPatch(transition, old, nowIso())',
        'install_status: status',
        'old_status: old.install_status, new_status: status',
        "'scheduled_at','started_at','completed_at'",
    ],
    test: [
        "installationStatusDefinition(null)?.key, 'unassigned'",
        "installationStatusDefinition('Нужно назначить')?.key, 'unassigned'",
        "installationStatusDefinition('Проблема')?.key, 'postponed'",
        "['Не назначен', 'Запланирован', 'Не требуется', 'Отменён']",
        "validateInstallationStatusTransition('Выполнен', 'В работе').reason, 'terminal_status'",
        "validateInstallationStatusTransition(unknown, unknown).storedValue, unknown",
        "{ started_at: now }",
        "{ completed_at: now }",
        'CRM installation status UI registry behavior is valid.',
    ],
    manual: [
        'leader_installation_jobs.install_status',
        '`Запланирован` — 1',
        '`NULL` — 2',
        '`Нужно назначить` → canonical `Не назначен`',
        '`Проблема` → canonical `Перенесён`',
        'Legacy Custom Installation',
        'blocked before any Supabase request',
        'It does not have `postponed_at` or `cancelled_at`.',
        'no historical status backfill is performed',
        '`nav_*`, `nav-*`, `parket-*` and `broker-*` remain untouched',
    ],
}

for path, markers in checks.items():
    if not path.exists():
        errors.append(f'Missing installation status UI registry file: {path.relative_to(root)}')
        continue
    text = path.read_text(encoding='utf-8')
    for marker in markers:
        if marker not in text:
            errors.append(f'Missing installation status UI marker in {path.relative_to(root)}: {marker}')

if model.exists():
    text = model.read_text(encoding='utf-8')
    for marker in ['supabaseClient', ".from('leader_", '.insert(', '.update(', '.delete(', '.upsert(', '.rpc(', 'fetch(', 'postponed_at', 'cancelled_at']:
        if marker in text:
            errors.append(f'Installation status UI model must remain side-effect/schema safe: {marker}')

if card.exists():
    text = card.read_text(encoding='utf-8')
    forbidden_legacy_options = [
        "job.install_status === 'Нужно назначить'",
        "job.install_status === 'Проблема'",
    ]
    for marker in forbidden_legacy_options:
        if marker in text:
            errors.append(f'Legacy hardcoded installation status option remains: {marker}')

    validation_index = text.find('const transition = validateInstallationStatusTransition')
    job_update_index = text.find("from('leader_installation_jobs').update(patch)")
    order_update_index = text.find("from('leader_orders').update({ installation_status: status")
    event_insert_index = text.find("from('leader_installation_events').insert(")
    if validation_index < 0:
        errors.append('Installation status validation is missing')
    for label, index in [('job update', job_update_index), ('order update', order_update_index), ('event insert', event_insert_index)]:
        if index < 0:
            errors.append(f'Missing existing installation {label} path')
        elif validation_index >= index:
            errors.append(f'Installation status validation must run before {label}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM installation status editor uses the canonical registry, preserves NULL/legacy/unknown values and validates before writes.')
