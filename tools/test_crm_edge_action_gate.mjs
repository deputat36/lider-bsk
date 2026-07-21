import assert from 'node:assert/strict';
import {
  CRM_EDGE_ACTION_GATE_VERSION,
  LEADS_ACTION_PERMISSION,
  ORDER_UPDATE_FIELD_PERMISSION,
  leadsActionPlan,
  orderActionPlan,
} from '../supabase/staging-functions/_shared/crm-canonical-action-map-v1.js';

assert.equal(CRM_EDGE_ACTION_GATE_VERSION, '20260721-canonical-action-gate-1');
assert.deepEqual(Object.keys(LEADS_ACTION_PERMISSION), [
  'dashboard',
  'list',
  'list_orders',
  'create',
  'update',
  'ensure_client',
  'create_order',
  'create_order_from_offer',
]);
assert.deepEqual(ORDER_UPDATE_FIELD_PERMISSION, {
  status: 'orders.update',
  layout_status: 'orders.update',
  production_status: 'orders.update',
  layout_comment: 'orders.update',
  deadline: 'orders.update',
  payment_status: 'finance.write',
});

assert.deepEqual(leadsActionPlan({}, ''), {
  action: 'dashboard',
  known: true,
  bootstrap: false,
  permissions: ['leads.read'],
});
assert.deepEqual(leadsActionPlan({ action: 'list' }), {
  action: 'list',
  known: true,
  bootstrap: false,
  permissions: ['leads.read'],
});
assert.deepEqual(leadsActionPlan({}, 'list_orders'), {
  action: 'list_orders',
  known: true,
  bootstrap: false,
  permissions: ['orders.read'],
});
assert.deepEqual(leadsActionPlan({ action: 'create' }).permissions, ['leads.create']);
assert.deepEqual(leadsActionPlan({ action: 'update' }).permissions, ['leads.update']);
assert.deepEqual(leadsActionPlan({ action: 'ensure_client' }).permissions, ['clients.write']);
assert.deepEqual(leadsActionPlan({ action: 'create_order' }).permissions, ['orders.create']);
assert.deepEqual(leadsActionPlan({ action: 'create_order_from_offer' }).permissions, ['orders.create']);
assert.deepEqual(leadsActionPlan({ action: 'ensure_profile' }), {
  action: 'ensure_profile',
  known: true,
  bootstrap: true,
  permissions: [],
});
assert.equal(leadsActionPlan({ action: 'delete_everything' }).known, false);

assert.deepEqual(orderActionPlan({}), {
  action: 'list',
  known: true,
  bootstrap: false,
  permissions: ['orders.read'],
  fields: [],
});
assert.deepEqual(orderActionPlan({ action: 'update', status: 'В работе' }), {
  action: 'update',
  known: true,
  bootstrap: false,
  permissions: ['orders.update'],
  fields: ['status'],
});
assert.deepEqual(orderActionPlan({ action: 'update', payment_status: 'Оплачено' }), {
  action: 'update',
  known: true,
  bootstrap: false,
  permissions: ['finance.write'],
  fields: ['payment_status'],
});
assert.deepEqual(orderActionPlan({
  action: 'update',
  status: 'Готов',
  payment_status: 'Частично',
  deadline: '2026-07-30',
}), {
  action: 'update',
  known: true,
  bootstrap: false,
  permissions: ['orders.update', 'finance.write'],
  fields: ['status', 'deadline', 'payment_status'],
});
assert.deepEqual(orderActionPlan({ action: 'update' }).permissions, ['orders.update']);
assert.equal(orderActionPlan({ action: 'remove' }).known, false);

for (const plan of [
  leadsActionPlan({ action: 'create' }),
  leadsActionPlan({ action: 'ensure_profile' }),
  orderActionPlan({ action: 'update', status: 'Готово' }),
]) {
  assert.ok(Object.isFrozen(plan));
  assert.ok(Object.isFrozen(plan.permissions));
}

console.log('CRM staging Edge action mapping is canonical and fail-closed.');
