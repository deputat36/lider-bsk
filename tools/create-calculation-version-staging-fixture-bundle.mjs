#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn';
export const ACTION = 'calculation.create_version';
export const FIXTURE_MANIFEST_VERSION = 'leader-calculation-version-staging-fixture-manifest-v1';
export const FIXTURE_BUNDLE_VERSION = 'leader-calculation-version-staging-fixture-sql-bundle-v1';
export const DEFAULT_OUTPUT_DIR = 'artifacts/calculation-version-staging-fixture';
export const MAX_TTL_HOURS = 24;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLEANUP_ORDER = Object.freeze([
  'receipt',
  'created_calculation_items',
  'created_calculations',
  'source_calculation_item',
  'source_calculation',
  'need',
  'lead',
  'profile',
  'auth_user'
]);

function text(value) {
  return String(value ?? '').trim();
}

function argValue(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : '';
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

export function sha256(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

export function manifestDigest(manifest) {
  return sha256(JSON.stringify(canonicalize(manifest)));
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

function guardSql(indent = '  ') {
  return `${indent}if not exists (\n${indent}  select 1\n${indent}  from leader_staging.environment_guard\n${indent}  where singleton = true\n${indent}    and project_ref = '${STAGING_PROJECT_REF}'\n${indent}    and environment_name = 'staging'\n${indent}    and repository = 'deputat36/lider-bsk'\n${indent}) then\n${indent}  raise exception 'staging_environment_guard_failed';\n${indent}end if;`;
}

function validTimestamp(value) {
  return Boolean(text(value)) && Number.isFinite(Date.parse(value));
}

export function validateFixtureManifest(manifest, { now = Date.now() } = {}) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { ok: false, errors: ['manifest_not_object'] };
  }
  if (manifest.manifest_version !== FIXTURE_MANIFEST_VERSION) errors.push('manifest_version_invalid');
  if (!UUID_RE.test(text(manifest.manifest_id))) errors.push('manifest_id_invalid');
  if (manifest.project_ref !== STAGING_PROJECT_REF) errors.push('project_ref_invalid');
  if (manifest.synthetic_only !== true) errors.push('synthetic_only_required');
  if (manifest.production_enabled !== false) errors.push('production_must_be_disabled');
  if (!validTimestamp(manifest.created_at)) errors.push('created_at_invalid');
  if (!validTimestamp(manifest.expires_at)) errors.push('expires_at_invalid');

  const createdAt = Date.parse(manifest.created_at);
  const expiresAt = Date.parse(manifest.expires_at);
  if (Number.isFinite(expiresAt) && expiresAt <= now) errors.push('manifest_expired');
  if (Number.isFinite(createdAt) && Number.isFinite(expiresAt)) {
    if (expiresAt <= createdAt) errors.push('expiry_order_invalid');
    if (expiresAt - createdAt > MAX_TTL_HOURS * 60 * 60 * 1000) errors.push('ttl_too_long');
  }

  const ids = manifest.fixture_ids || {};
  for (const field of [
    'auth_user_id',
    'profile_user_id',
    'lead_id',
    'need_id',
    'source_calculation_id',
    'source_item_id'
  ]) {
    if (!UUID_RE.test(text(ids[field]))) errors.push(`${field}_invalid`);
  }
  if (text(ids.auth_user_id) !== text(ids.profile_user_id)) errors.push('profile_auth_identity_mismatch');

  const source = manifest.source_snapshot || {};
  if (!validTimestamp(source.expected_updated_at)) errors.push('expected_updated_at_invalid');
  if (Number(source.version_number) !== 1) errors.push('source_version_must_be_1');
  if (text(source.status) !== 'Согласован') errors.push('source_status_invalid');
  if (!text(source.title)) errors.push('source_title_required');

  const command = manifest.command || {};
  if (command.action !== ACTION) errors.push('action_invalid');
  if (!text(command.idempotency_key) || text(command.idempotency_key).length > 120) errors.push('idempotency_key_invalid');
  if (!text(command.title)) errors.push('command_title_required');

  if (JSON.stringify(manifest.cleanup_order) !== JSON.stringify(CLEANUP_ORDER)) {
    errors.push('cleanup_order_invalid');
  }

  const serialized = JSON.stringify(manifest);
  for (const forbidden of ['password', 'access_token', 'refresh_token', 'service_role', 'sb_secret_']) {
    if (serialized.toLowerCase().includes(forbidden)) errors.push(`secret_like_field:${forbidden}`);
  }

  return { ok: errors.length === 0, errors };
}

export function createFixtureManifest({
  authUserId,
  now = Date.now(),
  ttlHours = 12,
  uuid = randomUUID
} = {}) {
  if (!UUID_RE.test(text(authUserId))) throw new Error('auth_user_id_invalid');
  const ttl = Number(ttlHours);
  if (!Number.isFinite(ttl) || ttl <= 0 || ttl > MAX_TTL_HOURS) throw new Error('ttl_hours_invalid');

  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + ttl * 60 * 60 * 1000).toISOString();
  const manifestId = uuid();
  const leadId = uuid();
  const needId = uuid();
  const sourceCalculationId = uuid();
  const sourceItemId = uuid();
  const expectedUpdatedAt = new Date(now).toISOString();

  const manifest = {
    manifest_version: FIXTURE_MANIFEST_VERSION,
    manifest_id: manifestId,
    project_ref: STAGING_PROJECT_REF,
    synthetic_only: true,
    production_enabled: false,
    created_at: createdAt,
    expires_at: expiresAt,
    fixture_ids: {
      auth_user_id: authUserId,
      profile_user_id: authUserId,
      lead_id: leadId,
      need_id: needId,
      source_calculation_id: sourceCalculationId,
      source_item_id: sourceItemId
    },
    source_snapshot: {
      expected_updated_at: expectedUpdatedAt,
      version_number: 1,
      status: 'Согласован',
      title: 'Synthetic staging calculation source'
    },
    command: {
      action: ACTION,
      idempotency_key: `calculation-version-e2e:${manifestId}`,
      title: 'Authenticated staging E2E version'
    },
    cleanup_order: [...CLEANUP_ORDER]
  };

  const checked = validateFixtureManifest(manifest, { now: now - 1 });
  if (!checked.ok) throw new Error(`fixture_manifest_invalid:${checked.errors.join(',')}`);
  return manifest;
}

