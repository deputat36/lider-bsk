#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  ACTION,
  FIXTURE_BUNDLE_VERSION,
  FIXTURE_MANIFEST_VERSION,
  STAGING_PROJECT_REF,
  buildCleanupSql,
  buildFixtureBundle,
  buildSeedSql,
  createFixtureManifest,
  manifestDigest,
  validateFixtureManifest
} from './create-calculation-version-staging-fixture-bundle.mjs';

const NOW = Date.parse('2026-07-15T21:00:00.000Z');
const UUIDS = [
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000003',
  '40000000-0000-4000-8000-000000000004',
  '50000000-0000-4000-8000-000000000005'
];
const AUTH_USER_ID = '90000000-0000-4000-8000-000000000009';

function deterministicUuid() {
  const value = UUIDS.shift();
  if (!value) throw new Error('uuid_sequence_exhausted');
  return value;
}

const manifest = createFixtureManifest({
  authUserId: AUTH_USER_ID,
  now: NOW,
  ttlHours: 12,
  uuid: deterministicUuid
});

assert.equal(manifest.manifest_version, FIXTURE_MANIFEST_VERSION);
assert.equal(manifest.project_ref, STAGING_PROJECT_REF);
assert.equal(manifest.synthetic_only, true);
assert.equal(manifest.production_enabled, false);
assert.equal(manifest.fixture_ids.auth_user_id, AUTH_USER_ID);
assert.equal(manifest.fixture_ids.profile_user_id, AUTH_USER_ID);
assert.equal(manifest.fixture_ids.lead_id, '20000000-0000-4000-8000-000000000002');
assert.equal(manifest.fixture_ids.need_id, '30000000-0000-4000-8000-000000000003');
assert.equal(manifest.fixture_ids.source_calculation_id, '40000000-0000-4000-8000-000000000004');
assert.equal(manifest.fixture_ids.source_item_id, '50000000-0000-4000-8000-000000000005');
assert.equal(manifest.source_snapshot.version_number, 1);
assert.equal(manifest.source_snapshot.status, 'Согласован');
assert.equal(manifest.command.action, ACTION);
assert.ok(manifest.command.idempotency_key.includes(manifest.manifest_id));
assert.equal(validateFixtureManifest(manifest, { now: NOW + 1 }).ok, true);
assert.match(manifestDigest(manifest), /^[0-9a-f]{64}$/);

const seed = buildSeedSql(manifest, { now: NOW + 1 });
const cleanup = buildCleanupSql(manifest, { now: NOW + 1 });
const bundle = buildFixtureBundle(manifest, { now: NOW + 1 });

assert.equal(bundle.bundle_version, FIXTURE_BUNDLE_VERSION);
assert.equal(bundle.project_ref, STAGING_PROJECT_REF);
assert.equal(bundle.production_enabled, false);
assert.equal(bundle.auth_user_required, true);
assert.equal(bundle.auth_user_created_or_deleted_by_sql, false);
assert.match(bundle.seed_sha256, /^[0-9a-f]{64}$/);
assert.match(bundle.cleanup_sha256, /^[0-9a-f]{64}$/);
assert.equal(bundle.runner_environment.LIDER_STAGING_SOURCE_CALCULATION_ID, manifest.fixture_ids.source_calculation_id);
assert.equal(bundle.runner_environment.LIDER_STAGING_EXPECTED_UPDATED_AT, manifest.source_snapshot.expected_updated_at);
assert.equal(bundle.runner_environment.LIDER_STAGING_NEED_ID, manifest.fixture_ids.need_id);
assert.equal(bundle.runner_environment.LIDER_STAGING_IDEMPOTENCY_KEY, manifest.command.idempotency_key);

for (const sql of [seed, cleanup]) {
  assert.match(sql, /STAGING ONLY/);
  assert.match(sql, new RegExp(STAGING_PROJECT_REF));
  assert.match(sql, /leader_staging\.environment_guard/);
  assert.match(sql, /repository = 'deputat36\/lider-bsk'/);
  assert.doesNotMatch(sql, /ofewxuqfjhamgerwzull/);
  assert.doesNotMatch(sql, /sb_secret_|Bearer\s+|eyJ[A-Za-z0-9_-]{20,}\./);
}

