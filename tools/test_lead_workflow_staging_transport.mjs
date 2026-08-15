import assert from 'node:assert/strict';
import {
  buildStagingLeadWorkflowCommand,
  createLeadWorkflowIdempotencyKey,
  invokeStagingLeadWorkflow,
  leadWorkflowPersistenceRoute,
  projectRefFromLeadWorkflowUrl
} from '../crm/v4/assets/v4/lead-workflow-staging-transport-v1.js';

const STAGING_URL = 'https://otulfnouybahfnsycxqn.supabase.co';
const PRODUCTION_URL = 'https://ofewxuqfjhamgerwzull.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_TEST_ONLY_DO_NOT_USE';
const ACCESS_TOKEN = 'TEST_ACCESS_TOKEN';
const leadId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const randomId = '44444444-4444-4444-8444-444444444444';
const expectedUpdatedAt = '2026-07-23T18:00:00.000Z';

class FakeResponse {
  constructor(status, body = null) {
    this.status = status;
    this.ok = status >= 200 && status < 300;
    this.body = body;
  }
  async json() { return this.body; }
}

const client = {
  auth: { getSession: async () => ({ data: { session: { access_token: ACCESS_TOKEN } }, error: null }) }
};

assert.equal(projectRefFromLeadWorkflowUrl(STAGING_URL), 'otulfnouybahfnsycxqn');
assert.equal(projectRefFromLeadWorkflowUrl('https://evil.otulfnouybahfnsycxqn.supabase.co'), '');
assert.equal(leadWorkflowPersistenceRoute(STAGING_URL).mode, 'staging_edge');
assert.equal(leadWorkflowPersistenceRoute(STAGING_URL).browserDirectWrite, false);
assert.equal(leadWorkflowPersistenceRoute(PRODUCTION_URL).mode, 'production_legacy');
assert.equal(leadWorkflowPersistenceRoute(PRODUCTION_URL).browserDirectWrite, true);

assert.equal(
  createLeadWorkflowIdempotencyKey(leadId, { randomUUID: () => randomId }),
  `lead-workflow:${leadId}:${randomId}`
);
assert.throws(() => createLeadWorkflowIdempotencyKey('bad', { randomUUID: () => randomId }), /lead_id_invalid/);

const command = buildStagingLeadWorkflowCommand({
  lead: { id: leadId, updated_at: expectedUpdatedAt },
  patch: { assigned_to: actorId, status: 'В работе', next_contact_at: '2026-07-24T08:00:00+03:00' },
  requestId,
  idempotencyKey: `lead-workflow:${leadId}:${randomId}`
});
assert.deepEqual(command, {
  action: 'update',
  id: leadId,
  request_id: requestId,
  expected_updated_at: expectedUpdatedAt,
  idempotency_key: `lead-workflow:${leadId}:${randomId}`,
  status: 'В работе',
  next_contact_at: '2026-07-24T05:00:00.000Z',
  assigned_to: actorId
});
assert.throws(() => buildStagingLeadWorkflowCommand({
  lead: { id: leadId, updated_at: expectedUpdatedAt }, patch: { message: 'forbidden' }, requestId, idempotencyKey: 'key'
}), /patch_field_not_allowed:message/);

let invokedUrl = '';
let invokedInit = null;
const result = await invokeStagingLeadWorkflow({
  client,
  supabaseUrl: STAGING_URL,
  publishableKey: PUBLISHABLE_KEY,
  lead: { id: leadId, updated_at: expectedUpdatedAt },
  patch: { assigned_to: actorId, status: 'В работе' },
  idempotencyKey: `lead-workflow:${leadId}:${randomId}`,
  cryptoObject: { randomUUID: () => requestId },
  fetchImpl: async (url, init) => {
    invokedUrl = url;
    invokedInit = init;
    const body = JSON.parse(init.body);
    return new FakeResponse(201, {
      ok: true,
      request_id: body.request_id,
      idempotent_replay: false,
      lead: { id: leadId, status: 'В работе', assigned_to: actorId, updated_at: '2026-07-23T18:01:00.000Z' }
    });
  }
});
assert.equal(result.ok, true);
assert.equal(result.kind, 'updated');
assert.equal(result.status, 201);
assert.equal(invokedUrl, `${STAGING_URL}/functions/v1/leader-crm-leads-staging`);
assert.equal(invokedInit.method, 'POST');
assert.equal(invokedInit.headers.apikey, PUBLISHABLE_KEY);
assert.equal(invokedInit.headers.Authorization, `Bearer ${ACCESS_TOKEN}`);
const invokedBody = JSON.parse(invokedInit.body);
assert.equal(invokedBody.action, 'update');
assert.equal(invokedBody.assigned_to, actorId);
assert.equal(invokedBody.expected_updated_at, expectedUpdatedAt);

