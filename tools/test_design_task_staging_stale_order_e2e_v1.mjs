#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  ACTION,
  SAFE_PROJECTIONS,
  STAGING_PROJECT_REF,
  STAGING_URL
} from './design-task-staging-auth-e2e.mjs';
import {
  FIXTURE_MANIFEST_VERSION,
  buildRunnerConfig,
  manifestDigest
} from './design-task-staging-auth-e2e-v2.mjs';
import {
  STALE_ORDER_EVIDENCE_VERSION,
  STALE_ORDER_KEY_SUFFIX,
  STALE_ORDER_MODE,
  STALE_ORDER_RUNNER_VERSION,
  runStaleOrderProbe,
  staleOrderOperatorPlan
} from './design-task-staging-stale-order-e2e-v1.mjs';
import {
  STALE_ORDER_STEP_ORDER,
  validateStaleOrderEvidence
} from './validate-design-task-staging-stale-order-evidence.mjs';

const UUID = Object.freeze({
  manifest: '10000000-0000-4000-8000-000000000001',
  user: '20000000-0000-4000-8000-000000000002',
  lead: '30000000-0000-4000-8000-000000000003',
  order: '40000000-0000-4000-8000-000000000004',
  need: '50000000-0000-4000-8000-000000000005',
  request: '60000000-0000-4000-8000-000000000006'
});

const SECRET = Object.freeze({
  publishableKey: 'test-publishable-sentinel',
  email: 'synthetic-user-at-invalid',
  password: 'test-password-sentinel',
  accessToken: 'test-access-sentinel',
  refreshToken: 'test-refresh-sentinel'
});

function manifest() {
  return {
    manifest_version: FIXTURE_MANIFEST_VERSION,
    manifest_id: UUID.manifest,
    project_ref: STAGING_PROJECT_REF,
    synthetic_only: true,
    production_enabled: false,
    created_at: '2026-07-14T08:00:00.000Z',
    expires_at: '2026-07-14T20:00:00.000Z',
    fixture_ids: {
      auth_user_id: UUID.user,
      profile_user_id: UUID.user,
      lead_id: UUID.lead,
      order_id: UUID.order,
      need_id: UUID.need
    },
    order_snapshot: {
      expected_updated_at: '2026-07-14T08:05:00.000Z',
      need_design: true,
      is_archived: false
    },
    command: {
      action: ACTION,
      idempotency_key: 'synthetic-stale-order-e2e',
      task_title: 'Synthetic staging design E2E'
    },
    baseline_counts: {
      profiles: 1,
      leads: 1,
      orders: 1,
      needs: 1,
      design_tasks: 0,
      design_events: 0,
      receipts: 0,
      environment_guard: 1
    },
    expected_after_success: {
      profiles: 1,
      leads: 1,
      orders: 1,
      needs: 1,
      design_tasks: 1,
      design_events: 1,
      successful_receipts: 1,
      environment_guard: 1
    },
    cleanup_order: [
      'receipt', 'design_event', 'design_task', 'need',
      'order', 'lead', 'profile', 'auth_user'
    ]
  };
}

function fixture() {
  const value = manifest();
  return {
    path: '/tmp/stale-order-fixture.json',
    manifest: value,
    digestSha256: manifestDigest(value)
  };
}

function config() {
  return buildRunnerConfig({
    STAGING_SUPABASE_PUBLISHABLE_KEY: SECRET.publishableKey,
    STAGING_TEST_EMAIL: SECRET.email,
    STAGING_TEST_PASSWORD: SECRET.password,
    STAGING_EVIDENCE_PATH: 'artifacts/test-stale-order-evidence.json'
  }, fixture());
}

class FakeResponse {
  constructor(status, body = null) {
    this.status = status;
    this.body = body;
  }

  async text() {
    return this.body === null ? '' : JSON.stringify(this.body);
  }
}

function fakeFetch({ stale = true, taskCountAfter = 0, edgeStatus = 409, errorCode = 'conflict' } = {}) {
  let taskReads = 0;
  const calls = [];
  return {
    calls,
    fetch: async (url, init = {}) => {
      const parsed = new URL(url);
      calls.push({ path: parsed.pathname, method: init.method || 'GET' });
      assert.equal(init.headers.apikey, SECRET.publishableKey);

      if (parsed.pathname === '/auth/v1/token') {
        return new FakeResponse(200, {
          access_token: SECRET.accessToken,
          refresh_token: SECRET.refreshToken
        });
      }
      if (parsed.pathname === '/auth/v1/user') {
        return new FakeResponse(200, { id: UUID.user });
      }
      if (parsed.pathname === '/rest/v1/leader_orders') {
        assert.equal(parsed.searchParams.get('select'), SAFE_PROJECTIONS.leader_orders.join(','));
        return new FakeResponse(200, [{
          id: UUID.order,
          order_number: 9903,
          lead_id: UUID.lead,
          project_name: 'Synthetic staging design E2E',
          status: 'Новый',
          priority: 'Обычный',
          deadline: null,
          layout_status: null,
          layout_link: null,
          is_archived: false,
          updated_at: stale ? '2026-07-14T08:05:01.000Z' : '2026-07-14T08:05:00.000Z'
        }]);
      }
      if (parsed.pathname === '/rest/v1/leader_design_tasks') {
        assert.equal(parsed.searchParams.get('select'), SAFE_PROJECTIONS.leader_design_tasks.join(','));
        taskReads += 1;
        if (taskReads === 1 || taskCountAfter === 0) return new FakeResponse(200, []);
        return new FakeResponse(200, [{ id: UUID.request, order_id: UUID.order }]);
      }
      if (parsed.pathname === '/functions/v1/leader-crm-design') {
        const command = JSON.parse(init.body);
        assert.equal(command.action, ACTION);
        assert.equal(command.expected_updated_at, manifest().order_snapshot.expected_updated_at);
        assert.equal(
          command.payload.idempotency_key,
          `${manifest().command.idempotency_key}${STALE_ORDER_KEY_SUFFIX}`.slice(0, 180)
        );
        assert.deepEqual(command.payload.need_ids, [UUID.need]);
        return new FakeResponse(edgeStatus, {
          ok: false,
          request_id: command.request_id,
          error: { code: errorCode, message: 'Order changed after draft preparation' }
        });
      }
      if (parsed.pathname === '/auth/v1/logout') return new FakeResponse(204);
      throw new Error(`unexpected_url:${url}`);
    }
  };
}

