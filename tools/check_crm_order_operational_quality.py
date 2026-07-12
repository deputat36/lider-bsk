#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
model = root / 'crm/v4/assets/v4/order-operational-quality-model-v1.js'
ui = root / 'crm/v4/assets/v4/order-operational-quality-v1.js'
bootstrap = root / 'crm/v4/assets/v4/lead-analytics-badges-v1.js'
test = root / 'tools/test_crm_order_operational_quality.mjs'
manual = root / 'docs/CRM_ORDER_OPERATIONAL_QUALITY_MANUAL_TEST_2026-07-12.md'

errors = []

checks = {
    model: [
        "from './order-status-ui-model-v1.js'",
        'orderOperationalQualityQueues',
        'isActiveOrderStatus',
        'orderStatusUiModel',
        'withoutExpenses',
        'withoutAssignee',
        'designWithoutTask',
        'unknownStatuses',
        'order?.is_archived === true',
        'statusWarning',
    ],
    ui: [
        "from './order-operational-quality-model-v1.js'",
        "from './role-tab-permissions-v1.js'",
        "canOpenV4Tab('order_control')",
        'Операционное качество заказов',
        'Без учтённых расходов',
        'Нужен дизайн, задачи нет',
        'Без ответственного',
        'Просроченные заказы',
        'Неизвестные статусы',
        "select('id,order_number,project_name,status,deadline,lead_id,assigned_to,is_archived,created_at')",
        "select('order_id')",
        "select('lead_id,need_design')",
        "select('order_id,task_status')",
        'data-order-quality-queue',
        'data-open-order',
        'MutationObserver',
        'частичном режиме',
    ],
    bootstrap: [
        "import './order-operational-quality-v1.js';",
    ],
    test: [
        'orderOperationalQualityQueues',
        'result.activeTotal, 4',
        "result.withoutExpenses.map((row) => row.id), ['o1', 'o4', 'o5']",
        "result.designWithoutTask.map((row) => row.id), ['o1']",
        "result.unknownStatuses.map((row) => row.id), ['o4']",
        "for (const forbidden of ['client_name', 'client_phone', 'client_total', 'amount', 'profit', 'assigned_to', 'lead_id'])",
        'CRM order operational quality behavior is valid.',
    ],
    manual: [
        'orders without any `leader_expenses` row — 5',
        'orders requiring design but without a linked `leader_design_tasks` row — 2',
        'orders without `assigned_to` — 5',
        'overdue active orders — 4',
        '`Операционное качество заказов`',
        '`id,order_number,project_name,status,deadline,lead_id,assigned_to,is_archived,created_at`',
        '`lead_id,need_design`',
        '`order_id,task_status`',
        'must not issue INSERT, UPDATE, DELETE, UPSERT, RPC or Edge Function requests',
        'Manual verification remains required before closing #205.',
    ],
}

for path, markers in checks.items():
    if not path.exists():
        errors.append(f'Missing order operational quality file: {path.relative_to(root)}')
        continue
    text = path.read_text(encoding='utf-8')
    for marker in markers:
        if marker not in text:
            errors.append(f'Missing order operational quality marker in {path.relative_to(root)}: {marker}')

for path in (model, ui):
    if not path.exists():
        continue
    text = path.read_text(encoding='utf-8')
    for marker in ['.insert(', '.update(', '.delete(', '.upsert(', '.rpc(', 'functions.invoke', 'fetch(']:
        if marker in text:
            errors.append(f'Order operational quality must remain read-only: {path.relative_to(root)} contains {marker}')

if model.exists():
    text = model.read_text(encoding='utf-8')
    if 'supabaseClient' in text or ".from('leader_" in text:
        errors.append('Order operational quality model must remain side-effect free')

if ui.exists():
    text = ui.read_text(encoding='utf-8')
    forbidden_fields = [
        'client_name', 'client_phone', 'client_email', 'message', 'installation_address',
        'internal_comment', 'client_total', 'contractor_cost', 'installer_cost',
        'expense_date,category,amount', 'profit', 'balance', 'prepayment'
    ]
    for marker in forbidden_fields:
        if marker in text:
            errors.append(f'Order operational quality UI must not request sensitive field: {marker}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM order operational quality queues are read-only, privacy-minimized and registry-backed.')
