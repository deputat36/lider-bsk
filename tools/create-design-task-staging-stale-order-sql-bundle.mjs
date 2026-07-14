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

export const STALE_ORDER_SQL_BUNDLE_VERSION = 'leader-design-task-staging-stale-order-sql-bundle-v1';
export const DEFAULT_MANIFEST_PATH = 'artifacts/design-task-staging-fixture-manifest.json';
export const DEFAULT_OUTPUT_DIR = 'artifacts/design-task-staging-stale-order';
export const DEFAULT_SUMMARY_PATH = 'artifacts/design-task-staging-stale-order-sql-bundle.json';

export const STALE_ORDER_TRANSITIONS = Object.freeze({
  stale_order: Object.freeze({
    output: 'stale-order.sql',
    from: 'expected',
    to: 'stale',
    restoreRequired: true
  }),
  restore_order_version: Object.freeze({
    output: 'restore-order-version.sql',
    from: 'stale',
    to: 'expected',
    restoreRequired: false
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

function guardSql(indent = '  ') {
  return `${indent}if not exists (\n${indent}  select 1\n${indent}  from leader_staging.environment_guard\n${indent}  where singleton = true\n${indent}    and project_ref = '${STAGING_PROJECT_REF}'\n${indent}    and environment_name = 'staging'\n${indent}    and repository = 'deputat36/lider-bsk'\n${indent}) then\n${indent}  raise exception 'staging_environment_guard_failed';\n${indent}end if;`;
}

function scopedCountsSql(indent = '  ') {
  return `jsonb_build_object(\n${indent}  'profiles', (select count(*) from public.leader_user_profiles where user_id = v_auth_user_id),\n${indent}  'leads', (select count(*) from public.leader_leads where id = v_lead_id),\n${indent}  'orders', (select count(*) from public.leader_orders where id = v_order_id),\n${indent}  'needs', (select count(*) from public.leader_lead_needs where id = v_need_id),\n${indent}  'production_jobs', (select count(*) from public.leader_production_jobs where order_id = v_order_id),\n${indent}  'design_tasks', (select count(*) from public.leader_design_tasks where order_id = v_order_id),\n${indent}  'design_events', (select count(*) from public.leader_design_task_events where order_id = v_order_id),\n${indent}  'receipts', (\n${indent}    select count(*)\n${indent}    from leader_private.leader_command_receipts\n${indent}    where action = '${ACTION}'\n${indent}      and idempotency_key in (v_idempotency_key, v_stale_idempotency_key)\n${indent}  )\n${indent})`;
}

export function buildStaleOrderTransitionSql(manifest, transitionName, { now = Date.now() } = {}) {
  const checked = validateFixtureManifest(manifest, { now });
  if (!checked.ok) throw new Error(`fixture_manifest_invalid:${checked.errors.join(',')}`);
  const transition = STALE_ORDER_TRANSITIONS[transitionName];
  if (!transition) throw new Error(`stale_order_transition_invalid:${transitionName}`);

  const ids = manifest.fixture_ids;
  const expectedUpdatedAt = manifest.order_snapshot.expected_updated_at;
  const fromExpr = transition.from === 'expected' ? 'v_expected_updated_at' : 'v_stale_updated_at';
  const toExpr = transition.to === 'expected' ? 'v_expected_updated_at' : 'v_stale_updated_at';

  return `-- GENERATED FILE. STAGING ONLY. DO NOT COMMIT.\n-- Bundle: ${STALE_ORDER_SQL_BUNDLE_VERSION}\n-- Transition: ${transitionName}\n-- Manifest digest: ${manifestDigest(manifest)}\n-- Target: ${STAGING_PROJECT_REF}\n-- Updates only the manifest-bound synthetic order version timestamp.\n\nbegin;\n\ndo $stale_order_transition$\ndeclare\n  v_auth_user_id uuid := ${uuidLiteral(ids.auth_user_id)};\n  v_lead_id uuid := ${uuidLiteral(ids.lead_id)};\n  v_order_id uuid := ${uuidLiteral(ids.order_id)};\n  v_need_id uuid := ${uuidLiteral(ids.need_id)};\n  v_expected_updated_at timestamptz := ${timestampLiteral(expectedUpdatedAt)};\n  v_stale_updated_at timestamptz := ${timestampLiteral(expectedUpdatedAt)} + interval '1 second';\n  v_expires_at timestamptz := ${timestampLiteral(manifest.expires_at)};\n  v_idempotency_key text := ${sqlLiteral(manifest.command.idempotency_key)};\n  v_stale_idempotency_key text := left(${sqlLiteral(manifest.command.idempotency_key)} || '-stale-order', 180);\n  v_counts_before jsonb;\n  v_counts_after jsonb;\n  v_order_before jsonb;\n  v_order_after jsonb;\n  v_rows integer;\nbegin\n${guardSql()}\n\n  if clock_timestamp() >= v_expires_at then\n    raise exception 'fixture_manifest_expired';\n  end if;\n\n  if not exists (\n    select 1\n    from auth.users\n    where id = v_auth_user_id\n      and email is not null\n      and email_confirmed_at is not null\n  ) then\n    raise exception 'confirmed_staging_auth_user_required';\n  end if;\n\n  if not exists (\n    select 1\n    from public.leader_user_profiles\n    where user_id = v_auth_user_id\n      and email is null\n      and full_name = 'Synthetic staging design E2E manager'\n      and role = 'manager'\n      and is_active = true\n      and permissions = '{}'::jsonb\n  ) then\n    raise exception 'active_synthetic_manager_profile_required';\n  end if;\n\n  if not exists (\n    select 1\n    from public.leader_orders\n    where id = v_order_id\n      and owner_id = v_auth_user_id\n      and lead_id = v_lead_id\n      and project_name = 'Synthetic staging design E2E'\n      and client_name is null\n      and client_phone is null\n      and internal_comment is null\n      and is_archived = false\n      and updated_at = ${fromExpr}\n  ) then\n    raise exception 'synthetic_order_version_precondition_failed';\n  end if;\n\n  if not exists (\n    select 1\n    from public.leader_lead_needs\n    where id = v_need_id\n      and lead_id = v_lead_id\n      and need_design = true\n      and status = 'Подтверждено'\n  ) then\n    raise exception 'synthetic_design_need_required';\n  end if;\n\n  if exists (select 1 from public.leader_production_jobs where order_id = v_order_id)\n     or exists (select 1 from public.leader_design_tasks where order_id = v_order_id)\n     or exists (select 1 from public.leader_design_task_events where order_id = v_order_id)\n     or exists (\n       select 1\n       from leader_private.leader_command_receipts\n       where action = '${ACTION}'\n         and idempotency_key in (v_idempotency_key, v_stale_idempotency_key)\n     ) then\n    raise exception 'stale_order_probe_requires_clean_baseline';\n  end if;\n\n  v_counts_before := ${scopedCountsSql('  ')};\n\n  select to_jsonb(source_order) - 'updated_at'\n  into v_order_before\n  from public.leader_orders as source_order\n  where source_order.id = v_order_id;\n\n  update public.leader_orders\n  set updated_at = ${toExpr}\n  where id = v_order_id\n    and updated_at = ${fromExpr};\n\n  get diagnostics v_rows = row_count;\n  if v_rows <> 1 then\n    raise exception 'stale_order_update_count_invalid';\n  end if;\n\n  select to_jsonb(source_order) - 'updated_at'\n  into v_order_after\n  from public.leader_orders as source_order\n  where source_order.id = v_order_id;\n\n  if v_order_after is distinct from v_order_before then\n    raise exception 'stale_order_non_version_fields_changed';\n  end if;\n\n  if not exists (\n    select 1\n    from public.leader_orders\n    where id = v_order_id\n      and updated_at = ${toExpr}\n  ) then\n    raise exception 'stale_order_version_postcondition_failed';\n  end if;\n\n  v_counts_after := ${scopedCountsSql('  ')};\n  if v_counts_after is distinct from v_counts_before then\n    raise exception 'stale_order_business_counts_changed';\n  end if;\nend\n$stale_order_transition$;\n\ncommit;\n\nselect jsonb_build_object(\n  'ok', true,\n  'bundle_version', '${STALE_ORDER_SQL_BUNDLE_VERSION}',\n  'project_ref', '${STAGING_PROJECT_REF}',\n  'transition', ${sqlLiteral(transitionName)},\n  'order_version_state', ${sqlLiteral(transition.to)},\n  'restore_required', ${transition.restoreRequired ? 'true' : 'false'},\n  'auth_user_mutated', false,\n  'non_version_order_fields_mutated', false,\n  'business_counts_mutated', false\n) as stale_order_transition_result;\n`;
}

export function buildStaleOrderSqlBundle(manifest, options = {}) {
  const checked = validateFixtureManifest(manifest, options);
  if (!checked.ok) throw new Error(`fixture_manifest_invalid:${checked.errors.join(',')}`);
  const scripts = Object.fromEntries(
    Object.keys(STALE_ORDER_TRANSITIONS).map((name) => [
      name,
      buildStaleOrderTransitionSql(manifest, name, options)
    ])
  );
  return {
    bundle_version: STALE_ORDER_SQL_BUNDLE_VERSION,
    project_ref: STAGING_PROJECT_REF,
    production_enabled: false,
    manifest_version: FIXTURE_MANIFEST_VERSION,
    manifest_id: manifest.manifest_id,
    manifest_digest_sha256: manifestDigest(manifest),
    transition_order: Object.keys(STALE_ORDER_TRANSITIONS),
    outputs: Object.fromEntries(
      Object.entries(STALE_ORDER_TRANSITIONS).map(([name, value]) => [name, value.output])
    ),
    scripts,
    script_sha256: Object.fromEntries(
      Object.entries(scripts).map(([name, sql]) => [name, sha256(sql)])
    ),
    auth_user_required: true,
    auth_user_created_or_deleted_by_sql: false,
    allowed_update_tables: ['public.leader_orders'],
    allowed_update_columns: ['updated_at']
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
  const bundle = buildStaleOrderSqlBundle(manifest);
  const written = {};

  for (const [name, sql] of Object.entries(bundle.scripts)) {
    written[name] = await writePrivate(path.join(outputDir, bundle.outputs[name]), sql);
  }

  const summary = {
    bundle_version: bundle.bundle_version,
    project_ref: bundle.project_ref,
    production_enabled: false,
    manifest_version: bundle.manifest_version,
    manifest_id: bundle.manifest_id,
    manifest_digest_sha256: bundle.manifest_digest_sha256,
    transition_order: bundle.transition_order,
    outputs: written,
    script_sha256: bundle.script_sha256,
    contains_credentials: false,
    performs_network_calls: false,
    executes_sql: false,
    auth_user_required: true,
    auth_user_created_or_deleted_by_sql: false,
    allowed_update_tables: bundle.allowed_update_tables,
    allowed_update_columns: bundle.allowed_update_columns
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
