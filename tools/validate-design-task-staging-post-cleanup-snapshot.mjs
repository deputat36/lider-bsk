#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const SNAPSHOT_VERSION = 'leader-design-task-staging-post-cleanup-snapshot-v1';
export const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn';
export const PRODUCTION_PROJECT_REF = 'ofewxuqfjhamgerwzull';

export const EXPECTED_COUNTS = Object.freeze({
  auth_users: 0,
  profiles: 0,
  leads: 0,
  orders: 0,
  needs: 0,
  production_jobs: 0,
  design_tasks: 0,
  design_events: 0,
  receipts: 0,
  environment_guard: 1
});

export const EXPECTED_OBJECTS = Object.freeze({
  design_rpc_present: true,
  read_helper_present: true,
  active_index_present: true,
  select_policy_count: 3
});

export const EXPECTED_PRIVILEGES = Object.freeze({
  authenticated_direct_rpc_execute: false,
  authenticated_receipt_select: false,
  authenticated_orders_table_select: false,
  authenticated_orders_id_select: true,
  authenticated_orders_client_phone_select: false
});

const TOP_LEVEL_FIELDS = Object.freeze([
  'snapshot_version',
  'project_ref',
  'captured_at',
  'counts',
  'objects',
  'privileges'
]);

const FORBIDDEN_EXTRA_KEY = /password|email|token|authorization|apikey|api_key|secret|service.?role|finance|profit|cost|payment|balance|comment/i;
const JWT_LIKE = /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/;
const SECRET_LIKE = /sb_secret_[A-Za-z0-9_-]{10,}|Bearer\s+[A-Za-z0-9._-]{20,}/i;

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function sortedKeys(value) {
  return Object.keys(value || {}).sort();
}

function exactKeys(value, expected, label, errors) {
  const actual = sortedKeys(value);
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    errors.push(`${label}_keys_invalid:${actual.join(',')}`);
  }
}

function scan(value, pathParts, errors) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scan(item, [...pathParts, String(index)], errors));
    return;
  }
  if (isObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_EXTRA_KEY.test(key)) errors.push(`forbidden_key:${[...pathParts, key].join('.')}`);
      scan(item, [...pathParts, key], errors);
    }
    return;
  }
  if (typeof value === 'string') {
    if (value.includes(PRODUCTION_PROJECT_REF)) errors.push(`production_ref_leaked:${pathParts.join('.')}`);
    if (JWT_LIKE.test(value) || SECRET_LIKE.test(value)) errors.push(`secret_like_value:${pathParts.join('.')}`);
  }
}

export function unwrapSnapshot(value) {
  if (Array.isArray(value) && value.length === 1 && isObject(value[0]?.snapshot)) return value[0].snapshot;
  if (isObject(value?.snapshot)) return value.snapshot;
  return value;
}

export function validateSnapshot(input) {
  const snapshot = unwrapSnapshot(input);
  const errors = [];

  if (!isObject(snapshot)) return { ok: false, errors: ['snapshot_not_object'] };
  exactKeys(snapshot, TOP_LEVEL_FIELDS, 'top_level', errors);

  if (snapshot.snapshot_version !== SNAPSHOT_VERSION) errors.push('snapshot_version_invalid');
  if (snapshot.project_ref !== STAGING_PROJECT_REF) errors.push('project_ref_invalid');
  if (!Number.isFinite(Date.parse(snapshot.captured_at))) errors.push('captured_at_invalid');

  for (const [label, expected] of [
    ['counts', EXPECTED_COUNTS],
    ['objects', EXPECTED_OBJECTS],
    ['privileges', EXPECTED_PRIVILEGES]
  ]) {
    const actual = snapshot[label];
    if (!isObject(actual)) {
      errors.push(`${label}_not_object`);
      continue;
    }
    exactKeys(actual, Object.keys(expected), label, errors);
    for (const [key, expectedValue] of Object.entries(expected)) {
      if (actual[key] !== expectedValue) errors.push(`${label}.${key}_invalid:${String(actual[key])}`);
    }
  }

  scan(snapshot, [], errors);

  return {
    ok: errors.length === 0,
    errors,
    summary: {
      snapshot_version: snapshot.snapshot_version || null,
      project_ref: snapshot.project_ref || null,
      captured_at: snapshot.captured_at || null,
      cleanup_complete: errors.length === 0
    }
  };
}

async function main() {
  const sourcePath = process.argv[2];
  if (!sourcePath) throw new Error('snapshot_path_required');
  const source = JSON.parse(await readFile(path.resolve(sourcePath), 'utf8'));
  const result = validateSnapshot(source);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, errors: [String(error?.message || error)] }));
    process.exitCode = 1;
  });
}
