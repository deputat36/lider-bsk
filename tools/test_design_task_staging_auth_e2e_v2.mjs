#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  ACTION,
  SAFE_PROJECTIONS,
  STAGING_PROJECT_REF,
  STAGING_URL
} from './design-task-staging-auth-e2e.mjs';
import {
  EVIDENCE_VERSION_V2,
  FIXTURE_MANIFEST_VERSION,
  RUNNER_VERSION,
  buildRunnerConfig,
  manifestDigest,
  operatorPlanV2,
  runAllowedSuiteV2,
  runDeniedProbeV2,
  validateFixtureManifest
} from './design-task-staging-auth-e2e-v2.mjs';
import { validateEvidenceV2 } from './validate-design-task-staging-auth-e2e-evidence.mjs';

const UUID = Object.freeze({
  manifest: '10000000-0000-4000-8000-000000000001',
  user: '20000000-0000-4000-8000-000000000002',
  lead: '30000000-0000-4000-8000-000000000003',
  order: '40000000-0000-4000-8000-000000000004',
  need: '50000000-0000-4000-8000-000000000005',
  task: '60000000-0000-4000-8000-000000000006',
  request1: '70000000-0000-4000-8000-000000000007',
  request2: '80000000-0000-4000-8000-000000000008',
  request3: '90000000-0000-4000-8000-000000000009'
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
      idempotency_key: 'synthetic-design-e2e-v2',
      task_title: 'Synthetic staging design E2E v2'
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
    path: '/tmp/synthetic-fixture-manifest.json',
    manifest: value,
    digestSha256: manifestDigest(value)
  };
}

function config() {
  return buildRunnerConfig({
    STAGING_SUPABASE_PUBLISHABLE_KEY: SECRET.publishableKey,
    STAGING_TEST_EMAIL: SECRET.email,
    STAGING_TEST_PASSWORD: SECRET.password,
    STAGING_EVIDENCE_PATH: 'artifacts/test-evidence-v2.json'
  }, fixture());
}

function deterministicCrypto() {
  const values = [UUID.request1, UUID.request2, UUID.request3];
  return { randomUUID: () => values.shift() };
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

function safeOrder() {
  return {
    id: UUID.order,
    order_number: 9902,
    lead_id: UUID.lead,
    project_name: 'Synthetic staging project',
    status: 'Новый',
    priority: 'Обычный',
    deadline: null,
    layout_status: 'Макета нет',
    layout_link: null,
    is_archived: false,
    updated_at: '2026-07-14T08:05:00.000Z'
  };
}

function safeNeed() {
  return {
    id: UUID.need,
    lead_id: UUID.lead,
    need_type: 'Наружная реклама',
    title: 'Synthetic need',
    need_design: true,
    design_reason: 'Synthetic only',
    deadline_date: null,
    status: 'Подтверждено',
    completeness_score: 100
  };
}

function safeTask() {
  return {
    id: UUID.task,
    order_id: UUID.order,
    task_status: 'Новая',
    layout_status: 'Макет не начат',
    designer_name: null,
    deadline: null,
    layout_link: null,
    created_at: '2026-07-14T08:10:00.000Z'
  };
}

function allowedFetch() {
  let taskReads = 0;
  let edgeCalls = 0;
  const calls = [];
  return {
    calls,
    fetch: async (url, init = {}) => {
      const parsed = new URL(url);
      calls.push({ path: parsed.pathname, method: init.method || 'GET' });
      assert.equal(init.headers.apikey, SECRET.publishableKey);

      if (parsed.pathname === '/auth/v1/token') {
        const body = JSON.parse(init.body);
        assert.equal(body.email, SECRET.email);
        assert.equal(body.password, SECRET.password);
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
        const command = JSON.parse(init.body);
        assert.equal(command.action, ACTION);
        assert.deepEqual(Object.keys(command).sort(), ['action', 'expected_updated_at', 'payload', 'request_id']);
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
          assert.equal(command.request_id, UUID.request1);
          return new FakeResponse(200, {
            ok: true,
            request_id: command.request_id,
            idempotent_replay: true,
            task: safeTask()
          });
        }
        if (edgeCalls === 3) {
          return new FakeResponse(409, {
            ok: false,
            request_id: command.request_id,
            error: { code: 'conflict', message: 'Idempotency payload mismatch' }
          });
        }
        return new FakeResponse(409, {
          ok: false,
          request_id: command.request_id,
          error: { code: 'conflict', message: 'Active design task exists' }
        });
      }
      if (parsed.pathname === '/auth/v1/logout') return new FakeResponse(204);
      throw new Error(`unexpected_url:${url}`);
    }
  };
}

function deniedFetch(code) {
  return async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname === '/auth/v1/token') {
      return new FakeResponse(200, {
        access_token: SECRET.accessToken,
        refresh_token: SECRET.refreshToken
      });
    }
    if (parsed.pathname === '/auth/v1/user') return new FakeResponse(200, { id: UUID.user });
    if (parsed.pathname === '/functions/v1/leader-crm-design') {
      return new FakeResponse(403, { error: code });
    }
    if (parsed.pathname === '/auth/v1/logout') return new FakeResponse(204);
    throw new Error(`unexpected_denied_url:${url}`);
  };
}

