#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  CLEAR_CONFIRMATION_WINDOW_MS,
  calculationDraftClearDecision,
  calculationDraftEconomics,
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

const economics = calculationDraftEconomics({ contractorPrice: 1000, clientPrice: 1500 });
assert.equal(economics.profitPerUnit, 500);
assert.equal(economics.markupPercent, 50);
assert.equal(Math.round(economics.marginPercent * 10) / 10, 33.3);
assert.equal(economics.isLoss, false);

const zeroEconomics = calculationDraftEconomics({ contractorPrice: 0, clientPrice: 0 });
assert.equal(zeroEconomics.profitPerUnit, 0);
assert.equal(zeroEconomics.markupPercent, null);
assert.equal(zeroEconomics.marginPercent, null);
assert.equal(zeroEconomics.isLoss, false);
assert.ok(!Object.values(zeroEconomics).some((value) => typeof value === 'number' && !Number.isFinite(value)));

const lossEconomics = calculationDraftEconomics({ contractorPrice: 1000, clientPrice: 800 });
assert.equal(lossEconomics.profitPerUnit, -200);
assert.equal(lossEconomics.markupPercent, -20);
assert.equal(lossEconomics.marginPercent, -25);
assert.equal(lossEconomics.isLoss, true);

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

console.log('Calculation draft review model keeps clear confirmation, row economics, labels, metadata and row reconciliation deterministic.');
