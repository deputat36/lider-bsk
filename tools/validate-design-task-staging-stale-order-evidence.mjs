#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  SAFE_PROJECTIONS,
  STAGING_PROJECT_REF
} from './design-task-staging-auth-e2e.mjs';
import {
  FIXTURE_MANIFEST_VERSION,
  manifestDigest,
  validateFixtureManifest
} from './design-task-staging-auth-e2e-v2.mjs';
import {
  STALE_ORDER_EVIDENCE_VERSION,
  STALE_ORDER_MODE,
  STALE_ORDER_RUNNER_VERSION
} from './design-task-staging-stale-order-e2e-v1.mjs';

export const STALE_ORDER_STEP_ORDER = Object.freeze([
  'fixture_manifest',
  'authenticate',
  'auth_user',
  'safe_read_stale_version',
  'stale_order',
  'safe_read_no_task',
  'logout_current_session'
]);

const FORBIDDEN_KEY = /password|token|authorization|apikey|api_key|service.?role|secret|email|phone|client|profit|cost|payment|balance|comment|task_text/i;
const FORBIDDEN_STRING = /Bearer\s+[A-Za-z0-9._-]+|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|sb_secret_|sb_publishable_|ofewxuqfjhamgerwzull|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function text(value) {
  return String(value ?? '').trim();
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function validTimestamp(value) {
  return Boolean(text(value)) && Number.isFinite(Date.parse(value));
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function scanForbidden(value, label = '$', errors = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForbidden(item, `${label}[${index}]`, errors));
    return errors;
  }
  if (asObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_KEY.test(key)) errors.push(`forbidden_evidence_key:${label}.${key}`);
      scanForbidden(item, `${label}.${key}`, errors);
    }
    return errors;
  }
  if (typeof value === 'string' && FORBIDDEN_STRING.test(value)) {
    errors.push(`forbidden_evidence_value:${label}`);
  }
  return errors;
}

function requireStep(step, expectedStatus, errors) {
  if (!step) {
    errors.push('required_step_missing');
    return;
  }
  const statuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  if (!statuses.includes(step.status)) errors.push(`step_status_invalid:${step.name}:${step.status}`);
  if (step.passed !== true) errors.push(`step_not_passed:${step.name}`);
}

