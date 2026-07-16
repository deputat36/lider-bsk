#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  AUTH_E2E_EVIDENCE_VERSION,
  AUTH_E2E_RUNNER_VERSION,
  STAGING_PROJECT_REF
} from './run_calculation_version_staging_auth_e2e.mjs';
import {
  manifestDigest,
  validateFixtureManifest
} from './create-calculation-version-staging-fixture-bundle.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST_RE = /^[0-9a-f]{64}$/;
const TOP_LEVEL_FIELDS = new Set([
  'evidence_version',
  'runner_version',
  'project_ref',
  'production_enabled',
  'network_e2e',
  'scenario',
  'passed',
  'started_at',
  'finished_at',
  'fixture_manifest',
  'statuses',
  'source_calculation_id',
  'created_calculation_id',
  'request_id',
  'safe_projection_validated',
  'cleanup_required',
  'logout'
]);
const FIXTURE_FIELDS = new Set(['id', 'digest_sha256']);
const LOGOUT_FIELDS = new Set(['status', 'passed']);
const SCENARIOS = new Set(['allowed', 'forbidden', 'inactive']);
const MAX_DURATION_MS = 15 * 60 * 1000;

function text(value) {
  return String(value ?? '').trim();
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function exactKeys(value, allowed, label, errors) {
  const current = object(value);
  if (!current) {
    errors.push(`${label}_not_object`);
    return;
  }
  const actual = Object.keys(current).sort();
  const expected = [...allowed].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    errors.push(`${label}_projection_drift`);
  }
}

function validTimestamp(value) {
  return Boolean(text(value)) && Number.isFinite(Date.parse(value));
}

function statusKeys(value) {
  const current = object(value);
  return current ? Object.keys(current).sort() : [];
}

function scenarioExpected(scenario) {
  if (scenario === 'allowed') {
    return {
      statuses: { create: 201, replay: 200, conflict: 409, stale: 409 },
      cleanupRequired: true,
      safeProjectionValidated: true,
      requiresIds: true
    };
  }
  if (scenario === 'forbidden') {
    return {
      statuses: { forbidden: 403 },
      cleanupRequired: false,
      safeProjectionValidated: false,
      requiresIds: false
    };
  }
  return {
    statuses: { inactive: 403 },
    cleanupRequired: false,
    safeProjectionValidated: false,
    requiresIds: false
  };
}

function containsSecretLikeMaterial(value) {
  const serialized = JSON.stringify(value);
  const lowered = serialized.toLowerCase();
  for (const marker of [
    'password',
    'access_token',
    'refresh_token',
    'publishable_key',
    'service_role',
    'sb_secret_',
    'authorization',
    'bearer '
  ]) {
    if (lowered.includes(marker)) return marker;
  }
  if (/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(serialized)) {
    return 'jwt';
  }
  return null;
}

