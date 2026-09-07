import assert from 'node:assert/strict';
import {
  itemClientDescription,
  itemClientTitle,
  itemVisibility,
  offerVisibilityVersion,
  publicOfferRows,
  shortOfferItemNames
} from '../crm/v4/assets/v4/offer-visibility-v1.js';

assert.match(offerVisibilityVersion(), /^offer-visibility-v1-/);
assert.equal(itemVisibility({ data: {} }), 'single_line');
assert.equal(itemClientTitle({ name: 'Исходное имя', data: { client_title: 'Для клиента' } }), 'Для клиента');
assert.equal(itemClientDescription({ data: { client_description: 'Размер 3×1 м' } }), 'Размер 3×1 м');
assert.equal(itemClientDescription({ data: { characteristics: 'ПВХ 3 мм' } }), 'ПВХ 3 мм');

{
  const rows = publicOfferRows([
    {
      name: 'Внутреннее имя', qty: 1, unit: 'комплект', client_sum: 5000,
      data: { visibility: 'single_line', client_title: 'Световая вывеска', client_description: '3000×700 мм, акрил, LED-подсветка', vendor: 'SECRET_VENDOR' }
    },
    { name: 'Внутреннее', qty: 1, unit: 'шт', client_sum: 1000, data: { visibility: 'internal_only' } }
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Световая вывеска');
  assert.equal(rows[0].description, '3000×700 мм, акрил, LED-подсветка');
  assert.equal(rows[0].client_sum, 5000);
  assert.equal(rows[0].mode, 'single_line');
  assert.ok(!('vendor' in rows[0]));
}

{
  const rows = publicOfferRows([{
    name: 'Комплект',
    qty: 1,
    unit: 'комплект',
    client_sum: 3000,
    contractor_sum: 1000,
    profit: 2000,
    margin_percent: 66,
    data: {
      visibility: 'detailed',
      client_title: 'Комплект оформления',
      components: [
        { title: 'Табличка', qty: 2, unit: 'шт', client_sum: 2000, client_visible: true, contractor_sum: 400, comment: 'ПВХ 3 мм' },
        { title: 'Монтаж', qty: 1, unit: 'услуга', client_sum: 1000, client_visible: true, contractor_sum: 300 },
        { title: 'Внутренняя доставка', qty: 1, unit: 'услуга', client_sum: 900, client_visible: false, contractor_sum: 300 },
        { title: 'Нулевая строка', qty: 1, unit: 'шт', client_sum: 0, client_visible: true }
      ]
    }
  }]);
  assert.deepEqual(rows.map((row) => row.name), ['Табличка', 'Монтаж']);
  assert.deepEqual(rows.map((row) => row.client_sum), [2000, 1000]);
  assert.equal(rows[0].description, 'ПВХ 3 мм');
  assert.ok(rows.every((row) => !('contractor_sum' in row)));
  assert.ok(rows.every((row) => !('profit' in row)));
  assert.ok(rows.every((row) => !('margin_percent' in row)));
}

{
  const rows = publicOfferRows([{
    name: 'Подробный без публичных компонентов',
    client_sum: 2500,
    data: { visibility: 'detailed', client_title: 'Итоговая работа', client_description: 'Без внутренних деталей', components: [{ title: 'Внутреннее', client_sum: 100, client_visible: false }] }
  }]);
  assert.equal(rows.length, 1, 'detailed item without public components must fall back to safe parent line');
  assert.equal(rows[0].name, 'Итоговая работа');
  assert.equal(rows[0].description, 'Без внутренних деталей');
  assert.equal(rows[0].client_sum, 2500);
}

{
  const names = shortOfferItemNames([
    { name: 'A', client_sum: 100, data: { visibility: 'single_line', client_description: 'Длинное описание' } },
    { name: 'B', client_sum: 200, data: { visibility: 'internal_only' } },
    { name: 'C', client_sum: 300, data: { visibility: 'single_line' } }
  ], 8);
  assert.deepEqual(names, ['A', 'C']);
}

console.log('offer visibility v1 tests: PASS');
