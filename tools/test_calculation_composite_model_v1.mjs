import assert from 'node:assert/strict';
import {
  compositeDraftItem,
  compositeDraftValidation,
  normalizeCompositeComponents,
  normalizeCompositeVisibility
} from '../crm/v4/assets/v4/calculation-composite-model-v1.js';

assert.equal(normalizeCompositeVisibility('detailed'), 'detailed');
assert.equal(normalizeCompositeVisibility('anything'), 'single_line');

{
  const components = normalizeCompositeComponents([
    { title: 'ПВХ', qty: '2', unit: 'м²', contractor_price: '1 000,50', client_price: '1600', client_visible: true },
    { title: 'Монтаж', qty: 1, unit: 'услуга', contractor_price: 500, client_price: 0, client_visible: false }
  ]);
  assert.equal(components.length, 2);
  assert.equal(components[0].contractor_sum, 2001);
  assert.equal(components[0].client_sum, 3200);
  assert.equal(components[1].client_visible, false);
}

{
  const item = compositeDraftItem({
    title: 'Световая вывеска',
    visibility: 'single_line',
    components: [
      { title: 'Основа', qty: 1, contractor_price: 1000, client_price: 1500 },
      { title: 'Монтаж', qty: 1, contractor_price: 500, client_price: 700 }
    ]
  });
  assert.equal(item.qty, 1);
  assert.equal(item.contractor_price, 1500);
  assert.equal(item.client_price, 2200);
  assert.equal(item.data.mode, 'composite');
  assert.equal(item.data.visibility, 'single_line');
  assert.equal(item.data.component_count, 2);
  assert.equal(item.data.client_title, 'Световая вывеска');
}

{
  const item = compositeDraftItem({
    title: 'Стенд',
    visibility: 'single_line',
    client_price: 5000,
    components: [
      { title: 'Печать', qty: 1, contractor_price: 1000, client_price: 2000 },
      { title: 'Каркас', qty: 1, contractor_price: 1200, client_price: 1800 }
    ]
  });
  assert.equal(item.contractor_price, 2200);
  assert.equal(item.client_price, 5000, 'manual parent total must win in single-line mode');
}

{
  const item = compositeDraftItem({
    title: 'Комплект оформления',
    visibility: 'detailed',
    client_price: 9999,
    components: [
      { title: 'Табличка', qty: 2, contractor_price: 200, client_price: 600, client_visible: true },
      { title: 'Скрытая доставка', qty: 1, contractor_price: 300, client_price: 1000, client_visible: false }
    ]
  });
  assert.equal(item.contractor_price, 700);
  assert.equal(item.client_price, 1200, 'detailed parent total must equal visible component total');
  assert.equal(item.data.components[1].client_sum, 1000, 'internal snapshot may retain client value without exposing it');
}

{
  const validation = compositeDraftValidation({
    title: 'Подробный комплект',
    visibility: 'detailed',
    components: [
      { title: 'Позиция', qty: 1, contractor_price: 100, client_price: 0, client_visible: true }
    ]
  });
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.includes('composite_visible_component_price_required'));
}

{
  const validation = compositeDraftValidation({ visibility: 'single_line', components: [] });
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.includes('composite_title_required'));
  assert.ok(validation.errors.includes('composite_components_required'));
}

console.log('calculation composite model v1 tests: PASS');
