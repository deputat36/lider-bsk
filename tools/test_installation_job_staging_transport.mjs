import assert from 'node:assert/strict';
import {
  projectRefFromInstallationSupabaseUrl,
  isStagingInstallationEnvironment,
  installationStagingReadAvailability,
  installationStagingTransportAvailability,
  buildStagingInstallationJobReadCommand,
  buildStagingInstallationJobCommand,
  invokeStagingInstallationJobRead,
  invokeStagingInstallationJob
} from '../crm/v4/assets/v4/installation-job-staging-transport-v1.js';

const stagingUrl = 'https://otulfnouybahfnsycxqn.supabase.co';
const job = { id: '11111111-1111-4111-8111-111111111111' };
const requestId = '22222222-2222-4222-8222-222222222222';
const expectedUpdatedAt = '2026-07-21T20:00:00.000Z';
const idempotencyKey = `installation-job:${job.id}:${requestId}`;
const patch = {
  title: ' Монтаж вывески ',
  install_status: 'Запланирован',
  installer_name: '',
  scheduled_at: '2026-07-22T09:00:00+03:00'
};

assert.equal(projectRefFromInstallationSupabaseUrl(stagingUrl), 'otulfnouybahfnsycxqn');
assert.equal(isStagingInstallationEnvironment(stagingUrl), true);
assert.equal(isStagingInstallationEnvironment('https://evil.otulfnouybahfnsycxqn.supabase.co'), false);
assert.equal(isStagingInstallationEnvironment('https://ofewxuqfjhamgerwzull.supabase.co'), false);

const readAvailability = installationStagingReadAvailability({ supabaseUrl: stagingUrl, jobId: job.id });
assert.equal(readAvailability.enabled, true);
assert.equal(readAvailability.permission, 'installation.read');
assert.equal(installationStagingReadAvailability({ supabaseUrl: stagingUrl, jobId: 'bad' }).reason, 'job_missing');
assert.equal(installationStagingReadAvailability({ supabaseUrl: 'https://ofewxuqfjhamgerwzull.supabase.co', jobId: job.id }).reason, 'production_locked');

const readCommand = buildStagingInstallationJobReadCommand({ jobId: job.id, requestId });
assert.deepEqual(readCommand, {
  action: 'installation_job.read',
  request_id: requestId,
  payload: { job_id: job.id }
});
assert.throws(() => buildStagingInstallationJobReadCommand({ jobId: 'bad', requestId }), /job_id_invalid/);

const availability = installationStagingTransportAvailability({
  supabaseUrl: stagingUrl,
  canWrite: true,
  job,
  patch,
  expectedUpdatedAt
});
assert.equal(availability.enabled, true);
assert.equal(availability.functionSlug, 'leader-crm-installation');
assert.equal(availability.permission, 'installation.write');
assert.equal(installationStagingTransportAvailability({ supabaseUrl: stagingUrl, canWrite: false, job, patch, expectedUpdatedAt }).reason, 'forbidden');
assert.equal(installationStagingTransportAvailability({ supabaseUrl: 'https://ofewxuqfjhamgerwzull.supabase.co', canWrite: true, job, patch, expectedUpdatedAt }).reason, 'production_locked');

const command = buildStagingInstallationJobCommand({ job, patch, expectedUpdatedAt, requestId, idempotencyKey });
assert.equal(command.action, 'installation_job.update');
assert.equal(command.payload.job_id, job.id);
assert.equal(command.payload.idempotency_key, idempotencyKey);
assert.equal(command.payload.patch.title, 'Монтаж вывески');
assert.equal(command.payload.patch.installer_name, null);
assert.equal(command.payload.patch.scheduled_at, '2026-07-22T06:00:00.000Z');
assert.equal('updated_by' in command.payload.patch, false);
assert.throws(() => buildStagingInstallationJobCommand({ job, patch: { updated_by: job.id }, expectedUpdatedAt, requestId, idempotencyKey }), /patch_field_not_allowed/);

