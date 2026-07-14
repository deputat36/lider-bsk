#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  ACTION,
  PRODUCTION_PROJECT_REF,
  SAFE_PROJECTIONS,
  STAGING_PROJECT_REF,
  STAGING_URL,
  authenticate,
  buildDesignCommand,
  invokeDesignEdge,
  isUuid,
  loadOperatorConfig,
  logoutCurrentSession,
  safeRead,
  sanitizeEvidence,
  verifyAuthenticatedUser
} from './design-task-staging-auth-e2e.mjs';

export const RUNNER_VERSION = 'leader-design-task-staging-auth-e2e-runner-v2';
export const EVIDENCE_VERSION_V2 = 'leader-design-task-staging-auth-e2e-evidence-v2';
export const FIXTURE_MANIFEST_VERSION = 'leader-design-task-staging-fixture-manifest-v1';

const CLEANUP_ORDER = Object.freeze([
  'receipt', 'design_event', 'design_task', 'need',
  'order', 'lead', 'profile', 'auth_user'
]);
const EXPECTED_BASELINE = Object.freeze({
  profiles: 1,
  leads: 1,
  orders: 1,
  needs: 1,
  design_tasks: 0,
  design_events: 0,
  receipts: 0,
  environment_guard: 1
});
const EXPECTED_AFTER_SUCCESS = Object.freeze({
  profiles: 1,
  leads: 1,
  orders: 1,
  needs: 1,
  design_tasks: 1,
  design_events: 1,
  successful_receipts: 1,
  environment_guard: 1
});
const FORBIDDEN_MANIFEST_KEY = /password|token|authorization|apikey|api_key|service.?role|secret|email/i;
const FORBIDDEN_VALUE = /Bearer\s+[A-Za-z0-9._-]+|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|sb_secret_|sb_publishable_|ofewxuqfjhamgerwzull/i;

function text(value) {
  return String(value ?? '').trim();
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function validTimestamp(value) {
  return Boolean(text(value)) && Number.isFinite(Date.parse(value));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!asObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableValue(value[key])])
  );
}

export function manifestDigest(manifest) {
  const canonical = JSON.stringify(stableValue(manifest));
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function collectForbiddenManifestMaterial(value, pathLabel = '$', errors = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectForbiddenManifestMaterial(item, `${pathLabel}[${index}]`, errors));
    return errors;
  }
  if (asObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_MANIFEST_KEY.test(key)) errors.push(`forbidden_manifest_key:${pathLabel}.${key}`);
      collectForbiddenManifestMaterial(item, `${pathLabel}.${key}`, errors);
    }
    return errors;
  }
  if (typeof value === 'string' && FORBIDDEN_VALUE.test(value)) {
    errors.push(`forbidden_manifest_value:${pathLabel}`);
  }
  return errors;
}

function exactObject(source, expected, label, errors) {
  const object = asObject(source);
  if (!object) {
    errors.push(`${label}_missing`);
    return;
  }
  const keys = Object.keys(object).sort();
  const expectedKeys = Object.keys(expected).sort();
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) errors.push(`${label}_keys_invalid`);
  for (const [key, value] of Object.entries(expected)) {
    if (object[key] !== value) errors.push(`${label}_${key}_invalid`);
  }
}