export function buildSeedSql(manifest, { now = Date.now() } = {}) {
  const checked = validateFixtureManifest(manifest, { now });
  if (!checked.ok) throw new Error(`fixture_manifest_invalid:${checked.errors.join(',')}`);
  const ids = manifest.fixture_ids;
  const source = manifest.source_snapshot;

  return `-- GENERATED FILE. STAGING ONLY. DO NOT COMMIT.\n-- Bundle: ${FIXTURE_BUNDLE_VERSION}\n-- Manifest digest: ${manifestDigest(manifest)}\n-- Target: ${STAGING_PROJECT_REF}\n-- Creates synthetic CRM fixtures only after a confirmed Auth user already exists.\n\nbegin;\n\ndo $calculation_fixture_seed$\ndeclare\n  v_auth_user_id uuid := ${uuidLiteral(ids.auth_user_id)};\n  v_lead_id uuid := ${uuidLiteral(ids.lead_id)};\n  v_need_id uuid := ${uuidLiteral(ids.need_id)};\n  v_source_calculation_id uuid := ${uuidLiteral(ids.source_calculation_id)};\n  v_source_item_id uuid := ${uuidLiteral(ids.source_item_id)};\n  v_expected_updated_at timestamptz := ${timestampLiteral(source.expected_updated_at)};\n  v_expires_at timestamptz := ${timestampLiteral(manifest.expires_at)};\n  v_idempotency_key text := ${sqlLiteral(manifest.command.idempotency_key)};\nbegin\n${guardSql()}\n\n  if clock_timestamp() >= v_expires_at then\n    raise exception 'fixture_manifest_expired';\n  end if;\n\n  if not exists (\n    select 1\n    from auth.users\n    where id = v_auth_user_id\n      and email is not null\n      and email_confirmed_at is not null\n  ) then\n    raise exception 'confirmed_staging_auth_user_required';\n  end if;\n\n  if exists (select 1 from public.leader_user_profiles where user_id = v_auth_user_id)\n     or exists (select 1 from public.leader_leads where id = v_lead_id)\n     or exists (select 1 from public.leader_lead_needs where id = v_need_id)\n     or exists (select 1 from public.leader_lead_calculations where lead_id = v_lead_id or id = v_source_calculation_id)\n     or exists (select 1 from public.leader_lead_calculation_items where lead_id = v_lead_id or id = v_source_item_id)\n     or exists (\n       select 1\n       from leader_private.leader_command_receipts\n       where action = '${ACTION}'\n         and (idempotency_key = v_idempotency_key or idempotency_key = v_idempotency_key || ':stale')\n     ) then\n    raise exception 'fixture_collision_detected';\n  end if;\n\n  insert into public.leader_user_profiles (\n    user_id, email, full_name, role, is_active, permissions, created_at, updated_at\n  ) values (\n    v_auth_user_id, null, 'Synthetic staging calculation E2E manager',\n    'manager', true, '{"calculations.write": true}'::jsonb, v_expected_updated_at, v_expected_updated_at\n  );\n\n  insert into public.leader_leads (id, status, created_at, updated_at)\n  values (v_lead_id, 'В работе', v_expected_updated_at, v_expected_updated_at);\n\n  insert into public.leader_lead_needs (\n    id, lead_id, need_type, title, description, structured_data, need_design,\n    design_reason, deadline_date, status, completeness_score, missing_fields,\n    created_by, updated_by, created_at, updated_at\n  ) values (\n    v_need_id, v_lead_id, 'Расчёт', 'Synthetic calculation need', null, '{}'::jsonb, false,\n    null, (v_expected_updated_at + interval '7 days')::date, 'Готово к расчёту', 100, '[]'::jsonb,\n    v_auth_user_id, v_auth_user_id, v_expected_updated_at, v_expected_updated_at\n  );\n\n  insert into public.leader_lead_calculations (\n    id, lead_id, need_id, client_id, title, status, version_number,\n    client_total, contractor_cost, profit, margin_percent, warning_level, warnings,\n    public_comment, internal_comment, commercial_offer_id, order_id,\n    created_by, updated_by, created_at, updated_at\n  ) values (\n    v_source_calculation_id, v_lead_id, v_need_id, null, ${sqlLiteral(source.title)},\n    'Согласован', 1, 1400, 800, 600, 42.86, 'ok', '[]'::jsonb,\n    'Synthetic staging source. Remove after verification.',\n    'Created by calculation fixture bundle.', null, null,\n    v_auth_user_id, v_auth_user_id, v_expected_updated_at, v_expected_updated_at\n  );\n\n  insert into public.leader_lead_calculation_items (\n    id, calculation_id, lead_id, catalog_id, category, item_type, name, unit, qty,\n    contractor_price, contractor_sum, markup_percent, client_price, client_sum, profit,\n    margin_percent, comment, data, sort_order, created_at, updated_at\n  ) values (\n    v_source_item_id, v_source_calculation_id, v_lead_id, null, 'E2E', 'Synthetic',\n    'Synthetic source item', 'шт.', 2, 400, 800, 75, 700, 1400, 600, 42.86,\n    'Temporary source snapshot.', '{"source":"calculation_fixture_bundle"}'::jsonb, 0,\n    v_expected_updated_at, v_expected_updated_at\n  );\n\n  if (select count(*) from public.leader_user_profiles where user_id = v_auth_user_id and role = 'manager' and is_active = true) <> 1\n     or (select count(*) from public.leader_leads where id = v_lead_id) <> 1\n     or (select count(*) from public.leader_lead_needs where id = v_need_id and lead_id = v_lead_id) <> 1\n     or (select count(*) from public.leader_lead_calculations where id = v_source_calculation_id and lead_id = v_lead_id and version_number = 1 and updated_at = v_expected_updated_at) <> 1\n     or (select count(*) from public.leader_lead_calculation_items where id = v_source_item_id and calculation_id = v_source_calculation_id) <> 1\n     or (select count(*) from public.leader_lead_calculations where lead_id = v_lead_id) <> 1\n     or (select count(*) from leader_private.leader_command_receipts where action = '${ACTION}' and actor_id = v_auth_user_id) <> 0 then\n    raise exception 'fixture_seed_postcondition_failed';\n  end if;\nend\n$calculation_fixture_seed$;\n\ncommit;\n\nselect jsonb_build_object(\n  'ok', true,\n  'bundle_version', '${FIXTURE_BUNDLE_VERSION}',\n  'project_ref', '${STAGING_PROJECT_REF}',\n  'fixture_seeded', true,\n  'auth_user_created_by_sql', false,\n  'cleanup_required', true\n) as fixture_seed_result;\n`;
}

