import assert from 'node:assert/strict';
import {
  CONTRACTOR_QUOTE_MODEL_V1,
  contractorQuoteCost,
  contractorQuoteDraftItem,
  contractorQuoteDraftValidation
} from '../crm/v4/assets/v4/calculation-contractor-quote-model-v1.js';

assert.equal(contractorQuoteCost({ base: 10000, delivery: 1000, installation: 2000, design: 500, other: 250 }), 13750);
assert.equal(contractorQuoteCost({ base: '10 000', delivery: '1 500,50' }), 11500.5);
assert.equal(contractorQuoteCost({ base: -100, delivery: 'bad' }), 0);

const auto = contractorQuoteDraftItem({
  clientTitle: 'Световая вывеска «ОВОЩИ»',
  clientDescription: 'Объёмные буквы, 3000×700 мм, белый акрил, светодиодная подсветка',
  qty: 1,
  unit: 'комплект',
  vendor: 'Подрядчик №1',
  base: 10000,
  delivery: 1000,
  installation: 2000,
  design: 500,
  other: 250,
  internalComment: 'Смета подрядчика от 07.09'
});
assert.equal(auto.name, 'Световая вывеска «ОВОЩИ»');
assert.equal(auto.qty, 1);
assert.equal(auto.unit, 'комплект');
assert.equal(auto.contractor_price, 13750);
assert.equal(auto.client_price, 0);
assert.equal(auto.comment, 'Смета подрядчика от 07.09');
assert.equal(auto.data.builder_version, 'calc-builder-v2');
assert.equal(auto.data.mode, 'contractor_quote');
assert.equal(auto.data.visibility, 'single_line');
assert.equal(auto.data.client_title, 'Световая вывеска «ОВОЩИ»');
assert.match(auto.data.client_description, /3000×700/);
assert.equal(auto.data.vendor, 'Подрядчик №1');
assert.deepEqual(auto.data.contractor, { id: null, name: 'Подрядчик №1' });
assert.equal(auto.data.contractor_quote.installation, 2000);
assert.equal(auto.data.contractor_quote.total_cost, 13750);
assert.equal(auto.data.contractor_quote.quoted_quantity, 1);
assert.equal(auto.data.components.length, 5);
assert.equal(auto.data.components.find((part) => part.code === 'delivery')?.amount, 1000);
assert.equal(auto.data.pricing.manual_client_total, null);
assert.equal(auto.data.price_source, 'auto');
assert.equal(auto.data.model_version, CONTRACTOR_QUOTE_MODEL_V1);

const multi = contractorQuoteDraftItem({
  clientTitle: 'Навигационные таблички',
  qty: 2,
  unit: 'шт',
  base: 8000,
  delivery: 1000,
  clientPrice: 14000
});
assert.equal(multi.qty, 2);
assert.equal(multi.contractor_price, 4500);
assert.equal(multi.client_price, 7000);
assert.equal(multi.data.contractor_quote.total_cost, 9000);
assert.equal(multi.data.pricing.manual_client_total, 14000);
assert.equal(multi.data.price_source, 'manual');

const missingTitle = contractorQuoteDraftValidation({ base: 5000 });
assert.equal(missingTitle.ok, false);
assert.deepEqual(missingTitle.errors, ['contractor_client_title_required']);

const missingCost = contractorQuoteDraftValidation({ clientTitle: 'Вывеска' });
assert.equal(missingCost.ok, false);
assert.deepEqual(missingCost.errors, ['contractor_cost_required']);

const valid = contractorQuoteDraftValidation({ clientTitle: 'Вывеска', base: 5000 });
assert.equal(valid.ok, true);
assert.equal(valid.item.name, 'Вывеска');

console.log('contractor quote model v1 tests: PASS');
