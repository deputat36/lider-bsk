import assert from 'node:assert/strict';
import { buildDesignTaskDraftPreview } from '../crm/v4/assets/v4/design-task-draft-model-v1.js';

const order = {
  id: 'order-1',
  order_number: 501,
  lead_id: 'lead-1',
  project_name: 'Вывеска кофейни',
  status: 'Новый',
  priority: 'Высокий',
  deadline: '2026-07-20',
  layout_status: 'Макета нет',
  layout_link: '',
  is_archived: false,
  updated_at: '2026-07-14T08:00:00.000Z',
  client_total: 999999,
  contractor_cost: 777777,
  profit: 222222,
  client_name: 'Не должно попасть в payload',
  client_phone: '+70000000000'
};

const needs = [
  {
    id: 'need-1',
    lead_id: 'lead-1',
    need_design: true,
    need_type: 'Наружная реклама',
    title: 'Макет световой вывески',
    design_reason: 'Нужно согласовать внешний вид',
    deadline_date: '2026-07-18',
    completeness_score: 92,
    status: 'Готово'
  }
];

const ready = buildDesignTaskDraftPreview({
  order,
  needs,
  designTasks: [],
  canRead: true,
  canWrite: true
});

assert.equal(ready.state, 'draft_ready');
assert.equal(ready.productionCreateEnabled, false);
assert.equal(ready.draft.command, 'design_task.create_from_order');
assert.equal(ready.draft.order_id, 'order-1');
assert.equal(ready.draft.idempotency_key, 'design_task.create_from_order:order-1:v1');
assert.equal(ready.draft.task.task_status, 'Новая');
assert.equal(ready.draft.task.deadline, '2026-07-18T00:00:00.000Z');
assert.equal(ready.order.updatedAt, '2026-07-14T08:00:00.000Z');
assert.equal(ready.draft.evidence.deadline_source, 'need.deadline_date');
assert.deepEqual(ready.statusFlow.allowedFromInitial.map((item) => item.key), ['in_progress', 'cancelled']);

const serialized = JSON.stringify(ready.draft);
for (const forbidden of ['client_total', 'contractor_cost', 'profit', 'client_name', 'client_phone']) {
  assert.equal(serialized.includes(forbidden), false, `forbidden field leaked: ${forbidden}`);
}
assert.equal(serialized.includes('999999'), false);
assert.equal(serialized.includes('+70000000000'), false);

const incomplete = buildDesignTaskDraftPreview({
  order: { ...order, deadline: null },
  needs: [{ ...needs[0], deadline_date: null, design_reason: '', completeness_score: 55 }],
  designTasks: [],
  canRead: true,
  canWrite: false
});
assert.equal(incomplete.state, 'draft_incomplete');
assert.equal(incomplete.canWrite, false);
assert.equal(incomplete.productionCreateEnabled, false);
assert.ok(incomplete.warnings.some((item) => item.includes('дедлайн')));
assert.ok(incomplete.warnings.some((item) => item.includes('причина')));
assert.ok(incomplete.warnings.some((item) => item.includes('ниже 80')));
assert.ok(incomplete.warnings.some((item) => item.includes('design.write')));

const existingUnknown = buildDesignTaskDraftPreview({
  order,
  needs,
  designTasks: [{
    id: 'task-1',
    order_id: 'order-1',
    task_status: 'Особый статус дизайнера',
    designer_name: 'Дизайнер',
    deadline: '2026-07-19',
    layout_status: 'В работе'
  }],
  canRead: true,
  canWrite: true
});
assert.equal(existingUnknown.state, 'existing_active_task');
assert.equal(existingUnknown.draft, null);
assert.equal(existingUnknown.existingTasks[0].raw, 'Особый статус дизайнера');
assert.equal(existingUnknown.existingTasks[0].known, false);
assert.ok(existingUnknown.warnings[0].includes('Особый статус дизайнера'));

const completedTask = buildDesignTaskDraftPreview({
  order,
  needs,
  designTasks: [{ id: 'task-2', order_id: 'order-1', task_status: 'Завершено' }],
  canRead: true,
  canWrite: true
});
assert.equal(completedTask.state, 'draft_ready');
assert.equal(completedTask.existingTasks[0].terminal, true);

const noEvidence = buildDesignTaskDraftPreview({
  order,
  needs: [{ ...needs[0], need_design: false }],
  designTasks: [],
  canRead: true,
  canWrite: true
});
assert.equal(noEvidence.state, 'design_not_proven');
assert.equal(noEvidence.draft, null);

const archivedNeed = buildDesignTaskDraftPreview({
  order,
  needs: [{ ...needs[0], status: 'Архив' }],
  designTasks: [],
  canRead: true,
  canWrite: true
});
assert.equal(archivedNeed.state, 'design_not_proven');

const accessDenied = buildDesignTaskDraftPreview({ order, needs, canRead: false, canWrite: false });
assert.equal(accessDenied.state, 'access_denied');
assert.equal(accessDenied.draft, null);

const closedOrder = buildDesignTaskDraftPreview({
  order: { ...order, status: 'Закрыт' },
  needs,
  canRead: true,
  canWrite: true
});
assert.equal(closedOrder.state, 'order_unavailable');
assert.equal(closedOrder.draft, null);

console.log('Design task draft preview model behavior is valid.');

const preciseRevision = '2026-08-27T15:00:00.123456+00:00';
assert.equal(buildDesignTaskDraftPreview({ order: { ...order, updated_at: preciseRevision }, needs, canRead: true, canWrite: true }).order.updatedAt, preciseRevision);
