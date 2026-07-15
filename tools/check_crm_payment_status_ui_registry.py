#!/usr/bin/env python3

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FILES = {
    'registry': ROOT / 'crm/v4/assets/v4/status-transitions-v1.js',
    'model': ROOT / 'crm/v4/assets/v4/payment-status-ui-model-v1.js',
    'order_model': ROOT / 'crm/v4/assets/v4/order-status-ui-model-v1.js',
    'finance': ROOT / 'crm/v4/assets/v4/finance-control-v2.js',
    'test': ROOT / 'tools/test_crm_payment_status_ui.mjs',
    'manual': ROOT / 'docs/CRM_PAYMENT_STATUS_UI_REGISTRY_MANUAL_TEST_2026-07-15.md',
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

forbid('model', [
    'supabaseClient',
    ".from('leader_",
    '.insert(',
    '.update(',
    '.delete(',
    '.upsert(',
    '.rpc(',
    'fetch(',
])

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

forbid('finance', [
    "const CLOSED = new Set(",
    "text.includes('не')",
    "text.includes('част')",
    "text.includes('долг')",
    'data-payment-status-update',
    'updatePaymentStatus(',
    ".from('leader_orders').update(",
    '.insert(',
    '.delete(',
    '.upsert(',
    '.rpc(',
])

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

require('workflow', [
    "- 'crm/v4/assets/v4/payment-status-ui-model-v1.js'",
    "- 'crm/v4/assets/v4/finance-control-v2.js'",
    "- 'docs/CRM_PAYMENT_STATUS_UI_REGISTRY_MANUAL_TEST_2026-07-15.md'",
    "- 'tools/check_crm_payment_status_ui_registry.py'",
    "- 'tools/test_crm_payment_status_ui.mjs'",
    'python3 tools/check_crm_payment_status_ui_registry.py',
    'node --check crm/v4/assets/v4/payment-status-ui-model-v1.js',
    'node --check crm/v4/assets/v4/finance-control-v2.js',
    'node tools/test_crm_payment_status_ui.mjs',
])

for forbidden_prefix in ('nav_', 'nav-', 'parket-', 'broker-'):
    if forbidden_prefix in texts['model'] or forbidden_prefix in texts['finance']:
        errors.append(f'payment status registry adoption entered forbidden scope: {forbidden_prefix}')

if errors:
    print('CRM payment status UI registry checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('CRM finance control uses canonical order/payment statuses, preserves unknown values and adds no status write path.')
