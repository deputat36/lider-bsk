#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn';
export const STAGING_URL = `https://${STAGING_PROJECT_REF}.supabase.co`;
export const PRODUCTION_PROJECT_REF = 'ofewxuqfjhamgerwzull';
export const FUNCTION_SLUG = 'leader-crm-installation';
export const MUTATION_CONFIRMATION = 'YES_DELETE_ALL_FIXTURES';
export const EVIDENCE_VERSION = 'leader-installation-auth-fixture-lifecycle-v1';

const READ_ACTION = 'installation_job.read';
const UPDATE_ACTION = 'installation_job.update';
const FORBIDDEN_EVIDENCE_KEYS = /password|token|authorization|apikey|api_key|secret|email/i;

function text(value) {
  return String(value ?? '').trim();
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value));
}

export function projectRefFromUrl(value) {
  try {
    return new URL(value).hostname.split('.')[0] || '';
  } catch (_) {
    return '';
  }
}

export function assertExactStagingUrl(value) {
  const normalized = text(value).replace(/\/+$/, '');
  if (normalized !== STAGING_URL || projectRefFromUrl(normalized) !== STAGING_PROJECT_REF) {
    throw new Error('staging_environment_guard_failed');
  }
  if (normalized.includes(PRODUCTION_PROJECT_REF)) throw new Error('production_endpoint_forbidden');
  return normalized;
}

export function isJwtApiKey(value) {
  return text(value).split('.').length === 3;
}

export function adminHeaders(secretKey, extra = {}) {
  const key = text(secretKey);
  if (!key) throw new Error('staging_secret_key_missing');
  const headers = {
    apikey: key,
    Accept: 'application/json',
    ...extra,
  };
  if (isJwtApiKey(key)) headers.Authorization = `Bearer ${key}`;
  return headers;
}

function required(name, env) {
  const value = text(env[name]);
  if (!value) throw new Error(`missing_environment_variable:${name}`);
  return value;
}

export function loadOperatorConfig(env = process.env) {
  const supabaseUrl = assertExactStagingUrl(required('STAGING_SUPABASE_URL', env));
  const publishableKey = required('STAGING_SUPABASE_PUBLISHABLE_KEY', env);
  const secretKey = required('STAGING_SUPABASE_SECRET_KEY', env);
  const confirmation = required('ALLOW_STAGING_AUTH_MUTATION', env);
  if (confirmation !== MUTATION_CONFIRMATION) throw new Error('staging_auth_mutation_not_confirmed');
  if (!secretKey.startsWith('sb_secret_') && !isJwtApiKey(secretKey)) {
    throw new Error('staging_secret_key_format_invalid');
  }
  return Object.freeze({
    supabaseUrl,
    publishableKey,
    secretKey,
    evidencePath: text(env.STAGING_EVIDENCE_PATH)
      || 'artifacts/installation-auth-fixture-lifecycle-evidence.json',
  });
}

function secureUuid(cryptoObject = globalThis.crypto) {
  const value = cryptoObject?.randomUUID?.() || randomUUID();
  if (!isUuid(value)) throw new Error('secure_uuid_unavailable');
  return value;
}

export function buildSyntheticIdentity(role, runId, cryptoObject = globalThis.crypto) {
  const normalizedRole = text(role).toLowerCase();
  if (!['installer', 'accountant'].includes(normalizedRole)) throw new Error('synthetic_role_invalid');
  if (!isUuid(runId)) throw new Error('run_id_invalid');
  const nonce = secureUuid(cryptoObject);
  return Object.freeze({
    role: normalizedRole,
    email: `leader-installation-smoke+${runId.slice(0, 8)}-${normalizedRole}-${nonce.slice(0, 8)}@example.invalid`,
    password: `L!${secureUuid(cryptoObject)}-${secureUuid(cryptoObject)}`,
    fullName: `Synthetic ${normalizedRole} installation smoke`,
  });
}

export function sanitizeEvidence(value) {
  if (Array.isArray(value)) return value.map(sanitizeEvidence);
  if (!asObject(value)) return value;
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_EVIDENCE_KEYS.test(key)) continue;
    output[key] = sanitizeEvidence(item);
  }
  return output;
}

async function readJson(response) {
  const raw = await response.text();
  if (!raw) return null;
  try { return JSON.parse(raw); }
  catch (_) { return { non_json_response: true }; }
}

async function request(fetchImpl, url, init, expectedStatuses) {
  const response = await fetchImpl(url, init);
  const body = await readJson(response);
  const allowed = Array.isArray(expectedStatuses) ? expectedStatuses : [expectedStatuses];
  return { status: response.status, ok: allowed.includes(response.status), body };
}

export async function createAdminUser(fetchImpl, config, identity) {
  const result = await request(
    fetchImpl,
    `${config.supabaseUrl}/auth/v1/admin/users`,
    {
      method: 'POST',
      headers: adminHeaders(config.secretKey, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        email: identity.email,
        password: identity.password,
        email_confirm: true,
        user_metadata: { purpose: 'leader-installation-auth-smoke', synthetic: true },
      }),
    },
    200,
  );
  const user = asObject(result.body);
  if (!result.ok || !isUuid(user?.id)) throw new Error(`auth_admin_create_failed:${result.status}`);
  return { id: user.id, role: identity.role };
}

