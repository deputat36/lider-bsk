#!/usr/bin/env node

import { randomUUID } from 'node:crypto';

const EXPECTED_PROJECT_REF = 'otulfnouybahfnsycxqn';
const FUNCTION_SLUG = 'leader-crm-installation';
const READ_ACTION = 'installation_job.read';
const READ_PERMISSION = 'installation.read';
const UPDATE_ACTION = 'installation_job.update';
const UPDATE_PERMISSION = 'installation.write';

function env(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Missing required runtime environment variable: ${name}`);
  return value;
}

function projectRefFromUrl(value) {
  return new URL(value).hostname.split('.')[0] || '';
}

function requestBody(action, label) {
  const requestId = randomUUID();
  const jobId = randomUUID();
  if (action === READ_ACTION) {
    return {
      action,
      request_id: requestId,
      payload: { job_id: jobId },
    };
  }
  if (action === UPDATE_ACTION) {
    return {
      action,
      request_id: requestId,
      expected_updated_at: new Date().toISOString(),
      payload: {
        job_id: jobId,
        idempotency_key: `installation-user-jwt-smoke:${label}:${randomUUID()}`,
        patch: { title: `Installation user-JWT smoke ${label}` },
      },
    };
  }
  throw new Error(`Unsupported smoke action: ${action}`);
}

async function invoke({ baseUrl, publishableKey, token, action, label }) {
  const headers = {
    apikey: publishableKey,
    'Content-Type': 'application/json',
  };
  if (token !== null) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}/functions/v1/${FUNCTION_SLUG}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody(action, label)),
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

function assertForbiddenEvidence(result, action, permission, label) {
  if (result.body?.action !== action || result.body?.permission !== permission) {
    throw new Error(`${label}: action/permission evidence is missing`);
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

  const missing = await invoke({
    baseUrl, publishableKey, token: null, action: READ_ACTION, label: 'missing-jwt',
  });
  assertCase(missing, 401, 'missing_or_invalid_jwt', 'missing JWT');

  const invalid = await invoke({
    baseUrl, publishableKey, token: 'invalid.jwt.value', action: UPDATE_ACTION, label: 'invalid-jwt',
  });
  assertCase(invalid, 401, 'missing_or_invalid_jwt', 'invalid JWT');

  const forbiddenRead = await invoke({
    baseUrl, publishableKey, token: forbiddenJwt, action: READ_ACTION, label: 'forbidden-read',
  });
  assertCase(forbiddenRead, 403, 'forbidden', 'forbidden read role');
  assertForbiddenEvidence(forbiddenRead, READ_ACTION, READ_PERMISSION, 'forbidden read role');

  const forbiddenUpdate = await invoke({
    baseUrl, publishableKey, token: forbiddenJwt, action: UPDATE_ACTION, label: 'forbidden-update',
  });
  assertCase(forbiddenUpdate, 403, 'forbidden', 'forbidden update role');
  assertForbiddenEvidence(forbiddenUpdate, UPDATE_ACTION, UPDATE_PERMISSION, 'forbidden update role');

  const authorizedRead = await invoke({
    baseUrl, publishableKey, token: authorizedJwt, action: READ_ACTION, label: 'authorized-read-not-found',
  });
  assertCase(authorizedRead, 404, 'not_found', 'authorized read role');

  const authorizedUpdate = await invoke({
    baseUrl, publishableKey, token: authorizedJwt, action: UPDATE_ACTION, label: 'authorized-update-not-found',
  });
  assertCase(authorizedUpdate, 404, 'not_found', 'authorized update role');

  console.log(JSON.stringify({
    ok: true,
    project_ref: EXPECTED_PROJECT_REF,
    function: FUNCTION_SLUG,
    actions: {
      read: { action: READ_ACTION, permission: READ_PERMISSION },
      update: { action: UPDATE_ACTION, permission: UPDATE_PERMISSION },
    },
    cases: {
      missing_jwt: '401/missing_or_invalid_jwt',
      invalid_jwt: '401/missing_or_invalid_jwt',
      forbidden_read: '403/forbidden',
      forbidden_update: '403/forbidden',
      authorized_read: '404/not_found_after_permission_gate',
      authorized_update: '404/not_found_after_permission_gate',
    },
    persistent_fixture_expected: false,
    receipt_expected: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(`Installation user-JWT smoke failed: ${error.message}`);
  process.exitCode = 1;
});
