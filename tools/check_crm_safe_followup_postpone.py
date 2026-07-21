#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
model = root / 'crm/v4/assets/v4/followup-schedule-model-v1.js'
followups = root / 'crm/v4/assets/v4/followups.js'
leads = root / 'crm/v4/assets/v4/leads.js'
status_model = root / 'crm/v4/assets/v4/lead-status-ui-model-v1.js'
status_registry = root / 'crm/v4/assets/v4/lead-status-ui-registry-v1.js'
badges = root / 'crm/v4/assets/v4/lead-analytics-badges-v1.js'
preferences = root / 'crm/v4/assets/v4/lead-list-preferences-v1.js'
html = root / 'crm/v4/index.html'
test = root / 'tools/test_crm_followup_schedule.mjs'
manual = root / 'docs/CRM_SAFE_FOLLOWUP_POSTPONE_MANUAL_TEST_2026-07-21.md'
staging = root / 'docs/CRM_SAFE_FOLLOWUP_POSTPONE_STAGING_2026-07-21.md'

errors = []

checks = {
    model: [
        'FOLLOWUP_CLOSED_STATUSES',
        'isFollowupClosedStatus',
        'followupDate',
        'isOverdueFollowupLead',
        'buildFollowupPostponePlan',
        "previousStatus === 'Новая' ? 'Ждём ответ' : previousStatus",
        'Этап заявки:',
        '— без изменения',
    ],
    followups: [
        "from './followup-schedule-model-v1.js'",
        'isFollowupClosedStatus',
        'isOverdueFollowupLead',
        'buildFollowupPostponePlan',
        'if (busyId) return',
        '.update({ ...plan.patch',
        'addFollowupHistory',
        'Дата сохранена, но запись истории требует проверки',
        'Перенос даты не меняет текущий этап заявки',
    ],
    leads: [
        "from './followup-schedule-model-v1.js'",
        "['overdue_contact', 'Просрочен контакт']",
        "status === 'overdue_contact'",
        'v4StatOverdueContactLeads',
        'isOverdueFollowupLead(lead)',
        'Контакт просрочен',
    ],
    status_model: [
        "value: 'overdue_contact'",
        "label: 'Просрочен контакт'",
    ],
    status_registry: [
        "from './lead-status-ui-model-v1.js?v=20260721-followup-1'",
    ],
    badges: [
        "import './lead-status-ui-registry-v1.js?v=20260721-followup-1';",
    ],
    preferences: [
        "overdue_contact: 'просрочен контакт'",
    ],
    html: [
        'leads.js?v=20260721-followup-1',
        'lead-analytics-badges-v1.js?v=20260721-followup-1',
        'followups.js?v=20260721-safe-postpone-1',
    ],
    test: [
        'CRM safe followup schedule model is valid.',
        "offerPlan.patch.status, 'КП отправлено'",
        "recalcPlan.patch.status, 'Нужно пересчитать'",
        'Pure model must not mutate the lead',
        "buildFollowupPostponePlan({ id: 'closed', status: 'Отказ'",
    ],
    manual: [
        'Сохранение этапа',
        'КП отправлено',
        'Нужно пересчитать',
        'Частичный результат истории',
        'Двойной клик',
        'Фильтр и счётчик',
        'Mobile',
        'Production boundary',
        'массовое исправление восьми просроченных заявок',
    ],
    staging: [
        'event_count = 1',
        'event_preserved_stage = true',
        'synthetic_rows = 0',
        'КП отправлено',
        'production-схема не нужна',
    ],
}

for path, markers in checks.items():
    if not path.exists():
        errors.append(f'Missing safe followup file: {path.relative_to(root)}')
        continue
    text = path.read_text(encoding='utf-8')
    for marker in markers:
        if marker.lower() not in text.lower():
            errors.append(f'Missing safe followup marker in {path.relative_to(root)}: {marker}')

if model.exists():
    text = model.read_text(encoding='utf-8')
    for forbidden in ['supabaseClient', ".from('", '.insert(', '.update(', '.delete(', '.upsert(', '.rpc(', 'fetch(', 'localStorage']:
        if forbidden in text:
            errors.append(f'Followup schedule model must remain pure: {forbidden}')

if followups.exists():
    text = followups.read_text(encoding='utf-8')
    for forbidden in [
        "status: 'Ждём ответ'",
        'function nextDate(',
        "const CLOSED_STATUSES =",
    ]:
        if forbidden in text:
            errors.append(f'Followup UI must use the pure plan instead of legacy hardcoding: {forbidden}')
    if ".from('leader_leads')" not in text or '.update(' not in text:
        errors.append('Existing classified followups.js must remain the write owner')

production_candidates = list((root / 'supabase/migrations').glob('*followup*postpone*.sql'))
if production_candidates:
    errors.append('Safe followup source change must not add a production migration: ' + ', '.join(path.name for path in production_candidates))

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM safe followup postpone contract is valid.')
