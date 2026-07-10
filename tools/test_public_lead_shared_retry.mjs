import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const STORAGE_KEY = 'leader_public_lead_pending_v1';
const MAX_PENDING_AGE_MS = 30 * 60 * 1000;

function makeStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function makeContext(storage) {
  const window = {
    sessionStorage: storage,
    addEventListener() {},
    dispatchEvent() {},
    fetch: async () => ({ ok: true, clone() { return this; }, async json() { return { ok: true }; } }),
  };
  window.window = window;
  return vm.createContext({
    window,
    document: { readyState: 'loading', addEventListener() {} },
    location: { pathname: '/test.html', href: 'https://www.lider-bsk.ru/test.html', search: '' },
    navigator: { userAgent: 'retry-contract-test' },
    URL,
    URLSearchParams,
    CustomEvent: class CustomEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
    console,
    Date,
    Math,
    JSON,
    String,
    Number,
    Array,
    Object,
    Set,
    Map,
    Promise,
  });
}

function expose(source, marker, injection) {
  const index = source.lastIndexOf(marker);
  assert.notEqual(index, -1, `Missing closing marker ${marker}`);
  return source.slice(0, index) + injection + source.slice(index);
}

const formSource = fs.readFileSync('assets/public-lead-form.js', 'utf8');
const helperSource = fs.readFileSync('assets/public-lead-reference-v1.js', 'utf8');

assert.ok(formSource.includes("const PENDING_STORAGE_KEY='leader_public_lead_pending_v1'"));
assert.ok(formSource.includes('const MAX_PENDING_AGE_MS=30*60*1000'));
assert.ok(formSource.includes("return 'fnv1a-'"));
assert.ok(formSource.includes('const rid=stableRequestId(payload)'));
assert.ok(formSource.includes('if(!res.ok||data.ok!==true)'));
assert.ok(formSource.indexOf('clearPending();', formSource.indexOf('if(!res.ok||data.ok!==true)')) > -1);
assert.ok(helperSource.includes("return 'fnv1a-'"));

const storage = makeStorage();
const formContext = makeContext(storage);
const instrumentedForm = expose(
  formSource,
  '})();',
  'window.__leaderRetryTest={fingerprint,stableRequestId,clearPending,readPending};\n',
);
vm.runInContext(instrumentedForm, formContext, { filename: 'public-lead-form.js' });
const formApi = formContext.window.__leaderRetryTest;
assert.ok(formApi);

const helperStorage = makeStorage();
const helperContext = makeContext(helperStorage);
const instrumentedHelper = expose(
  helperSource,
  '})();',
  'window.__leaderReferenceRetryTest={fingerprint};\n',
);
vm.runInContext(instrumentedHelper, helperContext, { filename: 'public-lead-reference-v1.js' });
const helperApi = helperContext.window.__leaderReferenceRetryTest;
assert.ok(helperApi);

const payload = {
  phone: '+7 (900) 123-45-67',
  service: 'Баннер',
  page_path: '/bannery-borisoglebsk.html',
  message: 'Нужен баннер 2 × 3 метра',
};

assert.equal(formApi.fingerprint(payload), helperApi.fingerprint(payload), 'Shared form and request helper fingerprints differ');

const first = formApi.stableRequestId(payload);
const second = formApi.stableRequestId({ ...payload, phone: '8 900 123 45 67' });
assert.equal(second, first, 'Same payload retry must reuse request_id');

const rawStored = storage.getItem(STORAGE_KEY);
assert.ok(rawStored);
assert.ok(rawStored.includes('fnv1a-'));
assert.ok(!rawStored.includes('9001234567'), 'Raw normalized phone must not be stored');
assert.ok(!rawStored.includes(payload.message), 'Raw message must not be stored');

const changed = formApi.stableRequestId({ ...payload, message: payload.message + ' срочно' });
assert.notEqual(changed, first, 'Changed payload must receive a new request_id');

formApi.clearPending();
assert.equal(storage.getItem(STORAGE_KEY), null);

storage.setItem(STORAGE_KEY, JSON.stringify({
  request_id: 'web-expired',
  fingerprint: formApi.fingerprint(payload),
  created_at: Date.now() - MAX_PENDING_AGE_MS - 1,
}));
const afterExpiry = formApi.stableRequestId(payload);
assert.notEqual(afterExpiry, 'web-expired', 'Expired pending request_id must not be reused');

console.log('Public lead shared retry idempotency contract passed.');
