#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  savedCalculationDetailsCopy,
  savedCalculationItemReview,
  savedCalculationPositionLabel
} from '../crm/v4/assets/v4/calculation-saved-review-model-v1.js';

assert.equal(savedCalculationPositionLabel(0), '0 позиций');
assert.equal(savedCalculationPositionLabel(1), '1 позиция');
assert.equal(savedCalculationPositionLabel(2), '2 позиции');
assert.equal(savedCalculationPositionLabel(5), '5 позиций');
assert.equal(savedCalculationPositionLabel(11), '11 позиций');
assert.equal(savedCalculationPositionLabel(21), '21 позиция');
assert.equal(savedCalculationDetailsCopy(3), 'Сохранено: 3 позиции. Эти строки используются для КП и заказа.');

const pvc = savedCalculationItemReview({
  name: 'ПВХ 20 мм · круг 35 см · 2 шт',
  category: 'ПВХ / фигуры',
  item_type: 'Изготовление',
  data: {
    calculation_mode: 'pvc_shape_material',
    diameter_cm: 35,
    thickness_mm: 20,
    pieces: 2,
    price_source: 'auto'
  }
}, 0);
assert.equal(pvc.rowNumber, 1);
assert.equal(pvc.category, 'ПВХ / фигуры');
assert.equal(pvc.itemType, 'Изготовление');
assert.equal(pvc.modeLabel, 'ПВХ-фигура');
assert.equal(pvc.priceSource, 'Автоматическая цена');
assert.deepEqual(pvc.characteristics, ['Диаметр: 35 см', 'Толщина: 20 мм', 'Изделий: 2 шт']);
assert.equal(pvc.rowLabel, 'Позиция 1: ПВХ 20 мм · круг 35 см · 2 шт');

const letters = savedCalculationItemReview({
  name: 'Буква/цифра «3»',
  category: 'Буквы / цифры',
  item_type: 'Изготовление',
  data: {
    calculation_mode: 'letters',
    symbol: '3',
    height_cm: 12,
    color: 'красный',
    material: 'самоклеящаяся плёнка',
    price_source: 'manual'
  }
}, 4);
assert.equal(letters.rowNumber, 5);
assert.equal(letters.priceSource, 'Ручная цена');
assert.deepEqual(letters.characteristics, [
  'Знак: 3',
  'Высота: 12 см',
  'Цвет: красный',
  'Материал: самоклеящаяся плёнка'
]);

const custom = savedCalculationItemReview({
  name: 'Нестандартная вывеска',
  category: 'Вывески',
  item_type: 'Изготовление',
  data: {
    calculation_mode: 'custom',
    characteristics: 'ПВХ 5 мм, фигурный край',
    width: 1.2,
    height: 0.6
  }
}, 1);
assert.deepEqual(custom.characteristics, [
  'ПВХ 5 мм, фигурный край',
  'Размер: 1.2×0.6 м'
]);

const fallback = savedCalculationItemReview({}, 2);
assert.equal(fallback.name, 'Позиция 3');
assert.equal(fallback.category, 'Без категории');
assert.equal(fallback.itemType, 'Позиция');
assert.deepEqual(fallback.characteristics, []);

const duplicate = savedCalculationItemReview({
  data: { characteristics: 'Материал: ПВХ', material: 'ПВХ' }
}, 0);
assert.deepEqual(duplicate.characteristics, ['Материал: ПВХ']);

console.log('Saved calculation review model exposes category, type, characteristics, price source and accessible row labels deterministically.');
