import assert from 'node:assert/strict';
import {
  buildRunnerCommand,
  readStagingAuthE2EConfig,
  responseErrorCode,
  validateSafeCalculationResponse
} from './run_calculation_version_staging_auth_e2e.mjs';

const ids = Object.freeze({
  source: '11111111-1111-4111-8111-111111111111',
  need: '22222222-2222-4222-8222-222222222222',
  request: '33333333-3333-4333-8333-333333333333',
  calculation: '44444444-4444-4444-8444-444444444444',
  lead: '55555555-5555-4555-8555-555555555555',
  client: '66666666-6666-4666-8666-666666666666',
  item: '77777777-7777-4777-8777-777777777777'
});

const env = {
  LIDER_STAGING_SUPABASE_URL: 'https://otulfnouybahfnsycxqn.supabase.co',
  LIDER_STAGING_PUBLISHABLE_KEY: 'publishable-test-placeholder',
  LIDER_STAGING_EMAIL: 'temporary@example.invalid',
  LIDER_STAGING_PASSWORD: 'not-a-real-password',
  LIDER_STAGING_SCENARIO: 'allowed',
  LIDER_STAGING_SOURCE_CALCULATION_ID: ids.source,
  LIDER_STAGING_EXPECTED_UPDATED_AT: '2026-07-15T12:00:00.000Z',
  LIDER_STAGING_NEED_ID: ids.need,
  LIDER_STAGING_IDEMPOTENCY_KEY: 'auth-e2e:test-1',
  LIDER_STAGING_TITLE: 'Offline runner test'
};

const config = readStagingAuthE2EConfig(env);
assert.equal(config.scenario, 'allowed');
assert.equal(config.sourceCalculationId, ids.source);
assert.equal(config.needId, ids.need);

assert.throws(
  () => readStagingAuthE2EConfig({ ...env, LIDER_STAGING_SUPABASE_URL: 'https://ofewxuqfjhamgerwzull.supabase.co' }),
  /wrong_environment/
);
assert.throws(
  () => readStagingAuthE2EConfig({ ...env, LIDER_STAGING_SCENARIO: 'production' }),
  /scenario_invalid/
);
assert.throws(
  () => readStagingAuthE2EConfig({ ...env, LIDER_STAGING_PASSWORD: '' }),
  /missing_environment:LIDER_STAGING_PASSWORD/
);

const command = buildRunnerCommand(config, { requestId: ids.request });
assert.equal(command.action, 'calculation.create_version');
assert.equal(command.request_id, ids.request);
assert.equal(command.payload.source_calculation_id, ids.source);
assert.equal(command.payload.idempotency_key, 'auth-e2e:test-1');
assert.equal(command.payload.items.length, 1);
assert.equal(command.payload.items[0].data.source, 'staging_auth_e2e_runner');
for (const forbidden of ['actor_id', 'actor_email', 'lead_id', 'version_number', 'status', 'client_total', 'contractor_cost', 'profit']) {
  assert.equal(Object.hasOwn(command, forbidden), false, `top-level forbidden field leaked: ${forbidden}`);
  assert.equal(Object.hasOwn(command.payload, forbidden), false, `payload forbidden field leaked: ${forbidden}`);
}
for (const forbidden of ['calculation_id', 'lead_id', 'contractor_sum', 'client_sum', 'profit', 'margin_percent']) {
  assert.equal(Object.hasOwn(command.payload.items[0], forbidden), false, `item forbidden field leaked: ${forbidden}`);
}

const safeResponse = {
  ok: true,
  request_id: ids.request,
  source_calculation_id: ids.source,
  calculation: {
    id: ids.calculation,
    lead_id: ids.lead,
    need_id: ids.need,
    client_id: ids.client,
    title: 'Version 2',
    status: 'Черновик',
    version_number: 2,
    client_total: 700,
    contractor_cost: 400,
    profit: 300,
    margin_percent: 42.86,
    warning_level: 'ok',
    warnings: [],
    public_comment: null,
    internal_comment: null,
    created_at: '2026-07-15T12:01:00.000Z',
    updated_at: '2026-07-15T12:01:00.000Z'
  },
  items: [{
    id: ids.item,
    catalog_id: null,
    category: 'E2E',
    item_type: 'Synthetic',
    name: 'Temporary item',
    unit: 'шт.',
    qty: 1,
    contractor_price: 400,
    contractor_sum: 400,
    markup_percent: 75,
    client_price: 700,
    client_sum: 700,
    profit: 300,
    margin_percent: 42.86,
    comment: null,
    data: {},
    sort_order: 0,
    created_at: '2026-07-15T12:01:00.000Z',
    updated_at: '2026-07-15T12:01:00.000Z'
  }],
  idempotent_replay: false
};

assert.equal(validateSafeCalculationResponse(safeResponse, ids.source), true);
assert.throws(
  () => validateSafeCalculationResponse({ ...safeResponse, source_calculation_id: ids.need }, ids.source),
  /source_calculation_id_mismatch/
);
assert.throws(
  () => validateSafeCalculationResponse(({ ok: true, request_id: ids.request, calculation: safeResponse.calculation, items: safeResponse.items, idempotent_replay: false }), ids.source),
  /top_level_projection_drift/
);
for (const forbidden of ['created_by', 'updated_by', 'commercial_offer_id', 'order_id']) {
  assert.throws(
    () => validateSafeCalculationResponse({
      ...safeResponse,
      calculation: { ...safeResponse.calculation, [forbidden]: ids.client }
    }, ids.source),
    /calculation_projection_drift/,
    `calculation response accepted forbidden field: ${forbidden}`
  );
}
for (const forbidden of ['calculation_id', 'lead_id']) {
  assert.throws(
    () => validateSafeCalculationResponse({
      ...safeResponse,
      items: [{ ...safeResponse.items[0], [forbidden]: ids.calculation }]
    }, ids.source),
    /item_projection_drift/,
    `item response accepted forbidden field: ${forbidden}`
  );
}

assert.equal(responseErrorCode({ error: { code: 'source_changed' } }), 'source_changed');
assert.equal(responseErrorCode({ error: 'forbidden' }), 'forbidden');
assert.equal(responseErrorCode(null), 'unknown_error');

console.log('Authenticated staging E2E runner is environment-locked, payload-minimized and projection-safe.');