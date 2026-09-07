import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { publicOfferRows } from '../crm/v4/assets/v4/offer-visibility-v1.js';
import { storedOfferClientDetails } from '../crm/v4/assets/v4/offer-client-privacy-v1.js';

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

const calculation = {
  id: 'calc', lead_id: 'lead', title: 'Вывеска', client_total: 6399,
  public_comment: 'Публичные условия', internal_comment: 'PRIVATE_CALC_COMMENT'
};
const liveLead = {
  id: 'lead', name: 'PRIVATE_LIVE_CLIENT', phone: '+79990000000', service: 'PRIVATE_LIVE_SERVICE'
};
const anonymousOffer = {
  id: 'offer-anon', calculation_id: 'calc', lead_id: 'lead', title: 'Предложение', total_sum: 6399,
  valid_until: '2026-09-20', short_text: 'Здравствуйте!\n\nПодготовили расчёт.',
  full_text: 'КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ\nРА «Лидер»\n\nСостав предложения'
};
const personalizedOffer = {
  ...anonymousOffer,
  id: 'offer-personalized',
  short_text: 'Здравствуйте, Публичный Клиент!\n\nПодготовили расчёт.',
  full_text: 'КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ\nРА «Лидер»\n\nКлиент: Публичный Клиент\nТелефон: +79001234567\n\nСостав предложения'
};

const selects = [];
const context = vm.createContext({
  publicOfferRows,
  storedOfferClientDetails,
  document: { addEventListener() {} },
  setInterval() {},
  v4State: { currentLead: liveLead, offers: [anonymousOffer, personalizedOffer] },
  timeout: async (result) => result,
  supabaseClient: { from(table) {
    const query = {
      select(fields) { selects.push({ table, fields }); return query; },
      eq() { return query; }, order() { return query; },
      maybeSingle: async () => ({ data: calculation }),
      limit: async () => ({ data: items })
    };
    return query;
  } }
});
vm.runInContext(source.replace(/^import .*;\n/gm, '') + '\nthis.printApi = { business, presentation, loadBundle };', context);

const loadedAnonymous = await context.printApi.loadBundle(anonymousOffer);
assert.deepEqual(loadedAnonymous.items, items);
assert.equal(loadedAnonymous.lead, undefined, 'print bundle must not load live lead identity');
const itemFields = selects.find((entry) => entry.table === 'leader_lead_calculation_items').fields.split(',');
assert.ok(itemFields.includes('data'), 'visibility metadata must be loaded');
for (const field of ['comment', 'contractor_price', 'contractor_sum', 'profit', 'margin_percent']) {
  assert.ok(!itemFields.includes(field), `print query must not select ${field}`);
}
assert.ok(!selects.some((entry) => entry.table === 'leader_leads'), 'anonymous print must not query live lead');

for (const template of ['business', 'presentation']) {
  const html = context.printApi[template](loadedAnonymous);
  assert.ok(!html.includes('PRIVATE_'), `${template} anonymous PDF must exclude internal/live client data`);
  assert.ok(!html.includes('+79990000000'), `${template} anonymous PDF must exclude live phone`);
  assert.ok(!html.includes('<h2>Клиент</h2>'), `${template} anonymous PDF must omit client card`);
  assert.ok(html.includes('Вывеска &lt;готовая&gt;'), `${template} must escape client title`);
  assert.ok(html.includes('Объёмные буквы 3000×700 мм, акрил и LED-подсветка'), `${template} must show safe client description`);
  assert.ok(html.includes('Публичные условия'));
  assert.ok(html.includes('Монтаж'));
  assert.ok(html.includes((6399).toLocaleString('ru-RU')), 'agreed total stays unchanged');
}

const personalizedBundle = { offer: personalizedOffer, calculation, items };
for (const template of ['business', 'presentation']) {
  const html = context.printApi[template](personalizedBundle);
  assert.ok(html.includes('Публичный Клиент'), `${template} personalized PDF must show stored client name`);
  assert.ok(html.includes('+79001234567'), `${template} personalized PDF must show stored client phone`);
  assert.ok(!html.includes('PRIVATE_LIVE_CLIENT'), `${template} must never substitute current lead name`);
  assert.ok(!html.includes('+79990000000'), `${template} must never substitute current lead phone`);
}

console.log('offer print privacy: anonymous default + stored personalized identity + no live lead leakage PASS');