export function buildCleanupSql(manifest, { now = Date.now() } = {}) {
  const checked = validateFixtureManifest(manifest, { now });
  if (!checked.ok) throw new Error(`fixture_manifest_invalid:${checked.errors.join(',')}`);
  const ids = manifest.fixture_ids;

  return `-- GENERATED FILE. STAGING ONLY. DO NOT COMMIT.\n-- Bundle: ${FIXTURE_BUNDLE_VERSION}\n-- Manifest digest: ${manifestDigest(manifest)}\n-- Target: ${STAGING_PROJECT_REF}\n-- Removes only manifest-bound synthetic database fixtures.\n-- Delete the Auth user separately through Dashboard/Admin API after this SQL.\n\nbegin;\n\ndo $calculation_fixture_cleanup$\ndeclare\n  v_auth_user_id uuid := ${uuidLiteral(ids.auth_user_id)};\n  v_lead_id uuid := ${uuidLiteral(ids.lead_id)};\n  v_need_id uuid := ${uuidLiteral(ids.need_id)};\n  v_source_calculation_id uuid := ${uuidLiteral(ids.source_calculation_id)};\n  v_source_item_id uuid := ${uuidLiteral(ids.source_item_id)};\n  v_idempotency_key text := ${sqlLiteral(manifest.command.idempotency_key)};\nbegin\n${guardSql()}\n\n  if not exists (select 1 from auth.users where id = v_auth_user_id) then\n    raise exception 'auth_user_must_be_deleted_last';\n  end if;\n\n  delete from leader_private.leader_command_receipts\n  where action = '${ACTION}'\n    and actor_id = v_auth_user_id\n    and (idempotency_key = v_idempotency_key or idempotency_key = v_idempotency_key || ':stale');\n\n  delete from public.leader_lead_calculation_items\n  where lead_id = v_lead_id\n     or calculation_id in (select id from public.leader_lead_calculations where lead_id = v_lead_id);\n\n  delete from public.leader_lead_calculations\n  where lead_id = v_lead_id;\n\n  delete from public.leader_lead_needs\n  where id = v_need_id\n    and lead_id = v_lead_id;\n\n  delete from public.leader_leads\n  where id = v_lead_id;\n\n  delete from public.leader_user_profiles\n  where user_id = v_auth_user_id;\n\n  if exists (select 1 from public.leader_user_profiles where user_id = v_auth_user_id)\n     or exists (select 1 from public.leader_leads where id = v_lead_id)\n     or exists (select 1 from public.leader_lead_needs where id = v_need_id)\n     or exists (select 1 from public.leader_lead_calculations where lead_id = v_lead_id or id = v_source_calculation_id)\n     or exists (select 1 from public.leader_lead_calculation_items where lead_id = v_lead_id or id = v_source_item_id)\n     or exists (\n       select 1\n       from leader_private.leader_command_receipts\n       where action = '${ACTION}'\n         and actor_id = v_auth_user_id\n         and (idempotency_key = v_idempotency_key or idempotency_key = v_idempotency_key || ':stale')\n     ) then\n    raise exception 'fixture_cleanup_postcondition_failed';\n  end if;\n\n  if not exists (select 1 from auth.users where id = v_auth_user_id) then\n    raise exception 'auth_user_missing_before_external_delete';\n  end if;\nend\n$calculation_fixture_cleanup$;\n\ncommit;\n\nselect jsonb_build_object(\n  'ok', true,\n  'bundle_version', '${FIXTURE_BUNDLE_VERSION}',\n  'project_ref', '${STAGING_PROJECT_REF}',\n  'database_fixtures_removed', true,\n  'auth_user_delete_required', true,\n  'post_cleanup_snapshot_required', true\n) as fixture_cleanup_result;\n`;
}

