#!/usr/bin/env node

const STAGING_REF = 'otulfnouybahfnsycxqn';
const FUNCTION_SLUG = 'leader-crm-catalog';
const ACTION = 'catalog.manage';

function required(env, name) {
  const value = String(env[name] || '').trim();
  if (!value) throw new Error(`missing_env:${name}`);
  return value;
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function requestId() {
  const value = globalThis.crypto?.randomUUID?.();
  if (!isUuid(value)) throw new Error('secure_request_id_unavailable');
  return value;
}

async function jsonFetch(url, init = {}) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  return { status: response.status, ok: response.ok, body };
}

async function login({ supabaseUrl, publishableKey, email, password }) {
  const result = await jsonFetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const accessToken = String(result.body?.access_token || '').trim();
  if (!result.ok || !accessToken) throw new Error(`staging_login_failed:${result.status}`);
  return accessToken;
}

function userHeaders(publishableKey, accessToken) {
  return {
    apikey: publishableKey,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function callCatalog({ supabaseUrl, publishableKey, accessToken, command }) {
  return await jsonFetch(`${supabaseUrl}/functions/v1/${FUNCTION_SLUG}`, {
    method: 'POST',
    headers: userHeaders(publishableKey, accessToken),
    body: JSON.stringify(command),
  });
}

function createCommand(marker) {
  return {
    action: ACTION,
    request_id: requestId(),
    expected_updated_at: null,
    payload: {
      operation: 'create',
      catalog_id: null,
      idempotency_key: `catalog-e2e:${marker}:create`,
      reason: `Synthetic authenticated E2E ${marker}`,
      patch: {
        category: 'Synthetic E2E',
        name: `${marker} Catalog item`,
        unit: 'шт',
        contractor_price: 123,
        is_active: true,
        sort_order: 999999,
        description: marker,
        item_type: 'Услуга',
        markup_percent: 25,
        min_client_price: 150,
        default_client_price: null,
        calculation_mode: 'markup',
        settings: { synthetic_marker: marker },
      },
    },
  };
}

function updateCommand(marker, catalogId, expectedUpdatedAt, suffix, patch) {
  return {
    action: ACTION,
    request_id: requestId(),
    expected_updated_at: expectedUpdatedAt,
    payload: {
      operation: 'update',
      catalog_id: catalogId,
      idempotency_key: `catalog-e2e:${marker}:${suffix}`,
      reason: `Synthetic authenticated E2E ${suffix} ${marker}`,
      patch,
    },
  };
}

async function readCatalog({ supabaseUrl, publishableKey, accessToken, catalogId }) {
  const fields = 'id,owner_id,name,category,contractor_price,markup_percent,default_client_price,calculation_mode,is_active,updated_at';
  const result = await jsonFetch(`${supabaseUrl}/rest/v1/leader_catalog?id=eq.${encodeURIComponent(catalogId)}&select=${encodeURIComponent(fields)}`, {
    headers: userHeaders(publishableKey, accessToken),
  });
  if (!result.ok || !Array.isArray(result.body) || result.body.length !== 1) {
    throw new Error(`catalog_readback_failed:${result.status}`);
  }
  return result.body[0];
}

async function readLogs({ supabaseUrl, publishableKey, accessToken, catalogId }) {
  const fields = 'id,catalog_id,change_type,old_contractor_price,new_contractor_price,old_markup_percent,new_markup_percent,created_at';
  const result = await jsonFetch(`${supabaseUrl}/rest/v1/leader_catalog_price_logs?catalog_id=eq.${encodeURIComponent(catalogId)}&select=${encodeURIComponent(fields)}&order=created_at.asc`, {
    headers: userHeaders(publishableKey, accessToken),
  });
  if (!result.ok || !Array.isArray(result.body)) throw new Error(`catalog_logs_readback_failed:${result.status}`);
  return result.body;
}

async function managerForbidden(ctx) {
  const command = createCommand(ctx.marker);
  const result = await callCatalog({ ...ctx, command });
  const code = String(result.body?.error?.code || result.body?.error || '').trim();
  if (result.status !== 403 || code !== 'forbidden') {
    throw new Error(`manager_catalog_write_not_forbidden:${result.status}:${code}`);
  }
  return {
    ok: true,
    mode: 'manager-forbidden',
    role: 'manager',
    forbidden: true,
    status: result.status,
    function: FUNCTION_SLUG,
    action: ACTION,
  };
}

async function ownerFull(ctx) {
  const create = createCommand(ctx.marker);
  const created = await callCatalog({ ...ctx, command: create });
  const createdCatalog = asObject(created.body?.catalog);
  if (created.status !== 201 || created.body?.ok !== true || created.body?.operation !== 'create' || !isUuid(createdCatalog?.id)) {
    throw new Error(`catalog_create_failed:${created.status}`);
  }
  const catalogId = createdCatalog.id;
  const initialUpdatedAt = String(createdCatalog.updated_at || '');
  if (!initialUpdatedAt || !Number.isFinite(Date.parse(initialUpdatedAt))) throw new Error('catalog_create_updated_at_missing');

  const replay = await callCatalog({ ...ctx, command: create });
  if (replay.status !== 200 || replay.body?.ok !== true || replay.body?.idempotent_replay !== true || replay.body?.catalog?.id !== catalogId) {
    throw new Error(`catalog_replay_failed:${replay.status}`);
  }

  const update = updateCommand(ctx.marker, catalogId, initialUpdatedAt, 'update', {
    contractor_price: 321,
    markup_percent: 35,
    min_client_price: 450,
    default_client_price: 500,
    calculation_mode: 'fixed',
    is_active: false,
  });
  const updated = await callCatalog({ ...ctx, command: update });
  const updatedCatalog = asObject(updated.body?.catalog);
  if (updated.status !== 200 || updated.body?.ok !== true || updated.body?.operation !== 'update' || updated.body?.changed !== true) {
    throw new Error(`catalog_update_failed:${updated.status}`);
  }
  if (Number(updatedCatalog?.contractor_price) !== 321 || Number(updatedCatalog?.markup_percent) !== 35 || Number(updatedCatalog?.default_client_price) !== 500 || updatedCatalog?.calculation_mode !== 'fixed' || updatedCatalog?.is_active !== false) {
    throw new Error('catalog_update_projection_mismatch');
  }
  const updatedAt = String(updatedCatalog?.updated_at || '');
  if (!updatedAt || updatedAt === initialUpdatedAt) throw new Error('catalog_update_timestamp_not_advanced');

  const stale = updateCommand(ctx.marker, catalogId, initialUpdatedAt, 'stale', { contractor_price: 222 });
  const staleResult = await callCatalog({ ...ctx, command: stale });
  const staleCode = String(staleResult.body?.error?.code || staleResult.body?.error || '').trim();
  if (staleResult.status !== 409 || staleCode !== 'source_changed') {
    throw new Error(`catalog_stale_guard_failed:${staleResult.status}:${staleCode}`);
  }

  const row = await readCatalog({ ...ctx, catalogId });
  if (row.id !== catalogId || Number(row.contractor_price) !== 321 || Number(row.markup_percent) !== 35 || Number(row.default_client_price) !== 500 || row.calculation_mode !== 'fixed' || row.is_active !== false) {
    throw new Error('catalog_authenticated_readback_mismatch');
  }

  const logs = await readLogs({ ...ctx, catalogId });
  if (logs.length !== 2 || logs[0]?.change_type !== 'created' || logs[1]?.change_type !== 'price_update') {
    throw new Error(`catalog_log_count_or_type_mismatch:${logs.length}`);
  }

  return {
    ok: true,
    mode: 'owner-full',
    role: 'owner',
    function: FUNCTION_SLUG,
    action: ACTION,
    catalog_id: catalogId,
    create: true,
    replay: true,
    update: true,
    stale_guard: true,
    authenticated_readback: true,
    price_logs: logs.length,
    final_projection: {
      contractor_price: Number(row.contractor_price),
      markup_percent: Number(row.markup_percent),
      default_client_price: Number(row.default_client_price),
      calculation_mode: row.calculation_mode,
      is_active: row.is_active,
    },
  };
}

async function main() {
  const modeArg = process.argv.find((value) => value.startsWith('--mode='));
  const mode = String(modeArg?.split('=')[1] || '').trim();
  if (!['manager-forbidden', 'owner-full'].includes(mode)) throw new Error('mode_required');

  const supabaseUrl = required(process.env, 'STAGING_SUPABASE_URL').replace(/\/+$/, '');
  const publishableKey = required(process.env, 'STAGING_SUPABASE_PUBLISHABLE_KEY');
  const email = required(process.env, 'STAGING_CRM_E2E_EMAIL');
  const password = required(process.env, 'STAGING_CRM_E2E_PASSWORD');
  const marker = required(process.env, 'STAGING_CRM_E2E_MARKER');
  if (new URL(supabaseUrl).hostname !== `${STAGING_REF}.supabase.co`) throw new Error('wrong_environment');
  if (!/^SYNTH-CRM-E2E-[A-Za-z0-9-]+$/.test(marker)) throw new Error('marker_invalid');

  const accessToken = await login({ supabaseUrl, publishableKey, email, password });
  const ctx = { supabaseUrl, publishableKey, accessToken, marker };
  const result = mode === 'manager-forbidden' ? await managerForbidden(ctx) : await ownerFull(ctx);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => {
  console.error(String(error?.message || error));
  process.exit(1);
});
