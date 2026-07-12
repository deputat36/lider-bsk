import assert from 'node:assert/strict';
import {
  TRAINING_PHASES,
  TRAINING_STEP_IDS,
  applyTrainingScenarioAction,
  createTrainingScenarioState,
  normalizeTrainingScenarioState,
  trainingScenarioProgress
} from '../crm/v4/assets/v4/crm-training-scenario-v1.js';

assert.deepEqual(TRAINING_STEP_IDS, ['lead', 'need', 'offer', 'order', 'production']);
assert.deepEqual(TRAINING_PHASES, ['lead', 'need', 'offer', 'order', 'production', 'done']);

let state = createTrainingScenarioState();
assert.equal(state.phase, 'lead');
assert.equal(state.productionStatus, 'Не передано');
assert.deepEqual(trainingScenarioProgress(state), { completed: 0, total: 5, percent: 0 });

const wrongOrder = applyTrainingScenarioAction(state, { type: 'confirm_need' });
assert.equal(wrongOrder.phase, 'lead');
assert.match(wrongOrder.lastError, /Сначала завершите этап/);

state = applyTrainingScenarioAction(state, { type: 'schedule_contact' });
assert.equal(state.phase, 'need');
state = applyTrainingScenarioAction(state, { type: 'confirm_need' });
assert.equal(state.phase, 'offer');
state = applyTrainingScenarioAction(state, { type: 'approve_offer' });
assert.equal(state.phase, 'order');
state = applyTrainingScenarioAction(state, { type: 'create_order' });
assert.equal(state.phase, 'production');
assert.deepEqual(state.completed, ['lead', 'need', 'offer', 'order']);

const forbidden = applyTrainingScenarioAction(state, { type: 'production_transition', status: 'Выдано' });
assert.equal(forbidden.phase, 'production');
assert.equal(forbidden.productionStatus, 'Не передано');
assert.match(forbidden.lastError, /запрещён registry/);

state = applyTrainingScenarioAction(state, { type: 'production_transition', status: 'В производстве' });
assert.equal(state.productionStatus, 'В производстве');
state = applyTrainingScenarioAction(state, { type: 'production_transition', status: 'Готово' });
assert.equal(state.productionStatus, 'Готово');
state = applyTrainingScenarioAction(state, { type: 'production_transition', status: 'Выдано' });
assert.equal(state.phase, 'done');
assert.deepEqual(state.completed, TRAINING_STEP_IDS);
assert.deepEqual(trainingScenarioProgress(state), { completed: 5, total: 5, percent: 100 });

const normalized = normalizeTrainingScenarioState({
  phase: 'fake',
  completed: ['lead', 'lead', 'fake'],
  productionStatus: 'Несуществующий статус'
});
assert.equal(normalized.phase, 'lead');
assert.deepEqual(normalized.completed, ['lead']);
assert.equal(normalized.productionStatus, 'Не передано');

const reset = applyTrainingScenarioAction(state, { type: 'reset' });
assert.equal(reset.phase, 'lead');
assert.deepEqual(reset.completed, []);

console.log('CRM local training scenario behavior is valid.');
