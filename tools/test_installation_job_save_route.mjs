import assert from 'node:assert/strict';
import {
  installationJobPersistenceRoute,
  createInstallationJobIdempotencyKey
} from '../crm/v4/assets/v4/installation-job-save-route-v1.js';

const staging = installationJobPersistenceRoute('https://otulfnouybahfnsycxqn.supabase.co');
assert.equal(staging.mode, 'staging_edge');
assert.equal(staging.enabled, true);
assert.equal(staging.atomic, true);
assert.equal(staging.browserDirectWrite, false);

for (const url of [
  'https://ofewxuqfjhamgerwzull.supabase.co',
  'https://evil.otulfnouybahfnsycxqn.supabase.co',
  'not-a-url',
  ''
]) {
  const route = installationJobPersistenceRoute(url);
  assert.equal(route.mode, 'production_legacy');
  assert.equal(route.enabled, true);
  assert.equal(route.atomic, false);
  assert.equal(route.browserDirectWrite, true);
  assert.equal(route.reason, 'existing_production_path');
}

const jobId = '11111111-1111-4111-8111-111111111111';
const randomId = '22222222-2222-4222-8222-222222222222';
assert.equal(
  createInstallationJobIdempotencyKey(jobId, { randomUUID: () => randomId }),
  `installation-job:${jobId}:${randomId}`
);
assert.throws(() => createInstallationJobIdempotencyKey('bad', { randomUUID: () => randomId }), /job_id_invalid/);
assert.throws(() => createInstallationJobIdempotencyKey(jobId, { randomUUID: () => 'bad' }), /secure_request_id_unavailable/);

console.log('Installation job save route tests passed.');
