import assert from 'node:assert/strict';
import {
  PRODUCTION_JOB_STAGING_TRANSPORT,
  buildStagingProductionCommand,
  invokeStagingProductionJob,
  productionStagingTransportAvailability
} from '../crm/v4/assets/v4/production-job-staging-transport-v1.js';

const ids = Object.freeze({
  request: '11111111-1111-4111-8111-111111111111',
  order: '22222222-2222-4222-8222-222222222222',
  task: '33333333-3333-4333-8333-333333333333',
  job: '44444444-4444-4444-8444-444444444444'
});
const stagingUrl = `https://${PRODUCTION_JOB_STAGING_TRANSPORT.projectRef}.supabase.co`;
const productionUrl = 'https://ofewxuqfjhamgerwzull.supabase.co';
const expectedUpdatedAt = '2026-08-09T10:00:00.000Z';
const draft = {
  command: PRODUCTION_JOB_STAGING_TRANSPORT.action,
  order_id: ids.order,
  design_task_id: ids.task,
  idempotency_key: `production_job.create_from_order:${ids.order}:v1`,
  job: {
    title: 'Производство №1701 — синтетическая вывеска',
    priority: 'Высокая',
    deadline: '2026-08-20T09:00:00.000Z',
    layout_status: 'Макет согласован',
    file_url: 'https://example.invalid/layout',
    technical_task: 'Только синтетическое техническое задание.',
    contractor_id: null,
    contractor_cost: null,
    production_status: 'Готово',
    client_phone: '+70000000000',
    profit: 999999
  }
};

const production = productionStagingTransportAvailability({
  supabaseUrl: productionUrl,
  canWrite: true,
  draft,
  expectedUpdatedAt
});
assert.equal(production.enabled, false);
assert.equal(production.reason, 'production_locked');

const command = buildStagingProductionCommand({ draft, expectedUpdatedAt, requestId: ids.request });
assert.deepEqual(Object.keys(command).sort(), ['action', 'expected_updated_at', 'payload', 'request_id']);
assert.deepEqual(Object.keys(command.payload).sort(), ['design_task_id', 'idempotency_key', 'job', 'order_id']);
assert.deepEqual(Object.keys(command.payload.job).sort(), [
  'contractor_cost', 'contractor_id', 'deadline', 'file_url', 'layout_status',
  'priority', 'technical_task', 'title'
]);
const commandKeys = new Set([
  ...Object.keys(command),
  ...Object.keys(command.payload),
  ...Object.keys(command.payload.job)
]);
for (const forbidden of ['actor_id', 'created_by', 'production_status', 'client_phone', 'profit', 'payment_status']) {
  assert.equal(commandKeys.has(forbidden), false, `forbidden field leaked: ${forbidden}`);
}

function clientWith(result) {
  const calls = [];
  return {
    calls,
    auth: {
      async getSession() {
        return { data: { session: { access_token: 'test-session-token-not-a-real-jwt' } }, error: null };
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

const createdClient = clientWith({
  data: {
    ok: true,
    request_id: ids.request,
    idempotent_replay: false,
    job: { id: ids.job, production_status: 'В очереди', contractor_cost: 9000, client_total: 14000 },
    order: { id: ids.order, production_status: 'В очереди', client_phone: '+70000000000', profit: 5000 }
  },
  error: null
});
let readCount = 0;
const created = await invokeStagingProductionJob({
  client: createdClient,
  supabaseUrl: stagingUrl,
  canWrite: true,
  draft,
  expectedUpdatedAt,
  cryptoObject: { randomUUID: () => ids.request },
  readAfterSuccess: async (data) => {
    readCount += 1;
    return data.job;
  }
});
assert.equal(created.ok, true);
assert.equal(created.status, 201);
assert.equal(created.replay, false);
assert.equal(created.jobId, ids.job);
assert.equal(readCount, 1);
assert.equal(createdClient.calls.length, 1);
assert.equal(createdClient.calls[0].slug, 'leader-crm-production-create');
assert.equal(createdClient.calls[0].options.body.payload.order_id, ids.order);
assert.equal(created.refreshed.id, ids.job);
assert.equal(JSON.stringify(created.data).includes('contractor_cost'), false);
assert.equal(JSON.stringify(created.data).includes('client_total'), false);
assert.equal(JSON.stringify(created.data).includes('client_phone'), false);
assert.equal(JSON.stringify(created.data).includes('profit'), false);

const replay = await invokeStagingProductionJob({
  client: clientWith({ data: { ok: true, request_id: ids.request, idempotent_replay: true, job: { id: ids.job } }, error: null }),
  supabaseUrl: stagingUrl,
  canWrite: true,
  draft,
  expectedUpdatedAt,
  cryptoObject: { randomUUID: () => ids.request }
});
assert.equal(replay.ok, true);
assert.equal(replay.status, 200);
assert.equal(replay.replay, true);
assert.match(replay.message, /без дубликата/i);

async function edgeFailure(message) {
  return invokeStagingProductionJob({
    client: clientWith({
      data: null,
      error: {
        context: new Response(JSON.stringify({ ok: false, error: { code: 'conflict', message } }), { status: 409 }),
        message: 'Edge Function returned a non-2xx status code'
      }
    }),
    supabaseUrl: stagingUrl,
    canWrite: true,
    draft,
    expectedUpdatedAt,
    cryptoObject: { randomUUID: () => ids.request }
  });
}

assert.equal((await edgeFailure('Order changed after it was loaded')).kind, 'stale_order');
assert.equal((await edgeFailure('Active production job already exists for this order')).kind, 'active_job_conflict');
assert.equal((await edgeFailure('Idempotency key was used with another payload')).kind, 'idempotency_conflict');

const layout = await invokeStagingProductionJob({
  client: clientWith({ data: { ok: false, error: { code: 'validation_error', message: 'Order layout is not approved' } }, error: null }),
  supabaseUrl: stagingUrl,
  canWrite: true,
  draft,
  expectedUpdatedAt,
  cryptoObject: { randomUUID: () => ids.request }
});
assert.equal(layout.kind, 'layout_conflict');

const noSessionClient = clientWith({ data: null, error: null });
noSessionClient.auth.getSession = async () => ({ data: { session: null }, error: null });
const noSession = await invokeStagingProductionJob({
  client: noSessionClient,
  supabaseUrl: stagingUrl,
  canWrite: true,
  draft,
  expectedUpdatedAt
});
assert.equal(noSession.kind, 'auth_required');
assert.equal(noSessionClient.calls.length, 0);

const lockedClient = clientWith({ data: null, error: null });
const locked = await invokeStagingProductionJob({
  client: lockedClient,
  supabaseUrl: productionUrl,
  canWrite: true,
  draft,
  expectedUpdatedAt
});
assert.equal(locked.kind, 'wrong_environment');
assert.equal(lockedClient.calls.length, 0);

console.log('CRM production job staging transport is environment-locked, minimized and replay-safe.');
