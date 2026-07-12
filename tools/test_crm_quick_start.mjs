import assert from 'node:assert/strict';
import {
  QUICK_START_STEP_IDS,
  normalizeQuickStartState,
  quickStartProgress,
  setQuickStartStep
} from '../crm/v4/assets/v4/crm-quick-start-v1.js';

assert.deepEqual(QUICK_START_STEP_IDS, ['lead', 'need', 'offer', 'order', 'finish']);

const normalized = normalizeQuickStartState({
  completed: ['lead', 'lead', 'unknown', '', 'order'],
  collapsed: true
});
assert.deepEqual(normalized.completed, ['lead', 'order']);
assert.equal(normalized.collapsed, true);

const started = setQuickStartStep({}, 'lead', true);
assert.deepEqual(started.completed, ['lead']);
assert.deepEqual(quickStartProgress(started), { completed: 1, total: 5, percent: 20 });

const continued = setQuickStartStep(started, 'need', true);
assert.deepEqual(continued.completed, ['lead', 'need']);
assert.deepEqual(setQuickStartStep(continued, 'lead', false).completed, ['need']);

const invalid = setQuickStartStep(continued, 'not-a-step', true);
assert.deepEqual(invalid.completed, ['lead', 'need']);

const complete = QUICK_START_STEP_IDS.reduce((state, id) => setQuickStartStep(state, id, true), {});
assert.deepEqual(quickStartProgress(complete), { completed: 5, total: 5, percent: 100 });

console.log('CRM quick-start state and progress behavior is valid.');
