#!/usr/bin/env node

import { randomUUID } from 'node:crypto';

const EXPECTED_PROJECT_REF = 'otulfnouybahfnsycxqn';
const FUNCTION_SLUG = 'leader-crm-installation';
const ACTION = 'installation_job.update';
const PERMISSION = 'installation.write';

function env(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Missing required runtime environment variable: ${name}`);
  return value;
}

function projectRefFromUrl(value) {
  return new URL(value).hostname.split('.')[0] || '';
}

function requestBody(label) {
  return {
    action: ACTION,
    request_id: randomUUID(),
    expected_updated_at: new Date().toISOString(),
    payload: {
      job_id: randomUUID(),
      idempotency_key: `installation-user-jwt-smoke:${label}:${randomUUID()}`,
      patch: {
        title: `Installation user-JWT smoke ${label}`,
      },
    },
  };
}

async function invoke({ baseUrl, publishableKey, token, label }) {
  const headers = {
    apikey: publishableKey,
    'Content-Type': 'application/json',
  };
  if (token !== null) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}/functions/v1/${FUNCTION_SLUG}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody(label)),
  });

  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    throw new Error(`${label}: response is not JSON (HTTP ${response.status})`);
  }
  return { status: response.status, body };
}

function errorCode(body) {
  if (!body || typeof body !== 'object') return '';
  if (typeof body.error === 'string') return body.error;
  if (body.error && typeof body.error.code === 'string') return body.error.code;
  return '';
}

function assertCase(result, expectedStatus, expectedCode, label) {
  const actualCode = errorCode(result.body);
  if (result.status !== expectedStatus || actualCode !== expectedCode) {
    throw new Error(
      `${label}: expected HTTP ${expectedStatus}/${expectedCode}, got HTTP ${result.status}/${actualCode || 'no_error_code'}`,
    );
  }
}

async function main() {
  const baseUrl = env('STAGING_SUPABASE_URL').replace(/\/$/, '');
  const publishableKey = env('STAGING_SUPABASE_PUBLISHABLE_KEY');
  const authorizedJwt = env('STAGING_INSTALLATION_AUTHORIZED_USER_JWT');
  const forbiddenJwt = env('STAGING_INSTALLATION_FORBIDDEN_USER_JWT');

  if (projectRefFromUrl(baseUrl) !== EXPECTED_PROJECT_REF) {
    throw new Error(`Wrong project ref: expected ${EXPECTED_PROJECT_REF}`);
  }
  if (authorizedJwt === forbiddenJwt) {
    throw new Error('Authorized and forbidden JWT values must be different');
  }

  const missing = await invoke({ baseUrl, publishableKey, token: null, label: 'missing-jwt' });
  assertCase(missing, 401, 'missing_or_invalid_jwt', 'missing JWT');

  const invalid = await invoke({ baseUrl, publishableKey, token: 'invalid.jwt.value', label: 'invalid-jwt' });
  assertCase(invalid, 401, 'missing_or_invalid_jwt', 'invalid JWT');

  const forbidden = await invoke({ baseUrl, publishableKey, token: forbiddenJwt, label: 'forbidden-role' });
  assertCase(forbidden, 403, 'forbidden', 'forbidden role');
  if (forbidden.body?.action !== ACTION || forbidden.body?.permission !== PERMISSION) {
    throw new Error('forbidden role: action/permission evidence is missing');
  }

  const authorized = await invoke({ baseUrl, publishableKey, token: authorizedJwt, label: 'authorized-not-found' });
  assertCase(authorized, 404, 'not_found', 'authorized role');

  console.log(JSON.stringify({
    ok: true,
    project_ref: EXPECTED_PROJECT_REF,
    function: FUNCTION_SLUG,
    action: ACTION,
    permission: PERMISSION,
    cases: {
      missing_jwt: '401/missing_or_invalid_jwt',
      invalid_jwt: '401/missing_or_invalid_jwt',
      forbidden_role: '403/forbidden',
      authorized_role: '404/not_found_after_permission_gate',
    },
    persistent_fixture_expected: false,
    receipt_expected: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(`Installation user-JWT smoke failed: ${error.message}`);
  process.exitCode = 1;
});
