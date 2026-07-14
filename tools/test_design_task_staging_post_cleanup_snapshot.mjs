#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  EXPECTED_COUNTS,
  EXPECTED_OBJECTS,
  EXPECTED_PRIVILEGES,
  PRODUCTION_PROJECT_REF,
  SNAPSHOT_VERSION,
  STAGING_PROJECT_REF,
  validateSnapshot
} from './validate-design-task-staging-post-cleanup-snapshot.mjs';

function validSnapshot() {
  return {
    snapshot_version: SNAPSHOT_VERSION,
    project_ref: STAGING_PROJECT_REF,
    captured_at: '2026-07-14T10:55:52.829916+00:00',
    counts: { ...EXPECTED_COUNTS },
    objects: { ...EXPECTED_OBJECTS },
    privileges: { ...EXPECTED_PRIVILEGES }
  };
}

assert.equal(validateSnapshot(validSnapshot()).ok, true);
assert.equal(validateSnapshot({ snapshot: validSnapshot() }).ok, true);
assert.equal(validateSnapshot([{ snapshot: validSnapshot() }]).ok, true);

const leftoverAuth = validSnapshot();
leftoverAuth.counts.auth_users = 1;
assert.equal(validateSnapshot(leftoverAuth).ok, false);
assert.match(validateSnapshot(leftoverAuth).errors.join('\n'), /counts\.auth_users_invalid/);

const leftoverReceipt = validSnapshot();
leftoverReceipt.counts.receipts = 1;
assert.match(validateSnapshot(leftoverReceipt).errors.join('\n'), /counts\.receipts_invalid/);

const guardMissing = validSnapshot();
guardMissing.counts.environment_guard = 0;
assert.match(validateSnapshot(guardMissing).errors.join('\n'), /environment_guard_invalid/);

const rpcMissing = validSnapshot();
rpcMissing.objects.design_rpc_present = false;
assert.match(validateSnapshot(rpcMissing).errors.join('\n'), /design_rpc_present_invalid/);

const privilegeLeak = validSnapshot();
privilegeLeak.privileges.authenticated_direct_rpc_execute = true;
assert.match(validateSnapshot(privilegeLeak).errors.join('\n'), /authenticated_direct_rpc_execute_invalid/);

const privateColumnLeak = validSnapshot();
privateColumnLeak.privileges.authenticated_orders_client_phone_select = true;
assert.match(validateSnapshot(privateColumnLeak).errors.join('\n'), /authenticated_orders_client_phone_select_invalid/);

const wrongProject = validSnapshot();
wrongProject.project_ref = PRODUCTION_PROJECT_REF;
assert.match(validateSnapshot(wrongProject).errors.join('\n'), /project_ref_invalid/);
assert.match(validateSnapshot(wrongProject).errors.join('\n'), /production_ref_leaked/);

const secretLeak = validSnapshot();
secretLeak.unexpected = 'Bearer abcdefghijklmnopqrstuvwxyz123456';
const secretResult = validateSnapshot(secretLeak);
assert.equal(secretResult.ok, false);
assert.match(secretResult.errors.join('\n'), /top_level_keys_invalid/);
assert.match(secretResult.errors.join('\n'), /secret_like_value/);

const invalidTimestamp = validSnapshot();
invalidTimestamp.captured_at = 'not-a-date';
assert.match(validateSnapshot(invalidTimestamp).errors.join('\n'), /captured_at_invalid/);

const extraNested = validSnapshot();
extraNested.counts.extra = 0;
assert.match(validateSnapshot(extraNested).errors.join('\n'), /counts_keys_invalid/);

console.log('Staging post-cleanup snapshot validator rejects leftover data, missing guards, privilege drift and secret leakage.');
