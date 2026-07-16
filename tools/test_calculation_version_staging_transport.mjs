import assert from 'node:assert/strict';
import {
  CALCULATION_VERSION_STAGING_TRANSPORT,
  buildStagingCalculationVersionCommand,
  calculationStagingTransportAvailability,
  invokeStagingCalculationVersion,
  isStagingCalculationEnvironment,
  projectRefFromCalculationSupabaseUrl
} from '../crm/v4/assets/v4/calculation-version-staging-transport-v1.js';

const ids = Object.freeze({
  request: '11111111-1111-4111-8111-111111111111',
  source: '22222222-2222-4222-8222-222222222222',
  need: '33333333-3333-4333-8333-333333333333',
  created: '44444444-4444-4444-8444-444444444444',
  lead: '55555555-5555-4555-8555-555555555555'
});

const stagingUrl = `https://${CALCULATION_VERSION_STAGING_TRANSPORT.hostname}`;
const productionUrl = 'https://ofewxuqfjhamgerwzull.supabase.co';
const expectedUpdatedAt = '2026-07-15T12:00:00.000Z';
const sourceCalculation = { id: ids.source, lead_id: ids.lead, updated_at: expectedUpdatedAt };
const draft = {
  idempotency_key: `calculation.create_version:${ids.source}:draft-1`,
  title: 'Новая версия расчёта',
  need_id: ids.need,
  public_comment: 'В стоимость входит изготовление.',
  internal_comment: 'Синтетический тест.',
  items: [{
    catalog_id: null,
    category: 'Широкоформатная печать',
    item_type: 'Изготовление',
    name: 'Баннер 1×2 м',
    unit: 'м²',
    qty: 2,
    contractor_price: 400,
    contractor_sum: 800,
    markup_percent: 75,
    client_price: 700,
    client_sum: 1400,
    profit: 600,
    margin_percent: 42.86,
    comment: 'Тестовая позиция',
    data: { calculation_mode: 'banner' },
    sort_order: 0,
    calculation_id: ids.source,
    lead_id: ids.lead,
    created_by: ids.request
  }],
  version_number: 99,
  status: 'Согласован',
  client_total: 1400,
  contractor_cost: 800,
  profit: 600,
  margin_percent: 42.86,
  commercial_offer_id: ids.request,
  order_id: ids.request,
  actor_id: ids.request
};

assert.equal(CALCULATION_VERSION_STAGING_TRANSPORT.permission, 'calculations.write');
assert.equal(CALCULATION_VERSION_STAGING_TRANSPORT.hostname, 'otulfnouybahfnsycxqn.supabase.co');
assert.equal(projectRefFromCalculationSupabaseUrl(stagingUrl), CALCULATION_VERSION_STAGING_TRANSPORT.projectRef);
assert.equal(isStagingCalculationEnvironment(stagingUrl), true);
for (const hostileUrl of [
  'https://otulfnouybahfnsycxqn.example.com',
  'https://evil.otulfnouybahfnsycxqn.supabase.co',
  'https://otulfnouybahfnsycxqn.supabase.co.example.com',
  productionUrl,
  'not-a-url'
]) {
  assert.equal(isStagingCalculationEnvironment(hostileUrl), false, `${hostileUrl} must fail closed`);
  assert.equal(projectRefFromCalculationSupabaseUrl(hostileUrl), '');
}

const production = calculationStagingTransportAvailability({
  supabaseUrl: productionUrl,
  canWrite: true,
  sourceCalculation,
  draft,
  expectedUpdatedAt
});
assert.equal(production.enabled, false);
assert.equal(production.reason, 'production_locked');

const command = buildStagingCalculationVersionCommand({ sourceCalculation, draft, expectedUpdatedAt, requestId: ids.request });
assert.deepEqual(Object.keys(command).sort(), ['action', 'expected_updated_at', 'payload', 'request_id']);
assert.deepEqual(Object.keys(command.payload).sort(), ['idempotency_key', 'internal_comment', 'items', 'need_id', 'public_comment', 'source_calculation_id', 'title']);
assert.deepEqual(Object.keys(command.payload.items[0]).sort(), ['catalog_id', 'category', 'client_price', 'comment', 'contractor_price', 'data', 'item_type', 'name', 'qty', 'sort_order', 'unit']);
for (const forbidden of ['actor_id', 'created_by', 'version_number', 'status', 'client_total', 'contractor_cost', 'contractor_sum', 'client_sum', 'profit', 'margin_percent', 'markup_percent', 'commercial_offer_id', 'order_id', 'calculation_id', 'lead_id']) {
  assert.equal(JSON.stringify(command).includes(`"${forbidden}"`), false, `forbidden field leaked: ${forbidden}`);
}

assert.throws(() => buildStagingCalculationVersionCommand({
  sourceCalculation,
  draft: { ...draft, items: [{ ...draft.items[0], contractor_price: null }] },
  expectedUpdatedAt,
  requestId: ids.request
}), /contractor_price_invalid/);

