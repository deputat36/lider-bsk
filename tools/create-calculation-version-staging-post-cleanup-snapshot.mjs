#!/usr/bin/env node

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

export const POST_CLEANUP_SNAPSHOT_VERSION = 'leader-calculation-version-staging-post-cleanup-snapshot-v1';
export const DEFAULT_SNAPSHOT_PATH = 'artifacts/calculation-version-staging-fixture/post-cleanup-snapshot.sql';

function text(value) {
  return String(value ?? '').trim();
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function uuidLiteral(value) {
  return `${sqlLiteral(value)}::uuid`;
}

export function buildPostCleanupSnapshotSql(manifest, { now = Date.now() } = {}) {
  const checked = validateFixtureManifest(manifest, { now });
  if (!checked.ok) throw new Error(`fixture_manifest_invalid:${checked.errors.join(',')}`);
  const ids = manifest.fixture_ids;
  const digest = manifestDigest(manifest);

  return `-- GENERATED FILE. STAGING ONLY. DO NOT COMMIT.
-- Snapshot: ${POST_CLEANUP_SNAPSHOT_VERSION}
-- Manifest digest: ${digest}
-- Target: ${STAGING_PROJECT_REF}
-- Run only after cleanup.sql and after manual deletion of the temporary Auth user.

do $calculation_post_cleanup_snapshot$
declare
  v_auth_user_id uuid := ${uuidLiteral(ids.auth_user_id)};
  v_lead_id uuid := ${uuidLiteral(ids.lead_id)};
  v_need_id uuid := ${uuidLiteral(ids.need_id)};
  v_source_calculation_id uuid := ${uuidLiteral(ids.source_calculation_id)};
  v_source_item_id uuid := ${uuidLiteral(ids.source_item_id)};
  v_idempotency_key text := ${sqlLiteral(manifest.command.idempotency_key)};
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

  if exists (select 1 from auth.users where id = v_auth_user_id) then
    raise exception 'post_cleanup_auth_user_still_exists';
  end if;

  if exists (select 1 from public.leader_user_profiles where user_id = v_auth_user_id)
     or exists (select 1 from public.leader_leads where id = v_lead_id)
     or exists (select 1 from public.leader_lead_needs where id = v_need_id or lead_id = v_lead_id)
     or exists (
       select 1
       from public.leader_lead_calculations
       where id = v_source_calculation_id
          or lead_id = v_lead_id
          or created_by = v_auth_user_id
          or updated_by = v_auth_user_id
     )
     or exists (
       select 1
       from public.leader_lead_calculation_items
       where id = v_source_item_id
          or lead_id = v_lead_id
          or calculation_id in (
            select id from public.leader_lead_calculations where lead_id = v_lead_id
          )
     )
     or exists (
       select 1
       from leader_private.leader_command_receipts
       where action = '${ACTION}'
         and (
           actor_id = v_auth_user_id
           or idempotency_key = v_idempotency_key
           or idempotency_key = v_idempotency_key || ':stale'
         )
     ) then
    raise exception 'post_cleanup_manifest_bound_rows_remain';
  end if;
end
$calculation_post_cleanup_snapshot$;

select jsonb_build_object(
  'ok', true,
  'snapshot_version', '${POST_CLEANUP_SNAPSHOT_VERSION}',
  'project_ref', '${STAGING_PROJECT_REF}',
  'manifest_id', ${sqlLiteral(manifest.manifest_id)},
  'manifest_digest_sha256', '${digest}',
  'auth_user_absent', true,
  'database_fixtures_absent', true,
  'cleanup_verified', true
) as post_cleanup_snapshot;
`;
}

export async function writePostCleanupSnapshot(filePath, sql) {
  const target = path.resolve(filePath || DEFAULT_SNAPSHOT_PATH);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, sql, { encoding: 'utf8', mode: 0o600 });
  return target;
}

function argValue(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : '';
}

async function main() {
  const manifestPath = argValue('manifest');
  const outputPath = argValue('output') || DEFAULT_SNAPSHOT_PATH;
  if (!manifestPath) throw new Error('manifest_path_required');

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    throw new Error('manifest_read_failed');
  }

  const sql = buildPostCleanupSnapshotSql(manifest);
  const target = await writePostCleanupSnapshot(outputPath, sql);
  console.log(JSON.stringify({
    ok: true,
    snapshot_version: POST_CLEANUP_SNAPSHOT_VERSION,
    project_ref: STAGING_PROJECT_REF,
    production_enabled: false,
    manifest_id: manifest.manifest_id,
    manifest_digest_sha256: manifestDigest(manifest),
    output: target,
    performs_network_calls: false,
    executes_sql: false
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
