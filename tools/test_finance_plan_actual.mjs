import assert from 'node:assert/strict';
import {
  actualProfitStateLabel,
  buildFinancePortfolioSnapshot,
  buildOrderFinanceSnapshot,
  confirmedExpenseEffect,
  confirmedPaymentEffect
} from '../crm/v4/assets/v4/finance-plan-actual-model-v1.js';

const orders = [
  { id: 'o1', order_number: 101, project_name: 'Закрытый заказ', status: 'Закрыт', client_total: 100000, contractor_cost: 60000, profit: 40000, is_archived: false },
  { id: 'o2', order_number: 102, project_name: 'Активный заказ', status: 'В работе', client_total: 50000, contractor_cost: 20000, profit: 30000, is_archived: false },
  { id: 'o3', order_number: 103, project_name: 'Архив', status: 'Закрыт', client_total: 9000, contractor_cost: 3000, profit: 6000, is_archived: true }
];

const payments = [
  { id: 'p1', order_id: 'o1', amount: 100000, payment_type: 'Приход', payment_status: 'Проведён', is_confirmed: true },
  { id: 'p2', order_id: 'o1', amount: 10000, payment_type: 'Возврат', payment_status: 'Проведён', is_confirmed: true },
  { id: 'p3', order_id: 'o1', amount: 5000, payment_type: 'Приход', payment_status: 'Проведён', is_confirmed: false },
  { id: 'p4', order_id: 'o2', amount: 20000, payment_type: 'Приход', payment_status: 'Проведён', is_confirmed: true },
  { id: 'p5', order_id: null, amount: 7000, payment_type: 'Приход', payment_status: 'Проведён', is_confirmed: true }
];

const expenses = [
  { id: 'e1', order_id: 'o1', amount: 55000, status: 'Проведён' },
  { id: 'e2', order_id: 'o1', amount: 3000, status: 'Отменён' },
  { id: 'e3', order_id: 'o1', amount: 2000, status: 'Черновик' },
  { id: 'e4', order_id: null, amount: 1000, status: 'Проведён' }
];

assert.equal(confirmedPaymentEffect(payments[0]).signedAmount, 100000);
assert.equal(confirmedPaymentEffect(payments[0]).statusKey, 'posted');
assert.equal(confirmedPaymentEffect(payments[1]).signedAmount, -10000);
assert.equal(confirmedPaymentEffect(payments[2]).included, false);
assert.equal(confirmedPaymentEffect(payments[2]).reason, 'not_confirmed');

const plannedPayment = confirmedPaymentEffect({ amount: 3000, payment_type: 'Приход', payment_status: 'Планируется', is_confirmed: true });
assert.equal(plannedPayment.included, false);
assert.equal(plannedPayment.reason, 'not_posted');
assert.equal(plannedPayment.statusKey, 'planned');

const cancelledPayment = confirmedPaymentEffect({ amount: 3000, payment_type: 'Приход', payment_status: 'Отменен', is_confirmed: true });
assert.equal(cancelledPayment.included, false);
assert.equal(cancelledPayment.reason, 'cancelled');
assert.equal(cancelledPayment.statusKey, 'cancelled');

const unknownPayment = confirmedPaymentEffect({ amount: 3000, payment_type: 'Приход', payment_status: 'Ожидает проверки', is_confirmed: true });
assert.equal(unknownPayment.included, false);
assert.equal(unknownPayment.reason, 'unknown_status');
assert.equal(unknownPayment.statusKnown, false);

assert.equal(confirmedExpenseEffect(expenses[0]).amount, 55000);
assert.equal(confirmedExpenseEffect(expenses[1]).included, false);
assert.equal(confirmedExpenseEffect(expenses[2]).included, false);

