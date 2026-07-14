#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  ACTION,
  PRODUCTION_PROJECT_REF,
  STAGING_PROJECT_REF
} from './design-task-staging-auth-e2e.mjs';
import { FIXTURE_MANIFEST_VERSION } from './design-task-staging-auth-e2e-v2.mjs';
import {
  STALE_ORDER_SQL_BUNDLE_VERSION,
  STALE_ORDER_TRANSITIONS,
  buildStaleOrderSqlBundle,
  buildStaleOrderTransitionSql,
  sqlLiteral
} from './create-design-task-staging-stale-order-sql-bundle.mjs';

const IDS = Object.freeze({
  manifest: '10000000-0000-4000-8000-000000000001',
  user: '20000000-0000-4000-8000-000000000002',
  lead: '30000000-0000-4000-8000-000000000003',
  order: '40000000-0000-4000-8000-000000000004',
  need: '50000000-0000-4000-8000-000000000005'
});

function manifest(idempotencyKey = 'stale-order-e2e') {
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
      idempotency_key: idempotencyKey,
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

assert.equal(sqlLiteral("stale-'quoted'"), "'stale-''quoted'''" );

const bundle = buildStaleOrderSqlBundle(manifest(), {
  now: Date.parse('2026-07-14T09:00:00.000Z')
});
assert.equal(bundle.bundle_version, STALE_ORDER_SQL_BUNDLE_VERSION);
assert.equal(bundle.project_ref, STAGING_PROJECT_REF);
assert.equal(bundle.production_enabled, false);
assert.deepEqual(bundle.transition_order, ['stale_order', 'restore_order_version']);
assert.deepEqual(bundle.outputs, {
  stale_order: 'stale-order.sql',
  restore_order_version: 'restore-order-version.sql'
});
assert.deepEqual(bundle.allowed_update_tables, ['public.leader_orders']);
assert.deepEqual(bundle.allowed_update_columns, ['updated_at']);
assert.equal(Object.keys(bundle.script_sha256).length, 2);
for (const digest of Object.values(bundle.script_sha256)) assert.match(digest, /^[0-9a-f]{64}$/);

for (const [name, transition] of Object.entries(STALE_ORDER_TRANSITIONS)) {
  const sql = bundle.scripts[name];
  assert.match(sql, new RegExp(`-- Transition: ${name}`));
  assert.match(sql, new RegExp(STAGING_PROJECT_REF));
  assert.doesNotMatch(sql, new RegExp(PRODUCTION_PROJECT_REF));
  assert.match(sql, /from leader_staging\.environment_guard/i);
  assert.match(sql, /from auth\.users/i);
  assert.match(sql, /email_confirmed_at is not null/i);
  assert.match(sql, /active_synthetic_manager_profile_required/i);
  assert.match(sql, /stale_order_probe_requires_clean_baseline/i);
  assert.match(sql, /to_jsonb\(source_order\) - 'updated_at'/i);
  assert.match(sql, /update public\.leader_orders/i);
  assert.match(sql, /set updated_at =/i);
  assert.match(sql, /stale_order_non_version_fields_changed/i);
  assert.match(sql, /stale_order_business_counts_changed/i);
  assert.match(sql, /auth_user_mutated', false/i);
  assert.match(sql, /non_version_order_fields_mutated', false/i);
  assert.match(sql, /business_counts_mutated', false/i);
  assert.equal((sql.match(/update\s+public\.leader_orders/gi) || []).length, 1);
  assert.doesNotMatch(sql, /insert\s+into/i);
  assert.doesNotMatch(sql, /delete\s+from/i);
  assert.doesNotMatch(sql, /update\s+(?!public\.leader_orders)/i);
  assert.doesNotMatch(sql, /\b(create|alter|drop|grant|revoke|truncate)\b/i);
  assert.doesNotMatch(sql, /(insert\s+into|update|delete\s+from)\s+auth\.users/i);
  assert.doesNotMatch(sql, /service_role|sb_secret_|Bearer\s+/i);
  if (transition.to === 'stale') {
    assert.match(sql, /set updated_at = v_stale_updated_at/i);
    assert.match(sql, /restore_required', true/i);
  } else {
    assert.match(sql, /set updated_at = v_expected_updated_at/i);
    assert.match(sql, /restore_required', false/i);
  }
}

const quoted = manifest("stale-'quoted'; select 1");
const quotedSql = buildStaleOrderTransitionSql(quoted, 'stale_order', {
  now: Date.parse('2026-07-14T09:00:00.000Z')
});
assert.match(quotedSql, /stale-''quoted''; select 1/);
assert.doesNotMatch(quotedSql, /v_idempotency_key text := 'stale-'quoted'/);

const maxKey = 'x'.repeat(180);
const maxKeySql = buildStaleOrderTransitionSql(manifest(maxKey), 'stale_order', {
  now: Date.parse('2026-07-14T09:00:00.000Z')
});
assert.match(maxKeySql, /left\('x{180}' \|\| '-stale-order', 180\)/);

const expired = manifest();
expired.expires_at = '2026-07-14T08:30:00.000Z';
assert.throws(
  () => buildStaleOrderSqlBundle(expired, { now: Date.parse('2026-07-14T09:00:00.000Z') }),
  /manifest_expired/
);

const wrongIdentity = manifest();
wrongIdentity.fixture_ids.profile_user_id = IDS.lead;
assert.throws(
  () => buildStaleOrderSqlBundle(wrongIdentity, { now: Date.parse('2026-07-14T09:00:00.000Z') }),
  /profile_auth_identity_mismatch/
);

assert.throws(
  () => buildStaleOrderTransitionSql(manifest(), 'bad_transition', { now: Date.parse('2026-07-14T09:00:00.000Z') }),
  /stale_order_transition_invalid/
);

console.log('Stale-order SQL bundle changes only the synthetic order version, preserves business state and remains production-locked.');
