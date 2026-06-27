#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const SUPABASE_URL = 'https://ofewxuqfjhamgerwzull.supabase.co';
const DEAL_ID = '00000000-0000-0000-0000-000000000000';
const PUBLIC_API_KEY = 'sb_publishable_ZiX8_Mnf0dY6S__tKO2A4A_uD94G2cs';

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function fakeJwt(payload) {
  return [
    base64urlJson({ alg: 'none', typ: 'JWT' }),
    base64urlJson(payload),
    'synthetic-signature',
  ].join('.');
}

function accessPayload(overrides = {}) {
  return {
    iss: `${SUPABASE_URL}/auth/v1`,
    aud: 'authenticated',
    role: 'authenticated',
    sub: '00000000-0000-0000-0000-000000000001',
    exp: Math.floor(Date.now() / 1000) + 3600,
    is_anonymous: false,
    ...overrides,
  };
}

function serviceRoleApiKey() {
  return fakeJwt({ role: 'service_role' });
}

function secretApiKey() {
  return 'sb_' + 'secret_' + 'synthetic_test_key';
}

function runSmoke(env) {
  return spawnSync(process.execPath, ['tools/nav_v2_deal_api_smoke_test.mjs'], {
    env: {
      ...process.env,
      NAV_V2_SUPABASE_URL: SUPABASE_URL,
      NAV_V2_DEAL_ID: DEAL_ID,
      NAV_V2_API_KEY: PUBLIC_API_KEY,
      ...env,
    },
    encoding: 'utf8',
  });
}

function expectPreflightFailure(name, env, expectedMessage) {
  const result = runSmoke(env);
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (result.status === 0) {
    throw new Error(`${name}: expected failure, got success`);
  }
  if (!output.includes(expectedMessage)) {
    throw new Error(`${name}: expected message ${JSON.stringify(expectedMessage)}, got ${JSON.stringify(output)}`);
  }
}

expectPreflightFailure('malformed jwt', {
  NAV_V2_JWT: 'not-a-jwt',
}, 'NAV_V2_JWT must be a JWT access token');

expectPreflightFailure('wrong issuer', {
  NAV_V2_JWT: fakeJwt(accessPayload({ iss: 'https://other-project.supabase.co/auth/v1' })),
}, 'NAV_V2_JWT issuer must match NAV_V2_SUPABASE_URL');

expectPreflightFailure('wrong audience', {
  NAV_V2_JWT: fakeJwt(accessPayload({ aud: 'anon' })),
}, 'NAV_V2_JWT audience must be authenticated');

expectPreflightFailure('wrong role', {
  NAV_V2_JWT: fakeJwt(accessPayload({ role: 'service_role' })),
}, 'NAV_V2_JWT must be a user access token with role=authenticated');

expectPreflightFailure('anonymous user', {
  NAV_V2_JWT: fakeJwt(accessPayload({ is_anonymous: true })),
}, 'NAV_V2_JWT must not be an anonymous user token');

expectPreflightFailure('missing subject', {
  NAV_V2_JWT: fakeJwt(accessPayload({ sub: '' })),
}, 'NAV_V2_JWT must include a user subject claim');

expectPreflightFailure('expired token', {
  NAV_V2_JWT: fakeJwt(accessPayload({ exp: Math.floor(Date.now() / 1000) - 10 })),
}, 'NAV_V2_JWT must not be expired');

expectPreflightFailure('secret api key', {
  NAV_V2_JWT: fakeJwt(accessPayload()),
  NAV_V2_API_KEY: secretApiKey(),
}, 'NAV_V2_API_KEY must be a publishable/anon key, not a secret key');

expectPreflightFailure('service-role api key jwt', {
  NAV_V2_JWT: fakeJwt(accessPayload()),
  NAV_V2_API_KEY: serviceRoleApiKey(),
}, 'NAV_V2_API_KEY must not be a service_role JWT');

console.log(JSON.stringify({ ok: true, cases: 9 }, null, 2));
