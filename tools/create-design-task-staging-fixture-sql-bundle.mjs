#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  FIXTURE_MANIFEST_VERSION,
  manifestDigest,
  validateFixtureManifest
} from './design-task-staging-auth-e2e-v2.mjs';
import {
  ACTION,
  STAGING_PROJECT_REF
} from './design-task-staging-auth-e2e.mjs';

export const SQL_BUNDLE_VERSION = 'leader-design-task-staging-fixture-sql-bundle-v1';
export const DEFAULT_MANIFEST_PATH = 'artifacts/design-task-staging-fixture-manifest.json';
export const DEFAULT_SEED_PATH = 'artifacts/design-task-staging-fixture-seed.sql';
export const DEFAULT_CLEANUP_PATH = 'artifacts/design-task-staging-fixture-cleanup.sql';
export const DEFAULT_SUMMARY_PATH = 'artifacts/design-task-staging-fixture-sql-bundle.json';

function text(value) {
  return String(value ?? '').trim();
}

function argValue(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : '';
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function uuidLiteral(value) {
  return `${sqlLiteral(value)}::uuid`;
}

function timestampLiteral(value) {
  return `${sqlLiteral(new Date(value).toISOString())}::timestamptz`;
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function guardSql(indent = '  ') {
  return `${indent}if not exists (\n${indent}  select 1\n${indent}  from leader_staging.environment_guard\n${indent}  where singleton = true\n${indent}    and project_ref = '${STAGING_PROJECT_REF}'\n${indent}    and environment_name = 'staging'\n${indent}    and repository = 'deputat36/lider-bsk'\n${indent}) then\n${indent}  raise exception 'staging_environment_guard_failed';\n${indent}end if;`;
}

export function buildSeedSql(manifest, { now = Date.now() } = {}) {
  const checked = validateFixtureManifest(manifest, { now });
  if (!checked.ok) throw new Error(`fixture_manifest_invalid:${checked.errors.join(',')}`);

  const ids = manifest.fixture_ids;
  const updatedAt = manifest.order_snapshot.expected_updated_at;
  const expiresAt = manifest.expires_at;

  return `-- GENERATED FILE. STAGING ONLY. DO NOT COMMIT.\n-- Bundle: ${SQL_BUNDLE_VERSION}\n-- Manifest digest: ${manifestDigest(manifest)}\n-- Target: ${STAGING_PROJECT_REF}\n-- Creates only synthetic CRM fixtures after the Auth user already exists.\n\nbegin;\n\ndo $fixture_seed$\ndeclare\n  v_auth_user_id uuid := ${uuidLiteral(ids.auth_user_id)};\n  v_lead_id uuid := ${uuidLiteral(ids.lead_id)};\n  v_order_id uuid := ${uuidLiteral(ids.order_id)};\n  v_need_id uuid := ${uuidLiteral(ids.need_id)};\n  v_expected_updated_at timestamptz := ${timestampLiteral(updatedAt)};\n  v_expires_at timestamptz := ${timestampLiteral(expiresAt)};\n  v_idempotency_key text := ${sqlLiteral(manifest.command.idempotency_key)};\nbegin\n${guardSql()}\n\n  if clock_timestamp() >= v_expires_at then\n    raise exception 'fixture_manifest_expired';\n  end if;\n\n  if not exists (\n    select 1\n    from auth.users\n    where id = v_auth_user_id\n      and email is not null\n      and email_confirmed_at is not null\n  ) then\n    raise exception 'confirmed_staging_auth_user_required';\n  end if;\n\n  if exists (select 1 from public.leader_user_profiles where user_id = v_auth_user_id)\n     or exists (select 1 from public.leader_leads where id = v_lead_id)\n     or exists (select 1 from public.leader_orders where id = v_order_id)\n     or exists (select 1 from public.leader_lead_needs where id = v_need_id)\n     or exists (select 1 from public.leader_production_jobs where order_id = v_order_id)\n     or exists (select 1 from public.leader_design_tasks where order_id = v_order_id)\n     or exists (\n       select 1\n       from leader_private.leader_command_receipts\n       where action = '${ACTION}'\n         and idempotency_key = v_idempotency_key\n     ) then\n    raise exception 'fixture_collision_detected';\n  end if;\n\n  insert into public.leader_user_profiles (\n    user_id, email, full_name, role, is_active, permissions, created_at, updated_at\n  ) values (\n    v_auth_user_id, null, 'Synthetic staging design E2E manager',\n    'manager', true, '{}'::jsonb, v_expected_updated_at, v_expected_updated_at\n  );\n\n  insert into public.leader_leads (id, status, created_at, updated_at)\n  values (v_lead_id, 'Новая', v_expected_updated_at, v_expected_updated_at);\n\n  insert into public.leader_orders (\n    id, owner_id, lead_id, project_name, client_name, client_phone,\n    status, priority, deadline, layout_status, layout_link, payment_status,\n    client_total, contractor_cost, profit, prepayment, balance,\n    production_status, internal_comment, data, is_archived, created_at, updated_at\n  ) values (\n    v_order_id, v_auth_user_id, v_lead_id, 'Synthetic staging design E2E', null, null,\n    'Новый', 'Обычный', (v_expected_updated_at + interval '7 days')::date,\n    null, null, null, 0, 0, 0, 0, 0, 'Не передано', null, '{}'::jsonb, false,\n    v_expected_updated_at, v_expected_updated_at\n  );\n\n  insert into public.leader_lead_needs (\n    id, lead_id, need_type, title, description, structured_data, need_design,\n    design_reason, deadline_date, status, completeness_score, missing_fields,\n    created_by, updated_by, created_at, updated_at\n  ) values (\n    v_need_id, v_lead_id, 'Дизайн', 'Synthetic design need', null, '{}'::jsonb, true,\n    'Authenticated staging design E2E',\n    (v_expected_updated_at + interval '7 days')::date, 'Подтверждено', 100, '[]'::jsonb,\n    v_auth_user_id, null, v_expected_updated_at, v_expected_updated_at\n  );\n\n  if (select count(*) from public.leader_user_profiles where user_id = v_auth_user_id) <> 1\n     or (select count(*) from public.leader_leads where id = v_lead_id) <> 1\n     or (select count(*) from public.leader_orders where id = v_order_id and updated_at = v_expected_updated_at and is_archived = false) <> 1\n     or (select count(*) from public.leader_lead_needs where id = v_need_id and lead_id = v_lead_id and need_design = true) <> 1\n     or (select count(*) from public.leader_design_tasks where order_id = v_order_id) <> 0\n     or (select count(*) from public.leader_design_task_events where order_id = v_order_id) <> 0\n     or (select count(*) from leader_private.leader_command_receipts where action = '${ACTION}' and idempotency_key = v_idempotency_key) <> 0 then\n    raise exception 'fixture_seed_postcondition_failed';\n  end if;\nend\n$fixture_seed$;\n\ncommit;\n\nselect jsonb_build_object(\n  'ok', true,\n  'bundle_version', '${SQL_BUNDLE_VERSION}',\n  'project_ref', '${STAGING_PROJECT_REF}',\n  'fixture_seeded', true,\n  'auth_user_created_by_sql', false,\n  'cleanup_required', true\n) as fixture_seed_result;\n`;
}

export function buildCleanupSql(manifest, { now = Date.now() } = {}) {
  const checked = validateFixtureManifest(manifest, { now });
  if (!checked.ok) throw new Error(`fixture_manifest_invalid:${checked.errors.join(',')}`);

  const ids = manifest.fixture_ids;

  return `-- GENERATED FILE. STAGING ONLY. DO NOT COMMIT.\n-- Bundle: ${SQL_BUNDLE_VERSION}\n-- Manifest digest: ${manifestDigest(manifest)}\n-- Target: ${STAGING_PROJECT_REF}\n-- Removes only manifest-bound synthetic database fixtures.\n-- The Auth user must be deleted separately through Dashboard/Admin API after this SQL.\n\nbegin;\n\ndo $fixture_cleanup$\ndeclare\n  v_auth_user_id uuid := ${uuidLiteral(ids.auth_user_id)};\n  v_lead_id uuid := ${uuidLiteral(ids.lead_id)};\n  v_order_id uuid := ${uuidLiteral(ids.order_id)};\n  v_need_id uuid := ${uuidLiteral(ids.need_id)};\n  v_idempotency_key text := ${sqlLiteral(manifest.command.idempotency_key)};\nbegin\n${guardSql()}\n\n  if not exists (select 1 from auth.users where id = v_auth_user_id) then\n    raise exception 'auth_user_must_be_deleted_last';\n  end if;\n\n  delete from leader_private.leader_command_receipts\n  where action = '${ACTION}'\n    and idempotency_key = v_idempotency_key\n    and actor_id = v_auth_user_id;\n\n  delete from public.leader_design_task_events\n  where order_id = v_order_id\n     or task_id in (select id from public.leader_design_tasks where order_id = v_order_id);\n\n  delete from public.leader_design_tasks\n  where order_id = v_order_id;\n\n  delete from public.leader_production_jobs\n  where order_id = v_order_id;\n\n  delete from public.leader_lead_needs\n  where id = v_need_id\n    and lead_id = v_lead_id;\n\n  delete from public.leader_orders\n  where id = v_order_id\n    and lead_id = v_lead_id;\n\n  delete from public.leader_leads\n  where id = v_lead_id;\n\n  delete from public.leader_user_profiles\n  where user_id = v_auth_user_id;\n\n  if exists (select 1 from public.leader_user_profiles where user_id = v_auth_user_id)\n     or exists (select 1 from public.leader_leads where id = v_lead_id)\n     or exists (select 1 from public.leader_orders where id = v_order_id)\n     or exists (select 1 from public.leader_lead_needs where id = v_need_id)\n     or exists (select 1 from public.leader_production_jobs where order_id = v_order_id)\n     or exists (select 1 from public.leader_design_tasks where order_id = v_order_id)\n     or exists (select 1 from public.leader_design_task_events where order_id = v_order_id)\n     or exists (\n       select 1\n       from leader_private.leader_command_receipts\n       where action = '${ACTION}'\n         and idempotency_key = v_idempotency_key\n     ) then\n    raise exception 'fixture_cleanup_postcondition_failed';\n  end if;\n\n  if not exists (select 1 from auth.users where id = v_auth_user_id) then\n    raise exception 'auth_user_missing_before_external_delete';\n  end if;\nend\n$fixture_cleanup$;\n\ncommit;\n\nselect jsonb_build_object(\n  'ok', true,\n  'bundle_version', '${SQL_BUNDLE_VERSION}',\n  'project_ref', '${STAGING_PROJECT_REF}',\n  'database_fixtures_removed', true,\n  'auth_user_delete_required', true,\n  'post_cleanup_snapshot_required', true\n) as fixture_cleanup_result;\n`;
}

export function buildSqlBundle(manifest, options = {}) {
  const checked = validateFixtureManifest(manifest, options);
  if (!checked.ok) throw new Error(`fixture_manifest_invalid:${checked.errors.join(',')}`);
  const seedSql = buildSeedSql(manifest, options);
  const cleanupSql = buildCleanupSql(manifest, options);
  return {
    bundle_version: SQL_BUNDLE_VERSION,
    project_ref: STAGING_PROJECT_REF,
    production_enabled: false,
    manifest_version: FIXTURE_MANIFEST_VERSION,
    manifest_id: manifest.manifest_id,
    manifest_digest_sha256: manifestDigest(manifest),
    seed_sha256: sha256(seedSql),
    cleanup_sha256: sha256(cleanupSql),
    auth_user_required: true,
    auth_user_created_or_deleted_by_sql: false,
    seed_sql: seedSql,
    cleanup_sql: cleanupSql
  };
}

async function writePrivate(filePath, content) {
  const target = path.resolve(filePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, { encoding: 'utf8', mode: 0o600 });
  return target;
}

async function main() {
  const manifestPath = path.resolve(argValue('manifest') || DEFAULT_MANIFEST_PATH);
  const seedPath = argValue('seed-output') || DEFAULT_SEED_PATH;
  const cleanupPath = argValue('cleanup-output') || DEFAULT_CLEANUP_PATH;
  const summaryPath = argValue('summary-output') || DEFAULT_SUMMARY_PATH;
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const bundle = buildSqlBundle(manifest);

  const seedTarget = await writePrivate(seedPath, bundle.seed_sql);
  const cleanupTarget = await writePrivate(cleanupPath, bundle.cleanup_sql);
  const summary = {
    bundle_version: bundle.bundle_version,
    project_ref: bundle.project_ref,
    production_enabled: false,
    manifest_version: bundle.manifest_version,
    manifest_id: bundle.manifest_id,
    manifest_digest_sha256: bundle.manifest_digest_sha256,
    seed_sha256: bundle.seed_sha256,
    cleanup_sha256: bundle.cleanup_sha256,
    seed_output: seedTarget,
    cleanup_output: cleanupTarget,
    contains_credentials: false,
    performs_network_calls: false,
    executes_sql: false,
    auth_user_required: true,
    auth_user_created_or_deleted_by_sql: false
  };
  const summaryTarget = await writePrivate(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, ...summary, summary_output: summaryTarget }, null, 2));
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: text(error?.message).slice(0, 500) }));
    process.exitCode = 1;
  });
}
