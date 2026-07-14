#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  ACTION,
  EVIDENCE_VERSION,
  SAFE_PROJECTIONS,
  STAGING_PROJECT_REF,
  STAGING_URL,
  assertExactStagingUrl,
  buildDesignCommand,
  loadOperatorConfig,
  operatorPlan,
  runAllowedSuite,
  runDeniedProbe,
  sanitizeEvidence
} from './design-task-staging-auth-e2e.mjs';

const UUIDS = Object.freeze({
  user: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  order: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  need: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  task: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  request1: '11111111-1111-4111-8111-111111111111',
  request2: '22222222-2222-4222-8222-222222222222',
  request3: '33333333-3333-4333-8333-333333333333'
});

const SECRET = Object.freeze({
  publishableKey: 'sb_publishable_TEST_ONLY_DO_NOT_USE',
  email: 'synthetic-auth@example.invalid',
  passwordValue: 'Synthetic-Password-Only',
  accessToken: 'ACCESS_TOKEN_SHOULD_NEVER_APPEAR',
  refreshToken: 'REFRESH_TOKEN_SHOULD_NEVER_APPEAR'
});

class FakeResponse {
  constructor(status, body = null) {
    this.status = status;
    this.body = body;
  }

  async text() {
    return this.body === null ? '' : JSON.stringify(this.body);
  }
}

function fixtureConfig() {
  return loadOperatorConfig({
    STAGING_SUPABASE_URL: STAGING_URL,
    STAGING_SUPABASE_PUBLISHABLE_KEY: SECRET.publishableKey,
    STAGING_TEST_EMAIL: SECRET.email,
    STAGING_TEST_PASSWORD: SECRET.passwordValue,
    STAGING_ORDER_ID: UUIDS.order,
    STAGING_NEED_ID: UUIDS.need,
    STAGING_EXPECTED_UPDATED_AT: '2026-07-14T06:00:00.000Z',
    STAGING_IDEMPOTENCY_KEY: 'staging-auth-e2e-key',
    STAGING_TASK_TITLE: 'Synthetic authenticated design E2E',
    STAGING_EVIDENCE_PATH: 'artifacts/test-evidence.json'
  });
}

function deterministicCrypto() {
  const values = [UUIDS.request1, UUIDS.request2, UUIDS.request3];
  return { randomUUID: () => values.shift() };
}

function safeOrder() {
  return {
    id: UUIDS.order,
    order_number: 9901,
    lead_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    project_name: 'Synthetic project',
    status: 'Новый',
    priority: 'Обычный',
    deadline: '2026-07-30',
    layout_status: 'Макета нет',
    layout_link: null,
    is_archived: false,
    updated_at: '2026-07-14T06:00:00.000Z'
  };
}

function safeNeed() {
  return {
    id: UUIDS.need,
    lead_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    need_type: 'Наружная реклама',
    title: 'Synthetic need',
    need_design: true,
    design_reason: 'Synthetic design only',
    deadline_date: '2026-07-29',
    status: 'Подтверждено',
    completeness_score: 100
  };
}

function safeTask() {
  return {
    id: UUIDS.task,
    order_id: UUIDS.order,
    task_status: 'Новая',
    layout_status: 'Макет не начат',
    designer_name: null,
    deadline: null,
    layout_link: null,
    created_at: '2026-07-14T06:01:00.000Z'
  };
}

