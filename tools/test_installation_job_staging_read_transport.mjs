#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  installationReadBundle,
  installationStagingReadAvailability,
  invokeStagingInstallationJobRead,
  isExactInstallationStagingUrl
} from '../crm/v4/assets/v4/installation-job-staging-read-transport-v1.js';

const STAGING_URL = 'https://otulfnouybahfnsycxqn.supabase.co';
const JOB_ID = '11111111-1111-4111-8111-111111111111';
const REQUEST_ID = '22222222-2222-4222-8222-222222222222';

assert.equal(isExactInstallationStagingUrl(STAGING_URL), true);
assert.equal(isExactInstallationStagingUrl('https://ofewxuqfjhamgerwzull.supabase.co'), false);
assert.equal(isExactInstallationStagingUrl('https://evil.otulfnouybahfnsycxqn.supabase.co'), false);
assert.equal(isExactInstallationStagingUrl('not-a-url'), false);

assert.deepEqual(
  installationStagingReadAvailability({ supabaseUrl: STAGING_URL, canRead: true, jobId: JOB_ID }),
  {
    enabled: true,
    staging: true,
    reason: '',
    functionSlug: 'leader-crm-installation',
    action: 'installation_job.read',
    permission: 'installation.read'
  }
);
assert.equal(installationStagingReadAvailability({ supabaseUrl: STAGING_URL, canRead: false, jobId: JOB_ID }).reason, 'forbidden');
assert.equal(installationStagingReadAvailability({ supabaseUrl: STAGING_URL, canRead: true, jobId: 'bad' }).reason, 'job_id_invalid');
assert.equal(installationStagingReadAvailability({ supabaseUrl: 'https://ofewxuqfjhamgerwzull.supabase.co', canRead: true, jobId: JOB_ID }).reason, 'production_locked');

const sourceBundle = {
  ok: true,
  entity: { id: JOB_ID, title: 'Монтаж', updated_at: '2026-07-22T06:00:00Z' },
  order: { id: '33333333-3333-4333-8333-333333333333', installation_status: 'Запланирован' },
  production: null,
  items: [{ id: '44444444-4444-4444-8444-444444444444', name: 'Вывеска' }],
  events: [],
  comments: []
};
const bundle = installationReadBundle(sourceBundle);
assert.equal(bundle.job.id, JOB_ID);
assert.equal(bundle.order.installation_status, 'Запланирован');
assert.equal(bundle.items.length, 1);
assert.throws(() => installationReadBundle({ ok: true, entity: { id: 'bad' } }), /read_bundle_invalid/);

function cryptoMock() {
  return { randomUUID: () => REQUEST_ID };
}

function successClient() {
  const calls = [];
  return {
    calls,
    auth: {
      async getSession() {
        return { data: { session: { access_token: 'user-token' } }, error: null };
      }
    },
    functions: {
      async invoke(slug, options) {
        calls.push({ slug, options });
        return { data: { ...sourceBundle, request_id: REQUEST_ID }, error: null };
      }
    }
  };
}

const okClient = successClient();
const success = await invokeStagingInstallationJobRead({
  client: okClient,
  supabaseUrl: STAGING_URL,
  canRead: true,
  jobId: JOB_ID,
  cryptoObject: cryptoMock()
});
assert.equal(success.ok, true);
assert.equal(success.status, 200);
assert.equal(success.kind, 'loaded');
assert.equal(success.bundle.job.id, JOB_ID);
assert.equal(okClient.calls.length, 1);
assert.equal(okClient.calls[0].slug, 'leader-crm-installation');
assert.deepEqual(okClient.calls[0].options.body, {
  action: 'installation_job.read',
  request_id: REQUEST_ID,
  payload: { job_id: JOB_ID }
});

let sessionRead = false;
const locked = await invokeStagingInstallationJobRead({
  client: {
    auth: { async getSession() { sessionRead = true; return { data: { session: null } }; } },
    functions: { async invoke() { throw new Error('must not invoke'); } }
  },
  supabaseUrl: 'https://ofewxuqfjhamgerwzull.supabase.co',
  canRead: true,
  jobId: JOB_ID,
  cryptoObject: cryptoMock()
});
assert.equal(locked.kind, 'wrong_environment');
assert.equal(sessionRead, false);

const noSession = await invokeStagingInstallationJobRead({
  client: {
    auth: { async getSession() { return { data: { session: null }, error: null }; } },
    functions: { async invoke() { throw new Error('must not invoke'); } }
  },
  supabaseUrl: STAGING_URL,
  canRead: true,
  jobId: JOB_ID,
  cryptoObject: cryptoMock()
});
assert.equal(noSession.status, 401);
assert.equal(noSession.kind, 'auth_required');

const forbidden = await invokeStagingInstallationJobRead({
  client: {
    auth: { async getSession() { return { data: { session: { access_token: 'user-token' } }, error: null }; } },
    functions: {
      async invoke() {
        return { data: { error: { code: 'forbidden' } }, error: null };
      }
    }
  },
  supabaseUrl: STAGING_URL,
  canRead: true,
  jobId: JOB_ID,
  cryptoObject: cryptoMock()
});
assert.equal(forbidden.kind, 'forbidden');

const invalidBundle = await invokeStagingInstallationJobRead({
  client: {
    auth: { async getSession() { return { data: { session: { access_token: 'user-token' } }, error: null }; } },
    functions: { async invoke() { return { data: { ok: true, entity: { id: 'bad' } }, error: null }; } }
  },
  supabaseUrl: STAGING_URL,
  canRead: true,
  jobId: JOB_ID,
  cryptoObject: cryptoMock()
});
assert.equal(invalidBundle.kind, 'read_failed');
assert.equal(invalidBundle.code, 'read_bundle_invalid');

console.log('Installation job staging read transport tests passed.');
