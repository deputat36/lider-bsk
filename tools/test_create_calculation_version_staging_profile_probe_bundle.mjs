#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  PROFILE_PROBE_BUNDLE_VERSION,
  PROFILE_TRANSITIONS,
  buildProfileProbeBundle,
  buildProfileTransitionSql
} from './create-calculation-version-staging-profile-probe-bundle.mjs';
import {
  STAGING_PROJECT_REF,
  createFixtureManifest,
  manifestDigest
} from './create-calculation-version-staging-fixture-bundle.mjs';

const NOW = Date.parse('2026-07-16T10:00:00.000Z');
const AUTH_USER_ID = '90000000-0000-4000-8000-000000000009';
const UUIDS = [
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000003',
  '40000000-0000-4000-8000-000000000004',
  '50000000-0000-4000-8000-000000000005'
];

const manifest = createFixtureManifest({
  authUserId: AUTH_USER_ID,
  now: NOW,
  ttlHours: 12,
  uuid: () => UUIDS.shift()
});
const digest = manifestDigest(manifest);
const bundle = buildProfileProbeBundle(manifest, { now: NOW + 1 });

assert.equal(bundle.bundle_version, PROFILE_PROBE_BUNDLE_VERSION);
assert.equal(bundle.project_ref, STAGING_PROJECT_REF);
assert.equal(bundle.production_enabled, false);
assert.equal(bundle.manifest_id, manifest.manifest_id);
assert.equal(bundle.manifest_digest_sha256, digest);
assert.deepEqual(bundle.transition_order, ['allowed', 'forbidden', 'inactive', 'restore_manager']);
assert.deepEqual(bundle.outputs, {
  allowed: 'allowed.sql',
  forbidden: 'forbidden.sql',
  inactive: 'inactive.sql',
  restore_manager: 'restore-manager.sql'
});
assert.equal(bundle.auth_user_required, true);
assert.equal(bundle.auth_user_created_or_deleted_by_sql, false);
assert.equal(bundle.executes_sql, false);
assert.equal(bundle.performs_network_calls, false);
assert.deepEqual(Object.keys(bundle.script_sha256).sort(), Object.keys(PROFILE_TRANSITIONS).sort());
for (const hash of Object.values(bundle.script_sha256)) assert.match(hash, /^[0-9a-f]{64}$/);

for (const [name, transition] of Object.entries(PROFILE_TRANSITIONS)) {
  const sql = bundle.scripts[name];
  assert.match(sql, new RegExp(`Transition: ${name}`));
  assert.match(sql, new RegExp(STAGING_PROJECT_REF));
  assert.match(sql, new RegExp(manifest.manifest_id));
  assert.match(sql, new RegExp(digest));
  assert.match(sql, /leader_staging\.environment_guard/);
  assert.match(sql, /repository = 'deputat36\/lider-bsk'/);
  assert.match(sql, /from auth\.users/i);
  assert.match(sql, /email_confirmed_at is not null/i);
  assert.match(sql, /manifest_bound_profile_required/);
  assert.match(sql, /manifest_bound_source_calculation_required/);
  assert.match(sql, /for update/i);
  assert.match(sql, /update public\.leader_user_profiles/i);
  assert.match(sql, /set role = v_expected_role/i);
  assert.match(sql, /is_active = v_expected_active/i);
  assert.match(sql, /permissions = v_expected_permissions/i);
  assert.match(sql, /profile_transition_postcondition_failed/);
  assert.match(sql, /profile_transition_changed_unapproved_fields/);
  assert.match(sql, /profile_transition_business_state_changed/);
  assert.match(sql, /business_state_unchanged', true/);
  assert.match(sql, /auth_user_created_or_deleted', false/);
  assert.equal((sql.match(/update\s+public\.leader_user_profiles/gi) || []).length, 1);
  assert.doesNotMatch(sql, /ofewxuqfjhamgerwzull/);
  assert.doesNotMatch(sql, /insert\s+into/i);
  assert.doesNotMatch(sql, /delete\s+from/i);
  assert.doesNotMatch(sql, /update\s+(?!public\.leader_user_profiles)/i);
  assert.doesNotMatch(sql, /\b(truncate|drop|alter|grant|revoke)\b/i);
  assert.doesNotMatch(sql, /(insert\s+into|update|delete\s+from)\s+auth\.users/i);
  assert.doesNotMatch(sql, /sb_secret_|Bearer\s+|eyJ[A-Za-z0-9_-]{20,}\./);

  assert.match(sql, new RegExp(`v_expected_role text := '${transition.role}'`));
  assert.match(sql, new RegExp(`v_expected_active boolean := ${transition.isActive ? 'true' : 'false'}`));
  if (transition.permissions['calculations.write'] === true) {
    assert.match(sql, /\{"calculations\.write":true\}/);
  } else {
    assert.match(sql, /v_expected_permissions jsonb := '\{\}'::jsonb/);
  }
}

assert.match(bundle.scripts.forbidden, /'transition', 'forbidden'/);
assert.match(bundle.scripts.forbidden, /'role', 'accountant'/);
assert.match(bundle.scripts.forbidden, /'is_active', true/);
assert.match(bundle.scripts.inactive, /'transition', 'inactive'/);
assert.match(bundle.scripts.inactive, /'role', 'manager'/);
assert.match(bundle.scripts.inactive, /'is_active', false/);
assert.match(bundle.scripts.restore_manager, /'transition', 'restore_manager'/);
assert.match(bundle.scripts.restore_manager, /'role', 'manager'/);
assert.match(bundle.scripts.restore_manager, /'is_active', true/);

const expired = structuredClone(manifest);
expired.expires_at = '2026-07-16T09:59:59.000Z';
assert.throws(
  () => buildProfileProbeBundle(expired, { now: NOW }),
  /fixture_manifest_invalid:manifest_expired/
);
assert.throws(
  () => buildProfileTransitionSql(manifest, 'unknown', { now: NOW + 1 }),
  /profile_transition_invalid/
);

console.log('Calculation staging profile probes are manifest-bound and change only the synthetic CRM profile.');
