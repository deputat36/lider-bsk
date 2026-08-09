#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
model = root / 'crm/v4/assets/v4/finance-plan-actual-model-v1.js'
payment_status_model = root / 'crm/v4/assets/v4/payment-record-status-model-v1.js'
panel = root / 'crm/v4/assets/v4/finance-plan-actual-panel-v1.js'
order_card = root / 'crm/v4/assets/v4/order-card-v1.js'
loader = root / 'crm/v4/assets/v4/crm-v4-tab-loader-v1.js'
test = root / 'tools/test_finance_plan_actual.mjs'
payment_status_test = root / 'tools/test_crm_payment_record_status.mjs'
manual = root / 'docs/CRM_FINANCE_PLAN_ACTUAL_MANUAL_TEST_2026-07-13.md'
payment_status_manual = root / 'docs/CRM_PAYMENT_RECORD_STATUS_REGISTRY_MANUAL_TEST_2026-07-15.md'
status = root / 'docs/STATUS.md'
workflow = root / '.github/workflows/crm-finance-plan-actual-check.yml'
full_audit = root / '.github/workflows/crm-site-full-audit-check.yml'

errors = []
checks = {
    model: [
        "from './payment-record-status-model-v1.js'",
        'confirmedPaymentEffect', 'confirmedExpenseEffect',
        'buildOrderFinanceSnapshot', 'buildFinancePortfolioSnapshot',
        "actualProfitState = 'unknown'", "actualProfitState = terminal ? 'provisional' : 'partial'",
        'confirmedNetReceipts', 'confirmedExpenses', 'cashResult',
        'expenseEvidenceCompleteEnough', 'unknownActualProfitOrders',
        'confirmedUnattributedPayments', 'confirmedUnattributedExpenses',
        'paymentRecordStatusModel(payment.payment_status)',
        'unknownPaymentStatusRows', 'notPostedPaymentRows',
        'Платежей с неизвестным статусом', 'Плановых платежей, ещё не включённых в факт',
        'Фактическая прибыль не рассчитана',
    ],
    payment_status_model: [
        "from './status-transitions-v1.js'",
        'paymentRecordStatusModel',
        "statusDefinition('payment_record', raw)",
        "current.key === 'posted'",
        "reason: 'unknown_status'",
    ],
    panel: [
        "canOpenV4Tab('finance_control')",
        "from(table).select(fields).limit(1000)",
        "readRows('leader_orders', ORDER_FIELDS)",
        "readRows('leader_payments', PAYMENT_FIELDS)",
        "readRows('leader_expenses', EXPENSE_FIELDS)",
        "const ORDER_FIELDS = 'id,order_number,project_name,status,client_total,contractor_cost,profit,is_archived,created_at'",
        "const PAYMENT_FIELDS = 'id,order_id,amount,payment_status,payment_type,is_confirmed,payment_date'",
        "const EXPENSE_FIELDS = 'id,order_id,amount,status,category,expense_date'",
        'План и подтверждённый факт', 'Денежный результат',
        'Фактическая прибыль не рассчитана', 'data-plan-actual-refresh',
        'data-open-order', 'MutationObserver',
    ],
    order_card: [
        "from './finance-plan-actual-model-v1.js'",
        'buildOrderFinanceSnapshot', 'confirmedPaymentEffect', 'confirmedExpenseEffect',
        'План и подтверждённый факт', 'План клиенту', 'План себестоимость', 'План прибыль',
        'Подтверждено приходов', 'Чистые поступления', 'Подтв. расходы',
        'Денежный результат', 'Не рассчитана', 'Учтено в подтверждённом факте',
    ],
    loader: [
        "import('./finance-plan-actual-panel-v1.js?v=20260713-finance-1')",
    ],
    test: [
        'confirmedPaymentEffect', 'confirmedExpenseEffect',
        "plannedPayment.reason, 'not_posted'",
        "cancelledPayment.reason, 'cancelled'",
        "unknownPayment.reason, 'unknown_status'",
        'statusCases.unknownPaymentStatusRows, 1',
        'statusCases.notPostedPaymentRows, 1',
        "assert.equal(order1.actualProfitState, 'provisional')",
        "assert.equal(order2.actualProfitState, 'unknown')",
        'assert.equal(portfolio.plannedRevenue, 150000)',
        'assert.equal(portfolio.confirmedNetReceipts, 110000)',
        'assert.equal(portfolio.confirmedExpenses, 55000)',
        'assert.equal(portfolio.cashResult, 55000)',
        'assert.equal(portfolio.actualProfit, null)',
        'Finance plan/actual model behavior is valid.',
    ],
    payment_status_test: [
        "paymentRecordStatusModel('Планируется')",
        "paymentRecordStatusModel('Проведён')",
        "paymentRecordStatusModel('Проведен')",
        "paymentRecordStatusModel('Отменен')",
        "paymentRecordStatusModel('Ожидает проверки')",
        'CRM payment record status registry behavior is valid.',
    ],
    manual: [
        'отсутствие строк в `leader_expenses` не означает нулевую фактическую себестоимость',
        'Live Supabase read-only baseline', '115 030 ₽', '63 440 ₽', '51 590 ₽', '61 400 ₽',
        'Фактическая прибыль не рассчитана', 'Network checklist', 'Production boundary', 'Approval gates',
        '`nav_*`, `nav-*`, `parket-*`, `broker-*`',
    ],
    payment_status_manual: [
        '`payment_record`',
        '`Планируется` → `planned`',
        '`Проведён` / `Проведен` → `posted`',
        '`unknownPaymentStatusRows`',
        '`notPostedPaymentRows`',
        'непроведёнными или нераспознанными строками',
    ],
    status: [
        'Плановые и подтверждённые фактические финансы',
        'фактическая прибыль не рассчитана', '61 400 ₽',
        'отсутствие расходов не считается нулевой фактической себестоимостью',
    ],
    workflow: [
        'node --check crm/v4/assets/v4/finance-plan-actual-model-v1.js',
        'node --check crm/v4/assets/v4/finance-plan-actual-panel-v1.js',
        'node --check crm/v4/assets/v4/payment-record-status-model-v1.js',
        'node --check crm/v4/assets/v4/order-card-v1.js',
        'node tools/test_finance_plan_actual.mjs',
        'node tools/test_crm_payment_record_status.mjs',
        'python3 tools/check_finance_plan_actual.py',
        'python3 tools/check_crm_payment_record_status_registry.py',
    ],
    full_audit: [
        'tools/check_finance_plan_actual.py',
        'tools/test_finance_plan_actual.mjs',
        'finance-plan-actual-model-v1.js',
        'finance-plan-actual-panel-v1.js',
        'CRM_FINANCE_PLAN_ACTUAL_MANUAL_TEST_2026-07-13.md',
    ],
}

