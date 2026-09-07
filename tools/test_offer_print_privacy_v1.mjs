import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { publicOfferRows } from '../crm/v4/assets/v4/offer-visibility-v1.js';

// Exercise both real print templates and their actual SELECT projection.
const source = await readFile(new URL('../crm/v4/assets/v4/offer-print-brand-v4.js', import.meta.url), 'utf8');
const items = [
  { name: 'PRIVATE_PARENT', qty: 2, unit: 'шт', client_sum: 2400,
    comment: 'PRIVATE_COMMENT', contractor_sum: 731, profit: 1669,
    data: {
      client_title: 'Вывеска <готовая>',
      client_description: 'Объёмные буквы 3000×700 мм, акрил и LED-подсветка',
      visibility: 'single_line',
      vendor: 'PRIVATE_VENDOR',
      contractor_quote: { total_cost: 731 }
    } },
  { name: 'PRIVATE_LINE', client_sum: 999, data: { visibility: 'internal_only' } },
  { name: 'PRIVATE_COMPOSITE', qty: 1, client_sum: 3000,
    data: { visibility: 'detailed', components: [
      { title: 'Монтаж', qty: 2, unit: 'шт', client_sum: 3000, client_visible: true },
      { title: 'PRIVATE_COMPONENT', client_sum: 950, client_visible: false }
    ] } }
];
const bundle = {
  offer: { id: 'offer', calculation_id: 'calc', lead_id: 'lead', title: 'Предложение', total: 6399 },
  calculation: { title: 'Вывеска', client_total: 6399, public_comment: 'Публичные условия', internal_comment: 'PRIVATE_CALC_COMMENT' },
  items, lead: { id: 'lead', name: 'Клиент', service: 'Вывеска' }
};
const selects = [];
const context = vm.createContext({
  publicOfferRows, document: { addEventListener() {} }, setInterval() {},
  v4State: { currentLead: bundle.lead }, timeout: async (result) => result,
  supabaseClient: { from(table) {
    const query = {
      select(fields) { selects.push({ table, fields }); return query; },
      eq() { return query; }, order() { return query; },
      maybeSingle: async () => ({ data: bundle.calculation }),
      limit: async () => ({ data: items })
    };
    return query;
  } }
});
vm.runInContext(source.replace(/^import .*;\n/gm, '') + '\nthis.printApi = { business, presentation, loadBundle };', context);
const loaded = await context.printApi.loadBundle(bundle.offer);
assert.deepEqual(loaded.items, items);
const fields = selects.find((entry) => entry.table === 'leader_lead_calculation_items').fields.split(',');
assert.ok(fields.includes('data'), 'visibility metadata must be loaded');
for (const field of ['comment', 'contractor_price', 'contractor_sum', 'profit', 'margin_percent']) {
  assert.ok(!fields.includes(field), `print query must not select ${field}`);
}
for (const template of ['business', 'presentation']) {
  const html = context.printApi[template](loaded);
  assert.ok(!html.includes('PRIVATE_'), `${template} must exclude internal names, vendor and comments`);
  assert.ok(html.includes('Вывеска &lt;готовая&gt;'), `${template} must escape client title`);
  assert.ok(html.includes('Объёмные буквы 3000×700 мм, акрил и LED-подсветка'), `${template} must show safe client description`);
  assert.ok(html.includes('Публичные условия'));
  assert.ok(html.includes('Монтаж'));
  assert.ok(html.includes((1200).toLocaleString('ru-RU')), 'single-line unit price');
  assert.ok(html.includes((1500).toLocaleString('ru-RU')), 'component unit price');
  assert.ok(html.includes((6399).toLocaleString('ru-RU')), 'agreed total stays unchanged');
}
console.log('offer print privacy: client description visible, internal contractor data hidden in both real templates PASS');
