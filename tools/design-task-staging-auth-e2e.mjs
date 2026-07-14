#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn';
export const STAGING_URL = `https://${STAGING_PROJECT_REF}.supabase.co`;
export const PRODUCTION_PROJECT_REF = 'ofewxuqfjhamgerwzull';
export const FUNCTION_SLUG = 'leader-crm-design';
export const ACTION = 'design_task.create_from_order';
export const EVIDENCE_VERSION = 'leader-design-task-staging-auth-e2e-evidence-v1';

export const SAFE_PROJECTIONS = Object.freeze({
  leader_orders: Object.freeze([
    'id', 'order_number', 'lead_id', 'project_name', 'status', 'priority',
    'deadline', 'layout_status', 'layout_link', 'is_archived', 'updated_at'
  ]),
  leader_lead_needs: Object.freeze([
    'id', 'lead_id', 'need_type', 'title', 'need_design', 'design_reason',
    'deadline_date', 'status', 'completeness_score'
  ]),
  leader_design_tasks: Object.freeze([
    'id', 'order_id', 'task_status', 'layout_status', 'designer_name',
    'deadline', 'layout_link', 'created_at'
  ])
});

const FORBIDDEN_EVIDENCE_KEYS = /password|token|authorization|apikey|api_key|secret|email|phone|client|profit|cost|payment|balance|comment|task_text/i;
const SAFE_TASK_RESPONSE_FIELDS = new Set([
  'id', 'order_id', 'task_status', 'layout_status', 'priority', 'deadline', 'created_at'
]);

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

function required(name, env) {
  const value = text(env[name]);
  if (!value) throw new Error(`missing_environment_variable:${name}`);
  return value;
}

export function loadOperatorConfig(env = process.env) {
  const supabaseUrl = assertExactStagingUrl(required('STAGING_SUPABASE_URL', env));
  const publishableKey = required('STAGING_SUPABASE_PUBLISHABLE_KEY', env);
  const email = required('STAGING_TEST_EMAIL', env);
  const password = required('STAGING_TEST_PASSWORD', env);
  const orderId = required('STAGING_ORDER_ID', env);
  const needId = required('STAGING_NEED_ID', env);
  const expectedUpdatedAt = required('STAGING_EXPECTED_UPDATED_AT', env);
  const idempotencyKey = required('STAGING_IDEMPOTENCY_KEY', env);
  const taskTitle = text(env.STAGING_TASK_TITLE) || 'Synthetic staging design E2E';
  const evidencePath = text(env.STAGING_EVIDENCE_PATH)
    || 'artifacts/design-task-staging-auth-e2e-evidence.json';

  if (!isUuid(orderId)) throw new Error('order_id_invalid');
  if (!isUuid(needId)) throw new Error('need_id_invalid');
  if (!Number.isFinite(Date.parse(expectedUpdatedAt))) throw new Error('expected_updated_at_invalid');
  if (idempotencyKey.length > 180) throw new Error('idempotency_key_invalid');
  if (taskTitle.length > 300) throw new Error('task_title_invalid');

  return Object.freeze({
    supabaseUrl,
    publishableKey,
    email,
    password,
    orderId,
    needId,
    expectedUpdatedAt: new Date(expectedUpdatedAt).toISOString(),
    idempotencyKey,
    taskTitle,
    evidencePath
  });
}

export function buildDesignCommand({
  orderId,
  needId,
  expectedUpdatedAt,
  idempotencyKey,
  taskTitle,
  requestId,
  keySuffix = '',
  titleSuffix = ''
}) {
  if (!isUuid(orderId) || !isUuid(needId) || !isUuid(requestId)) throw new Error('command_uuid_invalid');
  if (!Number.isFinite(Date.parse(expectedUpdatedAt))) throw new Error('command_timestamp_invalid');
  const key = `${text(idempotencyKey)}${keySuffix}`.slice(0, 180);
  const title = `${text(taskTitle)}${titleSuffix}`.slice(0, 300);
  if (!key || !title) throw new Error('command_text_invalid');

  return Object.freeze({
    action: ACTION,
    request_id: requestId,
    expected_updated_at: new Date(expectedUpdatedAt).toISOString(),
    payload: Object.freeze({
      order_id: orderId,
      production_job_id: null,
      idempotency_key: key,
      need_ids: Object.freeze([needId]),
      task: Object.freeze({
        title,
        priority: 'Обычный',
        deadline: null,
        task_text: 'Synthetic staging authenticated E2E only',
        reference_link: 'https://example.invalid/staging-design-e2e'
      })
    })
  });
}