assert.match(seed, /confirmed_staging_auth_user_required/);
assert.match(seed, /fixture_manifest_expired/);
assert.match(seed, /fixture_collision_detected/);
assert.match(seed, /insert into public\.leader_user_profiles/i);
assert.match(seed, /insert into public\.leader_leads/i);
assert.match(seed, /insert into public\.leader_lead_needs/i);
assert.match(seed, /insert into public\.leader_lead_calculations/i);
assert.match(seed, /insert into public\.leader_lead_calculation_items/i);
assert.match(seed, /fixture_seed_postcondition_failed/);
assert.match(seed, /auth_user_created_by_sql', false/);
assert.doesNotMatch(seed, /insert into auth\.users/i);
assert.doesNotMatch(seed, /delete from auth\.users/i);
assert.equal((seed.match(/insert into public\.leader_lead_calculations/gi) || []).length, 1);
assert.equal((seed.match(/insert into public\.leader_lead_calculation_items/gi) || []).length, 1);

assert.match(cleanup, /auth_user_must_be_deleted_last/);
assert.match(cleanup, /delete from leader_private\.leader_command_receipts/i);
assert.match(cleanup, /delete from public\.leader_lead_calculation_items/i);
assert.match(cleanup, /delete from public\.leader_lead_calculations/i);
assert.match(cleanup, /delete from public\.leader_lead_needs/i);
assert.match(cleanup, /delete from public\.leader_leads/i);
assert.match(cleanup, /delete from public\.leader_user_profiles/i);
assert.match(cleanup, /fixture_cleanup_postcondition_failed/);
assert.match(cleanup, /auth_user_delete_required', true/);
assert.doesNotMatch(cleanup, /delete from auth\.users/i);
assert.ok(cleanup.indexOf('delete from public.leader_lead_calculation_items') < cleanup.indexOf('delete from public.leader_lead_calculations'));
assert.ok(cleanup.indexOf('delete from public.leader_lead_calculations') < cleanup.indexOf('delete from public.leader_lead_needs'));
assert.ok(cleanup.indexOf('delete from public.leader_lead_needs') < cleanup.indexOf('delete from public.leader_leads'));
assert.ok(cleanup.indexOf('delete from public.leader_leads') < cleanup.indexOf('delete from public.leader_user_profiles'));

const expired = structuredClone(manifest);
expired.expires_at = '2026-07-15T20:59:59.000Z';
assert.equal(validateFixtureManifest(expired, { now: NOW }).ok, false);
assert.throws(() => buildSeedSql(expired, { now: NOW }), /manifest_expired/);

const wrongProject = structuredClone(manifest);
wrongProject.project_ref = 'wrong-project';
assert.equal(validateFixtureManifest(wrongProject, { now: NOW + 1 }).ok, false);

const identityMismatch = structuredClone(manifest);
identityMismatch.fixture_ids.profile_user_id = identityMismatch.fixture_ids.lead_id;
assert.equal(validateFixtureManifest(identityMismatch, { now: NOW + 1 }).ok, false);

const secretLike = structuredClone(manifest);
secretLike.password = 'must-not-exist';
assert.equal(validateFixtureManifest(secretLike, { now: NOW + 1 }).ok, false);

assert.throws(
  () => createFixtureManifest({ authUserId: 'not-a-uuid', now: NOW, uuid: () => crypto.randomUUID() }),
  /auth_user_id_invalid/
);
assert.throws(
  () => createFixtureManifest({ authUserId: AUTH_USER_ID, now: NOW, ttlHours: 25, uuid: () => crypto.randomUUID() }),
  /ttl_hours_invalid/
);

console.log('Calculation staging fixture bundle is manifest-bound, production-locked and Auth-safe.');
