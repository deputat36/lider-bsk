import assert from 'node:assert/strict';
import { circleAreaSquareMeters, parseCalculationDiameters, parseCalculationPairs } from '../crm/v4/assets/v4/calculation-spec-model-v1.js';

assert.deepEqual(parseCalculationPairs('3-2шт, 0-2шт, 5-1шт'), [
  { name: '3', qty: 2 }, { name: '0', qty: 2 }, { name: '5', qty: 1 }
]);
assert.deepEqual(parseCalculationDiameters('30, 35×2; 40x3'), [
  { diameter: 30, qty: 1 }, { diameter: 35, qty: 2 }, { diameter: 40, qty: 3 }
]);
assert.equal(Math.round(circleAreaSquareMeters(100, 1) * 1000) / 1000, 0.785);
console.log('Unified calculation specification parsing is valid.');