const fake = fakeFetch();
const evidence = await runStaleOrderProbe({
  fetchImpl: fake.fetch,
  config: config(),
  cryptoObject: { randomUUID: () => UUID.request },
  now: (() => {
    const values = ['2026-07-14T09:10:00.000Z', '2026-07-14T09:10:03.000Z'];
    return () => values.shift() || '2026-07-14T09:10:03.000Z';
  })()
});

assert.equal(evidence.evidence_version, STALE_ORDER_EVIDENCE_VERSION);
assert.equal(evidence.runner_version, STALE_ORDER_RUNNER_VERSION);
assert.equal(evidence.project_ref, STAGING_PROJECT_REF);
assert.equal(evidence.mode, STALE_ORDER_MODE);
assert.deepEqual(evidence.steps.map((step) => step.name), STALE_ORDER_STEP_ORDER);
assert.deepEqual(fake.calls.map((call) => call.path), [
  '/auth/v1/token',
  '/auth/v1/user',
  '/rest/v1/leader_orders',
  '/rest/v1/leader_design_tasks',
  '/functions/v1/leader-crm-design',
  '/rest/v1/leader_design_tasks',
  '/auth/v1/logout'
]);

const validated = validateStaleOrderEvidence(evidence, manifest(), {
  now: Date.parse('2026-07-14T09:11:00.000Z')
});
assert.equal(validated.ok, true, validated.errors.join(','));
assert.equal(validated.summary.step_count, 7);
assert.equal(validated.summary.restore_order_version_required, true);

const wrongStatus = structuredClone(evidence);
wrongStatus.steps.find((step) => step.name === 'stale_order').status = 201;
assert.equal(validateStaleOrderEvidence(wrongStatus, manifest(), {
  now: Date.parse('2026-07-14T09:11:00.000Z')
}).ok, false);

const wrongCode = structuredClone(evidence);
wrongCode.steps.find((step) => step.name === 'stale_order').response.error.code = 'forbidden';
assert.equal(validateStaleOrderEvidence(wrongCode, manifest(), {
  now: Date.parse('2026-07-14T09:11:00.000Z')
}).ok, false);

const taskLeak = structuredClone(evidence);
taskLeak.steps.find((step) => step.name === 'safe_read_no_task').counts.design_tasks = 1;
assert.equal(validateStaleOrderEvidence(taskLeak, manifest(), {
  now: Date.parse('2026-07-14T09:11:00.000Z')
}).ok, false);

const withoutLogout = structuredClone(evidence);
withoutLogout.steps.pop();
assert.equal(validateStaleOrderEvidence(withoutLogout, manifest(), {
  now: Date.parse('2026-07-14T09:11:00.000Z')
}).ok, false);

const leakedSecret = structuredClone(evidence);
leakedSecret.password = 'must-fail';
assert.equal(validateStaleOrderEvidence(leakedSecret, manifest(), {
  now: Date.parse('2026-07-14T09:11:00.000Z')
}).ok, false);

await assert.rejects(
  () => runStaleOrderProbe({
    fetchImpl: fakeFetch({ stale: false }).fetch,
    config: config(),
    cryptoObject: { randomUUID: () => UUID.request }
  }),
  /order_version_not_stale/
);

await assert.rejects(
  () => runStaleOrderProbe({
    fetchImpl: fakeFetch({ taskCountAfter: 1 }).fetch,
    config: config(),
    cryptoObject: { randomUUID: () => UUID.request }
  }),
  /stale_order_created_task/
);

await assert.rejects(
  () => runStaleOrderProbe({
    fetchImpl: fakeFetch({ edgeStatus: 403, errorCode: 'forbidden' }).fetch,
    config: config(),
    cryptoObject: { randomUUID: () => UUID.request }
  }),
  /stale_order_status_invalid/
);

const plan = staleOrderOperatorPlan({ manifestValid: true, digestSha256: manifestDigest(manifest()) });
assert.equal(plan.production_enabled, false);
assert.equal(plan.project_ref, STAGING_PROJECT_REF);
assert.equal(plan.mode, STALE_ORDER_MODE);
assert.equal(plan.stale_order_sql_required, true);
assert.equal(plan.restore_order_version_required, true);
assert.equal(plan.connector_can_create_or_delete_auth_user, false);
assert.equal(JSON.stringify(evidence).includes(SECRET.publishableKey), false);
assert.equal(JSON.stringify(evidence).includes(SECRET.password), false);
assert.equal(JSON.stringify(evidence).includes(SECRET.accessToken), false);
assert.equal(JSON.stringify(evidence).includes(SECRET.refreshToken), false);
assert.equal(JSON.stringify(evidence).includes(STAGING_URL), false);

console.log('Stale-order HTTP evidence proves 409 conflict, zero task creation, logout and manifest binding without secrets.');
