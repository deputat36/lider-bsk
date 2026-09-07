import assert from 'node:assert/strict';
import { needCalculationPrefill, numericNeedValue } from '../crm/v4/assets/v4/need-calculation-prefill-v1.js';

assert.equal(numericNeedValue('3,5 м'), '3.5');
assert.deepEqual(needCalculationPrefill({ id: 'n1', need_type: 'Баннер', title: 'Баннер на фасад', description: 'С люверсами', structured_data: { width: '3 м', height: '2 м', quantity: '2 шт', material: 'стандарт' } }), { needId: 'n1', mode: 'banner', title: 'Баннер на фасад', width: '3', height: '2', quantity: '2', material: 'стандарт', comment: 'С люверсами' });
assert.equal(needCalculationPrefill({ need_type: 'Вывеска' }).mode, 'custom');
assert.equal(needCalculationPrefill({ need_type: 'Полиграфия', structured_data: { print_run: '1000 шт' } }).quantity, '1000');
// Existing production needs use explicitly metric aliases. Do not rewrite them.
const legacy = Object.freeze({ width_m: 3, height_m: 2, material: 'Баннер 440' });
assert.equal(needCalculationPrefill({ structured_data: legacy }).width, '3');
assert.equal(needCalculationPrefill({ structured_data: legacy }).height, '2');
const mixed = needCalculationPrefill({ structured_data: { width: '4,5 м', width_m: 3, height: '', height_m: '1,5' } });
assert.equal(mixed.width, '4.5', 'current width takes priority');
assert.equal(mixed.height, '1.5', 'blank current height may use its metric alias');
assert.equal(needCalculationPrefill({ structured_data: { width: 0, width_m: 3 } }).width, '0');
assert.equal(needCalculationPrefill({ structured_data: {} }).height, '');
console.log('Need-to-calculation prefill behavior is valid.');
