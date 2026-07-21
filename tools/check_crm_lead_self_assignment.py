#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
model = root / 'crm/v4/assets/v4/lead-assignment-model-v1.js'
status_model = root / 'crm/v4/assets/v4/lead-status-ui-model-v1.js'
list_ui = root / 'crm/v4/assets/v4/leads.js'
card_ui = root / 'crm/v4/assets/v4/lead-card.js'
preferences = root / 'crm/v4/assets/v4/lead-list-preferences-v1.js'
html = root / 'crm/v4/index.html'
test = root / 'tools/test_crm_lead_assignment.mjs'
manual = root / 'docs/CRM_LEAD_SELF_ASSIGNMENT_MANUAL_TEST_2026-07-21.md'
staging_report = root / 'docs/CRM_LEAD_SELF_ASSIGNMENT_STAGING_2026-07-21.md'
staging_sql_path = root / 'supabase/staging/20260721054500_staging_lead_assignment_core.sql'
production_sql_path = root / 'supabase/migrations/20260721054500_staging_lead_assignment_core.sql'

errors = []

checks = {
    model: [
        'LEAD_ASSIGNABLE_ROLES',
        'leadResponsibilityState',
        'buildLeadSelfAssignment',
        'leadTakeButtonModel',
        "key: 'unassigned'",
        "key: 'mine'",
        "key: 'other'",
        'Без ответственного',
        'Ответственный: вы',
        'Назначена другому сотруднику',
        "previousStatus === 'Новая' ? 'В работе' : previousStatus",
    ],
    status_model: [
        "from './lead-assignment-model-v1.js'",
        "value: 'unassigned'",
        "'assign_self'",
        'Взять заявку в работу',
        'Заявка у другого сотрудника',
        'Не меняйте её рабочий этап без согласованной передачи ответственности.',
    ],
    list_ui: [
        "from './lead-assignment-model-v1.js'",
        'assigned_to,converted_order_id',
        "['unassigned', 'Без ответственного']",
        "status === 'unassigned'",
        'v4StatUnassignedLeads',
        'leadTakeButtonModel',
        "data-action=\"${esc(takeButton.action)}\"",
        'buildLeadSelfAssignment',
        "query.is('assigned_to', null)",
        '.maybeSingle()',
        'Заявку уже взял другой сотрудник. Обновите список.',
        'leadAssignmentBusy.has(id)',
        'addAssignmentHistory',
        'openLeadRoute(id)',
    ],
    card_ui: [
        "from './lead-assignment-model-v1.js'",
        'currentUserRole: v4State.profile?.role',
        'data-lead-responsibility',
        "action === 'assign_self'",
        'buildLeadSelfAssignment',
        "query.is('assigned_to', null)",
        '.maybeSingle()',
        'Заявку уже взял другой сотрудник. Обновите карточку.',
        'leadAssignmentBusy',
        'Ответственный сохранён, но запись истории требует проверки',
    ],
    preferences: [
        "unassigned: 'без ответственного'",
    ],
    test: [
        'CRM lead assignment model is valid.',
        "otherPrimary.type, 'none'",
        "takePrimary.type, 'assign_self'",
        "buildLeadSelfAssignment({ id: 'lead-3'",
    ],
    manual: [
        'Конкурентный захват',
        'Частичный результат истории',
        'Двойной клик',
        'Назначена другому сотруднику',
        'Production boundary',
        'массовое назначение существующих 13 заявок',
        'Mobile',
    ],
    staging_report: [
        'staging_lead_assignment_core_20260721',
        'первый условный запрос',
        'второй конкурентный запрос',
        'вернул ноль строк',
        'first_assignment_preserved = true',
        'synthetic_rows = 0',
        'anon_can_read_assignment = false',
        'authenticated_can_read_assignment = false',
        'service_role_can_read_assignment = true',
        'Production Supabase',
    ],
}

for path, markers in checks.items():
    if not path.exists():
        errors.append(f'Missing lead self-assignment file: {path.relative_to(root)}')
        continue
    text = path.read_text(encoding='utf-8')
    for marker in markers:
        if marker.lower() not in text.lower():
            errors.append(f'Missing lead self-assignment marker in {path.relative_to(root)}: {marker}')

if model.exists():
    text = model.read_text(encoding='utf-8')
    for marker in ['supabaseClient', ".from('", '.insert(', '.update(', '.delete(', '.upsert(', '.rpc(', 'fetch(']:
        if marker in text:
            errors.append(f'Lead assignment model must remain side-effect free: {marker}')

for path in (list_ui, card_ui):
    if not path.exists():
        continue
    text = path.read_text(encoding='utf-8')
    if ".update({ ...patch" not in text:
        errors.append(f'Existing classified write module must own assignment update: {path.relative_to(root)}')
    if "query.is('assigned_to', null)" not in text:
        errors.append(f'Assignment update must be compare-and-set in {path.relative_to(root)}')

if not staging_sql_path.exists():
    errors.append('Missing staging-only assignment compatibility SQL')
else:
    staging_sql = staging_sql_path.read_text(encoding='utf-8')
    for marker in [
        'Staging-only',
        'Never apply this file to production',
        'add column if not exists assigned_to uuid',
        'revoke all on table public.leader_leads from public, anon, authenticated',
        'grant select, insert, update, delete on table public.leader_leads to service_role',
    ]:
        if marker.lower() not in staging_sql.lower():
            errors.append('Missing staging assignment SQL marker: ' + marker)

if production_sql_path.exists():
    errors.append('Staging assignment SQL must never exist under supabase/migrations')

if html.exists():
    text = html.read_text(encoding='utf-8')
    for marker in [
        'leads.js?v=20260721-followup-1',
        'lead-card.js?v=20260721-assignment-1',
    ]:
        if marker not in text:
            errors.append('Missing assignment cache marker in crm/v4/index.html: ' + marker)

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM lead self-assignment contract is valid.')
