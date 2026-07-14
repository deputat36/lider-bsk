#!/usr/bin/env node

import assert from 'node:assert/strict';

import { STAGING_PROJECT_REF } from './design-task-staging-auth-e2e.mjs';
import {
  FIXTURE_MANIFEST_VERSION,
  manifestDigest,
  validateFixtureManifest
} from './design-task-staging-auth-e2e-v2.mjs';
import { buildFixtureManifest } from './create-design-task-staging-fixture-manifest.mjs';

const ids = {
  manifestId: '11111111-1111-4111-8111-111111111111',
  authUserId: '22222222-2222-4222-8222-222222222222',
  leadId: '33333333-3333-4333-8333-333333333333',
  orderId: '44444444-4444-4444-8444-444444444444',
  needId: '55555555-5555-4555-8555-555555555555'
};

const manifest = buildFixtureManifest({
  ...ids,
  expectedUpdatedAt: '2026-07-14T10:00:00.000Z',
  idempotencyKey: 'fixture-generator-test',
  taskTitle: 'Synthetic fixture generator test',
  createdAt: '2026-07-14T10:05:00.000Z',
  expiresAt: '2026-07-14T14:05:00.000Z'
});

assert.equal(manifest.manifest_version, FIXTURE_MANIFEST_VERSION);
assert.equal(manifest.project_ref, STAGING_PROJECT_REF);
assert.equal(manifest.production_enabled, false);
assert.equal(manifest.synthetic_only, true);
assert.equal(manifest.fixture_ids.auth_user_id, ids.authUserId);
assert.equal(manifest.fixture_ids.profile_user_id, ids.authUserId);
assert.equal(manifest.fixture_ids.order_id, ids.orderId);
assert.equal(manifest.command.idempotency_key, 'fixture-generator-test');
assert.equal(manifest.baseline_counts.design_tasks, 0);
assert.equal(manifest.expected_after_success.design_tasks, 1);
assert.deepEqual(manifest.cleanup_order, [
  'receipt', 'design_event', 'design_task', 'need',
  'order', 'lead', 'profile', 'auth_user'
]);

const check = validateFixtureManifest(manifest, { now: Date.parse('2026-07-14T10:06:00.000Z') });
assert.equal(check.ok, true, check.errors.join(','));
assert.equal(check.digest_sha256, manifestDigest(manifest));
assert.equal(JSON.stringify(manifest).includes('password'), false);
assert.equal(JSON.stringify(manifest).includes('access_token'), false);
assert.equal(JSON.stringify(manifest).includes('refresh_token'), false);
assert.equal(JSON.stringify(manifest).includes('service_role'), false);
assert.equal(JSON.stringify(manifest).includes('ofewxuqfjhamgerwzull'), false);

assert.throws(() => buildFixtureManifest({
  ...ids,
  authUserId: 'not-a-uuid',
  expectedUpdatedAt: '2026-07-14T10:00:00.000Z',
  idempotencyKey: 'bad-user',
  taskTitle: 'Bad user',
  createdAt: '2026-07-14T10:05:00.000Z',
  expiresAt: '2026-07-14T14:05:00.000Z'
}), /authUserId_invalid/);

assert.throws(() => buildFixtureManifest({
  ...ids,
  expectedUpdatedAt: 'not-a-time',
  idempotencyKey: 'bad-time',
  taskTitle: 'Bad time',
  createdAt: '2026-07-14T10:05:00.000Z',
  expiresAt: '2026-07-14T14:05:00.000Z'
}), /Invalid time value|expected_updated_at_invalid/);

console.log('Staging fixture manifest generator is exact-environment, credential-free and cleanup-complete.');