export function validateStaleOrderEvidence(evidenceValue, manifestValue, options = {}) {
  const evidence = asObject(evidenceValue);
  const manifest = asObject(manifestValue);
  const errors = [];
  if (!evidence) return { ok: false, errors: ['evidence_not_object'] };
  if (!manifest) return { ok: false, errors: ['manifest_not_object'] };

  const manifestCheck = validateFixtureManifest(manifest, options);
  if (!manifestCheck.ok) errors.push(...manifestCheck.errors.map((error) => `manifest:${error}`));

  if (evidence.evidence_version !== STALE_ORDER_EVIDENCE_VERSION) errors.push('evidence_version_invalid');
  if (evidence.runner_version !== STALE_ORDER_RUNNER_VERSION) errors.push('runner_version_invalid');
  if (evidence.project_ref !== STAGING_PROJECT_REF) errors.push('project_ref_invalid');
  if (evidence.mode !== STALE_ORDER_MODE) errors.push('mode_invalid');
  if (evidence.passed !== true) errors.push('evidence_not_passed');
  if (evidence.cleanup_required !== true) errors.push('cleanup_required_missing');
  if (evidence.restore_order_version_required !== true) errors.push('restore_order_version_required_missing');
  if (!validTimestamp(evidence.started_at)) errors.push('started_at_invalid');
  if (!validTimestamp(evidence.finished_at)) errors.push('finished_at_invalid');
  if (validTimestamp(evidence.started_at) && validTimestamp(evidence.finished_at)
      && Date.parse(evidence.finished_at) < Date.parse(evidence.started_at)) {
    errors.push('evidence_time_order_invalid');
  }

  const fixture = asObject(evidence.fixture_manifest);
  if (!fixture) {
    errors.push('fixture_manifest_evidence_missing');
  } else {
    if (fixture.manifest_version !== FIXTURE_MANIFEST_VERSION) errors.push('fixture_manifest_version_invalid');
    if (fixture.manifest_id !== manifest.manifest_id) errors.push('fixture_manifest_id_mismatch');
    if (fixture.digest_sha256 !== manifestDigest(manifest)) errors.push('fixture_manifest_digest_mismatch');
    if (!validTimestamp(fixture.expires_at)) errors.push('fixture_manifest_expiry_invalid');
  }

  const expectedProjections = {
    leader_orders: SAFE_PROJECTIONS.leader_orders,
    leader_design_tasks: SAFE_PROJECTIONS.leader_design_tasks
  };
  if (!deepEqual(evidence.safe_projection_columns, expectedProjections)) {
    errors.push('safe_projection_columns_invalid');
  }

  const steps = Array.isArray(evidence.steps) ? evidence.steps : [];
  const names = steps.map((step) => step?.name);
  if (!deepEqual(names, STALE_ORDER_STEP_ORDER)) {
    errors.push(`step_order_invalid:${names.join(',')}`);
  }
  const stepMap = new Map(steps.map((step) => [step.name, step]));
  requireStep(stepMap.get('fixture_manifest'), 0, errors);
  requireStep(stepMap.get('authenticate'), 200, errors);
  requireStep(stepMap.get('auth_user'), 200, errors);
  requireStep(stepMap.get('safe_read_stale_version'), 200, errors);
  requireStep(stepMap.get('stale_order'), 409, errors);
  requireStep(stepMap.get('safe_read_no_task'), 200, errors);
  requireStep(stepMap.get('logout_current_session'), [200, 204], errors);

  const staleRead = asObject(stepMap.get('safe_read_stale_version'));
  const staleCounts = asObject(staleRead?.counts);
  if (!staleCounts || staleCounts.orders !== 1 || staleCounts.design_tasks !== 0) {
    errors.push('stale_read_counts_invalid');
  }
  if (staleRead?.version_changed !== true) errors.push('stale_version_change_not_proven');

  const response = asObject(stepMap.get('stale_order')?.response);
  const responseError = asObject(response?.error);
  if (response?.ok !== false || responseError?.code !== 'conflict') {
    errors.push('stale_order_response_invalid');
  }

  const noTaskCounts = asObject(stepMap.get('safe_read_no_task')?.counts);
  if (!noTaskCounts || noTaskCounts.design_tasks !== 0) {
    errors.push('stale_order_task_count_invalid');
  }

  scanForbidden(evidence, '$', errors);

  return {
    ok: errors.length === 0,
    errors,
    summary: {
      evidence_version: evidence.evidence_version || null,
      runner_version: evidence.runner_version || null,
      project_ref: evidence.project_ref || null,
      mode: evidence.mode || null,
      manifest_id: evidence.fixture_manifest?.manifest_id || null,
      step_count: steps.length,
      restore_order_version_required: evidence.restore_order_version_required === true,
      cleanup_required: evidence.cleanup_required === true
    }
  };
}

async function readJson(filePath, label) {
  try {
    return JSON.parse(await readFile(path.resolve(filePath), 'utf8'));
  } catch (error) {
    throw new Error(`${label}_read_failed:${text(error?.code || error?.message)}`);
  }
}

function argumentValue(prefix) {
  const match = process.argv.find((argument) => argument.startsWith(`${prefix}=`));
  return match ? match.slice(prefix.length + 1) : '';
}

async function main() {
  const evidencePath = argumentValue('--evidence');
  const manifestPath = argumentValue('--manifest');
  if (!evidencePath || !manifestPath) throw new Error('usage: --evidence=<path> --manifest=<path>');
  const [evidence, manifest] = await Promise.all([
    readJson(evidencePath, 'evidence'),
    readJson(manifestPath, 'manifest')
  ]);
  const result = validateStaleOrderEvidence(evidence, manifest);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: text(error?.message).slice(0, 500) }));
    process.exitCode = 1;
  });
}