function randomUuid(cryptoObject = globalThis.crypto) {
  const value = cryptoObject?.randomUUID?.();
  if (!isUuid(value)) throw new Error('secure_request_id_unavailable');
  return value;
}

function safeErrorBody(body) {
  const source = asObject(body) || {};
  const nested = asObject(source.error);
  return {
    ok: source.ok === true,
    request_id: isUuid(source.request_id) ? source.request_id : null,
    error: nested
      ? {
          code: text(nested.code).slice(0, 80) || null,
          message: text(nested.message).slice(0, 300) || null
        }
      : typeof source.error === 'string'
        ? { code: text(source.error).slice(0, 80), message: null }
        : null
  };
}

function safeSuccessBody(body) {
  const source = asObject(body) || {};
  const taskSource = asObject(source.task) || {};
  const task = {};
  for (const field of SAFE_TASK_RESPONSE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(taskSource, field)) task[field] = taskSource[field];
  }
  return {
    ok: source.ok === true,
    request_id: isUuid(source.request_id) ? source.request_id : null,
    idempotent_replay: source.idempotent_replay === true,
    task
  };
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
  try {
    return JSON.parse(raw);
  } catch (_) {
    return { non_json_response: true };
  }
}

async function request(fetchImpl, url, init, expectedStatuses) {
  const response = await fetchImpl(url, init);
  const body = await readJson(response);
  const allowed = Array.isArray(expectedStatuses) ? expectedStatuses : [expectedStatuses];
  return { status: response.status, ok: allowed.includes(response.status), body };
}