export function validateFixtureManifest(value, { now = Date.now() } = {}) {
  const manifest = asObject(value);
  const errors = [];
  if (!manifest) return { ok: false, errors: ['manifest_not_object'] };

  if (manifest.manifest_version !== FIXTURE_MANIFEST_VERSION) errors.push('manifest_version_invalid');
  if (!isUuid(manifest.manifest_id)) errors.push('manifest_id_invalid');
  if (manifest.project_ref !== STAGING_PROJECT_REF) errors.push('manifest_project_ref_invalid');
  if (manifest.synthetic_only !== true) errors.push('manifest_not_synthetic');
  if (manifest.production_enabled !== false) errors.push('manifest_production_enabled');

  if (!validTimestamp(manifest.created_at)) errors.push('manifest_created_at_invalid');
  if (!validTimestamp(manifest.expires_at)) errors.push('manifest_expires_at_invalid');
  if (validTimestamp(manifest.created_at) && validTimestamp(manifest.expires_at)) {
    const created = Date.parse(manifest.created_at);
    const expires = Date.parse(manifest.expires_at);
    if (expires <= created) errors.push('manifest_expiry_order_invalid');
    if (expires - created > 24 * 60 * 60 * 1000) errors.push('manifest_expiry_too_long');
    if (expires <= now) errors.push('manifest_expired');
  }

  const ids = asObject(manifest.fixture_ids);
  if (!ids) {
    errors.push('fixture_ids_missing');
  } else {
    for (const key of ['auth_user_id', 'profile_user_id', 'lead_id', 'order_id', 'need_id']) {
      if (!isUuid(ids[key])) errors.push(`${key}_invalid`);
    }
    if (ids.auth_user_id !== ids.profile_user_id) errors.push('profile_auth_identity_mismatch');
    const distinct = [ids.auth_user_id, ids.lead_id, ids.order_id, ids.need_id].filter(Boolean);
    if (new Set(distinct).size !== distinct.length) errors.push('fixture_ids_not_distinct');
  }

  const orderSnapshot = asObject(manifest.order_snapshot);
  if (!orderSnapshot) {
    errors.push('order_snapshot_missing');
  } else {
    if (!validTimestamp(orderSnapshot.expected_updated_at)) errors.push('expected_updated_at_invalid');
    if (orderSnapshot.need_design !== true) errors.push('need_design_must_be_true');
    if (orderSnapshot.is_archived !== false) errors.push('order_must_not_be_archived');
  }

  const command = asObject(manifest.command);
  if (!command) {
    errors.push('manifest_command_missing');
  } else {
    if (command.action !== ACTION) errors.push('manifest_action_invalid');
    if (!text(command.idempotency_key) || text(command.idempotency_key).length > 180) errors.push('manifest_idempotency_key_invalid');
    if (!text(command.task_title) || text(command.task_title).length > 300) errors.push('manifest_task_title_invalid');
  }

  exactObject(manifest.baseline_counts, EXPECTED_BASELINE, 'baseline_counts', errors);
  exactObject(manifest.expected_after_success, EXPECTED_AFTER_SUCCESS, 'expected_after_success', errors);
  if (JSON.stringify(manifest.cleanup_order) !== JSON.stringify(CLEANUP_ORDER)) errors.push('cleanup_order_invalid');
  collectForbiddenManifestMaterial(manifest, '$', errors);

  return {
    ok: errors.length === 0,
    errors,
    digest_sha256: errors.length === 0 ? manifestDigest(manifest) : null
  };
}

export async function loadFixtureManifest(filePath, options = {}) {
  const target = path.resolve(text(filePath));
  if (!text(filePath)) throw new Error('fixture_manifest_path_required');
  let parsed;
  try {
    parsed = JSON.parse(await readFile(target, 'utf8'));
  } catch (error) {
    throw new Error(`fixture_manifest_read_failed:${text(error?.code || error?.message)}`);
  }
  const checked = validateFixtureManifest(parsed, options);
  if (!checked.ok) throw new Error(`fixture_manifest_invalid:${checked.errors.join(',')}`);
  return Object.freeze({ path: target, manifest: parsed, digestSha256: checked.digest_sha256 });
}

