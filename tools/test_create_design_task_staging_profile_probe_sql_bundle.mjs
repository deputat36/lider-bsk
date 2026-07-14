#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  ACTION,
  PRODUCTION_PROJECT_REF,
  STAGING_PROJECT_REF
} from './design-task-staging-auth-e2e.mjs';
import {
  FIXTURE_MANIFEST_VERSION
} from './design-task-staging-auth-e2e-v2.mjs';
import {
  PROFILE_PROBES,
  PROFILE_PROBE_SQL_BUNDLE_VERSION,
  buildProfileProbeSql,
  buildProfileProbeSqlBundle,
  sqlLiteral
} from './create-design-task-staging-profile-probe-sql-bundle.mjs';

const IDS = Object.freeze({
  manifest: '10000000-0000-4000-8000-000000000001',
  user: '20000000-0000-4000-8000-000000000002',
  lead: '30000000-0000-4000-8000-000000000003',
  order: '40000000-0000-4000-8000-000000000004',
  need: '50000000-0000-4000-8000-000000000005'
});

function manifest() {
  return {
    manifest_version: FIXTURE_MANIFEST_VERSION,
    manifest_id: IDS.manifest,
    project_ref: STAGING_PROJECT_REF,
    synthetic_only: true,
    production_enabled: false,
    created_at: '2026-07-14T08:00:00.000Z',
    expires_at: '2026-07-14T20:00:00.000Z',
    fixture_ids: {
      auth_user_id: IDS.user,
      profile_user_id: IDS.user,
      lead_id: IDS.lead,
      order_id: IDS.order,
      need_id: IDS.need
    },
    order_snapshot: {
      expected_updated_at: '2026-07-14T08:05:00.000Z',
      need_design: true,
      is_archived: false
    },
    command: {
      action: ACTION,
      idempotency_key: 'profile-probe-e2e',
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

assert.equal(sqlLiteral("probe-'quoted'"), "'probe-''quoted'''" );

const bundle = buildProfileProbeSqlBundle(manifest(), {
  now: Date.parse('2026-07-14T09:00:00.000Z')
});
assert.equal(bundle.bundle_version, PROFILE_PROBE_SQL_BUNDLE_VERSION);
assert.equal(bundle.project_ref, STAGING_PROJECT_REF);
assert.equal(bundle.production_enabled, false);
assert.deepEqual(bundle.probe_order, [
  'forbidden_role', 'inactive_profile', 'unknown_role', 'restore_manager'
]);
assert.deepEqual(bundle.allowed_update_tables, ['public.leader_user_profiles']);
assert.equal(Object.keys(bundle.script_sha256).length, 4);
for (const digest of Object.values(bundle.script_sha256)) assert.match(digest, /^[0-9a-f]{64}$/);

const expected = {
  forbidden_role: { role: 'accountant', active: 'true', runner: 'forbidden_role', http: '403' },
  inactive_profile: { role: 'manager', active: 'false', runner: 'inactive_profile', http: '403' },
  unknown_role: { role: 'staging_unknown_probe', active: 'true', runner: 'unknown_role', http: '403' },
  restore_manager: { role: 'manager', active: 'true', runner: null, http: 'null' }
};

for (const [name, profile] of Object.entries(expected)) {
  const sql = bundle.scripts[name];
  assert.equal(PROFILE_PROBES[name].role, profile.role);
  assert.match(sql, new RegExp(`-- Probe: ${name}`));
  assert.match(sql, new RegExp(STAGING_PROJECT_REF));
  assert.doesNotMatch(sql, new RegExp(PRODUCTION_PROJECT_REF));
  assert.match(sql, /from leader_staging\.environment_guard/i);
  assert.match(sql, /from auth\.users/i);
  assert.match(sql, /email_confirmed_at is not null/i);
  assert.match(sql, /synthetic_staging_profile_required/i);
  assert.match(sql, /update public\.leader_user_profiles/i);
  assert.match(sql, new RegExp(`set role = '${profile.role}'`));
  assert.match(sql, new RegExp(`is_active = ${profile.active}`));
  assert.match(sql, /profile_probe_business_state_changed/i);
  assert.match(sql, /business_rows_mutated', false/i);
  assert.equal((sql.match(/update\s+public\.leader_user_profiles/gi) || []).length, 1);
  assert.doesNotMatch(sql, /insert\s+into/i);
  assert.doesNotMatch(sql, /delete\s+from/i);
  assert.doesNotMatch(sql, /update\s+(?!public\.leader_user_profiles)/i);
  assert.doesNotMatch(sql, /\b(create|alter|drop|grant|revoke|truncate)\b/i);
  assert.doesNotMatch(sql, /(insert\s+into|update|delete\s+from)\s+auth\.users/i);
  assert.doesNotMatch(sql, /service_role|sb_secret_|Bearer\s+/i);
}

const quoted = manifest();
quoted.command.idempotency_key = "profile-'quoted'; select 1";
const quotedSql = buildProfileProbeSql(quoted, 'forbidden_role', {
  now: Date.parse('2026-07-14T09:00:00.000Z')
});
assert.match(quotedSql, /profile-''quoted''; select 1/);
assert.doesNotMatch(quotedSql, /v_idempotency_key text := 'profile-'quoted'/);

const expired = manifest();
expired.expires_at = '2026-07-14T08:30:00.000Z';
assert.throws(
  () => buildProfileProbeSqlBundle(expired, { now: Date.parse('2026-07-14T09:00:00.000Z') }),
  /manifest_expired/
);

const wrongIdentity = manifest();
wrongIdentity.fixture_ids.profile_user_id = IDS.lead;
assert.throws(
  () => buildProfileProbeSqlBundle(wrongIdentity, { now: Date.parse('2026-07-14T09:00:00.000Z') }),
  /profile_auth_identity_mismatch/
);

assert.throws(
  () => buildProfileProbeSql(manifest(), 'not_a_probe', { now: Date.parse('2026-07-14T09:00:00.000Z') }),
  /profile_probe_invalid/
);

console.log('Staging profile probe SQL bundle is manifest-bound, role-explicit, business-state preserving and production-locked.');
