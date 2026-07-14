#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  ACTION,
  STAGING_PROJECT_REF,
  isUuid
} from './design-task-staging-auth-e2e.mjs';
import {
  FIXTURE_MANIFEST_VERSION,
  validateFixtureManifest
} from './design-task-staging-auth-e2e-v2.mjs';

function text(value) {
  return String(value ?? '').trim();
}

function argumentValue(prefix) {
  const match = process.argv.find((argument) => argument.startsWith(`${prefix}=`));
  return match ? match.slice(prefix.length + 1) : '';
}

function requiredArgument(name) {
  const value = argumentValue(`--${name}`);
  if (!value) throw new Error(`missing_argument:${name}`);
  return value;
}

export function buildFixtureManifest({
  manifestId = randomUUID(),
  authUserId,
  leadId,
  orderId,
  needId,
  expectedUpdatedAt,
  idempotencyKey,
  taskTitle,
  createdAt = new Date().toISOString(),
  expiresAt = new Date(Date.parse(createdAt) + 4 * 60 * 60 * 1000).toISOString()
}) {
  const value = {
    manifest_version: FIXTURE_MANIFEST_VERSION,
    manifest_id: manifestId,
    project_ref: STAGING_PROJECT_REF,
    synthetic_only: true,
    production_enabled: false,
    created_at: new Date(createdAt).toISOString(),
    expires_at: new Date(expiresAt).toISOString(),
    fixture_ids: {
      auth_user_id: authUserId,
      profile_user_id: authUserId,
      lead_id: leadId,
      order_id: orderId,
      need_id: needId
    },
    order_snapshot: {
      expected_updated_at: new Date(expectedUpdatedAt).toISOString(),
      need_design: true,
      is_archived: false
    },
    command: {
      action: ACTION,
      idempotency_key: text(idempotencyKey),
      task_title: text(taskTitle)
    },
    baseline_counts: {
      profiles: 1,
      leads: 1,
      orders: 1,
      needs: 1,
      design_tasks: 0,
      design_events: 0,
      receipts: 0,
      environment_guard: 1
    },
    expected_after_success: {
      profiles: 1,
      leads: 1,
      orders: 1,
      needs: 1,
      design_tasks: 1,
      design_events: 1,
      successful_receipts: 1,
      environment_guard: 1
    },
    cleanup_order: [
      'receipt', 'design_event', 'design_task', 'need',
      'order', 'lead', 'profile', 'auth_user'
    ]
  };

  for (const [name, id] of Object.entries({ manifestId, authUserId, leadId, orderId, needId })) {
    if (!isUuid(id)) throw new Error(`${name}_invalid`);
  }
  if (!Number.isFinite(Date.parse(expectedUpdatedAt))) throw new Error('expected_updated_at_invalid');

  const checked = validateFixtureManifest(value, { now: Date.parse(createdAt) });
  if (!checked.ok) throw new Error(`generated_manifest_invalid:${checked.errors.join(',')}`);
  return value;
}

export async function writeFixtureManifest(filePath, manifest) {
  const target = path.resolve(filePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return target;
}

async function main() {
  const output = argumentValue('--output') || 'artifacts/design-task-staging-fixture-manifest.json';
  const createdAt = argumentValue('--created-at') || new Date().toISOString();
  const expiresAt = argumentValue('--expires-at')
    || new Date(Date.parse(createdAt) + 4 * 60 * 60 * 1000).toISOString();
  const manifest = buildFixtureManifest({
    authUserId: requiredArgument('auth-user-id'),
    leadId: requiredArgument('lead-id'),
    orderId: requiredArgument('order-id'),
    needId: requiredArgument('need-id'),
    expectedUpdatedAt: requiredArgument('expected-updated-at'),
    idempotencyKey: requiredArgument('idempotency-key'),
    taskTitle: argumentValue('--task-title') || 'Synthetic staging design E2E v2',
    createdAt,
    expiresAt
  });
  const target = await writeFixtureManifest(output, manifest);
  console.log(JSON.stringify({
    ok: true,
    project_ref: STAGING_PROJECT_REF,
    manifest_version: FIXTURE_MANIFEST_VERSION,
    manifest_id: manifest.manifest_id,
    expires_at: manifest.expires_at,
    output: target,
    contains_credentials: false,
    cleanup_required: true
  }, null, 2));
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: text(error?.message).slice(0, 500) }));
    process.exitCode = 1;
  });
}
