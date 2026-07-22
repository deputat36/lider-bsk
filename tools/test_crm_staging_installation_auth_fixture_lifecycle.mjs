#!/usr/bin/env node

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  MUTATION_CONFIRMATION,
  STAGING_URL,
  adminHeaders,
  assertExactStagingUrl,
  buildSyntheticIdentity,
  loadOperatorConfig,
  operatorPlan,
  runLifecycle,
  sanitizeEvidence,
} from './run_crm_staging_installation_auth_fixture_lifecycle.mjs';

function response(status, body = null) {
  return {
    status,
    async text() {
      if (body === null || body === undefined) return '';
      return JSON.stringify(body);
    },
  };
}

assert.equal(assertExactStagingUrl(STAGING_URL), STAGING_URL);
for (const rejected of [
  'https://ofewxuqfjhamgerwzull.supabase.co',
  'https://evil.otulfnouybahfnsycxqn.supabase.co',
  'https://otulfnouybahfnsycxqn.supabase.co.evil.example',
  '',
]) {
  assert.throws(() => assertExactStagingUrl(rejected), /staging_environment_guard_failed|production_endpoint_forbidden/);
}

const modernHeaders = adminHeaders('sb_secret_test_key');
assert.equal(modernHeaders.apikey, 'sb_secret_test_key');
assert.equal(Object.prototype.hasOwnProperty.call(modernHeaders, 'Authorization'), false);

const legacyKey = 'aaa.bbb.ccc';
const legacyHeaders = adminHeaders(legacyKey);
assert.equal(legacyHeaders.Authorization, `Bearer ${legacyKey}`);

const config = loadOperatorConfig({
  STAGING_SUPABASE_URL: STAGING_URL,
  STAGING_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  STAGING_SUPABASE_SECRET_KEY: 'sb_secret_test',
  ALLOW_STAGING_AUTH_MUTATION: MUTATION_CONFIRMATION,
});
assert.equal(config.supabaseUrl, STAGING_URL);
assert.throws(() => loadOperatorConfig({
  STAGING_SUPABASE_URL: STAGING_URL,
  STAGING_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  STAGING_SUPABASE_SECRET_KEY: 'sb_secret_test',
  ALLOW_STAGING_AUTH_MUTATION: 'NO',
}), /staging_auth_mutation_not_confirmed/);

const runId = randomUUID();
const installerIdentity = buildSyntheticIdentity('installer', runId, { randomUUID });
const accountantIdentity = buildSyntheticIdentity('accountant', runId, { randomUUID });
assert.match(installerIdentity.email, /@example\.invalid$/);
assert.match(accountantIdentity.email, /@example\.invalid$/);
assert.notEqual(installerIdentity.email, accountantIdentity.email);
assert.ok(installerIdentity.password.length > 40);

const sanitized = sanitizeEvidence({
  password: 'forbidden',
  token: 'forbidden',
  nested: { apiKey: 'forbidden', safe: true },
  safe: 'kept',
});
assert.deepEqual(sanitized, { nested: { safe: true }, safe: 'kept' });

const plan = operatorPlan({});
assert.equal(plan.production_enabled, false);
assert.equal(plan.always_cleanup, true);
assert.equal(plan.runtime_inputs_present.secret_key, false);

const createdUsers = [];
const deletedUsers = [];
const deletedProfiles = [];
const logouts = [];
let userCounter = 0;
const ids = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
];

async function mockFetch(urlValue, init = {}) {
  const url = new URL(urlValue);
  const method = String(init.method || 'GET').toUpperCase();

  if (url.pathname === '/auth/v1/admin/users' && method === 'POST') {
    const body = JSON.parse(init.body);
    const id = ids[userCounter++];
    createdUsers.push({ id, role: body.email.includes('installer') ? 'installer' : 'accountant' });
    return response(200, { id });
  }

  if (url.pathname === '/rest/v1/leader_user_profiles' && method === 'POST') {
    return response(201, null);
  }

  if (url.pathname === '/auth/v1/token' && method === 'POST') {
    const body = JSON.parse(init.body);
    const role = body.email.includes('installer') ? 'installer' : 'accountant';
    return response(200, { access_token: `token-${role}` });
  }

  if (url.pathname === '/functions/v1/leader-crm-installation' && method === 'POST') {
    const authorization = String(init.headers?.Authorization || '');
    const command = JSON.parse(init.body);
    const permission = command.action === 'installation_job.read' ? 'installation.read' : 'installation.write';
    if (!authorization || authorization === 'Bearer invalid.jwt.value') {
      return response(401, { error: 'missing_or_invalid_jwt' });
    }
    if (authorization === 'Bearer token-accountant') {
      return response(403, { error: 'forbidden', action: command.action, permission });
    }
    if (authorization === 'Bearer token-installer') {
      return response(404, { ok: false, error: { code: 'not_found', message: 'not_found' } });
    }
    return response(500, { error: 'unexpected_token' });
  }

  if (url.pathname === '/auth/v1/logout' && method === 'POST') {
    logouts.push(String(init.headers?.Authorization || ''));
    return response(204, null);
  }

  if (url.pathname === '/rest/v1/leader_user_profiles' && method === 'DELETE') {
    deletedProfiles.push(url.searchParams.get('user_id'));
    return response(204, null);
  }

  if (url.pathname.startsWith('/auth/v1/admin/users/') && method === 'DELETE') {
    deletedUsers.push(url.pathname.split('/').pop());
    return response(204, null);
  }

  if (url.pathname === '/rest/v1/leader_user_profiles' && method === 'GET') {
    return response(200, []);
  }

  throw new Error(`Unexpected mock request: ${method} ${url.pathname}`);
}

const evidence = await runLifecycle({
  fetchImpl: mockFetch,
  config,
  cryptoObject: { randomUUID },
  now: () => '2026-07-22T00:00:00.000Z',
});

assert.equal(evidence.passed, true);
assert.equal(evidence.probes.length, 6);
assert.deepEqual(evidence.probes.map((probe) => probe.status), [401, 401, 403, 404, 403, 404]);
assert.equal(createdUsers.length, 2);
assert.equal(deletedUsers.length, 2);
assert.equal(deletedProfiles.length, 2);
assert.equal(logouts.length, 2);
assert.equal(evidence.cleanup.every((item) => item.user_deleted && item.profile_deleted && item.profile_absent), true);
assert.equal(JSON.stringify(evidence).includes('token-installer'), false);
assert.equal(JSON.stringify(evidence).includes('@example.invalid'), false);

console.log('Installation staging Auth fixture lifecycle tests passed.');
