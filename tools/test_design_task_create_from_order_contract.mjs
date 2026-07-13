import assert from 'node:assert/strict';
import {
  buildDesignTaskCreatePlan,
  canonicalRequestFingerprint
} from './design-task-create-from-order-reference-v1.mjs';

const requestId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '22222222-2222-4222-8222-222222222222';
const order = {
  id: '33333333-3333-4333-8333-333333333333',
  order_number: 507,
  lead_id: '44444444-4444-4444-8444-444444444444',
  status: 'Новый',
  priority: 'Высокий',
  deadline: '2026-07-21',
  layout_status: 'Макета нет',
  layout_link: null,
  is_archived: false,
  updated_at: '2026-07-13T10:00:00.000Z',
  client_name: 'Не должно попасть в server payload',
  client_phone: '+70000000000',
  client_total: 999999,
  contractor_cost: 777777,
  profit: 222222
};
const need = {
  id: '55555555-5555-4555-8555-555555555555',
  lead_id: order.lead_id,
  need_design: true,
  need_type: 'Наружная реклама',
  title: 'Макет световой вывески',
  design_reason: 'Согласовать композицию и размеры',
  deadline_date: '2026-07-19',
  completeness_score: 90,
  missing_fields: [],
  status: 'Готово',
  updated_at: '2026-07-13T09:00:00.000Z'
};
const baseRequest = {
  action: 'design_task.create_from_order',
  request_id: requestId,
  expected_updated_at: order.updated_at,
  payload: {
    order_id: order.id,
    production_job_id: null,
    idempotency_key: `design_task.create_from_order:${order.id}:v1`,
    need_ids: [need.id],
    task: {
      title: 'Дизайн №507 — макет световой вывески',
      priority: 'Высокий',
      deadline: '2026-07-19T00:00:00.000Z',
      task_text: 'Подготовить макет по подтверждённой потребности.',
      reference_link: 'https://example.test/reference'
    }
  }
};

function plan(overrides = {}) {
  return buildDesignTaskCreatePlan({
    request: baseRequest,
    profileActive: true,
    canWrite: true,
    actorUserId,
    order,
    needs: [need],
    designTasks: [],
    productionJob: null,
    receipt: null,
    ...overrides
  });
}

const success = plan();
assert.equal(success.ok, true);
assert.equal(success.idempotentReplay, false);
assert.equal(success.writes.length, 4);
assert.deepEqual(success.writes.map((item) => `${item.target}:${item.operation}`), [
  'leader_command_receipts:reserve',
  'leader_design_tasks:insert',
  'leader_design_task_events:insert',
  'leader_command_receipts:complete'
]);
const taskInsert = success.writes[1].payload;
assert.equal(taskInsert.task_status, 'Новая');
assert.equal(taskInsert.layout_status, 'Макет не начат');
assert.equal(taskInsert.source, 'crm_v4_server_action');
assert.equal(taskInsert.owner_id, actorUserId);
assert.equal(taskInsert.created_by, actorUserId);
assert.equal(taskInsert.designer_name, null);
assert.equal(taskInsert.layout_link, null);
assert.equal(success.writes[2].payload.event_type, 'created');
assert.equal(success.writes[2].payload.new_status, 'Новая');

const serializedWrites = JSON.stringify(success.writes);
for (const forbidden of [
  'client_name', 'client_phone', 'client_total', 'contractor_cost', 'profit',
  '+70000000000', '999999', '777777', '222222'
]) {
  assert.equal(serializedWrites.includes(forbidden), false, `forbidden data leaked: ${forbidden}`);
}

assert.equal(plan({ profileActive: false }).code, 'access_denied');
assert.equal(plan({ canWrite: false }).code, 'forbidden');
assert.equal(plan({ request: { ...baseRequest, action: 'order.update' } }).code, 'unknown_action');
assert.equal(plan({ request: { ...baseRequest, request_id: 'not-a-uuid' } }).reason, 'request_id_invalid');
assert.equal(plan({ request: { ...baseRequest, expected_updated_at: '2026-07-13T09:59:00.000Z' } }).reason, 'order_stale');
assert.equal(plan({ order: { ...order, status: 'Непонятный статус' } }).reason, 'order_status_unknown');
assert.equal(plan({ order: { ...order, status: 'Закрыт' } }).reason, 'order_unavailable');
assert.equal(plan({ order: { ...order, is_archived: true } }).reason, 'order_unavailable');
assert.equal(plan({ order: { ...order, lead_id: null } }).reason, 'order_lead_missing');
assert.equal(plan({ needs: [] }).reason, 'need_not_found');
assert.equal(plan({ needs: [{ ...need, lead_id: 'other-lead' }] }).reason, 'need_lead_mismatch');
assert.equal(plan({ needs: [{ ...need, need_design: false }] }).reason, 'need_design_not_confirmed');
assert.equal(plan({ needs: [{ ...need, status: 'Архив' }] }).reason, 'need_unavailable');

