import assert from 'node:assert/strict';
import {
  NEED_READINESS_THRESHOLD,
  activeLeadNeeds,
  calculationReadinessContext,
  evaluateNeedReadiness,
  normalizeMissingFields,
  offerReadinessContext
} from '../crm/v4/assets/v4/need-readiness-model-v1.js';

assert.equal(NEED_READINESS_THRESHOLD, 80);
assert.deepEqual([...normalizeMissingFields(['Материал', 'Материал', '', null, 'Срок'])], ['Материал', 'Срок']);

const needs = [
  { id: 'n1', title: 'Баннер', status: 'Черновик', completeness_score: 45, missing_fields: ['Материал', 'Срок'] },
  { id: 'n2', title: 'Табличка', status: 'Черновик', completeness_score: 85, missing_fields: ['Адрес монтажа'] },
  { id: 'n3', title: 'Визитки', status: 'Готово', completeness_score: 96, missing_fields: [] },
  { id: 'n4', title: 'Архив', status: 'Архив', completeness_score: 100, missing_fields: [] }
];

assert.deepEqual(activeLeadNeeds(needs).map((need) => need.id), ['n1', 'n2', 'n3']);

const low = evaluateNeedReadiness(needs[0]);
assert.equal(low.state, 'below_threshold');
assert.equal(low.level, 'critical');
assert.equal(low.ready, false);
assert.deepEqual([...low.missingFields], ['Материал', 'Срок']);

const withMissing = evaluateNeedReadiness(needs[1]);
assert.equal(withMissing.state, 'missing_fields');
assert.equal(withMissing.level, 'warning');
assert.equal(withMissing.ready, false);

const ready = evaluateNeedReadiness(needs[2]);
assert.equal(ready.state, 'ready');
assert.equal(ready.level, 'ready');
assert.equal(ready.ready, true);

const noNeeds = calculationReadinessContext({ needs: [], selectedNeedId: '' });
assert.equal(noNeeds.state, 'no_active_needs');
assert.equal(noNeeds.action, 'open_need_form');

const unlinked = calculationReadinessContext({ needs, selectedNeedId: '' });
assert.equal(unlinked.state, 'unlinked_calculation');
assert.equal(unlinked.activeNeedCount, 3);

const selected = calculationReadinessContext({ needs, selectedNeedId: 'n3' });
assert.equal(selected.ready, true);
assert.equal(selected.needId, 'n3');

const calculations = [
  { id: 'c1', need_id: 'n1' },
  { id: 'c2', need_id: null },
  { id: 'c3', need_id: 'missing' }
];

assert.equal(offerReadinessContext({ needs, calculations, selectedCalculationId: '' }).state, 'select_calculation');
assert.equal(offerReadinessContext({ needs, calculations, selectedCalculationId: 'c1' }).state, 'below_threshold');
assert.equal(offerReadinessContext({ needs, calculations, selectedCalculationId: 'c2' }).state, 'calculation_without_need');
assert.equal(offerReadinessContext({ needs, calculations, selectedCalculationId: 'c3' }).state, 'linked_need_unavailable');

console.log('Need readiness warning model behavior is valid.');
