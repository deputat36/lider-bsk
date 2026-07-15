#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  CLEAR_CONFIRMATION_WINDOW_MS,
  calculationDraftClearDecision,
  calculationDraftReviewDescriptor,
  calculationDraftRowLabels,
  calculationPositionCountLabel,
  reconcileCalculationDraftReview
} from '../crm/v4/assets/v4/calculation-draft-review-model-v1.js';

assert.equal(CLEAR_CONFIRMATION_WINDOW_MS, 4000);
assert.equal(calculationPositionCountLabel(0), '0 позиций');
assert.equal(calculationPositionCountLabel(1), '1 позиция');
assert.equal(calculationPositionCountLabel(2), '2 позиции');
assert.equal(calculationPositionCountLabel(4), '4 позиции');
assert.equal(calculationPositionCountLabel(5), '5 позиций');
assert.equal(calculationPositionCountLabel(11), '11 позиций');
assert.equal(calculationPositionCountLabel(21), '21 позиция');
assert.equal(calculationPositionCountLabel(24), '24 позиции');

assert.deepEqual(
  calculationDraftClearDecision({ rowCount: 0, armedUntil: 0, now: 1000 }),
  { action: 'empty', armedUntil: 0 }
);
assert.deepEqual(
  calculationDraftClearDecision({ rowCount: 3, armedUntil: 0, now: 1000 }),
  { action: 'arm', armedUntil: 5000 }
);
assert.deepEqual(
  calculationDraftClearDecision({ rowCount: 3, armedUntil: 5000, now: 4999 }),
  { action: 'clear', armedUntil: 0 }
);
assert.deepEqual(
  calculationDraftClearDecision({ rowCount: 3, armedUntil: 5000, now: 5000 }),
  { action: 'arm', armedUntil: 9000 }
);

assert.deepEqual(calculationDraftRowLabels(0, 'ПВХ 20 мм'), {
  row: 'Позиция 1: ПВХ 20 мм',
  quantity: 'Количество — ПВХ 20 мм',
  contractorPrice: 'Себестоимость за единицу — ПВХ 20 мм',
  clientPrice: 'Цена клиенту за единицу — ПВХ 20 мм',
  autoPrice: 'Вернуть автоматическую цену — ПВХ 20 мм',
  remove: 'Удалить позицию — ПВХ 20 мм'
});

assert.deepEqual(calculationDraftReviewDescriptor({
  modeLabel: 'Ручная позиция',
  category: 'Вывески',
  itemType: 'Изготовление',
  characteristics: 'ПВХ 5 мм, белый',
  previewName: 'Фигурная вывеска'
}), {
  category: 'Вывески',
  itemType: 'Изготовление',
  characteristics: 'ПВХ 5 мм, белый',
  previewName: 'Фигурная вывеска'
});

assert.deepEqual(calculationDraftReviewDescriptor({ modeLabel: 'Баннер' }), {
  category: 'Баннер',
  itemType: 'Состав позиции',
  characteristics: '',
  previewName: ''
});

const existing = [calculationDraftReviewDescriptor({ modeLabel: 'Баннер' })];
const pending = [
  calculationDraftReviewDescriptor({ modeLabel: 'ПВХ-фигуры', previewName: 'ПВХ 20 мм' }),
  calculationDraftReviewDescriptor({ modeLabel: 'ПВХ-фигуры', previewName: 'Печать' }),
  calculationDraftReviewDescriptor({ modeLabel: 'ПВХ-фигуры', previewName: 'Резка' })
];
const reconciled = reconcileCalculationDraftReview(existing, pending, 1, 4);
assert.equal(reconciled.length, 4);
assert.equal(reconciled[0].category, 'Баннер');
assert.equal(reconciled[1].category, 'ПВХ-фигуры');
assert.equal(reconciled[3].previewName, 'Резка');

assert.equal(reconcileCalculationDraftReview(reconciled, [], 4, 2).length, 2);
assert.equal(reconcileCalculationDraftReview([], [], 0, 1)[0].category, 'Позиция расчёта');

console.log('Calculation draft review model keeps clear confirmation, labels, metadata and row reconciliation deterministic.');