const checkedManifest = validateFixtureManifest(manifest(), { now: Date.parse('2026-07-14T09:00:00.000Z') });
assert.equal(checkedManifest.ok, true);
assert.equal(checkedManifest.digest_sha256, manifestDigest(manifest()));
assert.equal(manifestDigest(manifest()).length, 64);

const expired = manifest();
expired.expires_at = '2026-07-14T08:30:00.000Z';
assert.equal(validateFixtureManifest(expired, { now: Date.parse('2026-07-14T09:00:00.000Z') }).ok, false);

const wrongIdentity = manifest();
wrongIdentity.fixture_ids.profile_user_id = UUID.lead;
assert.equal(validateFixtureManifest(wrongIdentity, { now: Date.parse('2026-07-14T09:00:00.000Z') }).ok, false);

const secretManifest = manifest();
secretManifest.password = 'forbidden-value';
assert.equal(validateFixtureManifest(secretManifest, { now: Date.parse('2026-07-14T09:00:00.000Z') }).ok, false);

const fake = allowedFetch();
const evidence = await runAllowedSuiteV2({
  fetchImpl: fake.fetch,
  config: config(),
  cryptoObject: deterministicCrypto(),
  now: (() => {
    const values = ['2026-07-14T09:10:00.000Z', '2026-07-14T09:10:05.000Z'];
    return () => values.shift() || '2026-07-14T09:10:05.000Z';
  })()
});

assert.equal(evidence.evidence_version, EVIDENCE_VERSION_V2);
assert.equal(evidence.runner_version, RUNNER_VERSION);
assert.equal(evidence.project_ref, STAGING_PROJECT_REF);
assert.equal(evidence.steps.at(-1).name, 'logout_current_session');
assert.equal(evidence.steps.at(-1).status, 204);
assert.equal(evidence.steps.at(-1).passed, true);
assert.deepEqual(fake.calls.map((call) => call.path), [
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

const validated = validateEvidenceV2(evidence, manifest(), { now: Date.parse('2026-07-14T09:11:00.000Z') });
assert.equal(validated.ok, true, validated.errors.join(','));
assert.equal(validated.summary.step_count, 10);

const withoutLogout = structuredClone(evidence);
withoutLogout.steps.pop();
assert.equal(validateEvidenceV2(withoutLogout, manifest(), { now: Date.parse('2026-07-14T09:11:00.000Z') }).ok, false);

const leakedSecret = structuredClone(evidence);
leakedSecret.password = 'should-fail';
assert.equal(validateEvidenceV2(leakedSecret, manifest(), { now: Date.parse('2026-07-14T09:11:00.000Z') }).ok, false);

const wrongReplay = structuredClone(evidence);
wrongReplay.steps.find((step) => step.name === 'exact_replay').response.task.id = UUID.need;
assert.equal(validateEvidenceV2(wrongReplay, manifest(), { now: Date.parse('2026-07-14T09:11:00.000Z') }).ok, false);

for (const [mode, code] of [
  ['forbidden_role', 'forbidden'],
  ['inactive_profile', 'access_denied'],
  ['unknown_role', 'forbidden']
]) {
  const denied = await runDeniedProbeV2({
    fetchImpl: deniedFetch(code),
    config: config(),
    probeName: mode,
    cryptoObject: { randomUUID: () => UUID.request1 },
    now: (() => {
      const values = ['2026-07-14T09:20:00.000Z', '2026-07-14T09:20:01.000Z'];
      return () => values.shift() || '2026-07-14T09:20:01.000Z';
    })()
  });
  assert.equal(denied.steps.at(-1).name, 'logout_current_session');
  const result = validateEvidenceV2(denied, manifest(), { now: Date.parse('2026-07-14T09:21:00.000Z') });
  assert.equal(result.ok, true, `${mode}:${result.errors.join(',')}`);
}

const plan = operatorPlanV2({ manifest: checkedManifest });
assert.equal(plan.production_enabled, false);
assert.equal(plan.fixture_manifest_required, true);
assert.equal(plan.fixture_manifest_valid, true);
assert.equal(plan.fixture_manifest_digest_sha256, checkedManifest.digest_sha256);
assert.equal(JSON.stringify(evidence).includes(SECRET.publishableKey), false);
assert.equal(JSON.stringify(evidence).includes(SECRET.password), false);
assert.equal(JSON.stringify(evidence).includes(SECRET.accessToken), false);
assert.equal(JSON.stringify(evidence).includes(SECRET.refreshToken), false);
assert.equal(JSON.stringify(evidence).includes(STAGING_URL), false);

console.log('Staging design E2E v2 evidence includes logout, matches fixture manifest and rejects secret or replay drift.');
