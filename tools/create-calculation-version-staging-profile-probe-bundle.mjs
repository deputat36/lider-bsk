#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  ACTION,
  STAGING_PROJECT_REF,
  manifestDigest,
  validateFixtureManifest
} from './create-calculation-version-staging-fixture-bundle.mjs';

export const PROFILE_PROBE_BUNDLE_VERSION = 'leader-calculation-version-staging-profile-probe-bundle-v1';
export const DEFAULT_OUTPUT_DIR = 'artifacts/calculation-version-staging-profile-probes';

export const PROFILE_TRANSITIONS = Object.freeze({
  allowed: Object.freeze({
    file: 'allowed.sql',
    role: 'manager',
    isActive: true,
    permissions: Object.freeze({ 'calculations.write': true })
  }),
  forbidden: Object.freeze({
    file: 'forbidden.sql',
    role: 'accountant',
    isActive: true,
    permissions: Object.freeze({})
  }),
  inactive: Object.freeze({
    file: 'inactive.sql',
    role: 'manager',
    isActive: false,
    permissions: Object.freeze({ 'calculations.write': true })
  }),
  restore_manager: Object.freeze({
    file: 'restore-manager.sql',
    role: 'manager',
    isActive: true,
    permissions: Object.freeze({ 'calculations.write': true })
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

function sha256(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function uuidLiteral(value) {
  return `${sqlLiteral(value)}::uuid`;
}

function jsonLiteral(value) {
  return `${sqlLiteral(JSON.stringify(value))}::jsonb`;
}

export function buildProfileTransitionSql(manifest, transitionName, { now = Date.now() } = {}) {
  const checked = validateFixtureManifest(manifest, { now });
  if (!checked.ok) throw new Error(`fixture_manifest_invalid:${checked.errors.join(',')}`);
  const transition = PROFILE_TRANSITIONS[transitionName];
  if (!transition) throw new Error('profile_transition_invalid');

  const ids = manifest.fixture_ids;
  const digest = manifestDigest(manifest);

  return `-- GENERATED FILE. STAGING ONLY. DO NOT COMMIT.
-- Bundle: ${PROFILE_PROBE_BUNDLE_VERSION}
-- Transition: ${transitionName}
-- Manifest digest: ${digest}
-- Target: ${STAGING_PROJECT_REF}
-- Changes only the manifest-bound CRM profile after seed.sql.

begin;

do $calculation_profile_probe$
declare
  v_auth_user_id uuid := ${uuidLiteral(ids.auth_user_id)};
  v_lead_id uuid := ${uuidLiteral(ids.lead_id)};
  v_expected_role text := ${sqlLiteral(transition.role)};
  v_expected_active boolean := ${transition.isActive ? 'true' : 'false'};
  v_expected_permissions jsonb := ${jsonLiteral(transition.permissions)};
  v_before jsonb;
  v_after jsonb;
  v_calculations_before integer;
  v_items_before integer;
  v_receipts_before integer;
  v_calculations_after integer;
  v_items_after integer;
  v_receipts_after integer;
begin
  if not exists (
    select 1
    from leader_staging.environment_guard
    where singleton = true
      and project_ref = '${STAGING_PROJECT_REF}'
      and environment_name = 'staging'
      and repository = 'deputat36/lider-bsk'
  ) then
    raise exception 'staging_environment_guard_failed';
  end if;

  if not exists (
    select 1
    from auth.users
    where id = v_auth_user_id
      and email is not null
      and email_confirmed_at is not null
  ) then
    raise exception 'confirmed_staging_auth_user_required';
  end if;

  select to_jsonb(profile_row)
  into v_before
  from public.leader_user_profiles as profile_row
  where profile_row.user_id = v_auth_user_id
  for update;

  if v_before is null then
    raise exception 'manifest_bound_profile_required';
  end if;

  if not exists (
    select 1
    from public.leader_lead_calculations
    where id = ${uuidLiteral(ids.source_calculation_id)}
      and lead_id = v_lead_id
  ) then
    raise exception 'manifest_bound_source_calculation_required';
  end if;

  select count(*) into v_calculations_before
  from public.leader_lead_calculations
  where lead_id = v_lead_id;

  select count(*) into v_items_before
  from public.leader_lead_calculation_items
  where lead_id = v_lead_id
     or calculation_id in (
       select id from public.leader_lead_calculations where lead_id = v_lead_id
     );

  select count(*) into v_receipts_before
  from leader_private.leader_command_receipts
  where action = '${ACTION}'
    and actor_id = v_auth_user_id;

  update public.leader_user_profiles
  set role = v_expected_role,
      is_active = v_expected_active,
      permissions = v_expected_permissions,
      updated_at = clock_timestamp()
  where user_id = v_auth_user_id;

  if not found then
    raise exception 'manifest_bound_profile_update_failed';
  end if;

  select to_jsonb(profile_row)
  into v_after
  from public.leader_user_profiles as profile_row
  where profile_row.user_id = v_auth_user_id;

  if v_after ->> 'role' <> v_expected_role
     or coalesce((v_after ->> 'is_active')::boolean, false) is distinct from v_expected_active
     or coalesce(v_after -> 'permissions', '{}'::jsonb) is distinct from v_expected_permissions then
    raise exception 'profile_transition_postcondition_failed';
  end if;

  if (v_after - 'role' - 'is_active' - 'permissions' - 'updated_at')
     is distinct from
     (v_before - 'role' - 'is_active' - 'permissions' - 'updated_at') then
    raise exception 'profile_transition_changed_unapproved_fields';
  end if;

  select count(*) into v_calculations_after
  from public.leader_lead_calculations
  where lead_id = v_lead_id;

  select count(*) into v_items_after
  from public.leader_lead_calculation_items
  where lead_id = v_lead_id
     or calculation_id in (
       select id from public.leader_lead_calculations where lead_id = v_lead_id
     );

  select count(*) into v_receipts_after
  from leader_private.leader_command_receipts
  where action = '${ACTION}'
    and actor_id = v_auth_user_id;

  if v_calculations_after <> v_calculations_before
     or v_items_after <> v_items_before
     or v_receipts_after <> v_receipts_before then
    raise exception 'profile_transition_business_state_changed';
  end if;
end
$calculation_profile_probe$;

commit;

select jsonb_build_object(
  'ok', true,
  'bundle_version', '${PROFILE_PROBE_BUNDLE_VERSION}',
  'project_ref', '${STAGING_PROJECT_REF}',
  'manifest_id', ${sqlLiteral(manifest.manifest_id)},
  'manifest_digest_sha256', '${digest}',
  'transition', '${transitionName}',
  'role', '${transition.role}',
  'is_active', ${transition.isActive ? 'true' : 'false'},
  'permissions', ${jsonLiteral(transition.permissions)},
  'business_state_unchanged', true,
  'auth_user_created_or_deleted', false
) as profile_probe_result;
`;
}

export function buildProfileProbeBundle(manifest, options = {}) {
  const checked = validateFixtureManifest(manifest, options);
  if (!checked.ok) throw new Error(`fixture_manifest_invalid:${checked.errors.join(',')}`);
  const scripts = Object.fromEntries(
    Object.keys(PROFILE_TRANSITIONS).map((name) => [name, buildProfileTransitionSql(manifest, name, options)])
  );
  return {
    bundle_version: PROFILE_PROBE_BUNDLE_VERSION,
    project_ref: STAGING_PROJECT_REF,
    production_enabled: false,
    manifest_id: manifest.manifest_id,
    manifest_digest_sha256: manifestDigest(manifest),
    transition_order: ['allowed', 'forbidden', 'inactive', 'restore_manager'],
    outputs: Object.fromEntries(
      Object.entries(PROFILE_TRANSITIONS).map(([name, transition]) => [name, transition.file])
    ),
    script_sha256: Object.fromEntries(
      Object.entries(scripts).map(([name, sql]) => [name, sha256(sql)])
    ),
    scripts,
    auth_user_required: true,
    auth_user_created_or_deleted_by_sql: false,
    executes_sql: false,
    performs_network_calls: false
  };
}

async function writePrivate(filePath, content) {
  const target = path.resolve(filePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, { encoding: 'utf8', mode: 0o600 });
  return target;
}

async function main() {
  const manifestPath = argValue('manifest');
  const outputDir = path.resolve(argValue('output-dir') || DEFAULT_OUTPUT_DIR);
  if (!manifestPath) throw new Error('manifest_path_required');

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    throw new Error('manifest_read_failed');
  }

  const bundle = buildProfileProbeBundle(manifest);
  const written = {};
  for (const [name, fileName] of Object.entries(bundle.outputs)) {
    written[name] = await writePrivate(path.join(outputDir, fileName), bundle.scripts[name]);
  }

  const summary = {
    bundle_version: bundle.bundle_version,
    project_ref: bundle.project_ref,
    production_enabled: false,
    manifest_id: bundle.manifest_id,
    manifest_digest_sha256: bundle.manifest_digest_sha256,
    transition_order: bundle.transition_order,
    outputs: written,
    script_sha256: bundle.script_sha256,
    auth_user_required: true,
    auth_user_created_or_deleted_by_sql: false,
    executes_sql: false,
    performs_network_calls: false
  };
  const summaryPath = await writePrivate(
    path.join(outputDir, 'profile-probe-summary.json'),
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