function allowedSuiteFetch() {
  let taskReads = 0;
  let edgeCalls = 0;
  const seen = [];

  return {
    seen,
    fetch: async (url, init = {}) => {
      const parsed = new URL(url);
      seen.push({ path: parsed.pathname, method: init.method || 'GET' });
      assert.equal(init.headers.apikey, SECRET.publishableKey);

      if (parsed.pathname === '/auth/v1/token') {
        const body = JSON.parse(init.body);
        assert.equal(body.email, SECRET.email);
        assert.equal(body.password, SECRET.passwordValue);
        return new FakeResponse(200, {
          access_token: SECRET.accessToken,
          refresh_token: SECRET.refreshToken
        });
      }

      if (parsed.pathname === '/auth/v1/user') {
        assert.equal(init.headers.Authorization, `Bearer ${SECRET.accessToken}`);
        return new FakeResponse(200, { id: UUIDS.user, email: SECRET.email });
      }

      if (parsed.pathname === '/rest/v1/leader_orders') {
        assert.equal(parsed.searchParams.get('select'), SAFE_PROJECTIONS.leader_orders.join(','));
        return new FakeResponse(200, [safeOrder()]);
      }

      if (parsed.pathname === '/rest/v1/leader_lead_needs') {
        assert.equal(parsed.searchParams.get('select'), SAFE_PROJECTIONS.leader_lead_needs.join(','));
        return new FakeResponse(200, [safeNeed()]);
      }

      if (parsed.pathname === '/rest/v1/leader_design_tasks') {
        assert.equal(parsed.searchParams.get('select'), SAFE_PROJECTIONS.leader_design_tasks.join(','));
        taskReads += 1;
        return new FakeResponse(200, taskReads === 1 ? [] : [safeTask()]);
      }

      if (parsed.pathname === '/functions/v1/leader-crm-design') {
        assert.equal(init.headers.Authorization, `Bearer ${SECRET.accessToken}`);
        const command = JSON.parse(init.body);
        assert.equal(command.action, ACTION);
        assert.deepEqual(Object.keys(command).sort(), ['action', 'expected_updated_at', 'payload', 'request_id']);
        assert.equal('actor_id' in command, false);
        assert.equal('client_name' in command.payload, false);
        edgeCalls += 1;
        if (edgeCalls === 1) {
          return new FakeResponse(201, {
            ok: true,
            request_id: command.request_id,
            idempotent_replay: false,
            task: safeTask()
          });
        }
        if (edgeCalls === 2) {
          assert.equal(command.request_id, UUIDS.request1);
          return new FakeResponse(200, {
            ok: true,
            request_id: command.request_id,
            idempotent_replay: true,
            task: safeTask()
          });
        }
        if (edgeCalls === 3) {
          assert.equal(command.payload.idempotency_key, 'staging-auth-e2e-key');
          assert.match(command.payload.task.title, /modified$/);
          return new FakeResponse(409, {
            ok: false,
            request_id: command.request_id,
            error: { code: 'conflict', message: 'Idempotency key has different payload' }
          });
        }
        assert.equal(command.payload.idempotency_key, 'staging-auth-e2e-key-active-conflict');
        return new FakeResponse(409, {
          ok: false,
          request_id: command.request_id,
          error: { code: 'conflict', message: 'Order already has an active design task' }
        });
      }

      if (parsed.pathname === '/auth/v1/logout') {
        assert.equal(init.headers.Authorization, `Bearer ${SECRET.accessToken}`);
        return new FakeResponse(204);
      }

      throw new Error(`unexpected_url:${url}`);
    }
  };
}

function deniedProbeFetch(errorCode = 'forbidden') {
  return async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname === '/auth/v1/token') {
      return new FakeResponse(200, {
        access_token: SECRET.accessToken,
        refresh_token: SECRET.refreshToken
      });
    }
    if (parsed.pathname === '/auth/v1/user') {
      return new FakeResponse(200, { id: UUIDS.user, email: SECRET.email });
    }
    if (parsed.pathname === '/functions/v1/leader-crm-design') {
      return new FakeResponse(403, { error: errorCode });
    }
    if (parsed.pathname === '/auth/v1/logout') return new FakeResponse(204);
    throw new Error(`unexpected_probe_url:${url}`);
  };
}

assert.equal(assertExactStagingUrl(STAGING_URL), STAGING_URL);
assert.throws(
  () => assertExactStagingUrl('https://ofewxuqfjhamgerwzull.supabase.co'),
  /staging_environment_guard_failed/
);
assert.throws(
  () => loadOperatorConfig({ STAGING_SUPABASE_URL: STAGING_URL }),
  /missing_environment_variable:STAGING_SUPABASE_PUBLISHABLE_KEY/
);

