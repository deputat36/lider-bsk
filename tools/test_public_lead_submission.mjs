import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Execute the actual submit handler. All HTTP is intercepted; no backend is used.
const source = fs.readFileSync(process.argv[2] || 'assets/public-lead-form.js', 'utf8');
const values = new Map();
const storage = {
  getItem: key => values.get(key) || null,
  setItem: (key, value) => values.set(key, value),
  removeItem: key => values.delete(key),
};
function page(search = '', sessionStorage = storage) {
  const sent = [];
  const fields = { phone: '+7 900 000-00-00', name: 'Synthetic local test', service: 'Наклейки', message: 'Тестовый расчёт', website: '' };
  const button = {};
  const status = {};
  const form = { dataset: {}, reset() {}, querySelector(selector) {
    if (selector === 'button[type="submit"]') return button;
    if (selector === '[data-leader-lead-status]') return status;
    const name = selector.match(/^\[name="([^"]+)"\]$/)?.[1];
    return name ? { value: fields[name] || '' } : null;
  } };
  let networkFailure = false;
  const context = vm.createContext({
    window: { sessionStorage, dispatchEvent() {} },
    document: { readyState: 'loading', title: 'Наклейки', addEventListener() {} },
    location: { pathname: '/nakleyki-plotternaya-rezka-borisoglebsk.html', href: 'https://www.lider-bsk.ru/nakleyki-plotternaya-rezka-borisoglebsk.html' + search, search },
    navigator: { userAgent: 'local-contract-test' },
    URLSearchParams, CustomEvent: class {}, console: { error() {} },
    fetch: async (url, options) => {
      const payload = JSON.parse(options.body); sent.push(payload);
      if (networkFailure) throw new Error('Synthetic network failure');
      return { ok: true, status: 200, json: async () => ({ ok: true, request_id: payload.request_id }) };
    },
  });
  vm.runInContext(fs.readFileSync('assets/leader-service-catalog.js', 'utf8'), context);
  context.window.LeaderServiceCatalog = context.LeaderServiceCatalog;
  const marker = source.lastIndexOf('})();');
  const instrumented = source.slice(0, marker) + '\nwindow.testSubmit=submit; window.testAttribution=typeof campaignAttribution === "function" ? campaignAttribution : qs;\n' + source.slice(marker);
  vm.runInContext(instrumented, context);
  return { sent, fields, status, capture: () => context.window.testAttribution(), fail: value => { networkFailure = value; }, submit: () => context.window.testSubmit({ preventDefault() {}, currentTarget: form }) };
}

const direct = page();
await direct.submit();
assert.equal(direct.sent[0].service, 'Наклейки', 'Selected service must survive an URL without service');
assert.equal(direct.sent[0].source, 'Сайт');
assert.equal(direct.sent[0].direction, 'production');
assert.equal(direct.sent[0].service_id, 'stickers');
assert.ok(direct.sent[0].message.includes('Направление: Производство рекламы'));
assert.equal(direct.sent[0].page_path, '/nakleyki-plotternaya-rezka-borisoglebsk.html');
assert.ok(direct.sent[0].message.includes('Услуга: Наклейки'));
assert.ok(direct.sent[0].submitted_at);
const changed = page('?service=Баннер&utm_source=vk&utm_campaign=opening');
await changed.submit();
assert.equal(changed.sent[0].service, 'Наклейки', 'User selection must win over the original link preset');
assert.equal(changed.sent[0].utm_source, 'vk');
const navigated = page();
await navigated.submit();
assert.equal(navigated.sent[0].utm_campaign, 'opening', 'Internal navigation must retain campaign');
const newCampaign = page('?utm_source=yandex');
newCampaign.capture();
const nextPage = page();
await nextPage.submit();
assert.equal(nextPage.sent[0].utm_source, 'yandex');
assert.equal(nextPage.sent[0].utm_campaign, '', 'A new campaign must not inherit old campaign fields');
const initialVisit = page('?utm_source=qr&utm_medium=offline&utm_content=flyer');
initialVisit.capture(); // Arrival must be captured before any form submission.
const fromArrival = page();
fromArrival.fail(true);
await fromArrival.submit();
fromArrival.fail(false);
await fromArrival.submit();
assert.equal(fromArrival.sent[0].request_id, fromArrival.sent[1].request_id, 'Retry must preserve the request ID');
assert.equal(fromArrival.sent[1].utm_content, 'flyer');
assert.ok(!Array.from(values.values()).join('').includes('Synthetic local test'));
assert.ok(!Array.from(values.values()).join('').includes('900 000'));
values.set('leader_public_campaign_v1', JSON.stringify({created_at: Date.now() - 31 * 60 * 1000, values: {utm_source: 'expired'}}));
const expired = page(); await expired.submit();
assert.equal(expired.sent[0].utm_source, '');
values.set('leader_public_campaign_v1', '{invalid json');
const corrupted = page(); await corrupted.submit();
assert.equal(corrupted.sent[0].service, 'Наклейки');
const blocked = page('?utm_source=vk', {getItem() {throw Error('blocked');}, setItem() {throw Error('blocked');}, removeItem() {throw Error('blocked');}});
await blocked.submit();
assert.equal(blocked.sent[0].utm_source, 'vk');
assert.equal(blocked.sent[0].service, 'Наклейки');
console.log('PASS: actual form submit preserves selected service, campaign navigation, replacement, TTL, storage fallback and retry.');