for path, markers in checks.items():
    if not path.exists():
        errors.append(f'Missing finance plan/actual file: {path.relative_to(root)}')
        continue
    text = path.read_text(encoding='utf-8')
    for marker in markers:
        if marker not in text:
            errors.append(f'Missing finance plan/actual marker in {path.relative_to(root)}: {marker}')

for path in [model, payment_status_model, panel]:
    if not path.exists():
        continue
    text = path.read_text(encoding='utf-8')
    for forbidden in ['.insert(', '.update(', '.delete(', '.upsert(', '.rpc(', 'fetch(']:
        if forbidden in text:
            errors.append(f'Finance plan/actual source must remain read-only: {path.relative_to(root)} contains {forbidden}')

if model.exists() and 'includesAny(payment.payment_status' in model.read_text(encoding='utf-8'):
    errors.append('Finance payment rows must use the canonical payment_record registry, not text-token matching')

if panel.exists():
    text = panel.read_text(encoding='utf-8')
    for forbidden_field in ['client_name', 'client_phone', 'counterparty_name', 'created_by_email', 'comment,']:
        if forbidden_field in text:
            errors.append(f'Finance portfolio panel must not request personal/comment fields: {forbidden_field}')

if order_card.exists():
    text = order_card.read_text(encoding='utf-8')
    for legacy in ['function financeTotals(', 'function paymentFactor(', 'function expenseFactor(', '<span>Факт прибыль</span>']:
        if legacy in text:
            errors.append(f'Legacy misleading finance calculation is still present in order card: {legacy}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM finance plan/actual contract is read-only, canonical-payment-aware and protected from zero-expense profit claims.')