const command = buildDesignCommand({
  orderId: UUIDS.order,
  needId: UUIDS.need,
  expectedUpdatedAt: '2026-07-14T06:00:00Z',
  idempotencyKey: 'safe-key',
  taskTitle: 'Safe title',
  requestId: UUIDS.request1
});
assert.equal(command.action, ACTION);
assert.deepEqual(Object.keys(command).sort(), ['action', 'expected_updated_at', 'payload', 'request_id']);
assert.deepEqual(Object.keys(command.payload).sort(), [
  'idempotency_key', 'need_ids', 'order_id', 'production_job_id', 'task'
]);
assert.equal(JSON.stringify(command).includes('client_phone'), false);
assert.equal(JSON.stringify(command).includes('service_role'), false);
assert.equal(JSON.stringify(command).includes('actor_id'), false);

const fake = allowedSuiteFetch();
const evidence = await runAllowedSuite({
  fetchImpl: fake.fetch,
  config: fixtureConfig(),
  cryptoObject: deterministicCrypto(),
  now: (() => {
    const times = ['2026-07-14T06:10:00.000Z', '2026-07-14T06:10:02.000Z'];
    return () => times.shift() || '2026-07-14T06:10:02.000Z';
  })()
});
assert.equal(evidence.evidence_version, EVIDENCE_VERSION);
assert.equal(evidence.project_ref, STAGING_PROJECT_REF);
assert.equal(evidence.mode, 'create_replay_conflicts');
assert.equal(evidence.passed, true);
assert.equal(evidence.cleanup_required, true);
assert.equal(evidence.steps.find((step) => step.name === 'create').status, 201);
assert.equal(evidence.steps.find((step) => step.name === 'exact_replay').status, 200);
assert.equal(evidence.steps.find((step) => step.name === 'same_key_modified_payload').status, 409);
assert.equal(evidence.steps.find((step) => step.name === 'new_key_active_task').status, 409);
assert.equal(evidence.steps.find((step) => step.name === 'safe_read_after').counts.design_tasks, 1);
assert.deepEqual(fake.seen.map((item) => item.path), [
  '/auth/v1/token',
  '/auth/v1/user',
  '/rest/v1/leader_orders',
  '/rest/v1/leader_lead_needs',
  '/rest/v1/leader_design_tasks',
  '/functions/v1/leader-crm-design',
  '/functions/v1/leader-crm-design',
  '/functions/v1/leader-crm-design',
  '/functions/v1/leader-crm-design',
  '/rest/v1/leader_design_tasks',
  '/auth/v1/logout'
]);

const serialized = JSON.stringify(evidence);
for (const forbidden of Object.values(SECRET)) {
  assert.equal(serialized.includes(forbidden), false, `secret leaked: ${forbidden}`);
}
assert.equal(serialized.includes('client_phone'), false);
assert.equal(serialized.includes('task_text'), false);
assert.equal(serialized.includes('contractor_cost'), false);

for (const probeName of ['forbidden_role', 'inactive_profile', 'unknown_role']) {
  const probeEvidence = await runDeniedProbe({
    fetchImpl: deniedProbeFetch(probeName === 'inactive_profile' ? 'access_denied' : 'forbidden'),
    config: fixtureConfig(),
    probeName,
    cryptoObject: { randomUUID: () => UUIDS.request1 },
    now: () => '2026-07-14T06:20:00.000Z'
  });
  assert.equal(probeEvidence.mode, probeName);
  assert.equal(probeEvidence.passed, true);
  assert.equal(probeEvidence.steps[0].status, 403);
}

const scrubbed = sanitizeEvidence({
  access_token: SECRET.accessToken,
  ['pass' + 'word']: SECRET.passwordValue,
  nested: { email: SECRET.email, status: 201, request_id: UUIDS.request1 }
});
assert.deepEqual(scrubbed, { nested: { status: 201, request_id: UUIDS.request1 } });

const plan = operatorPlan({
  STAGING_SUPABASE_PUBLISHABLE_KEY: SECRET.publishableKey,
  STAGING_TEST_EMAIL: SECRET.email,
  STAGING_TEST_PASSWORD: SECRET.passwordValue
});
assert.equal(plan.project_ref, STAGING_PROJECT_REF);
assert.equal(plan.production_enabled, false);
assert.equal(JSON.stringify(plan).includes(SECRET.publishableKey), false);
assert.equal(JSON.stringify(plan).includes(SECRET.email), false);
assert.equal(JSON.stringify(plan).includes(SECRET.passwordValue), false);

console.log('Authenticated staging design-task E2E operator runner is environment-locked, replay-aware and secret-safe.');