export function validateAuthE2EEvidence(evidence, manifest, { now = Date.now() } = {}) {
  const errors = [];
  exactKeys(evidence, TOP_LEVEL_FIELDS, 'evidence', errors);
  const current = object(evidence);
  if (!current) return { ok: false, errors };

  if (current.evidence_version !== AUTH_E2E_EVIDENCE_VERSION) errors.push('evidence_version_invalid');
  if (current.runner_version !== AUTH_E2E_RUNNER_VERSION) errors.push('runner_version_invalid');
  if (current.project_ref !== STAGING_PROJECT_REF) errors.push('project_ref_invalid');
  if (current.production_enabled !== false) errors.push('production_must_be_disabled');
  if (current.network_e2e !== true) errors.push('network_e2e_required');
  if (current.passed !== true) errors.push('passed_required');

  const scenario = text(current.scenario);
  if (!SCENARIOS.has(scenario)) errors.push('scenario_invalid');

  if (!validTimestamp(current.started_at)) errors.push('started_at_invalid');
  if (!validTimestamp(current.finished_at)) errors.push('finished_at_invalid');
  const startedAt = Date.parse(current.started_at);
  const finishedAt = Date.parse(current.finished_at);
  if (Number.isFinite(startedAt) && Number.isFinite(finishedAt)) {
    if (finishedAt < startedAt) errors.push('timestamp_order_invalid');
    if (finishedAt - startedAt > MAX_DURATION_MS) errors.push('duration_too_long');
    if (finishedAt > now + 5 * 60 * 1000) errors.push('finished_at_in_future');
  }

  exactKeys(current.fixture_manifest, FIXTURE_FIELDS, 'fixture_manifest', errors);
  const fixture = object(current.fixture_manifest);
  if (!UUID_RE.test(text(fixture?.id))) errors.push('fixture_manifest_id_invalid');
  if (!DIGEST_RE.test(text(fixture?.digest_sha256))) errors.push('fixture_manifest_digest_invalid');

  const manifestChecked = validateFixtureManifest(manifest, {
    now: Number.isFinite(startedAt) ? startedAt : now
  });
  if (!manifestChecked.ok) {
    errors.push(...manifestChecked.errors.map((error) => `fixture_manifest_${error}`));
  }
  if (text(manifest?.manifest_id) !== text(fixture?.id)) errors.push('fixture_manifest_id_mismatch');
  if (manifestDigest(manifest) !== text(fixture?.digest_sha256)) errors.push('fixture_manifest_digest_mismatch');

  if (SCENARIOS.has(scenario)) {
    const expected = scenarioExpected(scenario);
    const statuses = object(current.statuses);
    const expectedKeys = Object.keys(expected.statuses).sort();
    if (JSON.stringify(statusKeys(statuses)) !== JSON.stringify(expectedKeys)) {
      errors.push('statuses_projection_drift');
    } else {
      for (const [name, status] of Object.entries(expected.statuses)) {
        if (Number(statuses?.[name]) !== status) errors.push(`status_${name}_invalid`);
      }
    }
    if (current.cleanup_required !== expected.cleanupRequired) errors.push('cleanup_required_invalid');
    if (current.safe_projection_validated !== expected.safeProjectionValidated) {
      errors.push('safe_projection_flag_invalid');
    }

    if (expected.requiresIds) {
      if (!UUID_RE.test(text(current.source_calculation_id))) errors.push('source_calculation_id_invalid');
      if (!UUID_RE.test(text(current.created_calculation_id))) errors.push('created_calculation_id_invalid');
      if (!UUID_RE.test(text(current.request_id))) errors.push('request_id_invalid');
      if (text(current.source_calculation_id) !== text(manifest?.fixture_ids?.source_calculation_id)) {
        errors.push('source_calculation_id_manifest_mismatch');
      }
    } else {
      if (current.created_calculation_id !== null) errors.push('created_calculation_id_must_be_null');
      if (current.request_id !== null) errors.push('request_id_must_be_null');
    }
  }

  exactKeys(current.logout, LOGOUT_FIELDS, 'logout', errors);
  const logout = object(current.logout);
  if (logout?.passed !== true) errors.push('logout_not_confirmed');
  if (![200, 204].includes(Number(logout?.status))) errors.push('logout_status_invalid');

  const secretMarker = containsSecretLikeMaterial(current);
  if (secretMarker) errors.push(`secret_like_material:${secretMarker}`);

  return {
    ok: errors.length === 0,
    errors,
    summary: errors.length === 0 ? {
      evidence_version: current.evidence_version,
      runner_version: current.runner_version,
      project_ref: current.project_ref,
      scenario,
      fixture_manifest_id: fixture.id,
      fixture_manifest_digest_sha256: fixture.digest_sha256,
      cleanup_required: current.cleanup_required,
      logout_status: logout.status
    } : null
  };
}

function argValue(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : '';
}

function readJson(filePath, code) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    throw new Error(code);
  }
}

function main() {
  const evidencePath = argValue('evidence');
  const manifestPath = argValue('manifest');
  if (!evidencePath) throw new Error('evidence_path_required');
  if (!manifestPath) throw new Error('manifest_path_required');
  const evidence = readJson(evidencePath, 'evidence_read_failed');
  const manifest = readJson(manifestPath, 'manifest_read_failed');
  const result = validateAuthE2EEvidence(evidence, manifest);
  if (!result.ok) throw new Error(`evidence_invalid:${result.errors.join(',')}`);
  console.log(JSON.stringify({ ok: true, ...result.summary }, null, 2));
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  try {
    main();
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      error: text(error?.message).slice(0, 500)
    }));
    process.exitCode = 1;
  }
}
