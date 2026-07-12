import assert from 'node:assert/strict';
import {
  QUICK_START_STEP_IDS,
  completeQuickStartAutomatically,
  normalizeQuickStartState,
  quickStartProgress,
  quickStartStepsForEvent,
  quickStartStepsForRenderedProof,
  setQuickStartStep
} from '../crm/v4/assets/v4/crm-quick-start-v1.js';

assert.deepEqual(QUICK_START_STEP_IDS, ['lead', 'need', 'offer', 'order', 'finish']);

const normalized = normalizeQuickStartState({
  completed: ['lead', 'lead', 'unknown', '', 'order'],
  collapsed: true
});
assert.deepEqual(normalized.completed, ['lead', 'order']);
assert.deepEqual(normalized.automatic, []);
assert.equal(normalized.collapsed, true);

const started = setQuickStartStep({}, 'lead', true);
assert.deepEqual(started.completed, ['lead']);
assert.deepEqual(quickStartProgress(started), { completed: 1, total: 5, percent: 20 });

const continued = setQuickStartStep(started, 'need', true);
assert.deepEqual(continued.completed, ['lead', 'need']);
assert.deepEqual(setQuickStartStep(continued, 'lead', false).completed, ['need']);

const automatic = completeQuickStartAutomatically(continued, 'offer');
assert.deepEqual(automatic.completed, ['lead', 'need', 'offer']);
assert.deepEqual(automatic.automatic, ['offer']);
assert.deepEqual(setQuickStartStep(automatic, 'offer', true).automatic, []);

const invalid = setQuickStartStep(continued, 'not-a-step', true);
assert.deepEqual(invalid.completed, ['lead', 'need']);

const complete = QUICK_START_STEP_IDS.reduce((state, id) => setQuickStartStep(state, id, true), {});
assert.deepEqual(quickStartProgress(complete), { completed: 5, total: 5, percent: 100 });

assert.deepEqual(
  quickStartStepsForEvent('leader-v4:lead-card-rendered', { lead: { id: 'lead-1', next_contact_at: '2026-07-12T10:00:00Z' } }),
  ['lead']
);
assert.deepEqual(quickStartStepsForEvent('leader-v4:lead-card-rendered', { lead: { id: 'lead-1' } }), []);
assert.deepEqual(
  quickStartStepsForEvent('leader-v4:needs-loaded', { needs: [{ id: 'need-1', completeness_score: 80, status: 'Черновик' }] }),
  ['need']
);
assert.deepEqual(
  quickStartStepsForEvent('leader-v4:needs-loaded', { needs: [{ id: 'need-1', completeness_score: 79, status: 'Черновик' }] }),
  []
);
assert.deepEqual(
  quickStartStepsForEvent('leader-v4:needs-loaded', { needs: [{ id: 'need-1', completeness_score: 100, status: 'Архив' }] }),
  []
);
assert.deepEqual(quickStartStepsForEvent('leader-v4-order-updated', { order: { id: 'order-1' } }), ['order']);
assert.deepEqual(
  quickStartStepsForEvent('leader-v4-order-updated', { order: { id: 'order-1', production_status: 'Выдано' } }),
  ['order', 'finish']
);
assert.deepEqual(
  quickStartStepsForEvent('leader-v4-order-updated', { order: { id: 'order-1', installation_status: 'Выполнен' } }),
  ['order', 'finish']
);
assert.deepEqual(
  quickStartStepsForEvent('leader-v4-order-updated', { order: { id: 'order-1', installation_status: 'Завершён' } }),
  ['order', 'finish']
);
assert.deepEqual(
  quickStartStepsForEvent('leader-v4-order-updated', { order: { id: 'order-1', status: 'Закрыт' } }),
  ['order', 'finish']
);
assert.deepEqual(
  quickStartStepsForEvent('leader-v4-order-updated', { order: { id: 'order-1', production_status: 'Отменено' } }),
  ['order']
);
assert.deepEqual(quickStartStepsForRenderedProof({ offer: true, order: true }), ['offer', 'order']);

console.log('CRM quick-start state and progress behavior is valid.');
