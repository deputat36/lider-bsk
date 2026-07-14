#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  SAFE_PROJECTIONS,
  STAGING_PROJECT_REF,
  isUuid
} from './design-task-staging-auth-e2e.mjs';
import {
  EVIDENCE_VERSION_V2,
  FIXTURE_MANIFEST_VERSION,
  RUNNER_VERSION,
  manifestDigest,
  validateFixtureManifest
} from './design-task-staging-auth-e2e-v2.mjs';

const ALLOWED_STEP_ORDER = Object.freeze([
  'fixture_manifest',
  'authenticate',
  'auth_user',
  'safe_read_before',
  'create',
  'exact_replay',
  'same_key_modified_payload',
  'new_key_active_task',
  'safe_read_after',
  'logout_current_session'
]);
const DENIED_MODES = new Set(['forbidden_role', 'inactive_profile', 'unknown_role']);
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

function stepMap(steps) {
  return new Map(steps.map((step) => [step.name, step]));
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

function validateCommon(evidence, manifest, errors) {
  if (evidence.evidence_version !== EVIDENCE_VERSION_V2) errors.push('evidence_version_invalid');
  if (evidence.runner_version !== RUNNER_VERSION) errors.push('runner_version_invalid');
  if (evidence.project_ref !== STAGING_PROJECT_REF) errors.push('evidence_project_ref_invalid');
  if (evidence.passed !== true) errors.push('evidence_not_passed');
  if (evidence.cleanup_required !== true) errors.push('cleanup_required_missing');
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

  if (!deepEqual(evidence.safe_projection_columns, SAFE_PROJECTIONS)) {
    errors.push('safe_projection_columns_invalid');
  }
  scanForbidden(evidence, '$', errors);
}

function validateAllowed(evidence, errors) {
  const steps = Array.isArray(evidence.steps) ? evidence.steps : [];
  const names = steps.map((step) => step?.name);
  if (!deepEqual(names, ALLOWED_STEP_ORDER)) errors.push(`allowed_step_order_invalid:${names.join(',')}`);
  const map = stepMap(steps);

  requireStep(map.get('fixture_manifest'), 0, errors);
  requireStep(map.get('authenticate'), 200, errors);
  requireStep(map.get('auth_user'), 200, errors);
  requireStep(map.get('safe_read_before'), 200, errors);
  requireStep(map.get('create'), 201, errors);
  requireStep(map.get('exact_replay'), 200, errors);
  requireStep(map.get('same_key_modified_payload'), 409, errors);
  requireStep(map.get('new_key_active_task'), 409, errors);
  requireStep(map.get('safe_read_after'), 200, errors);
  requireStep(map.get('logout_current_session'), [200, 204], errors);

  const before = asObject(map.get('safe_read_before')?.counts);
  if (!before || before.orders !== 1 || before.needs !== 1 || before.design_tasks !== 0) {
    errors.push('safe_read_before_counts_invalid');
  }

  const create = asObject(map.get('create')?.response);
  const replay = asObject(map.get('exact_replay')?.response);
  const createTask = asObject(create?.task);
  const replayTask = asObject(replay?.task);
  if (create?.ok !== true || create?.idempotent_replay !== false || !isUuid(createTask?.id)) {
    errors.push('create_response_invalid');
  }
  if (replay?.ok !== true || replay?.idempotent_replay !== true || replayTask?.id !== createTask?.id) {
    errors.push('replay_response_invalid');
  }

  for (const name of ['same_key_modified_payload', 'new_key_active_task']) {
    const response = asObject(map.get(name)?.response);
    const error = asObject(response?.error);
    if (response?.ok !== false || error?.code !== 'conflict') errors.push(`${name}_response_invalid`);
  }

  const after = asObject(map.get('safe_read_after')?.counts);
  if (!after || after.design_tasks !== 1) errors.push('safe_read_after_counts_invalid');
  if (map.get('safe_read_after')?.task_id !== createTask?.id) errors.push('safe_read_after_task_mismatch');
}

function validateDenied(evidence, errors) {
  const mode = evidence.mode;
  const expectedNames = ['fixture_manifest', 'authenticate', 'auth_user', mode, 'logout_current_session'];
  const steps = Array.isArray(evidence.steps) ? evidence.steps : [];
  const names = steps.map((step) => step?.name);
  if (!deepEqual(names, expectedNames)) errors.push(`denied_step_order_invalid:${names.join(',')}`);
  const map = stepMap(steps);
  requireStep(map.get('fixture_manifest'), 0, errors);
  requireStep(map.get('authenticate'), 200, errors);
  requireStep(map.get('auth_user'), 200, errors);
  requireStep(map.get(mode), 403, errors);
  requireStep(map.get('logout_current_session'), [200, 204], errors);

  const response = asObject(map.get(mode)?.response);
  const error = asObject(response?.error);
  if (response?.ok !== false || !['forbidden', 'access_denied', 'profile_check_failed'].includes(error?.code)) {
    errors.push(`${mode}_response_invalid`);
  }
}

export function validateEvidenceV2(evidenceValue, manifestValue, options = {}) {
  const evidence = asObject(evidenceValue);
  const manifest = asObject(manifestValue);
  const errors = [];
  if (!evidence) return { ok: false, errors: ['evidence_not_object'] };
  if (!manifest) return { ok: false, errors: ['manifest_not_object'] };

  const manifestCheck = validateFixtureManifest(manifest, options);
  if (!manifestCheck.ok) errors.push(...manifestCheck.errors.map((error) => `manifest:${error}`));
  validateCommon(evidence, manifest, errors);

  if (evidence.mode === 'create_replay_conflicts') validateAllowed(evidence, errors);
  else if (DENIED_MODES.has(evidence.mode)) validateDenied(evidence, errors);
  else errors.push('evidence_mode_invalid');

  return {
    ok: errors.length === 0,
    errors,
    summary: {
      evidence_version: evidence.evidence_version || null,
      runner_version: evidence.runner_version || null,
      project_ref: evidence.project_ref || null,
      mode: evidence.mode || null,
      manifest_id: evidence.fixture_manifest?.manifest_id || null,
      step_count: Array.isArray(evidence.steps) ? evidence.steps.length : 0,
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
  const result = validateEvidenceV2(evidence, manifest);
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
