#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  SAFE_PROJECTIONS,
  STAGING_PROJECT_REF,
  STAGING_URL,
  authenticate,
  buildDesignCommand,
  invokeDesignEdge,
  isUuid,
  logoutCurrentSession,
  safeRead,
  sanitizeEvidence,
  verifyAuthenticatedUser
} from './design-task-staging-auth-e2e.mjs';
import {
  FIXTURE_MANIFEST_VERSION,
  buildRunnerConfig,
  loadFixtureManifest
} from './design-task-staging-auth-e2e-v2.mjs';

export const STALE_ORDER_RUNNER_VERSION = 'leader-design-task-staging-stale-order-runner-v1';
export const STALE_ORDER_EVIDENCE_VERSION = 'leader-design-task-staging-stale-order-evidence-v1';
export const STALE_ORDER_MODE = 'stale_order';
export const STALE_ORDER_KEY_SUFFIX = '-stale-order';
export const DEFAULT_EVIDENCE_PATH = 'artifacts/design-task-staging-stale-order-evidence.json';

function text(value) {
  return String(value ?? '').trim();
}

function validTimestamp(value) {
  return Boolean(text(value)) && Number.isFinite(Date.parse(value));
}

function requestId(cryptoObject = globalThis.crypto) {
  const value = cryptoObject?.randomUUID?.();
  if (!isUuid(value)) throw new Error('secure_request_id_unavailable');
  return value;
}

function assertStep(condition, code) {
  if (!condition) throw new Error(code);
}

function manifestEvidence(config) {
  return Object.freeze({
    manifest_version: config.manifest.manifest_version,
    manifest_id: config.manifest.manifest_id,
    digest_sha256: config.manifestDigestSha256,
    expires_at: new Date(config.manifest.expires_at).toISOString()
  });
}

function staleCommand(config, cryptoObject) {
  return buildDesignCommand({
    ...config,
    idempotencyKey: config.idempotencyKey.slice(0, 168),
    requestId: requestId(cryptoObject),
    keySuffix: STALE_ORDER_KEY_SUFFIX,
    titleSuffix: ' stale order'
  });
}

async function appendLogoutStep(fetchImpl, config, session, steps) {
  if (!session?.accessToken) return;
  const logout = await logoutCurrentSession(fetchImpl, config, session.accessToken).catch(() => null);
  steps.push({
    name: 'logout_current_session',
    status: Number(logout?.status || 0),
    passed: logout?.ok === true
  });
}

export async function runStaleOrderProbe({
  fetchImpl = globalThis.fetch,
  config,
  cryptoObject = globalThis.crypto,
  now = () => new Date().toISOString()
}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch_unavailable');
  const startedAt = now();
  const steps = [{ name: 'fixture_manifest', status: 0, passed: true }];
  let session = null;
  let failure = null;

  try {
    session = await authenticate(fetchImpl, config);
    steps.push({ name: 'authenticate', status: 200, passed: true });

    const userCheck = await verifyAuthenticatedUser(fetchImpl, config, session.accessToken);
    steps.push({ name: 'auth_user', status: userCheck.status, passed: userCheck.verified });

    const orderRead = await safeRead(fetchImpl, config, session.accessToken, 'leader_orders', {
      id: `eq.${config.orderId}`,
      limit: '1'
    });
    const tasksBefore = await safeRead(fetchImpl, config, session.accessToken, 'leader_design_tasks', {
      order_id: `eq.${config.orderId}`,
      order: 'created_at.desc'
    });
    assertStep(orderRead.rows.length === 1, 'stale_fixture_order_not_visible');
    assertStep(tasksBefore.rows.length === 0, 'stale_fixture_has_existing_task');
    const actualUpdatedAt = orderRead.rows[0]?.updated_at;
    assertStep(validTimestamp(actualUpdatedAt), 'stale_order_updated_at_invalid');
    assertStep(
      Date.parse(actualUpdatedAt) !== Date.parse(config.expectedUpdatedAt),
      'order_version_not_stale'
    );
    steps.push({
      name: 'safe_read_stale_version',
      status: 200,
      passed: true,
      counts: { orders: 1, design_tasks: 0 },
      version_changed: true
    });

    const command = staleCommand(config, cryptoObject);
    const result = await invokeDesignEdge(fetchImpl, config, session.accessToken, command, 409);
    assertStep(result.ok && result.status === 409, `stale_order_status_invalid:${result.status}`);
    assertStep(result.body.ok === false, 'stale_order_response_marked_ok');
    assertStep(result.body.error?.code === 'conflict', `stale_order_code_invalid:${result.body.error?.code}`);
    steps.push({ name: 'stale_order', status: result.status, passed: true, response: result.body });

    const tasksAfter = await safeRead(fetchImpl, config, session.accessToken, 'leader_design_tasks', {
      order_id: `eq.${config.orderId}`,
      order: 'created_at.desc'
    });
    assertStep(tasksAfter.rows.length === 0, `stale_order_created_task:${tasksAfter.rows.length}`);
    steps.push({
      name: 'safe_read_no_task',
      status: 200,
      passed: true,
      counts: { design_tasks: 0 }
    });
  } catch (error) {
    failure = error;
  } finally {
    await appendLogoutStep(fetchImpl, config, session, steps);
  }

  if (failure) throw failure;
  const logout = steps.at(-1);
  assertStep(logout?.name === 'logout_current_session' && logout.passed === true, 'logout_failed');

  return sanitizeEvidence({
    evidence_version: STALE_ORDER_EVIDENCE_VERSION,
    runner_version: STALE_ORDER_RUNNER_VERSION,
    started_at: startedAt,
    finished_at: now(),
    project_ref: STAGING_PROJECT_REF,
    mode: STALE_ORDER_MODE,
    passed: true,
    fixture_manifest: manifestEvidence(config),
    steps,
    safe_projection_columns: {
      leader_orders: SAFE_PROJECTIONS.leader_orders,
      leader_design_tasks: SAFE_PROJECTIONS.leader_design_tasks
    },
    cleanup_required: true,
    restore_order_version_required: true
  });
}