export function buildRunnerConfig(env, fixture) {
  const manifest = fixture?.manifest;
  const ids = asObject(manifest?.fixture_ids) || {};
  const orderSnapshot = asObject(manifest?.order_snapshot) || {};
  const command = asObject(manifest?.command) || {};
  const base = loadOperatorConfig({
    ...env,
    STAGING_SUPABASE_URL: STAGING_URL,
    STAGING_ORDER_ID: ids.order_id,
    STAGING_NEED_ID: ids.need_id,
    STAGING_EXPECTED_UPDATED_AT: orderSnapshot.expected_updated_at,
    STAGING_IDEMPOTENCY_KEY: command.idempotency_key,
    STAGING_TASK_TITLE: command.task_title,
    STAGING_EVIDENCE_PATH: text(env.STAGING_EVIDENCE_PATH)
      || 'artifacts/design-task-staging-auth-e2e-evidence-v2.json'
  });
  return Object.freeze({
    ...base,
    manifestPath: fixture.path,
    manifest,
    manifestDigestSha256: fixture.digestSha256
  });
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

async function appendLogoutStep(fetchImpl, config, session, steps) {
  if (!session?.accessToken) return;
  const logout = await logoutCurrentSession(fetchImpl, config, session.accessToken).catch(() => null);
  steps.push({
    name: 'logout_current_session',
    status: Number(logout?.status || 0),
    passed: logout?.ok === true
  });
}

function buildEvidence(config, mode, startedAt, finishedAt, steps) {
  return sanitizeEvidence({
    evidence_version: EVIDENCE_VERSION_V2,
    runner_version: RUNNER_VERSION,
    started_at: startedAt,
    finished_at: finishedAt,
    project_ref: STAGING_PROJECT_REF,
    mode,
    passed: true,
    fixture_manifest: manifestEvidence(config),
    steps,
    safe_projection_columns: SAFE_PROJECTIONS,
    cleanup_required: true
  });
}

export async function runAllowedSuiteV2({
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
      requestId: requestId(cryptoObject)
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
      requestId: requestId(cryptoObject),
      titleSuffix: ' modified'
    });
    const keyConflict = await invokeDesignEdge(fetchImpl, config, session.accessToken, modified, 409);
    assertStep(keyConflict.ok && keyConflict.body.error?.code === 'conflict', `idempotency_conflict_failed:${keyConflict.status}`);
    steps.push({ name: 'same_key_modified_payload', status: keyConflict.status, passed: true, response: keyConflict.body });

    const activeConflictCommand = buildDesignCommand({
      ...config,
      requestId: requestId(cryptoObject),
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
  } catch (error) {
    failure = error;
  } finally {
    await appendLogoutStep(fetchImpl, config, session, steps);
  }

  if (failure) throw failure;
  const logout = steps.at(-1);
  assertStep(logout?.name === 'logout_current_session' && logout.passed === true, 'logout_failed');
  return buildEvidence(config, 'create_replay_conflicts', startedAt, now(), steps);
}

export async function runDeniedProbeV2({
  fetchImpl = globalThis.fetch,
  config,
  probeName,
  expectedStatus = 403,
  cryptoObject = globalThis.crypto,
  now = () => new Date().toISOString()
}) {
  const allowed = new Set(['forbidden_role', 'inactive_profile', 'unknown_role']);
  if (!allowed.has(probeName)) throw new Error('probe_name_invalid');
  const startedAt = now();
  const steps = [{ name: 'fixture_manifest', status: 0, passed: true }];
  let session = null;
  let failure = null;

  try {
    session = await authenticate(fetchImpl, config);
    steps.push({ name: 'authenticate', status: 200, passed: true });
    const userCheck = await verifyAuthenticatedUser(fetchImpl, config, session.accessToken);
    steps.push({ name: 'auth_user', status: userCheck.status, passed: userCheck.verified });
    const command = buildDesignCommand({ ...config, requestId: requestId(cryptoObject) });
    const result = await invokeDesignEdge(fetchImpl, config, session.accessToken, command, expectedStatus);
    assertStep(result.ok && result.status === expectedStatus, `${probeName}_status_invalid:${result.status}`);
    const code = result.body.error?.code;
    assertStep(['forbidden', 'access_denied', 'profile_check_failed'].includes(code), `${probeName}_code_invalid:${code}`);
    steps.push({ name: probeName, status: result.status, passed: true, response: result.body });
  } catch (error) {
    failure = error;
  } finally {
    await appendLogoutStep(fetchImpl, config, session, steps);
  }

  if (failure) throw failure;
  const logout = steps.at(-1);
  assertStep(logout?.name === 'logout_current_session' && logout.passed === true, 'logout_failed');
  return buildEvidence(config, probeName, startedAt, now(), steps);
}

export function operatorPlanV2({ manifest = null } = {}) {
  return {
    runner_version: RUNNER_VERSION,
    evidence_version: EVIDENCE_VERSION_V2,
    fixture_manifest_version: FIXTURE_MANIFEST_VERSION,
    project_ref: STAGING_PROJECT_REF,
    exact_staging_url: STAGING_URL,
    production_project_ref: PRODUCTION_PROJECT_REF,
    production_enabled: false,
    auth_user_required: true,
    connector_can_create_or_delete_auth_user: false,
    fixture_manifest_required: true,
    fixture_manifest_valid: manifest?.ok === true,
    fixture_manifest_digest_sha256: manifest?.digest_sha256 || null,
    supported_modes: ['create_replay_conflicts', 'forbidden_role', 'inactive_profile', 'unknown_role'],
    external_cleanup_required: true
  };
}

export async function writeEvidenceV2(filePath, evidence) {
  const target = path.resolve(filePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(sanitizeEvidence(evidence), null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
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
    let checked = null;
    if (manifestPath) {
      const fixture = await loadFixtureManifest(manifestPath);
      checked = { ok: true, digest_sha256: fixture.digestSha256 };
    }
    console.log(JSON.stringify(operatorPlanV2({ manifest: checked }), null, 2));
    return;
  }

  const fixture = await loadFixtureManifest(manifestPath);
  const config = buildRunnerConfig(process.env, fixture);
  const evidence = mode === 'create_replay_conflicts'
    ? await runAllowedSuiteV2({ config })
    : await runDeniedProbeV2({ config, probeName: mode });
  const target = await writeEvidenceV2(config.evidencePath, evidence);
  console.log(JSON.stringify({
    ok: evidence.passed === true,
    runner_version: RUNNER_VERSION,
    evidence_version: EVIDENCE_VERSION_V2,
    project_ref: STAGING_PROJECT_REF,
    mode,
    evidence_path: target,
    fixture_manifest_digest_sha256: config.manifestDigestSha256,
    cleanup_required: true
  }, null, 2));
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      runner_version: RUNNER_VERSION,
      project_ref: STAGING_PROJECT_REF,
      error: text(error?.message).slice(0, 500),
      cleanup_required: true
    }));
    process.exitCode = 1;
  });
}