const cryptoObject = { randomUUID: () => requestId };
const noSessionClient = {
  auth: { getSession: async () => ({ data: { session: null } }) },
  functions: { invoke: async () => ({}) }
};
const missingReadSession = await invokeStagingInstallationJobRead({
  client: noSessionClient,
  supabaseUrl: stagingUrl,
  jobId: job.id,
  cryptoObject
});
assert.equal(missingReadSession.status, 401);
assert.equal(missingReadSession.kind, 'auth_required');

let readInvokedName = '';
let readInvokedBody = null;
const readSuccess = await invokeStagingInstallationJobRead({
  client: {
    auth: { getSession: async () => ({ data: { session: { access_token: 'runtime-only' } } }) },
    functions: { invoke: async (name, options) => {
      readInvokedName = name;
      readInvokedBody = options.body;
      return {
        data: {
          ok: true,
          request_id: requestId,
          capabilities: { can_read: true, can_write: true },
          entity: { id: job.id, updated_at: expectedUpdatedAt },
          order: null,
          production: null,
          items: [],
          events: [],
          comments: []
        },
        error: null
      };
    } }
  },
  supabaseUrl: stagingUrl,
  jobId: job.id,
  cryptoObject
});
assert.equal(readInvokedName, 'leader-crm-installation');
assert.equal(readInvokedBody.action, 'installation_job.read');
assert.equal(readSuccess.ok, true);
assert.equal(readSuccess.status, 200);
assert.equal(readSuccess.data.capabilities.can_write, true);

const invalidProjection = await invokeStagingInstallationJobRead({
  client: {
    auth: { getSession: async () => ({ data: { session: { access_token: 'runtime-only' } } }) },
    functions: { invoke: async () => ({ data: { ok: true, capabilities: { can_read: false }, entity: { id: job.id } }, error: null }) }
  },
  supabaseUrl: stagingUrl,
  jobId: job.id,
  cryptoObject
});
assert.equal(invalidProjection.kind, 'read_failed');
assert.equal(invalidProjection.code, 'invalid_read_projection');

const missingSession = await invokeStagingInstallationJob({
  client: noSessionClient,
  supabaseUrl: stagingUrl,
  canWrite: true,
  job,
  patch,
  expectedUpdatedAt,
  idempotencyKey,
  cryptoObject
});
assert.equal(missingSession.status, 401);
assert.equal(missingSession.kind, 'auth_required');

let invokedName = '';
let invokedBody = null;
const success = await invokeStagingInstallationJob({
  client: {
    auth: { getSession: async () => ({ data: { session: { access_token: 'runtime-only' } } }) },
    functions: { invoke: async (name, options) => {
      invokedName = name;
      invokedBody = options.body;
      return { data: { ok: true, request_id: requestId, idempotent_replay: true, entity: { id: job.id } }, error: null };
    } }
  },
  supabaseUrl: stagingUrl,
  canWrite: true,
  job,
  patch,
  expectedUpdatedAt,
  idempotencyKey,
  cryptoObject,
  readAfterSuccess: async () => ({ refreshed: true })
});
assert.equal(invokedName, 'leader-crm-installation');
assert.equal(invokedBody.action, 'installation_job.update');
assert.equal(success.ok, true);
assert.equal(success.replay, true);
assert.equal(success.status, 200);
assert.deepEqual(success.refreshed, { refreshed: true });

const wrongEnvironment = await invokeStagingInstallationJob({
  client: {},
  supabaseUrl: 'https://ofewxuqfjhamgerwzull.supabase.co',
  canWrite: true,
  job,
  patch,
  expectedUpdatedAt,
  idempotencyKey,
  cryptoObject
});
assert.equal(wrongEnvironment.kind, 'wrong_environment');
assert.equal(wrongEnvironment.status, 503);

const forbidden = await invokeStagingInstallationJob({
  client: {
    auth: { getSession: async () => ({ data: { session: { access_token: 'runtime-only' } } }) },
    functions: { invoke: async () => ({ data: { ok: false, error: { code: 'forbidden' } }, error: null }) }
  },
  supabaseUrl: stagingUrl,
  canWrite: true,
  job,
  patch,
  expectedUpdatedAt,
  idempotencyKey,
  cryptoObject
});
assert.equal(forbidden.kind, 'forbidden');

console.log('Installation job staging read/update transport tests passed.');
