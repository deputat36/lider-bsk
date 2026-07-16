import assert from 'node:assert/strict';
import {
  calculationVersionDraftTitle,
  calculationVersionItem,
  calculationVersionTotals,
  copyCalculationItemsForVersion,
  createCalculationVersionDraft,
  nextCalculationVersion
} from '../crm/v4/assets/v4/calculation-version-edit-model-v1.js';

assert.equal(nextCalculationVersion([]), 1);
assert.equal(nextCalculationVersion([{ version_number: 1 }, { version_number: 3 }, { version_number: 1 }]), 4);
assert.equal(nextCalculationVersion([{ version_number: null }, { version_number: 'bad' }]), 1);

assert.equal(
  calculationVersionDraftTitle({ title: 'Баннер — версия 2' }, 4),
  'Баннер — правки v4'
);
assert.equal(
  calculationVersionDraftTitle({ title: 'Вывеска — правки v3' }, 5),
  'Вывеска — правки v5'
);

const sourceItems = [{
  id: 'item-1',
  calculation_id: 'calc-1',
  lead_id: 'lead-1',
  category: 'ПВХ / фигуры',
  item_type: 'Изготовление',
  name: 'Круг 30 см',
  unit: 'шт',
  qty: 2,
  contractor_price: 100,
  contractor_sum: 200,
  client_price: 180,
  client_sum: 360,
  profit: 160,
  margin_percent: 44.44,
  comment: 'С печатью',
  data: { calculation_mode: 'pvc_shape_material', diameter_cm: 30 }
}];

const copied = copyCalculationItemsForVersion(sourceItems);
assert.equal(copied.length, 1);
assert.equal(copied[0].name, 'Круг 30 см');
assert.equal(copied[0].qty, 2);
assert.equal(copied[0].client_price, 180);
assert.equal(copied[0].data.diameter_cm, 30);
assert.equal('id' in copied[0], false);
assert.equal('calculation_id' in copied[0], false);
assert.equal('lead_id' in copied[0], false);
assert.equal('client_sum' in copied[0], false);
assert.notEqual(copied[0].data, sourceItems[0].data);

const calculated = calculationVersionItem(copied[0], 0);
assert.equal(calculated.contractor_sum, 200);
assert.equal(calculated.client_sum, 360);
assert.equal(calculated.profit, 160);
assert.equal(calculated.sort_order, 1);

const totals = calculationVersionTotals(copied);
assert.equal(totals.contractor_cost, 200);
assert.equal(totals.client_total, 360);
assert.equal(totals.profit, 160);
assert.equal(totals.canSave, true);

const invalid = calculationVersionTotals([{ ...copied[0], client_price: 50 }]);
assert.equal(invalid.profit, -100);
assert.equal(invalid.canSave, false);
assert.match(invalid.warnings.join(' '), /убыточ/i);

const draft = createCalculationVersionDraft({
  id: 'calc-1',
  lead_id: 'lead-1',
  client_id: 'client-1',
  need_id: 'need-1',
  title: 'Баннер',
  version_number: 2,
  public_comment: 'Монтаж включён'
}, sourceItems, [{ version_number: 1 }, { version_number: 2 }]);

assert.equal(draft.sourceCalculationId, 'calc-1');
assert.equal(draft.sourceVersion, 2);
assert.equal(draft.nextVersion, 3);
assert.equal(draft.leadId, 'lead-1');
assert.equal(draft.needId, 'need-1');
assert.equal(draft.title, 'Баннер — правки v3');
assert.equal(draft.items.length, 1);
assert.match(draft.internalComment, /Исходный расчёт сохранён без изменений/);

console.log('Calculation version edit model tests passed.');
