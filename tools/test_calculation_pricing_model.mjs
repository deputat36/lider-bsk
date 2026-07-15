import assert from 'node:assert/strict';
import { marginPercentFromMarkup, markupPercentForSubtotal, priceWithMarkup, repriceAutomaticItems } from '../crm/v4/assets/v4/calculation-pricing-model-v1.js';

const settings = { smallLimit: 3000, smallMarkup: 30, mediumLimit: 10000, mediumMarkup: 20, largeMarkup: 10, roundStep: 10 };
assert.equal(markupPercentForSubtotal(1000, settings), 30);
assert.equal(markupPercentForSubtotal(5000, settings), 20);
assert.equal(markupPercentForSubtotal(15000, settings), 10);
assert.equal(markupPercentForSubtotal(15000, { ...settings, fixedMarkup: '25' }), 25);
assert.equal(priceWithMarkup(1000, 20, 10), 1200);
assert.equal(Math.round(marginPercentFromMarkup(20) * 10) / 10, 16.7);

const items = [
  { contractor_price: 1000, qty: 1, client_price: 1300, data: { price_source: 'auto' } },
  { contractor_price: 500, qty: 1, client_price: 900, data: { price_source: 'manual' } }
];
const repriced = repriceAutomaticItems(items, { ...settings, fixedMarkup: 20 });
assert.equal(repriced[0].client_price, 1200);
assert.equal(repriced[0].data.applied_markup_percent, 20);
assert.equal(repriced[1].client_price, 900, 'manual employee price must be preserved');
console.log('Unified calculation pricing behavior is valid.');
