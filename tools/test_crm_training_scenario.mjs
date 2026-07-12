import assert from 'node:assert/strict';
import {
  CRM_TRAINING_SCENARIO,
  CRM_TRAINING_SCENARIO_VERSION,
  CRM_TRAINING_STEP_IDS,
  completeTrainingStep,
  currentTrainingStep,
  normalizeTrainingScenarioState,
  resetTrainingScenario,
  setTrainingScenarioCollapsed,
  startTrainingScenario,
  trainingScenarioProgress,
  trainingStepDefinition
} from '../crm/v4/assets/v4/crm-training-scenario-model-v1.js';

assert.equal(CRM_TRAINING_SCENARIO_VERSION, 1);
assert.deepEqual(CRM_TRAINING_STEP_IDS, ['lead', 'need', 'offer', 'order', 'finish']);
assert.equal(CRM_TRAINING_SCENARIO.steps.length, 5);
assert.match(CRM_TRAINING_SCENARIO.warning, /не создаёт клиента, заявку, КП, заказ или задачу в Supabase/);
assert.equal(trainingStepDefinition('need')?.facts.includes('Полнота потребности: 85%'), true);
assert.match(trainingStepDefinition('finish')?.result || '', /Отмена не считается выполнением/);

const empty = normalizeTrainingScenarioState({ completed: ['need', 'lead', 'offer'] });
assert.deepEqual(empty.completed, ['lead', 'need', 'offer']);
assert.equal(empty.started, true);

const initial = resetTrainingScenario();
assert.deepEqual(initial.completed, []);
assert.equal(initial.started, false);
assert.equal(currentTrainingStep(initial), null);
assert.deepEqual(trainingScenarioProgress(initial), { completed: 0, total: 5, percent: 0, finished: false });

const started = startTrainingScenario(initial);
assert.equal(started.started, true);
assert.equal(currentTrainingStep(started), 'lead');
assert.deepEqual(completeTrainingStep(started, 'need'), started);

const leadDone = completeTrainingStep(started, 'lead');
assert.deepEqual(leadDone.completed, ['lead']);
assert.equal(currentTrainingStep(leadDone), 'need');
assert.deepEqual(trainingScenarioProgress(leadDone), { completed: 1, total: 5, percent: 20, finished: false });

const collapsed = setTrainingScenarioCollapsed(leadDone, true);
assert.equal(collapsed.collapsed, true);
assert.deepEqual(collapsed.completed, ['lead']);

let completed = started;
for (const stepId of CRM_TRAINING_STEP_IDS) completed = completeTrainingStep(completed, stepId);
assert.deepEqual(completed.completed, CRM_TRAINING_STEP_IDS);
assert.equal(currentTrainingStep(completed), null);
assert.deepEqual(trainingScenarioProgress(completed), { completed: 5, total: 5, percent: 100, finished: true });
assert.deepEqual(completeTrainingStep(completed, 'finish'), completed);

console.log('CRM local training scenario behavior is valid.');