export function staleOrderOperatorPlan({ manifestValid = false, digestSha256 = null } = {}) {
  return {
    runner_version: STALE_ORDER_RUNNER_VERSION,
    evidence_version: STALE_ORDER_EVIDENCE_VERSION,
    fixture_manifest_version: FIXTURE_MANIFEST_VERSION,
    project_ref: STAGING_PROJECT_REF,
    exact_staging_url: STAGING_URL,
    production_enabled: false,
    mode: STALE_ORDER_MODE,
    fixture_manifest_required: true,
    fixture_manifest_valid: manifestValid === true,
    fixture_manifest_digest_sha256: digestSha256,
    auth_user_required: true,
    connector_can_create_or_delete_auth_user: false,
    stale_order_sql_required: true,
    restore_order_version_required: true,
    cleanup_required: true
  };
}

export async function writeStaleOrderEvidence(filePath, evidence) {
  const target = path.resolve(filePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(sanitizeEvidence(evidence), null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600
  });
  return target;
}

function argumentValue(prefix) {
  const match = process.argv.find((argument) => argument.startsWith(`${prefix}=`));
  return match ? match.slice(prefix.length + 1) : '';
}

async function main() {
  const mode = argumentValue('--mode') || 'plan';
  const manifestPath = text(process.env.STAGING_FIXTURE_MANIFEST_PATH || argumentValue('--manifest'));

  if (mode === 'plan') {
    if (!manifestPath) {
      console.log(JSON.stringify(staleOrderOperatorPlan(), null, 2));
      return;
    }
    const fixture = await loadFixtureManifest(manifestPath);
    console.log(JSON.stringify(staleOrderOperatorPlan({
      manifestValid: true,
      digestSha256: fixture.digestSha256
    }), null, 2));
    return;
  }

  if (mode !== STALE_ORDER_MODE) throw new Error(`unsupported_mode:${mode}`);
  const fixture = await loadFixtureManifest(manifestPath);
  const config = buildRunnerConfig({
    ...process.env,
    STAGING_EVIDENCE_PATH: text(process.env.STAGING_EVIDENCE_PATH) || DEFAULT_EVIDENCE_PATH
  }, fixture);
  const evidence = await runStaleOrderProbe({ config });
  const target = await writeStaleOrderEvidence(config.evidencePath, evidence);
  console.log(JSON.stringify({
    ok: evidence.passed === true,
    runner_version: STALE_ORDER_RUNNER_VERSION,
    evidence_version: STALE_ORDER_EVIDENCE_VERSION,
    project_ref: STAGING_PROJECT_REF,
    mode,
    evidence_path: target,
    fixture_manifest_digest_sha256: config.manifestDigestSha256,
    restore_order_version_required: true,
    cleanup_required: true
  }, null, 2));
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      runner_version: STALE_ORDER_RUNNER_VERSION,
      project_ref: STAGING_PROJECT_REF,
      error: text(error?.message).slice(0, 500),
      restore_order_version_required: true,
      cleanup_required: true
    }));
    process.exitCode = 1;
  });
}