let explicitGetSessionCalled = false;
let explicitAuthorization = '';
const explicitTokenResult = await invokeStagingLeadWorkflow({
  client: {
    auth: {
      getSession: async () => {
        explicitGetSessionCalled = true;
        throw new Error('must_not_read_session_when_access_token_is_explicit');
      }
    }
  },
  supabaseUrl: STAGING_URL,
  publishableKey: PUBLISHABLE_KEY,
  accessToken: ACCESS_TOKEN,
  lead: { id: leadId, updated_at: expectedUpdatedAt },
  patch: { assigned_to: actorId, status: 'В работе' },
  idempotencyKey: `lead-workflow:${leadId}:explicit-token`,
  cryptoObject: { randomUUID: () => requestId },
  fetchImpl: async (url, init) => {
    if (String(url).includes('/rest/v1/leader_leads')) {
      return new FakeResponse(200, [{
        id: leadId,
        status: 'В работе',
        assigned_to: actorId,
        next_contact_at: null,
        updated_at: '2026-07-23T18:01:00.000Z'
      }]);
    }
    explicitAuthorization = init.headers.Authorization;
    const body = JSON.parse(init.body);
    return new FakeResponse(201, {
      ok: true,
      request_id: body.request_id,
      idempotent_replay: false,
      lead: { id: leadId, status: 'В работе', assigned_to: actorId, updated_at: '2026-07-23T18:01:00.000Z' }
    });
  }
});
assert.equal(explicitGetSessionCalled, false);
assert.equal(explicitTokenResult.ok, true);
assert.equal(explicitAuthorization, `Bearer ${ACCESS_TOKEN}`);

let workerPayload = null;
let workerBootstrapUrl = '';
let workerBootstrapRevoked = false;
let workerMainThreadFetchCalls = 0;
let workerTerminated = false;
const workerResult = await invokeStagingLeadWorkflow({
  client,
  supabaseUrl: STAGING_URL,
  publishableKey: PUBLISHABLE_KEY,
  accessToken: ACCESS_TOKEN,
  lead: { id: leadId, updated_at: expectedUpdatedAt },
  patch: { assigned_to: actorId, status: 'В работе' },
  idempotencyKey: `lead-workflow:${leadId}:worker`,
  cryptoObject: { randomUUID: () => requestId },
  requestTimeoutMs: 2500,
  verificationTimeoutMs: 1250,
  fetchImpl: async () => {
    workerMainThreadFetchCalls += 1;
    throw new Error('worker transport must not duplicate verification on the main thread');
  },
  workerBootstrapFactory: ({ workerUrl, payload }) => {
    workerPayload = payload;
    assert.match(workerUrl.href, /lead-workflow-staging-worker-v1\.js$/);
    return {
      url: 'blob:test-worker-bootstrap',
      revoke() { workerBootstrapRevoked = true; }
    };
  },
  workerFactory: (url) => {
    workerBootstrapUrl = String(url);
    const worker = {
    onmessage: null,
    onerror: null,
    terminate() { workerTerminated = true; }
    };
    queueMicrotask(() => worker.onmessage?.({
        data: {
          type: 'transport',
          status: 201,
          ok: true,
          data: {
            ok: true,
            request_id: requestId,
            lead: {
              id: leadId,
              status: 'В работе',
              assigned_to: actorId,
              updated_at: '2026-07-23T18:01:00.000Z'
            }
          }
        }
      }));
    return worker;
  }
});
assert.equal(workerResult.ok, true);
assert.equal(workerResult.kind, 'updated');
assert.equal(workerMainThreadFetchCalls, 0);
assert.equal(workerBootstrapUrl, 'blob:test-worker-bootstrap');
assert.equal(workerBootstrapRevoked, true);
assert.equal(workerPayload.timeoutMs, 2500);
assert.equal(workerPayload.verificationTimeoutMs, 1250);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(workerTerminated, true);

