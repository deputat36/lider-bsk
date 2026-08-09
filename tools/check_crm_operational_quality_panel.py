#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
panel = root / 'crm/v4/assets/v4/lead-operational-quality-v1.js'
loader = root / 'crm/v4/assets/v4/lead-analytics-badges-v1.js'
manual = root / 'docs/CRM_OPERATIONAL_QUALITY_PANEL_MANUAL_TEST_2026-07-10.md'

errors = []

checks = {
    panel: [
        "import { supabaseClient } from './supabase-client.js';",
        "import { canOpenV4Tab } from './role-tab-permissions-v1.js';",
        "import { statusDefinition } from './status-transitions-v1.js';",
        "import { openLeadRoute } from './router.js';",
        'const CACHE_MS = 60000',
        'const DEFERRED_QUALITY_DELAY_MS = 900',
        'function scheduleQuality(',
        'window.requestIdleCallback(run, { timeout: 1500 })',
        "document.body?.dataset?.v4Tab === 'leads'",
        "const LEAD_FIELDS = 'id,status,assigned_to,next_contact_at,created_at,service,source'",
        "const NEED_FIELDS = 'id,lead_id,completeness_score,status,created_at,updated_at'",
        "statusDefinition('lead', lead?.status || 'Новая')",
        "canOpenV4Tab('leads')",
        "readRows('leader_leads', LEAD_FIELDS)",
        "readRows('leader_lead_needs', NEED_FIELDS)",
        "readRows('leader_orders', 'id,status')",
        "readRows('leader_expenses', 'id,status')",
        "readRows('leader_design_tasks', 'id,task_status')",
        'activeUnassigned',
        'activeWithoutNextContact',
        'activeOverdueContact',
        'needsBelow80',
        'data-quality-queue=',
        'data-quality-open-lead=',
        'data-quality-queue-close',
        "openLeadRoute(leadId)",
        "window.v4SetTab('card')",
        'Операционное качество CRM',
        'Read-only snapshot всей доступной базы',
        'Очереди не меняют данные',
        'В очереди намеренно не отображаются имя, телефон, сообщение, email, финансовые суммы и внутренние комментарии.',
        "document.addEventListener('leader-v4:crm-ready'",
        "document.addEventListener('leader-v4:leads-loaded'",
        'data-quality-refresh',
    ],
    loader: [
        "import('./lead-operational-quality-v1.js?v=20260718-deferred-1')",
    ],
    manual: [
        'active leads without assignee: 7',
        'active leads without next contact: 2',
        'active overdue contacts: 5',
        'needs below 80% completeness: 9',
        'expenses: 0',
        'design tasks: 0',
        '`leader_design_tasks`: `id,task_status`',
        'uses `task_status`, not a generic `status` column',
        'Click each non-zero problem card',
        'Open one row with `Открыть заявку`',
        'must not request',
        'no INSERT, UPDATE or DELETE request is emitted',
        'no lead name, phone, message or email is displayed in the queue',
        'no personal data or financial amount is displayed in the aggregate cards',
        'no Supabase DDL/DML, RLS, grants, Auth or Edge Function change is required',
    ],
}

for path, markers in checks.items():
    if not path.exists():
        errors.append(f'Missing operational-quality file: {path.relative_to(root)}')
        continue
    text = path.read_text(encoding='utf-8')
    for marker in markers:
        if marker not in text:
            errors.append(f'Missing operational-quality marker in {path.relative_to(root)}: {marker}')

if panel.exists():
    text = panel.read_text(encoding='utf-8')
    forbidden = [
        '.insert(',
        '.update(',
        '.delete(',
        '.upsert(',
        "LEAD_FIELDS = 'id,name",
        "LEAD_FIELDS = 'id,phone",
        "LEAD_FIELDS = 'id,message",
        "LEAD_FIELDS = 'id,email",
        "readRows('leader_design_tasks', 'id,status')",
        'client_total',
        'contractor_cost',
        'profit',
        'balance',
        'internal_comment',
        'client_phone',
        'message,email',
        "document.addEventListener('leader-v4:crm-ready', () => loadQuality(true))",
    ]
    for marker in forbidden:
        if marker in text:
            errors.append(f'Operational-quality panel contains forbidden write/sensitive marker: {marker}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM operational quality panel and queues are read-only, schema-correct, minimal-data and role-guarded.')
