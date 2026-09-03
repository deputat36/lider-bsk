import assert from 'node:assert/strict';
import {
  CONTRACTOR_QUOTE_MODEL_V1,
  contractorQuoteCost,
  contractorQuoteDraftItem
} from '../crm/v4/assets/v4/calculation-contractor-quote-model-v1.js';

assert.equal(contractorQuoteCost({ base: 10000, delivery: 1000, installation: 2000, design: 500, other: 250 }), 13750);
assert.equal(contractorQuoteCost({ base: '10 000', delivery: '1 500,50' }), 11500.5);
assert.equal(contractorQuoteCost({ base: -100, delivery: 'bad' }), 0);

const auto = contractorQuoteDraftItem({
  title: 'Фасадная вывеска под ключ',
  vendor: 'Подрядчик №1',
  base: 10000,
  delivery: 1000,
  installation: 2000,
  design: 500,
  other: 250,
  comment: 'Изготовление и монтаж'
});
assert.equal(auto.name, 'Фасадная вывеска под ключ');
assert.equal(auto.qty, 1);
assert.equal(auto.contractor_price, 13750);
assert.equal(auto.client_price, 0);
assert.equal(auto.data.builder_version, 'calc-builder-v2');
assert.equal(auto.data.mode, 'contractor_quote');
assert.equal(auto.data.visibility, 'single_line');
assert.equal(auto.data.vendor, 'Подрядчик №1');
assert.equal(auto.data.contractor_quote.installation, 2000);
assert.equal(auto.data.contractor_quote.total_cost, 13750);
assert.equal(auto.data.price_source, 'auto');
assert.equal(auto.data.model_version, CONTRACTOR_QUOTE_MODEL_V1);

const manual = contractorQuoteDraftItem({ base: 5000, clientPrice: 8000 });
assert.equal(manual.contractor_price, 5000);
assert.equal(manual.client_price, 8000);
assert.equal(manual.data.price_source, 'manual');

console.log('contractor quote model v1 tests: PASS');
