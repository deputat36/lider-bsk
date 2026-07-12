#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
model = root / 'crm/v4/assets/v4/management-workload-model-v1.js'
panel = root / 'crm/v4/assets/v4/management-workload-panel-v1.js'
loader = root / 'crm/v4/assets/v4/site-cache-note-v1.js'
test = root / 'tools/test_management_workload.mjs'
manual = root / 'docs/CRM_MANAGEMENT_WORKLOAD_SLA_MANUAL_TEST_2026-07-12.md'
status = root / 'docs/STATUS.md'
workflow = root / '.github/workflows/crm-management-workload-check.yml'

errors = []
checks = {
    model: [
        "from './status-transitions-v1.js'",
        "statusDefinition('lead', lead?.status || 'Новая')",
        "const RESPONSIBLE_ROLES = new Set(['owner', 'admin', 'manager'])",
        'buildManagementWorkloadSnapshot',
        'managementWorkloadGroup',
        'MANAGEMENT_WORKLOAD_UNASSIGNED_KEY',
        'withoutNextContact',
        'overdue',
        'slaBreaches',
        'slaCoveragePercent',
        'oldestLeadAgeDays',
        'definition.terminal !== true',
    ],
    panel: [
        "import { supabaseClient } from './supabase-client.js';",
        "import { canOpenV4Tab } from './role-tab-permissions-v1.js';",
        "from './management-workload-model-v1.js'",
        "const LEAD_FIELDS = 'id,status,assigned_to,next_contact_at,created_at,service,source'",
        "const PROFILE_FIELDS = 'user_id,full_name,role,is_active'",
        "canOpenV4Tab('management_dashboard')",
        "readRows('leader_leads', LEAD_FIELDS)",
        "readRows('leader_user_profiles', PROFILE_FIELDS)",
        'Нагрузка и SLA по ответственным',
        'Без ответственного',
        'Нарушения SLA',
        'Покрытие SLA',
        'data-workload-open=',
        'data-workload-open-lead=',
        'data-workload-close',
        'Очереди только открывают карточки и не меняют данные.',
        'В очереди намеренно не отображаются имя клиента, телефон, email, сообщение, внутренние комментарии и финансовые суммы.',
        "document.addEventListener('leader-v4:tab-opened'",
        "openLeadRoute(leadId)",
        "window.v4SetTab('card')",
    ],
    loader: [
        "import('./management-workload-panel-v1.js?v=20260712-workload-1')",
    ],
    test: [
        'buildManagementWorkloadSnapshot',
        'MANAGEMENT_WORKLOAD_UNASSIGNED_KEY',
        'snapshot.activeCount, 4',
        'snapshot.slaCoveragePercent, 25',
        "m1.label, 'Анна Менеджер'",
        'Management workload and SLA model behavior is valid.',
    ],
    manual: [
        'SLA считается выполненным',
        '`leader_leads`: `id,status,assigned_to,next_contact_at,created_at,service,source`',
        '`leader_user_profiles`: `user_id,full_name,role,is_active`',
        'owner/admin',
        'Network',
        'POST',
        'PATCH',
        'DELETE',
        'Открыть очередь',
        'не отображаются имя клиента, телефон, email, сообщение',
        'Production boundary',
    ],
    status: [
        'Нагрузка и SLA по ответственным',
        'management-workload-panel-v1.js',
        'только read-only SELECT',
    ],
    workflow: [
        'node --check crm/v4/assets/v4/management-workload-model-v1.js',
        'node --check crm/v4/assets/v4/management-workload-panel-v1.js',
        'node tools/test_management_workload.mjs',
        'python3 tools/check_management_workload_dashboard.py',
    ],
}

for path, markers in checks.items():
    if not path.exists():
        errors.append(f'Missing management workload file: {path.relative_to(root)}')
        continue
    text = path.read_text(encoding='utf-8')
    for marker in markers:
        if marker not in text:
            errors.append(f'Missing management workload marker in {path.relative_to(root)}: {marker}')

for path in (model, panel):
    if not path.exists():
        continue
    text = path.read_text(encoding='utf-8')
    for forbidden in ('.insert(', '.update(', '.delete(', '.upsert(', '.rpc(', 'fetch('):
        if forbidden in text:
            errors.append(f'Management workload must remain read-only: {path.relative_to(root)} contains {forbidden}')

if panel.exists():
    text = panel.read_text(encoding='utf-8')
    for forbidden in (
        "LEAD_FIELDS = 'id,name",
        "LEAD_FIELDS = 'id,phone",
        "LEAD_FIELDS = 'id,email",
        "LEAD_FIELDS = 'id,message",
        "PROFILE_FIELDS = 'user_id,email",
        "PROFILE_FIELDS = 'user_id,phone",
        'client_total',
        'contractor_cost',
        'profit',
        'internal_comment',
    ):
        if forbidden in text:
            errors.append(f'Management workload panel contains forbidden sensitive marker: {forbidden}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM management workload and SLA dashboard is read-only, minimal-data, role-guarded and registry-backed.')
