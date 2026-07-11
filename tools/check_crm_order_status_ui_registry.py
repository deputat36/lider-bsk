#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
registry = root / 'crm/v4/assets/v4/status-transitions-v1.js'
model = root / 'crm/v4/assets/v4/order-status-ui-model-v1.js'
orders = root / 'crm/v4/assets/v4/orders.js'
fast = root / 'crm/v4/assets/v4/orders-fast-loader-v1.js'
control = root / 'crm/v4/assets/v4/order-control-v2.js'
card = root / 'crm/v4/assets/v4/order-card-v1.js'
test = root / 'tools/test_crm_order_status_ui.mjs'
manual = root / 'docs/CRM_ORDER_STATUS_UI_REGISTRY_MANUAL_TEST_2026-07-11.md'

errors = []

checks = {
    registry: [
        "label: 'Отменён', aliases: ['Отменен', 'Отмена']",
    ],
    model: [
        "from './status-transitions-v1.js'",
        'rawOrderStatus',
        'orderStatusUiModel',
        'isActiveOrderStatus',
        'orderStageFlags',
        'Неизвестный статус заказа',
        'оставлен в активном контроле',
    ],
    orders: [
        "from './order-status-ui-model-v1.js'",
        'orderStatusUiModel(order.status)',
        'orderStageFlags(order.status)',
        'isActiveOrderStatus(order.status)',
        'data-unknown-order-status',
    ],
    fast: [
        "from './order-status-ui-model-v1.js'",
        'isActiveOrderStatus',
        'orderStatusUiModel(order.status)',
        'data-unknown-order-status',
    ],
    control: [
        "from './order-status-ui-model-v1.js'",
        'isActiveOrderStatus(order.status)',
        'orderStatusUiModel(order.status)',
        'data-unknown-order-status',
    ],
    card: [
        "from './order-status-ui-model-v1.js'",
        'orderStatusUiModel(order.status)',
        'data-unknown-order-status',
        'host().innerHTML =',
    ],
    test: [
        "orderStatusUiModel('Новый')",
        "orderStatusUiModel('Выдано')",
        "orderStatusUiModel('Отмена').key, 'cancelled'",
        "orderStatusUiModel('Legacy Order State')",
        "unknown.active, true",
        'CRM order status UI registry behavior is valid.',
    ],
    manual: [
        'Новый`, `Макет на согласовании`, `В производстве`, `Выдано',
        'Legacy Order State',
        'unknown order remains in active counters and queues',
        'no status update control is added',
        'no new Supabase write path',
        'no historical status rewrite',
        '`nav_*`, `nav-*`, `parket-*` and `broker-*` remain untouched',
    ],
}

for path, markers in checks.items():
    if not path.exists():
        errors.append(f'Missing order status UI registry file: {path.relative_to(root)}')
        continue
    text = path.read_text(encoding='utf-8')
    for marker in markers:
        if marker not in text:
            errors.append(f'Missing order status UI marker in {path.relative_to(root)}: {marker}')

if model.exists():
    text = model.read_text(encoding='utf-8')
    for marker in ['supabaseClient', ".from('leader_", '.insert(', '.update(', '.delete(', '.upsert(', '.rpc(', 'fetch(']:
        if marker in text:
            errors.append(f'Order status UI model must remain side-effect free: {marker}')

for path in (fast, control):
    if not path.exists():
        continue
    text = path.read_text(encoding='utf-8')
    for marker in ['const CLOSED = new Set(', 'function statusClass(status']:
        if marker in text:
            errors.append(f'Duplicate order terminal/status classifier remains in {path.relative_to(root)}: {marker}')

for path in (orders, fast, control, card):
    if not path.exists():
        continue
    text = path.read_text(encoding='utf-8')
    for marker in ['data-order-status-update', 'updateOrderStatus(', "from('leader_orders').update({ status"]:
        if marker in text:
            errors.append(f'Order registry adoption must not add a new order-status write path: {path.relative_to(root)} contains {marker}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM order views use the canonical registry, preserve unknown statuses and add no order-status write path.')