let restReadSeen = false;
const recovered = await invokeStagingLeadWorkflow({
  client,
  supabaseUrl: STAGING_URL,
  publishableKey: PUBLISHABLE_KEY,
  lead: { id: leadId, updated_at: expectedUpdatedAt },
  patch: { assigned_to: actorId, status: 'В работе' },
  idempotencyKey: `lead-workflow:${leadId}:${randomId}`,
  cryptoObject: { randomUUID: () => requestId },
  requestTimeoutMs: 300,
  verificationTimeoutMs: 200,
  fetchImpl: async (url) => {
    if (String(url).includes('/functions/v1/')) {
      return { status: 201, ok: true, json: async () => new Promise(() => {}) };
    }
    restReadSeen = true;
    assert.match(String(url), /\/rest\/v1\/leader_leads/);
    return new FakeResponse(200, [{
      id: leadId,
      status: 'В работе',
      assigned_to: actorId,
      next_contact_at: null,
      updated_at: '2026-07-23T18:01:00.000Z'
    }]);
  }
});
assert.equal(restReadSeen, true);
assert.equal(recovered.ok, true);
assert.equal(recovered.kind, 'verified_after_transport_error');
assert.equal(recovered.status, 202);
assert.equal(recovered.data.transport_recovered, true);
assert.equal(recovered.data.lead.assigned_to, actorId);

const unresolvedTimeout = await invokeStagingLeadWorkflow({
  client,
  supabaseUrl: STAGING_URL,
  publishableKey: PUBLISHABLE_KEY,
  lead: { id: leadId, updated_at: expectedUpdatedAt },
  patch: { assigned_to: actorId, status: 'В работе' },
  idempotencyKey: `lead-workflow:${leadId}:${randomId}`,
  cryptoObject: { randomUUID: () => requestId },
  requestTimeoutMs: 250,
  verificationTimeoutMs: 120,
  fetchImpl: async (url) => {
    if (String(url).includes('/functions/v1/')) {
      return { status: 201, ok: true, json: async () => new Promise(() => {}) };
    }
    return new FakeResponse(200, [{
      id: leadId,
      status: 'Новая',
      assigned_to: null,
      next_contact_at: null,
      updated_at: expectedUpdatedAt
    }]);
  }
});
assert.equal(unresolvedTimeout.ok, false);
assert.equal(unresolvedTimeout.kind, 'network_error');
assert.equal(unresolvedTimeout.code, 'request_timeout');

const unauthenticated = await invokeStagingLeadWorkflow({
  client: { auth: { getSession: async () => ({ data: { session: null }, error: null }) } },
  supabaseUrl: STAGING_URL,
  publishableKey: PUBLISHABLE_KEY,
  lead: { id: leadId, updated_at: expectedUpdatedAt },
  patch: { status: 'В работе' },
  idempotencyKey: 'key',
  cryptoObject: { randomUUID: () => requestId },
  fetchImpl: async () => { throw new Error('must not fetch'); }
});
assert.equal(unauthenticated.kind, 'auth_required');

const rejected = await invokeStagingLeadWorkflow({
  client,
  supabaseUrl: STAGING_URL,
  publishableKey: PUBLISHABLE_KEY,
  lead: { id: leadId, updated_at: expectedUpdatedAt },
  patch: { status: 'В работе' },
  idempotencyKey: 'key',
  cryptoObject: { randomUUID: () => requestId },
  fetchImpl: async () => new FakeResponse(409, { ok: false, error: { code: 'assignee_required' } })
});
assert.equal(rejected.kind, 'assignee_required');
assert.match(rejected.message, /ответственного/i);

const missingKey = await invokeStagingLeadWorkflow({
  client,
  supabaseUrl: STAGING_URL,
  lead: { id: leadId, updated_at: expectedUpdatedAt },
  patch: { status: 'В работе' },
  idempotencyKey: 'key',
  cryptoObject: { randomUUID: () => requestId },
  fetchImpl: async () => { throw new Error('must not fetch'); }
});
assert.equal(missingKey.code, 'publishable_key_missing');

const wrongEnvironment = await invokeStagingLeadWorkflow({
  client,
  supabaseUrl: PRODUCTION_URL,
  publishableKey: PUBLISHABLE_KEY,
  lead: { id: leadId, updated_at: expectedUpdatedAt },
  patch: { status: 'В работе' },
  idempotencyKey: 'key',
  cryptoObject: { randomUUID: () => requestId },
  fetchImpl: async () => { throw new Error('must not fetch'); }
});
assert.equal(wrongEnvironment.kind, 'wrong_environment');

console.log('Lead workflow staging transport tests passed.');
