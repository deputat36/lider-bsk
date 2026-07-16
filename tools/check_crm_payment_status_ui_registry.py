#!/usr/bin/env python3

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FILES = {
    'registry': ROOT / 'crm/v4/assets/v4/status-transitions-v1.js',
    'model': ROOT / 'crm/v4/assets/v4/payment-status-ui-model-v1.js',
    'order_model': ROOT / 'crm/v4/assets/v4/order-status-ui-model-v1.js',
    'finance': ROOT / 'crm/v4/assets/v4/finance-control-v2.js',
    'order_control': ROOT / 'crm/v4/assets/v4/order-control-v2.js',
    'order_preferences': ROOT / 'crm/v4/assets/v4/order-list-preferences-v1.js',
    'management_attention': ROOT / 'crm/v4/assets/v4/management-attention-model-v1.js',
    'test': ROOT / 'tools/test_crm_payment_status_ui.mjs',
    'order_preferences_test': ROOT / 'tools/test_order_list_preferences.mjs',
    'management_attention_test': ROOT / 'tools/test_management_attention_queue.mjs',
    'manual': ROOT / 'docs/CRM_PAYMENT_STATUS_UI_REGISTRY_MANUAL_TEST_2026-07-15.md',
    'adoption': ROOT / 'docs/CRM_ORDER_PAYMENT_STATUS_REGISTRY_ADOPTION_2026-07-16.md',
    'workflow': ROOT / '.github/workflows/crm-status-transition-registry-check.yml',
}

errors: list[str] = []
texts: dict[str, str] = {}

for name, path in FILES.items():
    if not path.is_file():
        errors.append(f'Missing payment status UI registry file: {path.relative_to(ROOT)}')
        texts[name] = ''
    else:
        texts[name] = path.read_text(encoding='utf-8')


def require(name: str, markers: list[str] | tuple[str, ...]) -> None:
    for marker in markers:
        if marker not in texts[name]:
            errors.append(f'{name}: missing marker {marker!r}')


def forbid(name: str, markers: list[str] | tuple[str, ...]) -> None:
    for marker in markers:
        if marker in texts[name]:
            errors.append(f'{name}: forbidden marker found {marker!r}')


require('registry', [
    "key: 'payment'",
    "label: 'Не оплачено'",
    "label: 'Предоплата'",
    "label: 'Частично оплачено'",
    "label: 'Оплачено', terminal: true",
])

require('model', [
    "from './status-transitions-v1.js'",
    'rawPaymentStatus',
    'paymentStatusUiModel',
    'paymentNeedsAttention',
    "statusDefinition('payment', raw)",
    "statusDomain('payment')",
    "current.key === 'paid'",
    'Неизвестный статус оплаты',
    'оставлен в финансовом контроле',
])

forbidden_side_effects = [
    'supabaseClient',
    ".from('leader_",
    '.insert(',
    '.update(',
    '.delete(',
    '.upsert(',
    '.rpc(',
    'fetch(',
]
forbid('model', forbidden_side_effects)

require('order_model', [
    'isActiveOrderStatus',
    'orderStatusUiModel',
])

require('finance', [
    "from './order-status-ui-model-v1.js'",
    "from './payment-status-ui-model-v1.js'",
    'isActiveOrderStatus(order.status)',
    'orderStatusUiModel(order.status)',
    'paymentStatusUiModel(rawPaymentText(order))',
    'paymentNeedsAttention(rawPaymentText(order))',
    'unknownPayment',
    'Неизвестный статус оплаты',
    'data-unknown-payment-status',
    "supabaseClient.from('leader_orders').select(FIELDS)",
])

require('order_control', [
    "from './payment-status-ui-model-v1.js'",
    'paymentNeedsAttention(order.payment_status)',
    'paymentStatusUiModel(order.payment_status)',
    'unknownPayment',
    'Неизвестный статус оплаты',
    'data-unknown-payment-status',
    'Registry: ${paymentModel.key}',
    "supabaseClient.from('leader_orders').select(ORDER_FIELDS)",
])

require('order_preferences', [
    "from './payment-status-ui-model-v1.js'",
    'registryPaymentNeedsAttention(order?.payment_status)',
    'paymentStatusUiModel(order?.payment_status)',
    'payment.label',
    'selectOrderRows',
])

require('management_attention', [
    "from './payment-status-ui-model-v1.js'",
    'paymentNeedsAttention(value)',
    'data.payment_status',
    'data.paymentStatus',
    "'Оплата не закрыта'",
])

