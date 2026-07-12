import assert from 'node:assert/strict';
import { orderOperationalQualityQueues } from '../crm/v4/assets/v4/order-operational-quality-model-v1.js';

const now = new Date(2030, 0, 15, 12, 0, 0, 0).getTime();
const overdue = new Date(2030, 0, 14, 8, 0, 0, 0).toISOString();
const future = new Date(2030, 0, 20, 8, 0, 0, 0).toISOString();

const orders = [
  { id: 'o1', order_number: 101, project_name: 'Баннер', status: 'Новый', deadline: overdue, lead_id: 'l1', assigned_to: null, is_archived: false, created_at: future, client_name: 'Не должно попасть', client_phone: '+70000000000', client_total: 1000 },
  { id: 'o2', order_number: 102, project_name: 'Вывеска', status: 'В производстве', deadline: future, lead_id: 'l2', assigned_to: 'u1', is_archived: false, created_at: future },
  { id: 'o3', order_number: 103, project_name: 'Закрытый', status: 'Закрыт', deadline: overdue, lead_id: 'l3', assigned_to: null, is_archived: false, created_at: future },
  { id: 'o4', order_number: 104, project_name: 'Неизвестный', status: 'Legacy Order State', deadline: future, lead_id: 'l4', assigned_to: 'u2', is_archived: false, created_at: future },
  { id: 'o5', order_number: 105, project_name: 'Листовки', status: 'Новый', deadline: future, lead_id: 'l5', assigned_to: 'u3', is_archived: false, created_at: future },
  { id: 'o6', order_number: 106, project_name: 'Архив', status: 'Новый', deadline: overdue, lead_id: 'l6', assigned_to: null, is_archived: true, created_at: future }
];

const expenses = [{ order_id: 'o2' }];
const needs = [
  { lead_id: 'l1', need_design: true },
  { lead_id: 'l3', need_design: true },
  { lead_id: 'l5', need_design: true }
];
const designTasks = [{ order_id: 'o5', task_status: 'Новая' }];

const result = orderOperationalQualityQueues(orders, expenses, needs, designTasks, now);

assert.equal(result.activeTotal, 4);
assert.deepEqual(result.withoutExpenses.map((row) => row.id), ['o1', 'o4', 'o5']);
assert.deepEqual(result.withoutAssignee.map((row) => row.id), ['o1']);
assert.deepEqual(result.overdue.map((row) => row.id), ['o1']);
assert.deepEqual(result.designWithoutTask.map((row) => row.id), ['o1']);
assert.deepEqual(result.unknownStatuses.map((row) => row.id), ['o4']);
assert.equal(result.unknownStatuses[0].statusKnown, false);
assert.match(result.unknownStatuses[0].statusWarning, /оставлен в активном контроле/);

const safeKeys = Object.keys(result.withoutExpenses[0]).sort();
assert.deepEqual(safeKeys, [
  'deadline', 'id', 'orderNumber',
  'statusKnown', 'statusLabel', 'statusRaw', 'statusWarning'
].sort());
for (const forbidden of [
  'projectName', 'createdAt', 'project_name', 'created_at',
  'client_name', 'client_phone', 'client_total', 'amount', 'profit',
  'assigned_to', 'lead_id', 'task_status'
]) {
  assert.equal(Object.hasOwn(result.withoutExpenses[0], forbidden), false);
}

console.log('CRM order operational quality behavior is valid.');
