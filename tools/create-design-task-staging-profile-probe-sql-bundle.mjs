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

export const PROFILE_PROBE_SQL_BUNDLE_VERSION = 'leader-design-task-staging-profile-probe-sql-bundle-v1';
export const DEFAULT_MANIFEST_PATH = 'artifacts/design-task-staging-fixture-manifest.json';
export const DEFAULT_OUTPUT_DIR = 'artifacts/design-task-staging-profile-probes';
export const DEFAULT_SUMMARY_PATH = 'artifacts/design-task-staging-profile-probe-sql-bundle.json';

export const PROFILE_PROBES = Object.freeze({
  forbidden_role: Object.freeze({
    role: 'accountant',
    isActive: true,
    runnerMode: 'forbidden_role',
    expectedHttp: 403
  }),
  inactive_profile: Object.freeze({
    role: 'manager',
    isActive: false,
    runnerMode: 'inactive_profile',
    expectedHttp: 403
  }),
  unknown_role: Object.freeze({
    role: 'staging_unknown_probe',
    isActive: true,
    runnerMode: 'unknown_role',
    expectedHttp: 403
  }),
  restore_manager: Object.freeze({
    role: 'manager',
    isActive: true,
    runnerMode: null,
    expectedHttp: null
  })
});

function text(value) {
  return String(value ?? '').trim();
}

function argValue(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : '';
}

