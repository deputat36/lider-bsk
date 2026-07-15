#!/usr/bin/env python3

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FILES = {
    'registry': ROOT / 'crm/v4/assets/v4/status-transitions-v1.js',
    'status_model': ROOT / 'crm/v4/assets/v4/payment-record-status-model-v1.js',
    'finance_model': ROOT / 'crm/v4/assets/v4/finance-plan-actual-model-v1.js',
    'status_test': ROOT / 'tools/test_crm_payment_record_status.mjs',
    'finance_test': ROOT / 'tools/test_finance_plan_actual.mjs',
    'manual': ROOT / 'docs/CRM_PAYMENT_RECORD_STATUS_REGISTRY_MANUAL_TEST_2026-07-15.md',
    'finance_workflow': ROOT / '.github/workflows/crm-finance-plan-actual-check.yml',
    'registry_workflow': ROOT / '.github/workflows/crm-status-transition-registry-check.yml',
}

errors: list[str] = []
texts: dict[str, str] = {}

for name, path in FILES.items():
    if not path.is_file():
        errors.append(f'Missing payment record status file: {path.relative_to(ROOT)}')
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
    "key: 'payment_record'",
    "label: 'Планируется'",
    "label: 'Проведён', aliases: ['Проведен'], terminal: true",
    "label: 'Отменён', aliases: ['Отменен'], terminal: true",
])

require('status_model', [
    "from './status-transitions-v1.js'",
    'rawPaymentRecordStatus',
    'paymentRecordStatusModel',
    "statusDefinition('payment_record', raw)",
    "statusDomain('payment_record')",
    "current.key === 'posted'",
    "reason: 'unknown_status'",
    'не включён в подтверждённый факт',
])

forbid('status_model', [
    'supabaseClient',
    ".from('leader_",
    '.insert(',
    '.update(',
    '.delete(',
    '.upsert(',
    '.rpc(',
    'fetch(',
])

require('finance_model', [
    "from './payment-record-status-model-v1.js'",
    'const status = paymentRecordStatusModel(payment.payment_status)',
    'if (!status.posted)',
    'statusKnown: status.known',
    'statusKey: status.key',
    "effect.reason === 'unknown_status'",
    "effect.reason === 'not_posted'",
    'unknownPaymentStatusRows',
    'notPostedPaymentRows',
    'Платежей с неизвестным статусом',
    'Плановых платежей, ещё не включённых в факт',
])

forbid('finance_model', [
    'includesAny(payment.payment_status',
    '.insert(',
    '.update(',
    '.delete(',
    '.upsert(',
    '.rpc(',
    'fetch(',
])

require('status_test', [
    "paymentRecordStatusModel('Планируется')",
    "paymentRecordStatusModel('Проведён')",
    "paymentRecordStatusModel('Проведен')",
    "paymentRecordStatusModel('Отменен')",
    "paymentRecordStatusModel('Ожидает проверки')",
    "empty.reason, 'unknown_status'",
    'CRM payment record status registry behavior is valid.',
])

require('finance_test', [
    "plannedPayment.reason, 'not_posted'",
    "cancelledPayment.reason, 'cancelled'",
    "unknownPayment.reason, 'unknown_status'",
    'statusCases.unknownPaymentStatusRows, 1',
    'statusCases.notPostedPaymentRows, 1',
    'portfolio.unknownPaymentStatusRows, 0',
    'portfolio.notPostedPaymentRows, 0',
])

require('manual', [
    '`payment_record`',
    '`Планируется` → `planned`',
    '`Проведён` / `Проведен` → `posted`',
    '`Отменён` / `Отменен` → `cancelled`',
    '`unknownPaymentStatusRows`',
    '`notPostedPaymentRows`',
    'непроведёнными или нераспознанными строками',
    'POST, PATCH, INSERT, UPDATE, DELETE или RPC',
    '#202/#204',
])

for workflow_name in ('finance_workflow', 'registry_workflow'):
    require(workflow_name, [
        "crm/v4/assets/v4/payment-record-status-model-v1.js",
        "tools/test_crm_payment_record_status.mjs",
        "tools/check_crm_payment_record_status_registry.py",
        "docs/CRM_PAYMENT_RECORD_STATUS_REGISTRY_MANUAL_TEST_2026-07-15.md",
        'node --check crm/v4/assets/v4/payment-record-status-model-v1.js',
        'node tools/test_crm_payment_record_status.mjs',
        'python3 tools/check_crm_payment_record_status_registry.py',
    ])

for forbidden_prefix in ('nav_', 'nav-', 'parket-', 'broker-'):
    if forbidden_prefix in texts['status_model'] or forbidden_prefix in texts['finance_model']:
        errors.append(f'payment record registry adoption entered forbidden scope: {forbidden_prefix}')

if errors:
    print('CRM payment record status registry checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('CRM confirmed finance uses canonical payment record statuses and excludes unknown or non-posted rows.')
