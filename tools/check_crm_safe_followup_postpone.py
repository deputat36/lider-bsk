#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
model = root / 'crm/v4/assets/v4/followup-schedule-model-v1.js'
followups = root / 'crm/v4/assets/v4/followups.js'
styles = root / 'crm/v4/assets/v4/followups.css'
assignment_model = root / 'crm/v4/assets/v4/lead-assignment-model-v1.js'
leads = root / 'crm/v4/assets/v4/leads.js'
status_model = root / 'crm/v4/assets/v4/lead-status-ui-model-v1.js'
status_registry = root / 'crm/v4/assets/v4/lead-status-ui-registry-v1.js'
badges = root / 'crm/v4/assets/v4/lead-analytics-badges-v1.js'
preferences = root / 'crm/v4/assets/v4/lead-list-preferences-v1.js'
html = root / 'crm/v4/index.html'
test = root / 'tools/test_crm_followup_schedule.mjs'
manual = root / 'docs/CRM_SAFE_FOLLOWUP_POSTPONE_MANUAL_TEST_2026-07-21.md'
staging = root / 'docs/CRM_SAFE_FOLLOWUP_POSTPONE_STAGING_2026-07-21.md'
ownership_manual = root / 'docs/CRM_FOLLOWUP_OWNERSHIP_MANUAL_TEST_2026-07-21.md'
ownership_staging = root / 'docs/CRM_FOLLOWUP_OWNERSHIP_STAGING_2026-07-21.md'

errors = []

checks = {
    model: [
        "from './lead-assignment-model-v1.js'",
        'FOLLOWUP_CLOSED_STATUSES',
        'isFollowupClosedStatus',
        'followupDate',
        'isOverdueFollowupLead',
        'followupResponsibilityModel',
        'buildFollowupPostponePlan',
        'buildOwnedFollowupPostponePlan',
        "key: 'unassigned'",
        "key: 'mine'",
        "key: 'other'",
        "key: 'unavailable'",
        'canPostpone: true',
        'canTake: true',
        "previousStatus === 'Новая' ? 'Ждём ответ' : previousStatus",
        'Этап заявки:',
        '— без изменения',
        'Перенос контакта доступен только текущему ответственному',
    ],
    assignment_model: [
        'buildLeadSelfAssignment',
        'leadResponsibilityState',
        "previousStatus === 'Новая' ? 'В работе' : previousStatus",
    ],
    followups: [
        "from './lead-assignment-model-v1.js'",
        "from './followup-schedule-model-v1.js'",
        'assigned_to,converted_order_id',
        'assignmentContext',
        'followupResponsibilityModel',
        'buildOwnedFollowupPostponePlan',
        'buildLeadSelfAssignment',
        'data-followup-responsibility',
        'data-followup-take',
        'Взять в работу',
        'У другого сотрудника',
        "query.is('assigned_to', null)" if False else ".is('assigned_to', null)",
        ".eq('assigned_to', context.currentUserId)",
        '.maybeSingle()',
        'Заявку уже взял другой сотрудник. Обновите очередь.',
        'Ответственный изменился. Обновите очередь перед переносом контакта.',
        'addAssignmentHistory',
        'addFollowupHistory',
        'Ответственный сохранён, но запись истории требует проверки',
        'Дата сохранена, но запись истории требует проверки',
        'Переносить контакт может только ответственный сотрудник',
        'if (busyId) return',
    ],
    styles: [
        '.v4-followup-responsibility',
        '.v4-followup-responsibility.is-good',
        '.v4-followup-responsibility.is-warn',
        '.v4-followup-ownership-note',
        '[data-followup-responsibility="other"]',
        '@media(max-width:520px)',
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
        'followups.css?v=20260721-ownership-1',
        'followups.js?v=20260721-ownership-1',
    ],
    test: [
        'CRM followup ownership and safe schedule model are valid.',
        "offerPlan.patch.status, 'КП отправлено'",
        "recalcPlan.patch.status, 'Нужно пересчитать'",
        'Pure model must not mutate the lead',
        "unassignedManager.key, 'unassigned'",
        "unassignedDesigner.key, 'unavailable'",
        "mineModel.key, 'mine'",
        "otherModel.key, 'other'",
        'buildOwnedFollowupPostponePlan',
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
    ownership_manual: [
        '8 реально рабочих заявок',
        'все 8 без ответственного',
        'Конкурентный захват',
        'Моя заявка',
        'Чужая заявка',
        'Роль без права самоназначения',
        'assigned_to = текущий user id',
        'Mobile 360–430 px',
        'Production Supabase не изменять',
    ],
    ownership_staging: [
        'first_assignment_succeeded = true',
        'second_assignment_rows = 0',
        'wrong_owner_postpone_rows = 0',
        'stage_preserved = true',
        'synthetic_rows = 0',
        'КП отправлено',
        'Production данные',
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

for pure_path in (model, assignment_model):
    if not pure_path.exists():
        continue
    text = pure_path.read_text(encoding='utf-8')
    for forbidden in ['supabaseClient', ".from('", '.insert(', '.update(', '.delete(', '.upsert(', '.rpc(', 'fetch(', 'localStorage']:
        if forbidden in text:
            errors.append(f'Followup ownership model must remain pure: {pure_path.relative_to(root)} contains {forbidden}')

if followups.exists():
    text = followups.read_text(encoding='utf-8')
    for forbidden in [
        "status: 'Ждём ответ'",
        'function nextDate(',
        "const CLOSED_STATUSES =",
        '.delete(',
    ]:
        if forbidden in text:
            errors.append(f'Followup UI must use pure plans and non-destructive writes: {forbidden}')
    if ".from('leader_leads')" not in text or '.update(' not in text:
        errors.append('Existing classified followups.js must remain the write owner')
    if text.find(".is('assigned_to', null)") > text.find('.update({ ...assignment.patch'):
        pass
    if ".is('assigned_to', null)" not in text or ".eq('assigned_to', context.currentUserId)" not in text:
        errors.append('Followup writes must use conditional assignment ownership checks')

production_candidates = list((root / 'supabase/migrations').glob('*followup*postpone*.sql')) + list((root / 'supabase/migrations').glob('*followup*ownership*.sql'))
if production_candidates:
    errors.append('Followup source change must not add a production migration: ' + ', '.join(path.name for path in production_candidates))

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM followup ownership, safe postpone, staging evidence and conditional write contract are valid.')
