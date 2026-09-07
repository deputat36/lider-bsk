import assert from 'node:assert/strict';
import {
  NEED_CALCULATION_READY_THRESHOLD,
  needCalculationGateDecision,
  needCalculationReadiness,
  normalizeNeedCompletenessScore,
  normalizeNeedMissingFields
} from '../crm/v4/assets/v4/need-calculation-readiness-v1.js';

assert.equal(NEED_CALCULATION_READY_THRESHOLD, 80);
assert.equal(normalizeNeedCompletenessScore('85.4'), 85);
assert.equal(normalizeNeedCompletenessScore(-10), 0);
assert.equal(normalizeNeedCompletenessScore(120), 100);
assert.deepEqual(normalizeNeedMissingFields([' Материал ', 'материал', '', 'Срок']), ['Материал', 'Срок']);

const ready = needCalculationReadiness({ completeness_score: 100, missing_fields: [] });
assert.equal(ready.ready, true);
assert.equal(ready.needsAttention, false);
assert.equal(needCalculationGateDecision({ completeness_score: 100, missing_fields: [] }).action, 'calculate');

const lowScore = needCalculationReadiness({ completeness_score: 65, missing_fields: [] });
assert.equal(lowScore.needsAttention, true);
assert.equal(needCalculationGateDecision({ completeness_score: 65, missing_fields: [] }).action, 'review');

const missing = needCalculationReadiness({ completeness_score: 90, missing_fields: ['Материал', 'Срок'] });
assert.equal(missing.needsAttention, true);
assert.deepEqual(missing.missingFields, ['Материал', 'Срок']);
assert.match(missing.message, /Материал/);
assert.match(missing.message, /Срок/);

const override = needCalculationGateDecision(
  { completeness_score: 45, missing_fields: ['Размер'] },
  { continueAnyway: true }
);
assert.equal(override.action, 'calculate');
assert.equal(override.overridden, true);
assert.equal(override.readiness.needsAttention, true);

console.log('Need calculation readiness gate model: PASS');
