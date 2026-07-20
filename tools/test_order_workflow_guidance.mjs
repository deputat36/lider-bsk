import assert from 'node:assert/strict';
import {
  ORDER_EXCEPTION_SCENARIOS,
  buildOrderExceptionPlan,
  buildOrderPrimaryAction
} from '../crm/v4/assets/v4/order-workflow-guidance-model-v1.js';

const NOW = new Date('2026-07-20T12:00:00+03:00');
const status = (key, terminal = false, known = true) => ({ key, terminal, known });
const baseOrder = {
  id: 'order-1',
  order_number: '101',
  project_name: 'Баннер 3×2',
  deadline: '2026-07-25',
  layout_status: 'Согласован',
  production_status: '',
  payment_status: 'Оплачено',
  balance: 0,
  contractor_cost: 5000,
  lead_id: 'lead-1'
};
const expenses = [{ id: 'expense-1', amount: 5000, status: 'Проведён' }];

assert.equal(buildOrderPrimaryAction({ order: baseOrder, statusModel: status('', false, false), expenses, now: NOW }).key, 'review_unknown_status');

const overdue = buildOrderPrimaryAction({
  order: { ...baseOrder, deadline: '2026-07-18' },
  statusModel: status('production'),
  expenses,
  now: NOW
});
assert.equal(overdue.key, 'resolve_overdue');
assert.equal(overdue.target, 'order_control');

const layout = buildOrderPrimaryAction({
  order: { ...baseOrder, layout_status: 'На согласовании' },
  statusModel: status('layout_review'),
  expenses,
  now: NOW
});
assert.equal(layout.key, 'approve_layout');
assert.equal(layout.target, 'lead');

const layoutProcess = buildOrderPrimaryAction({
  order: { ...baseOrder, layout_status: 'Согласование макета' },
  statusModel: status('layout_review'),
  expenses,
  now: NOW
});
assert.equal(layoutProcess.key, 'approve_layout');

const layoutApproved = buildOrderPrimaryAction({
  order: { ...baseOrder, layout_status: 'Макет согласован' },
  statusModel: status('layout_review'),
  expenses,
  now: NOW
});
assert.equal(layoutApproved.key, 'start_production');

const unpaid = buildOrderPrimaryAction({
  order: { ...baseOrder, payment_status: 'Не оплачено', balance: 12000 },
  statusModel: status('new'),
  expenses,
  now: NOW
});
assert.equal(unpaid.key, 'verify_payment_before_start');
assert.equal(unpaid.target, 'finance_control');

assert.equal(buildOrderPrimaryAction({ order: baseOrder, statusModel: status('new'), expenses, now: NOW }).key, 'start_production');

const productionProblem = buildOrderPrimaryAction({
  order: { ...baseOrder, production_status: 'Задержка подрядчика' },
  statusModel: status('production'),
  expenses,
  now: NOW
});
assert.equal(productionProblem.key, 'resolve_production_problem');
assert.equal(productionProblem.target, 'production');

assert.equal(buildOrderPrimaryAction({ order: baseOrder, statusModel: status('ready'), expenses: [], now: NOW }).key, 'ready_finance_check');
assert.equal(buildOrderPrimaryAction({ order: baseOrder, statusModel: status('ready'), expenses, now: NOW }).key, 'arrange_handover');
assert.equal(buildOrderPrimaryAction({ order: baseOrder, statusModel: status('issued'), expenses, now: NOW }).key, 'close_order');
assert.equal(buildOrderPrimaryAction({ order: baseOrder, statusModel: status('closed', true), expenses, now: NOW }).key, 'complete');
assert.equal(buildOrderPrimaryAction({ order: baseOrder, statusModel: status('cancelled', true), expenses, now: NOW }).key, 'settle_cancelled_order');

assert.equal(ORDER_EXCEPTION_SCENARIOS.length, 8);
assert.equal(new Set(ORDER_EXCEPTION_SCENARIOS.map((item) => item.key)).size, 8);
assert.ok(ORDER_EXCEPTION_SCENARIOS.every((item) => Object.isFrozen(item) && Object.isFrozen(item.steps)));

const defect = buildOrderExceptionPlan('defect_rework', baseOrder);
assert.equal(defect.target, 'production');
assert.match(defect.note, /Заказ №101/);
assert.match(defect.note, /брак/i);
assert.equal(buildOrderExceptionPlan('unknown', baseOrder), null);

console.log('Order workflow guidance model tests passed.');