export function buildFixtureBundle(manifest, options = {}) {
  const checked = validateFixtureManifest(manifest, options);
  if (!checked.ok) throw new Error(`fixture_manifest_invalid:${checked.errors.join(',')}`);
  const seedSql = buildSeedSql(manifest, options);
  const cleanupSql = buildCleanupSql(manifest, options);
  return {
    bundle_version: FIXTURE_BUNDLE_VERSION,
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
    cleanup_sql: cleanupSql,
    runner_environment: {
      LIDER_STAGING_SCENARIO: 'allowed',
      LIDER_STAGING_SOURCE_CALCULATION_ID: manifest.fixture_ids.source_calculation_id,
      LIDER_STAGING_EXPECTED_UPDATED_AT: manifest.source_snapshot.expected_updated_at,
      LIDER_STAGING_NEED_ID: manifest.fixture_ids.need_id,
      LIDER_STAGING_IDEMPOTENCY_KEY: manifest.command.idempotency_key,
      LIDER_STAGING_TITLE: manifest.command.title
    }
  };
}

async function writePrivate(filePath, content) {
  const target = path.resolve(filePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, { encoding: 'utf8', mode: 0o600 });
  return target;
}

async function main() {
  const authUserId = argValue('auth-user-id');
  const outputDir = path.resolve(argValue('output-dir') || DEFAULT_OUTPUT_DIR);
  const ttlHours = Number(argValue('ttl-hours') || 12);
  const manifest = createFixtureManifest({ authUserId, ttlHours });
  const bundle = buildFixtureBundle(manifest);

  const manifestPath = await writePrivate(
    path.join(outputDir, 'fixture-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  const seedPath = await writePrivate(path.join(outputDir, 'seed.sql'), bundle.seed_sql);
  const cleanupPath = await writePrivate(path.join(outputDir, 'cleanup.sql'), bundle.cleanup_sql);
  const summary = {
    bundle_version: bundle.bundle_version,
    project_ref: bundle.project_ref,
    production_enabled: false,
    manifest_version: bundle.manifest_version,
    manifest_id: bundle.manifest_id,
    manifest_digest_sha256: bundle.manifest_digest_sha256,
    seed_sha256: bundle.seed_sha256,
    cleanup_sha256: bundle.cleanup_sha256,
    manifest_output: manifestPath,
    seed_output: seedPath,
    cleanup_output: cleanupPath,
    contains_credentials: false,
    performs_network_calls: false,
    executes_sql: false,
    auth_user_required: true,
    auth_user_created_or_deleted_by_sql: false,
    runner_environment: bundle.runner_environment
  };
  const summaryPath = await writePrivate(
    path.join(outputDir, 'bundle-summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`
  );
  console.log(JSON.stringify({ ok: true, ...summary, summary_output: summaryPath }, null, 2));
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: text(error?.message).slice(0, 500) }));
    process.exitCode = 1;
  });
}
