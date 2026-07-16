#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  AUTH_E2E_EVIDENCE_VERSION,
  AUTH_E2E_RUNNER_VERSION,
  STAGING_PROJECT_REF,
  buildAuthE2EEvidence,
  writeAuthE2EEvidence
} from './run_calculation_version_staging_auth_e2e.mjs';
import {
  createFixtureManifest,
  manifestDigest
} from './create-calculation-version-staging-fixture-bundle.mjs';
import {
  POST_CLEANUP_SNAPSHOT_VERSION,
  buildPostCleanupSnapshotSql,
  writePostCleanupSnapshot
} from './create-calculation-version-staging-post-cleanup-snapshot.mjs';
import {
  validateAuthE2EEvidence
} from './validate-calculation-version-staging-auth-e2e-evidence.mjs';

const NOW = Date.parse('2026-07-16T08:00:00.000Z');
const UUIDS = [
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000003',
  '40000000-0000-4000-8000-000000000004',
  '50000000-0000-4000-8000-000000000005'
];
const manifest = createFixtureManifest({
  authUserId: '90000000-0000-4000-8000-000000000009',
  now: NOW,
  ttlHours: 12,
  uuid: () => UUIDS.shift()
});
const fixtureDigest = manifestDigest(manifest);

function summary(scenario) {
  const base = {
    scenario,
    fixtureManifestId: manifest.manifest_id,
    fixtureManifestDigest: fixtureDigest,
    logout: { status: 204, passed: true }
  };
  if (scenario === 'allowed') {
    return {
      ...base,
      statuses: { create: 201, replay: 200, conflict: 409, stale: 409 },
      sourceCalculationId: manifest.fixture_ids.source_calculation_id,
      createdCalculationId: '60000000-0000-4000-8000-000000000006',
      requestId: '70000000-0000-4000-8000-000000000007',
      safeProjectionValidated: true,
      cleanupRequired: true
    };
  }
  return {
    ...base,
    statuses: scenario === 'forbidden' ? { forbidden: 403 } : { inactive: 403 },
    safeProjectionValidated: false,
    cleanupRequired: false
  };
}

const startedAt = '2026-07-16T08:01:00.000Z';
const finishedAt = '2026-07-16T08:01:04.000Z';

for (const scenario of ['allowed', 'forbidden', 'inactive']) {
  const evidence = buildAuthE2EEvidence(summary(scenario), { startedAt, finishedAt });
  assert.equal(evidence.evidence_version, AUTH_E2E_EVIDENCE_VERSION);
  assert.equal(evidence.runner_version, AUTH_E2E_RUNNER_VERSION);
  assert.equal(evidence.project_ref, STAGING_PROJECT_REF);
  assert.equal(evidence.production_enabled, false);
  assert.equal(evidence.network_e2e, true);
  assert.equal(evidence.scenario, scenario);
  assert.equal(evidence.fixture_manifest.id, manifest.manifest_id);
  assert.equal(evidence.fixture_manifest.digest_sha256, fixtureDigest);
  assert.equal(evidence.logout.passed, true);

  const checked = validateAuthE2EEvidence(evidence, manifest, { now: NOW + 10 * 60 * 1000 });
  assert.equal(checked.ok, true, checked.errors.join(','));
  assert.equal(checked.summary.scenario, scenario);
}

assert.throws(
  () => buildAuthE2EEvidence({ ...summary('allowed'), fixtureManifestDigest: null }, { startedAt, finishedAt }),
  /evidence_requires_fixture_manifest/
);
assert.throws(
  () => buildAuthE2EEvidence({ ...summary('allowed'), logout: { status: 0, passed: false } }, { startedAt, finishedAt }),
  /evidence_requires_successful_logout/
);
assert.throws(
  () => buildAuthE2EEvidence(summary('allowed'), { startedAt: finishedAt, finishedAt: startedAt }),
  /evidence_timestamp_invalid/
);

const allowedEvidence = buildAuthE2EEvidence(summary('allowed'), { startedAt, finishedAt });
const wrongDigest = structuredClone(allowedEvidence);
wrongDigest.fixture_manifest.digest_sha256 = '0'.repeat(64);
assert.equal(validateAuthE2EEvidence(wrongDigest, manifest, { now: NOW + 10 * 60 * 1000 }).ok, false);

const wrongStatuses = structuredClone(allowedEvidence);
wrongStatuses.statuses.create = 200;
assert.equal(validateAuthE2EEvidence(wrongStatuses, manifest, { now: NOW + 10 * 60 * 1000 }).ok, false);

const leakedSecret = structuredClone(allowedEvidence);
leakedSecret.password = 'must-fail';
assert.equal(validateAuthE2EEvidence(leakedSecret, manifest, { now: NOW + 10 * 60 * 1000 }).ok, false);

const noLogout = structuredClone(allowedEvidence);
noLogout.logout = { status: 0, passed: false };
assert.equal(validateAuthE2EEvidence(noLogout, manifest, { now: NOW + 10 * 60 * 1000 }).ok, false);

const snapshotSql = buildPostCleanupSnapshotSql(manifest, { now: NOW + 1 });
assert.match(snapshotSql, new RegExp(POST_CLEANUP_SNAPSHOT_VERSION));
assert.match(snapshotSql, new RegExp(STAGING_PROJECT_REF));
assert.match(snapshotSql, /leader_staging\.environment_guard/);
assert.match(snapshotSql, /post_cleanup_auth_user_still_exists/);
assert.match(snapshotSql, /post_cleanup_manifest_bound_rows_remain/);
assert.match(snapshotSql, /database_fixtures_absent', true/);
assert.match(snapshotSql, /cleanup_verified', true/);
assert.doesNotMatch(snapshotSql, /ofewxuqfjhamgerwzull/);
assert.doesNotMatch(snapshotSql, /\b(insert|update|delete|truncate|drop|alter|grant|revoke)\b/i);
assert.doesNotMatch(snapshotSql, /sb_secret_|Bearer\s+|eyJ[A-Za-z0-9_-]{20,}\./);

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'calculation-e2e-evidence-'));
try {
  const evidencePath = path.join(tempDir, 'allowed-evidence.json');
  const snapshotPath = path.join(tempDir, 'post-cleanup-snapshot.sql');
  await writeAuthE2EEvidence(evidencePath, allowedEvidence);
  await writePostCleanupSnapshot(snapshotPath, snapshotSql);

  const storedEvidence = JSON.parse(await readFile(evidencePath, 'utf8'));
  assert.deepEqual(storedEvidence, allowedEvidence);
  assert.equal((await stat(evidencePath)).mode & 0o777, 0o600);
  assert.equal((await stat(snapshotPath)).mode & 0o777, 0o600);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

console.log('Calculation staging authenticated E2E evidence is manifest-bound, secret-free and cleanup-verifiable.');