function authHeaders(config, accessToken = '') {
  const headers = {
    apikey: config.publishableKey,
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
}

export async function authenticate(fetchImpl, config) {
  const result = await request(
    fetchImpl,
    `${config.supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: authHeaders(config),
      body: JSON.stringify({ email: config.email, password: config.password })
    },
    200
  );
  const body = asObject(result.body) || {};
  if (!result.ok || !text(body.access_token) || !text(body.refresh_token)) {
    throw new Error(`authentication_failed:${result.status}`);
  }
  return Object.freeze({ accessToken: body.access_token, refreshToken: body.refresh_token });
}

export async function verifyAuthenticatedUser(fetchImpl, config, accessToken) {
  const result = await request(
    fetchImpl,
    `${config.supabaseUrl}/auth/v1/user`,
    { method: 'GET', headers: authHeaders(config, accessToken) },
    200
  );
  const user = asObject(result.body);
  if (!result.ok || !isUuid(user?.id)) throw new Error(`auth_user_verification_failed:${result.status}`);
  return { status: result.status, verified: true };
}

function restUrl(config, table, projection, filters = {}) {
  if (!Object.prototype.hasOwnProperty.call(SAFE_PROJECTIONS, table)) throw new Error('table_not_allowlisted');
  const expected = SAFE_PROJECTIONS[table];
  if (projection.join(',') !== expected.join(',')) throw new Error('projection_not_allowlisted');
  const url = new URL(`${config.supabaseUrl}/rest/v1/${table}`);
  url.searchParams.set('select', projection.join(','));
  for (const [key, value] of Object.entries(filters)) url.searchParams.set(key, value);
  return url.toString();
}

export async function safeRead(fetchImpl, config, accessToken, table, filters) {
  const projection = SAFE_PROJECTIONS[table];
  const result = await request(
    fetchImpl,
    restUrl(config, table, projection, filters),
    { method: 'GET', headers: authHeaders(config, accessToken) },
    200
  );
  if (!result.ok || !Array.isArray(result.body)) throw new Error(`safe_read_failed:${table}:${result.status}`);
  for (const row of result.body) {
    const unexpected = Object.keys(asObject(row) || {}).filter((key) => !projection.includes(key));
    if (unexpected.length) throw new Error(`unsafe_projection_returned:${table}:${unexpected.join(',')}`);
  }
  return { status: result.status, rows: result.body, columns: [...projection] };
}

export async function invokeDesignEdge(fetchImpl, config, accessToken, command, expectedStatuses) {
  const result = await request(
    fetchImpl,
    `${config.supabaseUrl}/functions/v1/${FUNCTION_SLUG}`,
    {
      method: 'POST',
      headers: authHeaders(config, accessToken),
      body: JSON.stringify(command)
    },
    expectedStatuses
  );
  return {
    status: result.status,
    ok: result.ok,
    body: result.status >= 400 ? safeErrorBody(result.body) : safeSuccessBody(result.body)
  };
}

export async function logoutCurrentSession(fetchImpl, config, accessToken) {
  return await request(
    fetchImpl,
    `${config.supabaseUrl}/auth/v1/logout`,
    { method: 'POST', headers: authHeaders(config, accessToken), body: '{}' },
    [200, 204]
  );
}

function assertStep(condition, code) {
  if (!condition) throw new Error(code);
}

export async function runAllowedSuite({
  fetchImpl = globalThis.fetch,
  config,
  cryptoObject = globalThis.crypto,
  now = () => new Date().toISOString()
}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch_unavailable');
  const startedAt = now();
  const steps = [];
  let session = null;

  try {
    session = await authenticate(fetchImpl, config);
    steps.push({ name: 'authenticate', status: 200, passed: true });

    const userCheck = await verifyAuthenticatedUser(fetchImpl, config, session.accessToken);
    steps.push({ name: 'auth_user', status: userCheck.status, passed: userCheck.verified });

    const orderBefore = await safeRead(fetchImpl, config, session.accessToken, 'leader_orders', {
      id: `eq.${config.orderId}`,
      limit: '1'
    });
    const needBefore = await safeRead(fetchImpl, config, session.accessToken, 'leader_lead_needs', {
      id: `eq.${config.needId}`,
      limit: '1'
    });
    const tasksBefore = await safeRead(fetchImpl, config, session.accessToken, 'leader_design_tasks', {
      order_id: `eq.${config.orderId}`,
      order: 'created_at.desc'
    });
    assertStep(orderBefore.rows.length === 1, 'fixture_order_not_visible');
    assertStep(needBefore.rows.length === 1, 'fixture_need_not_visible');
    assertStep(tasksBefore.rows.length === 0, 'fixture_has_existing_design_task');
    steps.push({
      name: 'safe_read_before',
      status: 200,
      passed: true,
      counts: { orders: 1, needs: 1, design_tasks: 0 }
    });

    const createCommand = buildDesignCommand({
      ...config,
      requestId: randomUuid(cryptoObject)
    });
    const created = await invokeDesignEdge(fetchImpl, config, session.accessToken, createCommand, 201);
    assertStep(created.ok && created.body.ok === true, `create_failed:${created.status}`);
    assertStep(created.body.idempotent_replay === false, 'create_marked_as_replay');
    assertStep(isUuid(created.body.task?.id), 'create_task_id_missing');
    steps.push({ name: 'create', status: created.status, passed: true, response: created.body });

    const replay = await invokeDesignEdge(fetchImpl, config, session.accessToken, createCommand, 200);
    assertStep(replay.ok && replay.body.ok === true, `replay_failed:${replay.status}`);
    assertStep(replay.body.idempotent_replay === true, 'replay_flag_missing');
    assertStep(replay.body.task?.id === created.body.task?.id, 'replay_task_changed');
    steps.push({ name: 'exact_replay', status: replay.status, passed: true, response: replay.body });

    const modified = buildDesignCommand({
      ...config,
      requestId: randomUuid(cryptoObject),
      titleSuffix: ' modified'
    });
    const keyConflict = await invokeDesignEdge(fetchImpl, config, session.accessToken, modified, 409);
    assertStep(keyConflict.ok && keyConflict.body.error?.code === 'conflict', `idempotency_conflict_failed:${keyConflict.status}`);
    steps.push({ name: 'same_key_modified_payload', status: keyConflict.status, passed: true, response: keyConflict.body });

    const activeConflictCommand = buildDesignCommand({
      ...config,
      requestId: randomUuid(cryptoObject),
      keySuffix: '-active-conflict'
    });
    const activeConflict = await invokeDesignEdge(fetchImpl, config, session.accessToken, activeConflictCommand, 409);
    assertStep(activeConflict.ok && activeConflict.body.error?.code === 'conflict', `active_conflict_failed:${activeConflict.status}`);
    steps.push({ name: 'new_key_active_task', status: activeConflict.status, passed: true, response: activeConflict.body });

    const tasksAfter = await safeRead(fetchImpl, config, session.accessToken, 'leader_design_tasks', {
      order_id: `eq.${config.orderId}`,
      order: 'created_at.desc'
    });
    assertStep(tasksAfter.rows.length === 1, `read_after_success_count:${tasksAfter.rows.length}`);
    assertStep(tasksAfter.rows[0]?.id === created.body.task?.id, 'read_after_success_task_mismatch');
    steps.push({
      name: 'safe_read_after',
      status: 200,
      passed: true,
      counts: { design_tasks: 1 },
      task_id: tasksAfter.rows[0].id
    });

    return sanitizeEvidence({
      evidence_version: EVIDENCE_VERSION,
      started_at: startedAt,
      finished_at: now(),
      project_ref: STAGING_PROJECT_REF,
      mode: 'create_replay_conflicts',
      passed: true,
      steps,
      safe_projection_columns: SAFE_PROJECTIONS,
      cleanup_required: true
    });
  } finally {
    if (session?.accessToken) {
      const logout = await logoutCurrentSession(fetchImpl, config, session.accessToken).catch(() => null);
      if (logout) steps.push({ name: 'logout_current_session', status: logout.status, passed: logout.ok });
    }
  }
}

export async function runDeniedProbe({
  fetchImpl = globalThis.fetch,
  config,
  probeName,
  expectedStatus = 403,
  cryptoObject = globalThis.crypto,
  now = () => new Date().toISOString()
}) {
  const allowedProbeNames = new Set(['forbidden_role', 'inactive_profile', 'unknown_role']);
  if (!allowedProbeNames.has(probeName)) throw new Error('probe_name_invalid');
  const startedAt = now();
  let session = null;
  try {
    session = await authenticate(fetchImpl, config);
    await verifyAuthenticatedUser(fetchImpl, config, session.accessToken);
    const command = buildDesignCommand({ ...config, requestId: randomUuid(cryptoObject) });
    const result = await invokeDesignEdge(fetchImpl, config, session.accessToken, command, expectedStatus);
    assertStep(result.ok && result.status === expectedStatus, `${probeName}_status_invalid:${result.status}`);
    const code = result.body.error?.code;
    assertStep(['forbidden', 'access_denied', 'profile_check_failed'].includes(code), `${probeName}_code_invalid:${code}`);
    return sanitizeEvidence({
      evidence_version: EVIDENCE_VERSION,
      started_at: startedAt,
      finished_at: now(),
      project_ref: STAGING_PROJECT_REF,
      mode: probeName,
      passed: true,
      steps: [{ name: probeName, status: result.status, passed: true, response: result.body }],
      safe_projection_columns: SAFE_PROJECTIONS,
      cleanup_required: true
    });
  } finally {
    if (session?.accessToken) await logoutCurrentSession(fetchImpl, config, session.accessToken).catch(() => null);
  }
}

export function operatorPlan(env = process.env) {
  return {
    evidence_version: EVIDENCE_VERSION,
    project_ref: STAGING_PROJECT_REF,
    production_enabled: false,
    exact_staging_url: STAGING_URL,
    auth_user_required: true,
    connector_can_create_or_delete_auth_user: false,
    secret_inputs_present: {
      publishable_key: Boolean(text(env.STAGING_SUPABASE_PUBLISHABLE_KEY)),
      test_email: Boolean(text(env.STAGING_TEST_EMAIL)),
      test_password: Boolean(text(env.STAGING_TEST_PASSWORD))
    },
    supported_modes: ['create_replay_conflicts', 'forbidden_role', 'inactive_profile', 'unknown_role'],
    external_cleanup_required: true
  };
}

async function writeEvidence(filePath, evidence) {
  const target = path.resolve(filePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(sanitizeEvidence(evidence), null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return target;
}

function argumentValue(prefix) {
  const match = process.argv.find((arg) => arg.startsWith(`${prefix}=`));
  return match ? match.slice(prefix.length + 1) : '';
}

async function main() {
  const mode = argumentValue('--mode') || 'plan';
  if (mode === 'plan') {
    console.log(JSON.stringify(operatorPlan(), null, 2));
    return;
  }

  const config = loadOperatorConfig();
  const evidence = mode === 'create_replay_conflicts'
    ? await runAllowedSuite({ config })
    : await runDeniedProbe({ config, probeName: mode });
  const target = await writeEvidence(config.evidencePath, evidence);
  console.log(JSON.stringify({
    ok: evidence.passed === true,
    evidence_version: EVIDENCE_VERSION,
    project_ref: STAGING_PROJECT_REF,
    mode,
    evidence_path: target,
    cleanup_required: true
  }, null, 2));
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      project_ref: STAGING_PROJECT_REF,
      error: text(error?.message).slice(0, 300),
      cleanup_required: true
    }));
    process.exitCode = 1;
  });
}