for name in ('finance', 'order_control', 'order_preferences', 'management_attention'):
    forbid(name, [
        "text.includes('не')",
        "text.includes('част')",
        "text.includes('долг')",
        "text.includes('ожид')",
    ])

forbid('finance', [
    "const CLOSED = new Set(",
    'data-payment-status-update',
    'updatePaymentStatus(',
    ".from('leader_orders').update(",
    '.insert(',
    '.delete(',
    '.upsert(',
    '.rpc(',
])

forbid('order_control', [
    'data-payment-status-update',
    'updatePaymentStatus(',
    ".from('leader_orders').update(",
    '.insert(',
    '.delete(',
    '.upsert(',
    '.rpc(',
])

for name in ('order_preferences', 'management_attention'):
    forbid(name, forbidden_side_effects)

require('test', [
    "paymentStatusUiModel('Не оплачено')",
    "paymentStatusUiModel('Предоплата')",
    "paymentStatusUiModel('Частично оплачено')",
    "paymentStatusUiModel('Оплачено')",
    "paymentStatusUiModel('Оплата на проверке банка')",
    "paymentNeedsAttention('Оплачено'), false",
    'unknown.needsAttention, true',
    'CRM payment status UI registry behavior is valid.',
])

require('order_preferences_test', [
    "payment_status: 'Оплачено'",
    "payment_status: 'Частично оплачено'",
    "payment_status: 'Предоплата'",
    "payment_status: 'Оплата на проверке банка'",
    "filter: 'payment'",
    'paymentNeedsAttention(rows[0]), false',
    'Order list preferences use canonical payment attention rules.',
])

require('management_attention_test', [
    "payment_status: 'Предоплата'",
    "payment_status: 'Частично оплачено'",
    "payment_status: 'Оплата на проверке банка'",
    "data: { paymentStatus: 'Оплачено' }",
    "data: { payment_status: 'Не оплачено' }",
    "reason, 'Оплата не закрыта'",
    'Management attention queue uses canonical payment attention rules.',
])

require('manual', [
    '`Не оплачено` → `unpaid`',
    '`Предоплата` → `prepayment`',
    '`Частично оплачено` → `partial`',
    '`Оплачено` → `paid`',
    '`Оплата на проверке банка`',
    'Неизвестный статус оплаты',
    'POST, PATCH, INSERT, UPDATE, DELETE или RPC',
    'ни один статус в production не переписан',
    '#202/#204',
])

require('adoption', [
    'фильтр `Оплата под контролем`',
    '`management-attention-model-v1.js`',
    '`Не оплачено`',
    '`Предоплата`',
    '`Частично оплачено`',
    '`Оплачено`',
    'неизвестная строка',
    'data-unknown-payment-status',
    'POST, PATCH, INSERT, UPDATE, DELETE или RPC',
    'Supabase production не изменён',
    '#202/#204',
])

require('workflow', [
    "- 'crm/v4/assets/v4/payment-status-ui-model-v1.js'",
    "- 'crm/v4/assets/v4/order-list-preferences-v1.js'",
    "- 'crm/v4/assets/v4/order-control-v2.js'",
    "- 'crm/v4/assets/v4/management-attention-model-v1.js'",
    "- 'docs/CRM_ORDER_PAYMENT_STATUS_REGISTRY_ADOPTION_2026-07-16.md'",
    "- 'tools/test_order_list_preferences.mjs'",
    "- 'tools/test_management_attention_queue.mjs'",
    'python3 tools/check_crm_payment_status_ui_registry.py',
    'node --check crm/v4/assets/v4/payment-status-ui-model-v1.js',
    'node --check crm/v4/assets/v4/order-list-preferences-v1.js',
    'node --check crm/v4/assets/v4/order-control-v2.js',
    'node --check crm/v4/assets/v4/management-attention-model-v1.js',
    'node tools/test_order_list_preferences.mjs',
    'node tools/test_management_attention_queue.mjs',
])

for forbidden_prefix in ('nav_', 'nav-', 'parket-', 'broker-'):
    for name in ('model', 'finance', 'order_control', 'order_preferences', 'management_attention'):
        if forbidden_prefix in texts[name]:
            errors.append(f'payment status registry adoption entered forbidden scope: {name} contains {forbidden_prefix}')

if errors:
    print('CRM payment status UI registry checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('CRM payment attention uses the canonical registry across finance, order filters, order control and management queues without adding a write path.')
