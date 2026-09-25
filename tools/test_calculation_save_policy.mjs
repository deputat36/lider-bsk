import assert from 'node:assert/strict';
import { calculationSaveDecision } from '../crm/v4/assets/v4/calculation-save-policy-v1.js';
import { calculationVersionTotals, updateCalculationVersionItem } from '../crm/v4/assets/v4/calculation-version-edit-model-v1.js';

const item = { name: 'Тестовая работа', qty: 1, contractor_price: 1000, client_price: 1500 };
for (const [price, warning] of [[0, /Бесплатная работа/], [900, /убыточный/], [1000, /Работа в ноль/], [1500, /^$/]]) {
  const rows = [{ ...item, client_price: price }];
  const totals = calculationVersionTotals(rows);
  const decision = calculationSaveDecision(rows, totals);
  assert.equal(totals.canSave, true);
  assert.equal(decision.ok, true);
  assert.match(decision.confirmation, warning);
  assert.equal(totals.profit, price - 1000);
}
for (const [field, values] of Object.entries({ qty: [0, -1, NaN, Infinity, null, '', 1000001], contractor_price: [-1, NaN, Infinity, null, '', 1000000001], client_price: [-1, NaN, Infinity, null, '', 1000000001] })) {
  for (const value of values) {
    const rows = [{ ...item, [field]: value }];
    assert.equal(calculationVersionTotals(rows).canSave, false, `${field}=${value} must not be normalized into a valid special price`);
  }
}
assert.equal(calculationVersionTotals([]).canSave, false);
assert.equal(calculationVersionTotals(Array.from({ length: 201 }, () => item)).canSave, false);
assert.equal(updateCalculationVersionItem(item, 'client_price', '-1').client_price, -1);
assert.ok(Number.isNaN(updateCalculationVersionItem(item, 'qty', '').qty));
assert.equal(item.client_price, 1500, 'editing does not mutate the saved source');
console.log('Special-price policy: free/loss/break-even warnings; invalid numeric inputs remain blocked.');
