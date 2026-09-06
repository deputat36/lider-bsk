import assert from 'node:assert/strict';
import {
  marginPercentFromMarkup,
  markupPercentForSubtotal,
  markupPercentFromMargin,
  normalizeMarginPercent,
  normalizePricingSettings,
  priceWithMarkup,
  repriceAutomaticItems
} from '../crm/v4/assets/v4/calculation-pricing-model-v1.js';

const settings = { smallLimit: 3000, smallMarkup: 30, mediumLimit: 10000, mediumMarkup: 20, largeMarkup: 10, roundStep: 10 };
assert.equal(markupPercentForSubtotal(1000, settings), 30);
assert.equal(markupPercentForSubtotal(5000, settings), 20);
assert.equal(markupPercentForSubtotal(15000, settings), 10);
assert.equal(markupPercentForSubtotal(15000, { ...settings, fixedMarkup: '25' }), 25);
assert.equal(priceWithMarkup(1000, 20, 10), 1200);
assert.equal(Math.round(marginPercentFromMarkup(20) * 10) / 10, 16.7);
assert.equal(normalizeMarginPercent('30'), 30);
assert.equal(normalizeMarginPercent('30,5'), 30.5);
assert.equal(normalizeMarginPercent('100'), null);
assert.equal(normalizeMarginPercent('-1'), null);
assert.equal(markupPercentFromMargin(20), 25);
assert.equal(Math.round(markupPercentFromMargin(30) * 100) / 100, 42.86);
assert.equal(Math.round(marginPercentFromMarkup(markupPercentFromMargin(30)) * 100) / 100, 30);
assert.equal(markupPercentFromMargin(100), null);

const items = [
  { contractor_price: 1000, qty: 1, client_price: 1300, data: { price_source: 'auto' } },
  { contractor_price: 500, qty: 1, client_price: 900, data: { price_source: 'manual' } }
];
const repriced = repriceAutomaticItems(items, { ...settings, fixedMarkup: 20 });
assert.equal(repriced[0].client_price, 1200);
assert.equal(repriced[0].data.applied_markup_percent, 20);
assert.equal(repriced[1].client_price, 900, 'manual employee price must be preserved');

const targetMarginMarkup = markupPercentFromMargin(30);
const marginRepriced = repriceAutomaticItems(items, { ...settings, fixedMarkup: targetMarginMarkup });
assert.equal(marginRepriced[0].client_price, 1430, '30% target margin must reprice the automatic item using equivalent markup and rounding');
assert.equal(Math.round(marginRepriced[0].data.applied_markup_percent * 100) / 100, 42.86);
assert.equal(marginRepriced[1].client_price, 900, 'target margin must not overwrite a manual employee price');

console.log('Unified calculation pricing behavior, including target margin conversion, is valid.');

// Explicit zero rules must survive normalization, including tier boundaries.
const zeroRules = normalizePricingSettings({ smallMarkup: '0', mediumMarkup: 0, largeMarkup: '0', roundStep: 1 });
for (const subtotal of [100, 5000, 15000]) assert.equal(markupPercentForSubtotal(subtotal, zeroRules), 0);
assert.equal(normalizePricingSettings({ smallMarkup: '', mediumMarkup: 'bad' }).smallMarkup, 30);
assert.equal(markupPercentForSubtotal(1, { smallLimit: 0, mediumLimit: 0 }), 10);
const special = [
  { qty: 1, contractor_price: 100, client_price: 0, data: { price_source: 'manual' } },
  { qty: 2, contractor_price: 100, client_price: 50, data: { price_source: 'manual' } },
  { qty: 1, contractor_price: 100, client_price: 125, data: { price_source: 'catalog' } },
  { qty: 1, contractor_price: 100, client_price: 150, data: { price_source: 'auto' } }
];
const specialBefore = JSON.stringify(special);
assert.deepEqual(repriceAutomaticItems(special, zeroRules).map(x => x.client_price), [0, 50, 125, 100]);
assert.equal(JSON.stringify(special), specialBefore, 'repricing must not mutate historical input');

// Exercise real builder event handlers: rule selection previews; the apply action reprices.
const { readFileSync } = await import('node:fs');
const { default: vm } = await import('node:vm');
const source = readFileSync(new URL('../crm/v4/assets/v4/calculations.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '')
  .replace(/export (async )?function /g, '$1function ');
const handlers = {};
const fields = new Map(Object.entries({ calcMarkup: '', calcTargetMargin: '', calcSmallMarkup: '0', calcMedMarkup: '0', calcLargeMarkup: '0', calcRoundStep: '1' }).map(([id, value]) => [id, { value }]));
const messages = [];
const ctx = vm.createContext({
  normalizePricingSettings, normalizeMarginPercent, markupPercentFromMargin,
  markupPercentForSubtotal, priceWithMarkup, repriceAutomaticItems,
  legacyCatalogFallbackRows: () => [],
  document: { addEventListener() {} },
  byId: id => id === 'leadCardSection' ? { addEventListener: (name, callback) => { handlers[name] = callback; } } : fields.get(id),
  toast: message => messages.push(message),
  testItems: special
});
vm.runInContext(source, ctx);
vm.runInContext('renderSmartPreview = () => {}; renderPricingExplanation = () => {}; renderDraftItems = () => {}; draftItems = testItems; bindCalculationEvents();', ctx);
fields.get('calcTargetMargin').value = '20';
handlers.input({ target: { id: 'calcTargetMargin', value: '20' } });
assert.equal(vm.runInContext('draftItems[3].client_price', ctx), 150, 'typing target must not silently reprice draft');
handlers.click({ target: { closest: selector => selector === '#applyAutomaticCalcPricesBtn' ? {} : null } });
assert.equal(vm.runInContext('draftItems[3].client_price', ctx), 125, 'apply must calculate cost / (1 - margin/100)');
assert.equal(vm.runInContext('draftItems[0].client_price', ctx), 0);
assert.equal(vm.runInContext('draftItems[1].client_price', ctx), 50);
assert.equal(vm.runInContext('draftItems[2].client_price', ctx), 125);
fields.get('calcTargetMargin').value = '100';
handlers.click({ target: { closest: selector => selector === '#applyAutomaticCalcPricesBtn' ? {} : null } });
assert.equal(messages.length, 1, 'invalid margin must not emit a success toast');
assert.equal(vm.runInContext('draftItems[3].client_price', ctx), 125);
fields.get('calcTargetMargin').value = '';
handlers.click({ target: { closest: selector => selector === '#applyAutomaticCalcPricesBtn' ? {} : null } });
assert.equal(vm.runInContext('draftItems[3].client_price', ctx), 100, 'zero tier rule must reach actual builder handler');
console.log('Builder pricing controls: explicit apply, zero tiers, manual/catalog protection PASS.');
