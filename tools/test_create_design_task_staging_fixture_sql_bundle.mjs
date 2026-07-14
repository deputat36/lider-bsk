#!/usr/bin/env node

import assert from 'node:assert/strict';

import { buildFixtureManifest } from './create-design-task-staging-fixture-manifest.mjs';
import {
  SQL_BUNDLE_VERSION,
  buildCleanupSql,
  buildSeedSql,
  buildSqlBundle
} from './create-design-task-staging-fixture-sql-bundle.mjs';

const now = Date.parse('2026-07-14T12:00:00.000Z');

function manifest(overrides = {}) {
  return buildFixtureManifest({
    manifestId: '11111111-1111-4111-8111-111111111111',
    authUserId: '22222222-2222-4222-8222-222222222222',
    leadId: '33333333-3333-4333-8333-333333333333',
    orderId: '44444444-4444-4444-8444-444444444444',
    needId: '55555555-5555-4555-8555-555555555555',
    expectedUpdatedAt: '2026-07-14T12:00:00.000Z',
    idempotencyKey: 'staging-e2e-fixture-key',
    taskTitle: 'Synthetic staging design task',
    createdAt: '2026-07-14T12:00:00.000Z',
    expiresAt: '2026-07-14T16:00:00.000Z',
    ...overrides
  });
}

const value = manifest();
const bundle = buildSqlBundle(value, { now });

assert.equal(bundle.bundle_version, SQL_BUNDLE_VERSION);
assert.equal(bundle.project_ref, 'otulfnouybahfnsycxqn');
assert.equal(bundle.production_enabled, false);
assert.equal(bundle.auth_user_required, true);
assert.equal(bundle.auth_user_created_or_deleted_by_sql, false);
assert.equal(bundle.manifest_digest_sha256.length, 64);
assert.equal(bundle.seed_sha256.length, 64);
assert.equal(bundle.cleanup_sha256.length, 64);

const seed = bundle.seed_sql;
const cleanup = bundle.cleanup_sql;

for (const sql of [seed, cleanup]) {
  assert.match(sql, /otulfnouybahfnsycxqn/);
  assert.doesNotMatch(sql, /ofewxuqfjhamgerwzull/);
  assert.doesNotMatch(sql, /sb_secret_|sb_publishable_|Bearer\s+|eyJ[A-Za-z0-9_-]{20,}\./);
  assert.doesNotMatch(sql, /\b(create|alter|drop|grant|revoke|truncate)\b/i);
  assert.match(sql, /^-- GENERATED FILE\. STAGING ONLY\./);
  assert.match(sql, /begin;[\s\S]*commit;/i);
}

assert.ok(seed.indexOf('leader_staging.environment_guard') < seed.indexOf('insert into public.leader_user_profiles'));
assert.match(seed, /from auth\.users[\s\S]*email_confirmed_at is not null/);
assert.match(seed, /raise exception 'confirmed_staging_auth_user_required'/);
assert.match(seed, /raise exception 'fixture_collision_detected'/);
assert.match(seed, /insert into public\.leader_user_profiles/);
assert.match(seed, /insert into public\.leader_leads/);
assert.match(seed, /insert into public\.leader_orders/);
assert.match(seed, /insert into public\.leader_lead_needs/);
assert.doesNotMatch(seed, /insert into auth\.users/i);
assert.doesNotMatch(seed, /insert into public\.leader_design_tasks/i);
assert.doesNotMatch(seed, /insert into public\.leader_design_task_events/i);
assert.doesNotMatch(seed, /insert into leader_private\.leader_command_receipts/i);
assert.match(seed, /'manager', true, '\{\}'::jsonb/);
assert.match(seed, /'Новый', 'Обычный'/);
assert.match(seed, /'Подтверждено', 100, '\[\]'::jsonb/);
assert.match(seed, /v_expected_updated_at, v_expected_updated_at/);
assert.match(seed, /auth_user_created_by_sql', false/);

const expectedDeleteOrder = [
  'delete from leader_private.leader_command_receipts',
  'delete from public.leader_design_task_events',
  'delete from public.leader_design_tasks',
  'delete from public.leader_production_jobs',
  'delete from public.leader_lead_needs',
  'delete from public.leader_orders',
  'delete from public.leader_leads',
  'delete from public.leader_user_profiles'
];
let previous = -1;
for (const marker of expectedDeleteOrder) {
  const position = cleanup.indexOf(marker);
  assert.ok(position > previous, `cleanup order drifted at ${marker}`);
  previous = position;
}
assert.doesNotMatch(cleanup, /delete from auth\.users/i);
assert.match(cleanup, /raise exception 'auth_user_must_be_deleted_last'/);
assert.match(cleanup, /auth_user_delete_required', true/);
assert.match(cleanup, /post_cleanup_snapshot_required', true/);

const quoted = manifest({ idempotencyKey: "fixture-'quoted'; select 1" });
const quotedCleanup = buildCleanupSql(quoted, { now });
assert.match(quotedCleanup, /fixture-''quoted''; select 1/);
assert.doesNotMatch(quotedCleanup, /fixture-'quoted'; select 1/);

const expired = manifest({
  createdAt: '2026-07-14T08:00:00.000Z',
  expiresAt: '2026-07-14T09:00:00.000Z'
});
assert.throws(() => buildSeedSql(expired, { now }), /manifest_expired/);

const wrongEnvironment = structuredClone(value);
wrongEnvironment.project_ref = 'ofewxuqfjhamgerwzull';
assert.throws(() => buildSqlBundle(wrongEnvironment, { now }), /manifest_project_ref_invalid|forbidden_manifest_value/);

const identityMismatch = structuredClone(value);
identityMismatch.fixture_ids.profile_user_id = '66666666-6666-4666-8666-666666666666';
assert.throws(() => buildCleanupSql(identityMismatch, { now }), /profile_auth_identity_mismatch/);

const credentialLeak = structuredClone(value);
credentialLeak.password = ['not', 'a', 'real', 'credential'].join('-');
assert.throws(() => buildSqlBundle(credentialLeak, { now }), /forbidden_manifest_key/);

console.log('Staging fixture SQL bundle is manifest-bound, transaction-safe, injection-safe and never mutates auth.users.');
