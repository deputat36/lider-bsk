import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('crm/v4/assets/v4/calculations.js', 'utf8');
const start = source.indexOf('function calcItem(raw, index) {');
const endMarker = '\n}\n\nfunction itemsWithRoundAdjustment';
const end = source.indexOf(endMarker, start);

assert.notEqual(start, -1, 'calcItem function not found');
assert.notEqual(end, -1, 'calcItem closing marker not found');

const functionSource = source.slice(start, end + 2);
const context = vm.createContext({ Number, Math });
vm.runInContext(`${functionSource}\nthis.calcItem = calcItem;`, context, { filename: 'calculations.js#calcItem' });

const catalogId = '11111111-2222-3333-4444-555555555555';
const calculated = context.calcItem({
  catalog_id: catalogId,
  category: 'Тест каталога',
  item_type: 'Товар',
  name: 'Catalog-backed item',
  unit: 'шт',
  qty: 2,
  contractor_price: 100,
  client_price: 150,
  comment: 'source test',
  data: { catalog_source: true },
}, 0);

assert.equal(calculated.catalog_id, catalogId, 'calcItem must preserve a catalog-backed UUID');
assert.equal(calculated.contractor_sum, 200);
assert.equal(calculated.client_sum, 300);
assert.equal(calculated.profit, 100);
assert.equal(calculated.sort_order, 1);

const manual = context.calcItem({ name: 'Manual item', qty: 1, client_price: 50 }, 1);
assert.equal(manual.catalog_id, null, 'Manual item without catalog_id must save null');
assert.equal(manual.sort_order, 2);

console.log('Calculation catalog_id preservation behavior passed.');