assert.throws(() => buildStagingCalculationVersionCommand({
  sourceCalculation,
  draft: { ...draft, idempotency_key: 'x'.repeat(161) },
  expectedUpdatedAt,
  requestId: ids.request
}), /idempotency_key_invalid/);

function clientWith(result) {
  const calls = [];
  return {
    calls,
    auth: {
      async getSession() {
        return { data: { session: { access_token: 'stub-session' } }, error: null };
      }
    },
    functions: {
      async invoke(slug, options) {
        calls.push({ slug, options });
        return typeof result === 'function' ? result(slug, options) : result;
      }
    }
  };
}

const safeCalculation = {
  id: ids.created,
  lead_id: ids.lead,
  need_id: ids.need,
  client_id: null,
  title: 'Новая версия расчёта',
  status: 'Черновик',
  version_number: 2,
  client_total: 1400,
  contractor_cost: 800,
  profit: 600,
  margin_percent: 42.86,
  warning_level: 'ok',
  warnings: [],
  public_comment: 'В стоимость входит изготовление.',
  internal_comment: 'Синтетический тест.',
  created_at: expectedUpdatedAt,
  updated_at: expectedUpdatedAt
};

const createdClient = clientWith({
  data: { ok: true, request_id: ids.request, source_calculation_id: ids.source, idempotent_replay: false, calculation: safeCalculation, items: [command.payload.items[0]] },
  error: null
});
let readCount = 0;
const created = await invokeStagingCalculationVersion({
  client: createdClient,
  supabaseUrl: stagingUrl,
  canWrite: true,
  sourceCalculation,
  draft,
  expectedUpdatedAt,
  cryptoObject: { randomUUID: () => ids.request },
  readAfterSuccess: async () => {
    readCount += 1;
    return [{ id: ids.created, version_number: 2 }];
  }
});
assert.equal(created.ok, true);
assert.equal(created.status, 201);
assert.equal(created.replay, false);
assert.equal(created.calculationId, ids.created);
assert.equal(created.items.length, 1);
assert.equal(readCount, 1);
assert.equal(createdClient.calls.length, 1);
assert.equal(createdClient.calls[0].slug, 'leader-crm-calculations');
assert.equal(createdClient.calls[0].options.body.payload.source_calculation_id, ids.source);
assert.equal(created.refreshed[0].id, ids.created);

const replay = await invokeStagingCalculationVersion({
  client: clientWith({ data: { ok: true, request_id: ids.request, idempotent_replay: true, calculation: safeCalculation, items: [] }, error: null }),
  supabaseUrl: stagingUrl,
  canWrite: true,
  sourceCalculation,
  draft,
  expectedUpdatedAt,
  cryptoObject: { randomUUID: () => ids.request }
});
assert.equal(replay.ok, true);
assert.equal(replay.status, 200);
assert.equal(replay.replay, true);
assert.match(replay.message, /без дубликата/i);

const staleError = {
  context: new Response(JSON.stringify({ ok: false, error: { code: 'source_changed', message: 'Source calculation changed' } }), { status: 409 }),
  message: 'Edge Function returned a non-2xx status code'
};
const stale = await invokeStagingCalculationVersion({
  client: clientWith({ data: null, error: staleError }),
  supabaseUrl: stagingUrl,
  canWrite: true,
  sourceCalculation,
  draft,
  expectedUpdatedAt,
  cryptoObject: { randomUUID: () => ids.request }
});
assert.equal(stale.ok, false);
assert.equal(stale.status, 409);
assert.equal(stale.kind, 'stale_source');

const duplicate = await invokeStagingCalculationVersion({
  client: clientWith({ data: { ok: false, error: { code: 'duplicate_version_inventory', message: 'Duplicates exist' } }, error: null }),
  supabaseUrl: stagingUrl,
  canWrite: true,
  sourceCalculation,
  draft,
  expectedUpdatedAt,
  cryptoObject: { randomUUID: () => ids.request }
});
assert.equal(duplicate.kind, 'duplicate_inventory');

const denied = await invokeStagingCalculationVersion({
  client: clientWith({ data: null, error: null }),
  supabaseUrl: stagingUrl,
  canWrite: false,
  sourceCalculation,
  draft,
  expectedUpdatedAt
});
assert.equal(denied.kind, 'forbidden');

const noSessionClient = clientWith({ data: null, error: null });
noSessionClient.auth.getSession = async () => ({ data: { session: null }, error: null });
const noSession = await invokeStagingCalculationVersion({
  client: noSessionClient,
  supabaseUrl: stagingUrl,
  canWrite: true,
  sourceCalculation,
  draft,
  expectedUpdatedAt
});
assert.equal(noSession.kind, 'auth_required');
assert.equal(noSessionClient.calls.length, 0);

const lockedClient = clientWith({ data: null, error: null });
const locked = await invokeStagingCalculationVersion({
  client: lockedClient,
  supabaseUrl: productionUrl,
  canWrite: true,
  sourceCalculation,
  draft,
  expectedUpdatedAt
});
assert.equal(locked.kind, 'wrong_environment');
assert.equal(lockedClient.calls.length, 0);

console.log('CRM calculation version staging transport is production-locked, exact-hostname bound, minimized and replay-safe.');
