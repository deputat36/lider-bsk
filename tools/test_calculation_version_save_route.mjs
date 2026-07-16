import assert from 'node:assert/strict';
import {
  buildCalculationVersionTransportDraft,
  calculationVersionPersistenceRoute,
  createCalculationVersionIdempotencyKey
} from '../crm/v4/assets/v4/calculation-version-save-route-v1.js';

const SOURCE_ID = '11111111-1111-4111-8111-111111111111';
const RANDOM_ID = '22222222-2222-4222-8222-222222222222';

{
  const route = calculationVersionPersistenceRoute('https://otulfnouybahfnsycxqn.supabase.co');
  assert.equal(route.mode, 'staging_edge');
  assert.equal(route.atomic, true);
  assert.equal(route.browserDirectWrite, false);
  assert.match(route.description, /атомарно/i);
}

{
  const route = calculationVersionPersistenceRoute('https://ofewxuqfjhamgerwzull.supabase.co');
  assert.equal(route.mode, 'production_legacy');
  assert.equal(route.atomic, false);
  assert.equal(route.browserDirectWrite, true);
}

{
  const route = calculationVersionPersistenceRoute('https://otulfnouybahfnsycxqn.example.com');
  assert.equal(route.mode, 'production_legacy');
}

{
  const key = createCalculationVersionIdempotencyKey(SOURCE_ID, { randomUUID: () => RANDOM_ID });
  assert.equal(key, `calculation-version:${SOURCE_ID}:${RANDOM_ID}`);
  assert.ok(key.length <= 160);
}

assert.throws(
  () => createCalculationVersionIdempotencyKey('bad', { randomUUID: () => RANDOM_ID }),
  /source_calculation_id_invalid/
);
assert.throws(
  () => createCalculationVersionIdempotencyKey(SOURCE_ID, { randomUUID: () => 'bad' }),
  /secure_request_id_unavailable/
);

function baseDraft(overrides = {}) {
  return {
    idempotencyKey: `calculation-version:${SOURCE_ID}:${RANDOM_ID}`,
    title: 'Баннер — правки v2',
    autoTitle: 'Баннер — правки v2',
    needId: null,
    publicComment: 'Для клиента',
    internalComment: 'Внутренний комментарий',
    items: [{
      id: 'server-row-id-must-not-pass',
      calculation_id: SOURCE_ID,
      lead_id: '33333333-3333-4333-8333-333333333333',
      catalog_id: null,
      category: 'Печать',
      item_type: 'Изготовление',
      name: 'Баннер',
      unit: 'м²',
      qty: 2,
      contractor_price: 400,
      contractor_sum: 800,
      client_price: 700,
      client_sum: 1400,
      profit: 600,
      margin_percent: 42.86,
      comment: 'Тест',
      data: { calculation_mode: 'banner' },
      sort_order: 1
    }],
    ...overrides
  };
}

{
  const draft = buildCalculationVersionTransportDraft(baseDraft());
  assert.equal(draft.title, null, 'automatic title must be server-derived in staging');
  assert.equal(draft.items.length, 1);
  assert.deepEqual(Object.keys(draft.items[0]).sort(), [
    'catalog_id',
    'category',
    'client_price',
    'comment',
    'contractor_price',
    'data',
    'item_type',
    'name',
    'qty',
    'sort_order',
    'unit'
  ]);
  for (const forbidden of ['id', 'calculation_id', 'lead_id', 'contractor_sum', 'client_sum', 'profit', 'margin_percent']) {
    assert.equal(forbidden in draft.items[0], false, `${forbidden} must not enter transport payload`);
  }
}

{
  const draft = buildCalculationVersionTransportDraft(baseDraft({
    title: 'Согласованный вариант для клиента'
  }));
  assert.equal(draft.title, 'Согласованный вариант для клиента');
}

{
  const draft = buildCalculationVersionTransportDraft(baseDraft({
    title: '',
    autoTitle: 'Баннер — правки v3'
  }));
  assert.equal(draft.title, null);
}

console.log('Calculation version save route tests passed.');