export async function upsertProfile(fetchImpl, config, user, identity) {
  const url = new URL(`${config.supabaseUrl}/rest/v1/leader_user_profiles`);
  url.searchParams.set('on_conflict', 'user_id');
  const result = await request(
    fetchImpl,
    url.toString(),
    {
      method: 'POST',
      headers: adminHeaders(config.secretKey, {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      }),
      body: JSON.stringify([{
        user_id: user.id,
        email: identity.email,
        full_name: identity.fullName,
        role: identity.role,
        is_active: true,
        permissions: {},
      }]),
    },
    [200, 201, 204],
  );
  if (!result.ok) throw new Error(`profile_upsert_failed:${result.status}`);
}

export async function authenticate(fetchImpl, config, identity) {
  const result = await request(
    fetchImpl,
    `${config.supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: { apikey: config.publishableKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: identity.email, password: identity.password }),
    },
    200,
  );
  const body = asObject(result.body);
  if (!result.ok || !text(body?.access_token)) throw new Error(`authentication_failed:${result.status}`);
  return { accessToken: body.access_token };
}

function actionBody(action, label, cryptoObject = globalThis.crypto) {
  const requestId = secureUuid(cryptoObject);
  const jobId = secureUuid(cryptoObject);
  if (action === READ_ACTION) return { action, request_id: requestId, payload: { job_id: jobId } };
  if (action === UPDATE_ACTION) {
    return {
      action,
      request_id: requestId,
      expected_updated_at: new Date().toISOString(),
      payload: {
        job_id: jobId,
        idempotency_key: `installation-auth-lifecycle:${label}:${secureUuid(cryptoObject)}`,
        patch: { title: `Synthetic installation smoke ${label}` },
      },
    };
  }
  throw new Error('unsupported_action');
}

export async function invokeInstallation(fetchImpl, config, token, action, label, cryptoObject = globalThis.crypto) {
  const headers = { apikey: config.publishableKey, 'Content-Type': 'application/json' };
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  const result = await request(
    fetchImpl,
    `${config.supabaseUrl}/functions/v1/${FUNCTION_SLUG}`,
    { method: 'POST', headers, body: JSON.stringify(actionBody(action, label, cryptoObject)) },
    [401, 403, 404],
  );
  const body = asObject(result.body) || {};
  const nested = asObject(body.error);
  return {
    status: result.status,
    code: text(typeof body.error === 'string' ? body.error : nested?.code),
    action: text(body.action),
    permission: text(body.permission),
  };
}

function assertProbe(result, status, code, label) {
  if (result.status !== status || result.code !== code) {
    throw new Error(`${label}:expected_${status}_${code}:got_${result.status}_${result.code || 'none'}`);
  }
}

async function logout(fetchImpl, config, token) {
  if (!token) return true;
  const result = await request(
    fetchImpl,
    `${config.supabaseUrl}/auth/v1/logout`,
    {
      method: 'POST',
      headers: { apikey: config.publishableKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
    },
    [200, 204, 401],
  );
  return result.ok;
}

export async function deleteProfile(fetchImpl, config, userId) {
  if (!isUuid(userId)) return true;
  const url = new URL(`${config.supabaseUrl}/rest/v1/leader_user_profiles`);
  url.searchParams.set('user_id', `eq.${userId}`);
  const result = await request(
    fetchImpl,
    url.toString(),
    { method: 'DELETE', headers: adminHeaders(config.secretKey, { Prefer: 'return=minimal' }) },
    [200, 204],
  );
  return result.ok;
}

export async function deleteAdminUser(fetchImpl, config, userId) {
  if (!isUuid(userId)) return true;
  const result = await request(
    fetchImpl,
    `${config.supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    { method: 'DELETE', headers: adminHeaders(config.secretKey) },
    [200, 204, 404],
  );
  return result.ok;
}

export async function verifyProfileRemoved(fetchImpl, config, userId) {
  if (!isUuid(userId)) return true;
  const url = new URL(`${config.supabaseUrl}/rest/v1/leader_user_profiles`);
  url.searchParams.set('select', 'user_id');
  url.searchParams.set('user_id', `eq.${userId}`);
  const result = await request(
    fetchImpl,
    url.toString(),
    { method: 'GET', headers: adminHeaders(config.secretKey) },
    200,
  );
  return result.ok && Array.isArray(result.body) && result.body.length === 0;
}

export async function runLifecycle({
  fetchImpl = globalThis.fetch,
  config,
  cryptoObject = globalThis.crypto,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch_unavailable');
  if (!config) throw new Error('config_required');
  const startedAt = now();
  const runId = secureUuid(cryptoObject);
  const identities = [
    buildSyntheticIdentity('installer', runId, cryptoObject),
    buildSyntheticIdentity('accountant', runId, cryptoObject),
  ];
  const state = identities.map((identity) => ({ identity, user: null, session: null }));
  const probes = [];
  const cleanup = [];
  let primaryError = null;

  try {
    for (const entry of state) {
      entry.user = await createAdminUser(fetchImpl, config, entry.identity);
      await upsertProfile(fetchImpl, config, entry.user, entry.identity);
      entry.session = await authenticate(fetchImpl, config, entry.identity);
    }

    const installer = state.find((entry) => entry.identity.role === 'installer');
    const accountant = state.find((entry) => entry.identity.role === 'accountant');

    const missing = await invokeInstallation(fetchImpl, config, null, UPDATE_ACTION, 'missing-jwt', cryptoObject);
    assertProbe(missing, 401, 'missing_or_invalid_jwt', 'missing_jwt');
    probes.push({ name: 'missing_jwt', status: missing.status, code: missing.code });

    const invalid = await invokeInstallation(fetchImpl, config, 'invalid.jwt.value', UPDATE_ACTION, 'invalid-jwt', cryptoObject);
    assertProbe(invalid, 401, 'missing_or_invalid_jwt', 'invalid_jwt');
    probes.push({ name: 'invalid_jwt', status: invalid.status, code: invalid.code });

    for (const action of [READ_ACTION, UPDATE_ACTION]) {
      const denied = await invokeInstallation(fetchImpl, config, accountant.session.accessToken, action, `accountant-${action}`, cryptoObject);
      assertProbe(denied, 403, 'forbidden', `accountant_${action}`);
      probes.push({ name: `accountant_${action}`, status: denied.status, code: denied.code, action: denied.action, permission: denied.permission });

      const allowed = await invokeInstallation(fetchImpl, config, installer.session.accessToken, action, `installer-${action}`, cryptoObject);
      assertProbe(allowed, 404, 'not_found', `installer_${action}`);
      probes.push({ name: `installer_${action}`, status: allowed.status, code: allowed.code });
    }
  } catch (error) {
    primaryError = error;
  } finally {
    for (const entry of [...state].reverse()) {
      const logoutOk = await logout(fetchImpl, config, entry.session?.accessToken).catch(() => false);
      const profileDeleted = await deleteProfile(fetchImpl, config, entry.user?.id).catch(() => false);
      const userDeleted = await deleteAdminUser(fetchImpl, config, entry.user?.id).catch(() => false);
      const profileAbsent = await verifyProfileRemoved(fetchImpl, config, entry.user?.id).catch(() => false);
      cleanup.push({ role: entry.identity.role, logout_ok: logoutOk, profile_deleted: profileDeleted, user_deleted: userDeleted, profile_absent: profileAbsent });
    }
  }

  const cleanupPassed = cleanup.every((item) => item.logout_ok && item.profile_deleted && item.user_deleted && item.profile_absent);
  if (!cleanupPassed) throw new Error(`fixture_cleanup_failed${primaryError ? `;primary:${text(primaryError.message)}` : ''}`);
  if (primaryError) throw primaryError;

  return sanitizeEvidence({
    evidence_version: EVIDENCE_VERSION,
    project_ref: STAGING_PROJECT_REF,
    function: FUNCTION_SLUG,
    edge_contract: 'leader-crm-installation-edge-v2',
    started_at: startedAt,
    finished_at: now(),
    passed: true,
    roles: { authorized: 'installer', forbidden: 'accountant' },
    probes,
    cleanup,
    persistent_fixture_expected: false,
    receipt_expected: false,
    production_enabled: false,
  });
}

export function operatorPlan(env = process.env) {
  return {
    evidence_version: EVIDENCE_VERSION,
    project_ref: STAGING_PROJECT_REF,
    exact_staging_url: STAGING_URL,
    production_enabled: false,
    mutates_staging_auth_temporarily: true,
    creates_roles: ['installer', 'accountant'],
    always_cleanup: true,
    confirmation_required: MUTATION_CONFIRMATION,
    runtime_inputs_present: {
      publishable_key: Boolean(text(env.STAGING_SUPABASE_PUBLISHABLE_KEY)),
      secret_key: Boolean(text(env.STAGING_SUPABASE_SECRET_KEY)),
      confirmation: text(env.ALLOW_STAGING_AUTH_MUTATION) === MUTATION_CONFIRMATION,
    },
  };
}

async function writeEvidence(filePath, evidence) {
  const target = path.resolve(filePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(sanitizeEvidence(evidence), null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return target;
}

async function main() {
  const modeArg = process.argv.find((arg) => arg.startsWith('--mode='));
  const mode = modeArg ? modeArg.slice('--mode='.length) : 'plan';
  if (mode === 'plan') {
    console.log(JSON.stringify(operatorPlan(), null, 2));
    return;
  }
  if (mode !== 'run') throw new Error('unsupported_mode');
  const config = loadOperatorConfig();
  const evidence = await runLifecycle({ config });
  const evidencePath = await writeEvidence(config.evidencePath, evidence);
  console.log(JSON.stringify({ ok: true, project_ref: STAGING_PROJECT_REF, evidence_path: evidencePath, cleanup_complete: true }, null, 2));
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, project_ref: STAGING_PROJECT_REF, error: text(error?.message).slice(0, 300), cleanup_required: true }));
    process.exitCode = 1;
  });
}