const productionJobRequest = {
  ...baseRequest,
  payload: { ...baseRequest.payload, production_job_id: '66666666-6666-4666-8666-666666666666' }
};
assert.equal(plan({ request: productionJobRequest }).reason, 'production_job_not_found');
assert.equal(plan({
  request: productionJobRequest,
  productionJob: {
    id: productionJobRequest.payload.production_job_id,
    order_id: 'other-order',
    production_status: 'Не передано'
  }
}).reason, 'production_job_order_mismatch');
assert.equal(plan({
  request: productionJobRequest,
  productionJob: {
    id: productionJobRequest.payload.production_job_id,
    order_id: order.id,
    production_status: 'Не передано'
  }
}).ok, true);

assert.equal(plan({
  designTasks: [{ id: 'task-new', order_id: order.id, task_status: 'Новая' }]
}).reason, 'existing_active_task');
assert.equal(plan({
  designTasks: [{ id: 'task-approved', order_id: order.id, task_status: 'Согласовано' }]
}).reason, 'existing_active_task');
assert.equal(plan({
  designTasks: [{ id: 'task-unknown', order_id: order.id, task_status: 'Особый статус' }]
}).reason, 'existing_task_unknown_status');
assert.equal(plan({
  designTasks: [{ id: 'task-completed', order_id: order.id, task_status: 'Завершено' }]
}).ok, true);
assert.equal(plan({
  designTasks: [{ id: 'task-cancelled', order_id: order.id, task_status: 'Отменено' }]
}).ok, true);

const clientOwnedFieldRequest = {
  ...baseRequest,
  payload: {
    ...baseRequest.payload,
    task: { ...baseRequest.payload.task, task_status: 'Завершено' }
  }
};
assert.equal(plan({ request: clientOwnedFieldRequest }).reason, 'server_owned_task_fields');

const unknownFieldRequest = {
  ...baseRequest,
  payload: {
    ...baseRequest.payload,
    task: { ...baseRequest.payload.task, arbitrary_field: 'x' }
  }
};
assert.equal(plan({ request: unknownFieldRequest }).reason, 'unknown_task_fields');

const duplicateNeedRequest = {
  ...baseRequest,
  payload: { ...baseRequest.payload, need_ids: [need.id, need.id] }
};
assert.equal(plan({ request: duplicateNeedRequest }).reason, 'need_ids_not_unique');

const fingerprint = canonicalRequestFingerprint(baseRequest);
const originalResponse = { warnings: [], entity: { id: 'task-id' } };
const replay = plan({
  receipt: { state: 'success', requestFingerprint: fingerprint, response: originalResponse }
});
assert.equal(replay.ok, true);
assert.equal(replay.idempotentReplay, true);
assert.deepEqual(replay.response, originalResponse);
assert.equal(replay.writes.length, 0);
assert.equal(plan({ receipt: { state: 'in_progress' } }).code, 'duplicate_request');
assert.equal(plan({
  receipt: { state: 'success', requestFingerprint: 'different', response: originalResponse }
}).reason, 'idempotency_hash_mismatch');

const advisory = plan({
  request: {
    ...baseRequest,
    payload: {
      ...baseRequest.payload,
      task: { title: 'Черновик без дедлайна' }
    }
  },
  order: { ...order, deadline: null },
  needs: [{
    ...need,
    design_reason: '',
    deadline_date: null,
    completeness_score: 45,
    missing_fields: ['sizes']
  }]
});
assert.equal(advisory.ok, true);
assert.deepEqual(new Set(advisory.warnings), new Set([
  'design_deadline_missing',
  'design_reason_missing',
  'need_completeness_below_80',
  'need_missing_fields_present'
]));

console.log('Design task create-from-order server contract behavior is valid.');