export function sqlLiteral(value) {
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

function boolSql(value) {
  return value === true ? 'true' : 'false';
}

function guardSql(indent = '  ') {
  return `${indent}if not exists (\n${indent}  select 1\n${indent}  from leader_staging.environment_guard\n${indent}  where singleton = true\n${indent}    and project_ref = '${STAGING_PROJECT_REF}'\n${indent}    and environment_name = 'staging'\n${indent}    and repository = 'deputat36/lider-bsk'\n${indent}) then\n${indent}  raise exception 'staging_environment_guard_failed';\n${indent}end if;`;
}

function scopedCountsSql(indent = '  ') {
  return `jsonb_build_object(\n${indent}  'leads', (select count(*) from public.leader_leads where id = v_lead_id),\n${indent}  'orders', (select count(*) from public.leader_orders where id = v_order_id),\n${indent}  'needs', (select count(*) from public.leader_lead_needs where id = v_need_id),\n${indent}  'production_jobs', (select count(*) from public.leader_production_jobs where order_id = v_order_id),\n${indent}  'design_tasks', (select count(*) from public.leader_design_tasks where order_id = v_order_id),\n${indent}  'design_events', (select count(*) from public.leader_design_task_events where order_id = v_order_id),\n${indent}  'receipts', (\n${indent}    select count(*)\n${indent}    from leader_private.leader_command_receipts\n${indent}    where action = '${ACTION}'\n${indent}      and idempotency_key = v_idempotency_key\n${indent}  )\n${indent})`;
}

export function buildProfileProbeSql(manifest, probeName, { now = Date.now() } = {}) {
  const checked = validateFixtureManifest(manifest, { now });
  if (!checked.ok) throw new Error(`fixture_manifest_invalid:${checked.errors.join(',')}`);
  const probe = PROFILE_PROBES[probeName];
  if (!probe) throw new Error(`profile_probe_invalid:${probeName}`);

  const ids = manifest.fixture_ids;
  const expiresAt = manifest.expires_at;
  const roleLiteral = sqlLiteral(probe.role);
  const activeSql = boolSql(probe.isActive);
  const runnerMode = probe.runnerMode ? sqlLiteral(probe.runnerMode) : 'null';
  const expectedHttp = Number.isInteger(probe.expectedHttp) ? String(probe.expectedHttp) : 'null';

  return `-- GENERATED FILE. STAGING ONLY. DO NOT COMMIT.\n-- Bundle: ${PROFILE_PROBE_SQL_BUNDLE_VERSION}\n-- Probe: ${probeName}\n-- Manifest digest: ${manifestDigest(manifest)}\n-- Target: ${STAGING_PROJECT_REF}\n-- Updates only the manifest-bound synthetic CRM profile.\n\nbegin;\n\ndo $profile_probe$\ndeclare\n  v_auth_user_id uuid := ${uuidLiteral(ids.auth_user_id)};\n  v_lead_id uuid := ${uuidLiteral(ids.lead_id)};\n  v_order_id uuid := ${uuidLiteral(ids.order_id)};\n  v_need_id uuid := ${uuidLiteral(ids.need_id)};\n  v_expires_at timestamptz := ${timestampLiteral(expiresAt)};\n  v_idempotency_key text := ${sqlLiteral(manifest.command.idempotency_key)};\n  v_before jsonb;\n  v_after jsonb;\n  v_rows integer;\nbegin\n${guardSql()}\n\n  if clock_timestamp() >= v_expires_at then\n    raise exception 'fixture_manifest_expired';\n  end if;\n\n  if not exists (\n    select 1\n    from auth.users\n    where id = v_auth_user_id\n      and email is not null\n      and email_confirmed_at is not null\n  ) then\n    raise exception 'confirmed_staging_auth_user_required';\n  end if;\n\n  if not exists (\n    select 1\n    from public.leader_user_profiles\n    where user_id = v_auth_user_id\n      and email is null\n      and full_name = 'Synthetic staging design E2E manager'\n  ) then\n    raise exception 'synthetic_staging_profile_required';\n  end if;\n\n  v_before := ${scopedCountsSql('  ')};\n\n  update public.leader_user_profiles\n  set role = ${roleLiteral},\n      is_active = ${activeSql},\n      permissions = '{}'::jsonb,\n      updated_at = clock_timestamp()\n  where user_id = v_auth_user_id\n    and email is null\n    and full_name = 'Synthetic staging design E2E manager';\n\n  get diagnostics v_rows = row_count;\n  if v_rows <> 1 then\n    raise exception 'profile_probe_update_count_invalid';\n  end if;\n\n  if not exists (\n    select 1\n    from public.leader_user_profiles\n    where user_id = v_auth_user_id\n      and role = ${roleLiteral}\n      and is_active = ${activeSql}\n      and permissions = '{}'::jsonb\n  ) then\n    raise exception 'profile_probe_postcondition_failed';\n  end if;\n\n  v_after := ${scopedCountsSql('  ')};\n  if v_after is distinct from v_before then\n    raise exception 'profile_probe_business_state_changed';\n  end if;\nend\n$profile_probe$;\n\ncommit;\n\nselect jsonb_build_object(\n  'ok', true,\n  'bundle_version', '${PROFILE_PROBE_SQL_BUNDLE_VERSION}',\n  'project_ref', '${STAGING_PROJECT_REF}',\n  'probe_name', ${sqlLiteral(probeName)},\n  'profile_role', ${roleLiteral},\n  'profile_is_active', ${activeSql},\n  'runner_mode', ${runnerMode},\n  'expected_http', ${expectedHttp},\n  'auth_user_mutated', false,\n  'business_rows_mutated', false\n) as profile_probe_result;\n`;
}

export function buildProfileProbeSqlBundle(manifest, options = {}) {
  const checked = validateFixtureManifest(manifest, options);
  if (!checked.ok) throw new Error(`fixture_manifest_invalid:${checked.errors.join(',')}`);
  const scripts = Object.fromEntries(
    Object.keys(PROFILE_PROBES).map((name) => [name, buildProfileProbeSql(manifest, name, options)])
  );
  return {
    bundle_version: PROFILE_PROBE_SQL_BUNDLE_VERSION,
    project_ref: STAGING_PROJECT_REF,
    production_enabled: false,
    manifest_version: FIXTURE_MANIFEST_VERSION,
    manifest_id: manifest.manifest_id,
    manifest_digest_sha256: manifestDigest(manifest),
    probe_order: Object.keys(PROFILE_PROBES),
    scripts,
    script_sha256: Object.fromEntries(
      Object.entries(scripts).map(([name, sql]) => [name, sha256(sql)])
    ),
    auth_user_required: true,
    auth_user_created_or_deleted_by_sql: false,
    allowed_update_tables: ['public.leader_user_profiles']
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
  const outputDir = path.resolve(argValue('output-dir') || DEFAULT_OUTPUT_DIR);
  const summaryPath = argValue('summary-output') || DEFAULT_SUMMARY_PATH;
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const bundle = buildProfileProbeSqlBundle(manifest);
  const outputs = {};

  for (const [name, sql] of Object.entries(bundle.scripts)) {
    outputs[name] = await writePrivate(path.join(outputDir, `${name.replaceAll('_', '-')}.sql`), sql);
  }

  const summary = {
    bundle_version: bundle.bundle_version,
    project_ref: bundle.project_ref,
    production_enabled: false,
    manifest_version: bundle.manifest_version,
    manifest_id: bundle.manifest_id,
    manifest_digest_sha256: bundle.manifest_digest_sha256,
    probe_order: bundle.probe_order,
    script_sha256: bundle.script_sha256,
    outputs,
    contains_credentials: false,
    performs_network_calls: false,
    executes_sql: false,
    auth_user_required: true,
    auth_user_created_or_deleted_by_sql: false,
    allowed_update_tables: bundle.allowed_update_tables
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
