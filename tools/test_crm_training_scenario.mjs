import assert from 'node:assert/strict';
import {
  TRAINING_PHASES,
  TRAINING_STEP_IDS,
  TRAINING_TRACK_IDS,
  TRAINING_TRACK_STEP_IDS,
  applyTrainingScenarioAction,
  availableTrainingTracks,
  createTrainingScenarioState,
  normalizeTrainingScenarioState,
  trainingScenarioProgress,
  trainingTrackForAccess
} from '../crm/v4/assets/v4/crm-training-scenario-v1.js';

assert.deepEqual(TRAINING_STEP_IDS, ['lead', 'need', 'offer', 'order', 'production']);
assert.deepEqual(TRAINING_PHASES, ['lead', 'need', 'offer', 'order', 'production', 'done']);
assert.deepEqual(TRAINING_TRACK_IDS, ['manager', 'production', 'installation']);
assert.deepEqual(TRAINING_TRACK_STEP_IDS.production, ['production_brief', 'production_start', 'production_finish']);
assert.deepEqual(TRAINING_TRACK_STEP_IDS.installation, ['installation_brief', 'installation_schedule', 'installation_finish']);

const managerAccess = { role: 'manager', tabs: ['leads', 'orders', 'production'], productionKinds: ['production', 'installation'] };
const productionAccess = { role: 'contractor', tabs: ['production'], productionKinds: ['production'] };
const installationAccess = { role: 'installer', tabs: ['production'], productionKinds: ['installation'] };
assert.deepEqual(availableTrainingTracks(managerAccess), ['manager', 'production', 'installation']);
assert.equal(trainingTrackForAccess(managerAccess), 'manager');
assert.equal(trainingTrackForAccess(productionAccess), 'production');
assert.equal(trainingTrackForAccess(installationAccess), 'installation');
assert.deepEqual(availableTrainingTracks({ role: 'installer', tabs: [], productionKinds: ['installation'] }), []);

let state = createTrainingScenarioState();
assert.equal(state.track, 'manager');
assert.equal(state.phase, 'lead');
assert.equal(state.productionStatus, 'Не передано');
assert.deepEqual(trainingScenarioProgress(state), { completed: 0, total: 5, percent: 0 });

const wrongOrder = applyTrainingScenarioAction(state, { type: 'confirm_need' });
assert.equal(wrongOrder.phase, 'lead');
assert.match(wrongOrder.lastError, /Сначала завершите этап/);

state = applyTrainingScenarioAction(state, { type: 'schedule_contact' });
state = applyTrainingScenarioAction(state, { type: 'confirm_need' });
state = applyTrainingScenarioAction(state, { type: 'approve_offer' });
state = applyTrainingScenarioAction(state, { type: 'create_order' });
assert.equal(state.phase, 'production');
assert.deepEqual(state.completed, ['lead', 'need', 'offer', 'order']);

const forbidden = applyTrainingScenarioAction(state, { type: 'production_transition', status: 'Выдано' });
assert.equal(forbidden.phase, 'production');
assert.equal(forbidden.productionStatus, 'Не передано');
assert.match(forbidden.lastError, /запрещён registry/);

state = applyTrainingScenarioAction(state, { type: 'production_transition', status: 'В производстве' });
state = applyTrainingScenarioAction(state, { type: 'production_transition', status: 'Готово' });
state = applyTrainingScenarioAction(state, { type: 'production_transition', status: 'Выдано' });
assert.equal(state.phase, 'done');
assert.deepEqual(state.completed, TRAINING_STEP_IDS);
assert.deepEqual(trainingScenarioProgress(state), { completed: 5, total: 5, percent: 100 });

let production = createTrainingScenarioState('production');
assert.equal(production.phase, 'production_brief');
production = applyTrainingScenarioAction(production, { type: 'confirm_production_brief' });
assert.equal(production.phase, 'production_start');
const productionSkip = applyTrainingScenarioAction(production, { type: 'production_transition', status: 'Выдано' });
assert.match(productionSkip.lastError, /запрещён registry/);
production = applyTrainingScenarioAction(production, { type: 'production_transition', status: 'В производстве' });
assert.equal(production.phase, 'production_finish');
production = applyTrainingScenarioAction(production, { type: 'production_transition', status: 'Готово' });
production = applyTrainingScenarioAction(production, { type: 'production_transition', status: 'Выдано' });
assert.equal(production.phase, 'done');
assert.deepEqual(trainingScenarioProgress(production), { completed: 3, total: 3, percent: 100 });

let installation = createTrainingScenarioState('installation');
assert.equal(installation.phase, 'installation_brief');
installation = applyTrainingScenarioAction(installation, { type: 'confirm_installation_brief' });
assert.equal(installation.phase, 'installation_schedule');
const installationSkip = applyTrainingScenarioAction(installation, { type: 'installation_transition', status: 'Выполнен' });
assert.equal(installationSkip.installationStatus, 'Не назначен');
assert.match(installationSkip.lastError, /запрещён registry/);
installation = applyTrainingScenarioAction(installation, { type: 'installation_transition', status: 'Запланирован' });
assert.equal(installation.phase, 'installation_finish');
installation = applyTrainingScenarioAction(installation, { type: 'installation_transition', status: 'В работе' });
installation = applyTrainingScenarioAction(installation, { type: 'installation_transition', status: 'Выполнен' });
assert.equal(installation.phase, 'done');
assert.deepEqual(trainingScenarioProgress(installation), { completed: 3, total: 3, percent: 100 });

const normalizedLegacy = normalizeTrainingScenarioState({
  phase: 'fake',
  completed: ['lead', 'lead', 'fake'],
  productionStatus: 'Несуществующий статус'
});
assert.equal(normalizedLegacy.track, 'manager');
assert.equal(normalizedLegacy.phase, 'lead');
assert.deepEqual(normalizedLegacy.completed, ['lead']);
assert.equal(normalizedLegacy.productionStatus, 'Не передано');

const switched = applyTrainingScenarioAction(state, { type: 'select_track', track: 'installation' });
assert.equal(switched.track, 'installation');
assert.equal(switched.phase, 'installation_brief');
assert.deepEqual(switched.completed, []);

const reset = applyTrainingScenarioAction(production, { type: 'reset' });
assert.equal(reset.track, 'production');
assert.equal(reset.phase, 'production_brief');
assert.deepEqual(reset.completed, []);

console.log('CRM role-aware local training scenario behavior is valid.');
