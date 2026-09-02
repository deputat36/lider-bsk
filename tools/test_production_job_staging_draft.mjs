import assert from 'node:assert/strict';
import { buildProductionJobStagingDraft } from '../crm/v4/assets/v4/production-job-staging-draft-model-v1.js';

const ids = Object.freeze({
  order: '22222222-2222-4222-8222-222222222222',
  task: '33333333-3333-4333-8333-333333333333',
  job: '44444444-4444-4444-8444-444444444444'
});

const order = {
  id: ids.order,
  order_number: 1701,
  project_name: 'Синтетическая вывеска',
  status: 'В работе',
  layout_status: 'Макет согласован',
  layout_link: 'https://example.invalid/layout',
  priority: 'Высокая',
  deadline: '2026-08-20T09:00:00.000Z',
  updated_at: '2026-08-09T10:00:00.000Z',
  is_archived: false,
  client_name: 'Не должно попасть в payload',
  client_phone: '+70000000000',
  payment_status: 'Оплачено',
  profit: 999999
};

const ready = buildProductionJobStagingDraft({
  order,
  items: [{ name: 'Буквы', quantity: 3, unit: 'шт', comment: 'Белый акрил' }],
  designTasks: [{
    id: ids.task,
    order_id: ids.order,
    task_status: 'Согласовано',
    layout_link: 'https://example.invalid/task-layout',
    updated_at: '2026-08-09T09:00:00.000Z'
  }],
  canRead: true,
  canWrite: true
});
assert.equal(ready.state, 'draft_ready');
assert.equal(ready.draft.command, 'production_job.create_from_order');
assert.equal(ready.draft.order_id, ids.order);
assert.equal(ready.draft.design_task_id, ids.task);
assert.equal(ready.draft.job.layout_status, 'Макет согласован');
assert.equal(ready.draft.job.priority, 'Высокая');
assert.match(ready.draft.job.technical_task, /Буквы · 3 шт · Белый акрил/);

const serialized = JSON.stringify(ready.draft);
for (const forbidden of ['client_name', 'client_phone', 'payment_status', 'profit', '+70000000000', '999999']) {
  assert.equal(serialized.includes(forbidden), false, `forbidden order data leaked: ${forbidden}`);
}

const readOnly = buildProductionJobStagingDraft({ order, canRead: true, canWrite: false });
assert.equal(readOnly.state, 'read_only');
assert.equal(readOnly.draft !== null, true);

const noRead = buildProductionJobStagingDraft({ order, canRead: false, canWrite: true });
assert.equal(noRead.state, 'access_denied');
assert.equal(noRead.draft, null);

const noLayout = buildProductionJobStagingDraft({
  order: { ...order, layout_status: 'На согласовании' },
  canRead: true,
  canWrite: true
});
assert.equal(noLayout.state, 'layout_not_approved');
assert.equal(noLayout.draft, null);

const active = buildProductionJobStagingDraft({
  order,
  productionJobs: [{ id: ids.job, order_id: ids.order, production_status: 'В очереди' }],
  canRead: true,
  canWrite: true
});
assert.equal(active.state, 'active_job_exists');
assert.equal(active.draft, null);

const unknown = buildProductionJobStagingDraft({
  order,
  productionJobs: [{ id: ids.job, order_id: ids.order, production_status: 'Новый raw статус' }],
  canRead: true,
  canWrite: true
});
assert.equal(unknown.state, 'active_job_exists');
assert.match(unknown.warnings[0], /считается активным/i);

const terminal = buildProductionJobStagingDraft({
  order: { ...order, status: 'Отменён' },
  canRead: true,
  canWrite: true
});
assert.equal(terminal.state, 'order_unavailable');

console.log('CRM production job staging draft is guarded, minimal and status-registry aware.');

const preciseRevision = '2026-08-27T15:00:00.123456+00:00';
assert.equal(buildProductionJobStagingDraft({ order: { ...order, updated_at: preciseRevision }, canRead: true, canWrite: true }).order.updatedAt, preciseRevision);