const order1 = buildOrderFinanceSnapshot(
  orders[0],
  payments.filter((item) => item.order_id === 'o1'),
  expenses.filter((item) => item.order_id === 'o1'),
  { terminal: true, statusKnown: true }
);
assert.equal(order1.plannedProfit, 40000);
assert.equal(order1.confirmedIncoming, 100000);
assert.equal(order1.confirmedPaymentOutflow, 10000);
assert.equal(order1.confirmedNetReceipts, 90000);
assert.equal(order1.confirmedExpenses, 55000);
assert.equal(order1.cashResult, 35000);
assert.equal(order1.actualProfitState, 'provisional');
assert.equal(order1.actualProfit, 35000);
assert.equal(order1.planFactDiff, -5000);
assert.equal(order1.ignoredPaymentRows, 1);
assert.equal(order1.unknownPaymentStatusRows, 0);
assert.equal(order1.notPostedPaymentRows, 0);
assert.equal(order1.ignoredExpenseRows, 2);

const statusCases = buildOrderFinanceSnapshot(
  { id: 'o4', status: 'Новый', client_total: 9000, contractor_cost: 0 },
  [
    { amount: 1000, payment_type: 'Приход', payment_status: 'Планируется', is_confirmed: true },
    { amount: 2000, payment_type: 'Приход', payment_status: 'Ожидает проверки', is_confirmed: true }
  ],
  [],
  { terminal: false, statusKnown: true }
);
assert.equal(statusCases.confirmedIncoming, 0);
assert.equal(statusCases.ignoredPaymentRows, 2);
assert.equal(statusCases.unknownPaymentStatusRows, 1);
assert.equal(statusCases.notPostedPaymentRows, 1);
assert.match(statusCases.warnings.join(' '), /неизвестным статусом/i);
assert.match(statusCases.warnings.join(' '), /Плановых платежей/i);

const order2 = buildOrderFinanceSnapshot(
  orders[1],
  payments.filter((item) => item.order_id === 'o2'),
  [],
  { terminal: false, statusKnown: true }
);
assert.equal(order2.cashResult, 20000);
assert.equal(order2.actualProfitState, 'unknown');
assert.equal(order2.actualProfit, null);
assert.match(order2.warnings.join(' '), /фактическая прибыль не рассчитана/i);

const statusResolver = (status) => ({ known: true, terminal: status === 'Закрыт' });
const portfolio = buildFinancePortfolioSnapshot(orders, payments, expenses, { statusResolver });
assert.equal(portfolio.orderCount, 2);
assert.equal(portfolio.plannedRevenue, 150000);
assert.equal(portfolio.plannedCost, 80000);
assert.equal(portfolio.plannedProfit, 70000);
assert.equal(portfolio.confirmedIncoming, 120000);
assert.equal(portfolio.confirmedPaymentOutflow, 10000);
assert.equal(portfolio.confirmedNetReceipts, 110000);
assert.equal(portfolio.confirmedExpenses, 55000);
assert.equal(portfolio.cashResult, 55000);
assert.equal(portfolio.debt, 40000);
assert.equal(portfolio.paymentCoveragePercent, 73);
assert.equal(portfolio.expenseCoveragePercent, 50);
assert.equal(portfolio.unknownActualProfitOrders, 1);
assert.equal(portfolio.unknownPaymentStatusRows, 0);
assert.equal(portfolio.notPostedPaymentRows, 0);
assert.equal(portfolio.actualProfitState, 'unknown');
assert.equal(portfolio.actualProfit, null);
assert.equal(portfolio.confirmedUnattributedPayments, 7000);
assert.equal(portfolio.confirmedUnattributedExpenses, 1000);
assert.equal(portfolio.orders[0].orderId, 'o2');
assert.equal(actualProfitStateLabel(portfolio.actualProfitState), 'Фактическая прибыль не рассчитана');

const empty = buildFinancePortfolioSnapshot([], [], [], { statusResolver });
assert.equal(empty.orderCount, 0);
assert.equal(empty.paymentCoveragePercent, 100);
assert.equal(empty.expenseCoveragePercent, 100);

console.log('Finance plan/actual model behavior is valid.');
