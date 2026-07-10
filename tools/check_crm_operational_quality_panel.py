#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
panel = root / 'crm/v4/assets/v4/lead-operational-quality-v1.js'
badges = root / 'crm/v4/assets/v4/lead-analytics-badges-v1.js'
manual = root / 'docs/CRM_OPERATIONAL_QUALITY_PANEL_MANUAL_TEST_2026-07-10.md'

errors = []

checks = {
    panel: [
        "import { supabaseClient } from './supabase-client.js';",
        "import { canOpenV4Tab } from './role-tab-permissions-v1.js';",
        'const CACHE_MS = 60000',
        "canOpenV4Tab('leads')",
        "readRows('leader_leads', 'id,status,assigned_to,next_contact_at')",
        "readRows('leader_lead_needs', 'id,completeness_score,status')",
        "readRows('leader_orders', 'id,status')",
        "readRows('leader_expenses', 'id,status')",
        "readRows('leader_design_tasks', 'id,task_status')",
        'activeUnassigned',
        'activeWithoutNextContact',
        'needsBelow80',
        'Операционное качество CRM',
        'Read-only snapshot всей доступной базы',
        'Панель не меняет данные',
        "document.addEventListener('leader-v4:crm-ready'",
        "document.addEventListener('leader-v4:leads-loaded'",
        'data-quality-refresh',
    ],
    badges: [
        "import './lead-operational-quality-v1.js';",
    ],
    manual: [
        'active leads without assignee: 7',
        'active leads without next contact: 2',
        'needs below 80% completeness: 9',
        'expenses: 0',
        'design tasks: 0',
        '`leader_design_tasks`: `id,task_status`',
        'uses `task_status`, not a generic `status` column',
        'must not request',
        'no INSERT, UPDATE or DELETE request is emitted',
        'no personal data or financial amount is displayed',
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
        "readRows('leader_leads', 'id,name",
        "readRows('leader_design_tasks', 'id,status')",
        'client_total',
        'contractor_cost',
        'profit',
        'balance',
        'amount',
    ]
    for marker in forbidden:
        if marker in text:
            errors.append(f'Operational-quality panel contains forbidden write/sensitive marker: {marker}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM operational quality panel is read-only, aggregate-only, schema-correct and role-guarded.')
