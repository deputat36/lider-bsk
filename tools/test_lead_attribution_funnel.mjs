import assert from 'node:assert/strict';
import { buildLeadAttributionFunnel } from '../crm/v4/assets/v4/lead-attribution-funnel-model-v1.js';
import { normalizeLeadLandingPage, normalizeLeadSourceCategory } from '../crm/v4/assets/v4/lead-analytics-normalization.js';

const leads = [
  { id: 'l1', source: 'Сайт', page_url: 'https://www.lider-bsk.ru/banner/?utm_source=vk', source_page_path: '/banner/', utm_source: 'vk', request_id: 'r1' },
  { id: 'l2', source: 'Форма сайта', page_url: 'https://www.lider-bsk.ru/banner/?draft=1' },
  { id: 'l3', source: 'VK', page_url: 'https://vk.com/lider_bsk' },
  { id: 'l4', source: 'Вручную', page_url: 'CRM v4 / ручное создание' },
  { id: 'l5', source: 'Одноклассники' },
  { id: 'l6', source: '', page_url: 'https://lider-bsk.ru/signs/?from=menu' },
];
const calculations = [{ id: 'c1', lead_id: 'l1' }, { id: 'c2', lead_id: 'l2' }, { id: 'c3', lead_id: 'l3' }, { id: 'c4', lead_id: 'l4' }];
const offers = [{ id: 'f1', lead_id: 'l1' }, { id: 'f2', lead_id: 'l3' }, { id: 'f3', lead_id: 'l4' }];
const orders = [
  { id: 'o1', lead_id: 'l1', client_total: 30000 },
  { id: 'o2', lead_id: 'l3', client_total: 20000 },
  { id: 'o3', lead_id: 'l4', client_total: 10000 },
];

assert.equal(normalizeLeadSourceCategory('Сайт', '/banner/', 'vk'), 'ВКонтакте');
assert.equal(normalizeLeadSourceCategory('VK', 'https://www.lider-bsk.ru/banner/'), 'ВКонтакте');
assert.equal(normalizeLeadLandingPage(leads[0]), '/banner/');
assert.equal(normalizeLeadLandingPage(leads[1]), '/banner/');
assert.equal(normalizeLeadLandingPage(leads[2]), 'ВКонтакте / внешняя ссылка');
assert.equal(normalizeLeadLandingPage(leads[3]), 'Ручное создание в CRM');
assert.equal(normalizeLeadLandingPage(leads[4]), 'Не указана');
assert.equal(normalizeLeadLandingPage(leads[5]), '/signs/');

const snapshot = buildLeadAttributionFunnel(leads, calculations, offers, orders);
assert.equal(snapshot.totalLeads, 6);
assert.equal(snapshot.calculationLeads, 4);
assert.equal(snapshot.offerLeads, 3);
assert.equal(snapshot.orderLeads, 3);
assert.equal(snapshot.plannedRevenue, 60000);
assert.equal(snapshot.orderConversionPercent, 50);
assert.deepEqual(snapshot.coverage, { requestId: 1, pageReference: 5, utmSource: 1 });

const vk = snapshot.bySource.find((row) => row.label === 'ВКонтакте');
assert.deepEqual(vk, {
  label: 'ВКонтакте', leads: 2, calculations: 2, offers: 2, orders: 2,
  plannedRevenue: 50000, orderConversionPercent: 100,
});
const site = snapshot.bySource.find((row) => row.label === 'Сайт');
assert.equal(site.leads, 2);
assert.equal(site.orders, 0);
const banner = snapshot.byPage.find((row) => row.label === '/banner/');
assert.equal(banner.leads, 2);
assert.equal(banner.calculations, 2);
assert.equal(banner.orders, 1);
assert.equal(banner.plannedRevenue, 30000);
assert.equal(snapshot.bySource[0].label, 'ВКонтакте', 'groups with the most orders and revenue must be first');

const empty = buildLeadAttributionFunnel([], [], [], []);
assert.equal(empty.totalLeads, 0);
assert.equal(empty.orderConversionPercent, 0);
assert.deepEqual(empty.bySource, []);

console.log('Lead attribution funnel behavior is valid: UTM priority, landing pages, milestones and revenue grouping are deterministic.');
