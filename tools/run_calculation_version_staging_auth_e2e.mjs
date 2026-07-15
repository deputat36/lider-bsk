#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  buildStagingCalculationVersionCommand,
  isStagingCalculationEnvironment
} from '../crm/v4/assets/v4/calculation-version-staging-transport-v1.js';

const FUNCTION_SLUG = 'leader-crm-calculations';
const PERMISSION = 'calculations.write';
const SCENARIOS = new Set(['allowed', 'forbidden', 'inactive']);
const CALCULATION_FIELDS = new Set([
  'id', 'lead_id', 'need_id', 'client_id', 'title', 'status',
  'version_number', 'client_total', 'contractor_cost', 'profit',
  'margin_percent', 'warning_level', 'warnings', 'public_comment',
  'internal_comment', 'created_at', 'updated_at'
]);
const ITEM_FIELDS = new Set([
  'id', 'catalog_id', 'category', 'item_type', 'name', 'unit', 'qty',
  'contractor_price', 'contractor_sum', 'markup_percent', 'client_price',
  'client_sum', 'profit', 'margin_percent', 'comment', 'data', 'sort_order',
  'created_at', 'updated_at'
]);
const TOP_LEVEL_FIELDS = new Set([
  'ok', 'request_id', 'calculation', 'items', 'idempotent_replay'
]);

function text(value) {
  return String(value ?? '').trim();
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function positiveNumber(value, fallback) {
  const parsed = value === undefined || value === null || value === '' ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('configuration_number_invalid');
  return parsed;
}

function nonNegativeNumber(value, fallback) {
  const parsed = value === undefined || value === null || value === '' ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error('configuration_number_invalid');
  return parsed;
}

function required(env, name) {
  const value = text(env[name]);
  if (!value) throw new Error(`missing_environment:${name}`);
  return value;
}

export function readStagingAuthE2EConfig(env = process.env) {
  const supabaseUrl = required(env, 'LIDER_STAGING_SUPABASE_URL').replace(/\/+$/, '');
  if (!isStagingCalculationEnvironment(supabaseUrl)) throw new Error('wrong_environment');
  if (!/^https:\/\//i.test(supabaseUrl)) throw new Error('https_required');

  const scenario = text(env.LIDER_STAGING_SCENARIO || 'allowed').toLowerCase();
  if (!SCENARIOS.has(scenario)) throw new Error('scenario_invalid');

  const expectedUpdatedAt = required(env, 'LIDER_STAGING_EXPECTED_UPDATED_AT');
  if (!Number.isFinite(Date.parse(expectedUpdatedAt))) throw new Error('expected_updated_at_invalid');

  return Object.freeze({
    supabaseUrl,
    publishableKey: required(env, 'LIDER_STAGING_PUBLISHABLE_KEY'),
    email: required(env, 'LIDER_STAGING_EMAIL'),
    password: required(env, 'LIDER_STAGING_PASSWORD'),
    scenario,
    sourceCalculationId: required(env, 'LIDER_STAGING_SOURCE_CALCULATION_ID'),
    expectedUpdatedAt: new Date(expectedUpdatedAt).toISOString(),
    needId: text(env.LIDER_STAGING_NEED_ID) || null,
    idempotencyKey: text(env.LIDER_STAGING_IDEMPOTENCY_KEY) || `auth-e2e:${randomUUID()}`,
    title: text(env.LIDER_STAGING_TITLE) || 'Authenticated staging E2E version',
    itemName: text(env.LIDER_STAGING_ITEM_NAME) || 'Authenticated staging E2E item',
    qty: positiveNumber(env.LIDER_STAGING_QTY, 1),
    contractorPrice: nonNegativeNumber(env.LIDER_STAGING_CONTRACTOR_PRICE, 400),
    clientPrice: nonNegativeNumber(env.LIDER_STAGING_CLIENT_PRICE, 700)
  });
}

export function buildRunnerCommand(config, overrides = {}) {
  const requestId = text(overrides.requestId) || randomUUID();
  const expectedUpdatedAt = text(overrides.expectedUpdatedAt) || config.expectedUpdatedAt;
  const idempotencyKey = text(overrides.idempotencyKey) || config.idempotencyKey;
  const title = text(overrides.title) || config.title;

  return buildStagingCalculationVersionCommand({
    sourceCalculation: { id: config.sourceCalculationId },
    expectedUpdatedAt,
    requestId,
    draft: {
      idempotency_key: idempotencyKey,
      title,
      need_id: config.needId,
      public_comment: 'Synthetic authenticated staging E2E. Remove after verification.',
      internal_comment: 'Created by tools/run_calculation_version_staging_auth_e2e.mjs.',
      items: [{
        catalog_id: null,
        category: 'E2E',
        item_type: 'Synthetic',
        name: config.itemName,
        unit: 'шт.',
        qty: config.qty,
        contractor_price: config.contractorPrice,
        client_price: config.clientPrice,
        comment: 'Temporary staging verification item.',
        data: { source: 'staging_auth_e2e_runner' },
        sort_order: 0
      }]
    }
  });
}

function exactKeys(value, allowed, label) {
  const current = object(value);
  if (!current) throw new Error(`${label}_not_object`);
  const actual = Object.keys(current).sort();
  const expected = [...allowed].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label}_projection_drift`);
  }
}

export function validateSafeCalculationResponse(value) {
  const result = object(value);
  if (!result || result.ok !== true) throw new Error('safe_response_not_success');
  exactKeys(result, TOP_LEVEL_FIELDS, 'top_level');
  exactKeys(result.calculation, CALCULATION_FIELDS, 'calculation');
  if (!Array.isArray(result.items) || result.items.length < 1) throw new Error('items_missing');
  for (const item of result.items) exactKeys(item, ITEM_FIELDS, 'item');
  return true;
}

export function responseErrorCode(body) {
  const data = object(body);
  const nested = object(data?.error);
  return text(nested?.code || data?.error || 'unknown_error');
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch (_) { body = null; }
  return Object.freeze({ status: response.status, ok: response.ok, body });
}

async function signIn(config) {
  const response = await fetchJson(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: config.publishableKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email: config.email, password: config.password })
  });
  const accessToken = text(response.body?.access_token);
  if (response.status !== 200 || !accessToken) {
    throw new Error(`auth_sign_in_failed:${response.status}:${responseErrorCode(response.body)}`);
  }
  return accessToken;
}

async function invoke(config, accessToken, command) {
  return await fetchJson(`${config.supabaseUrl}/functions/v1/${FUNCTION_SLUG}`, {
    method: 'POST',
    headers: {
      apikey: config.publishableKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });
}

async function signOut(config, accessToken) {
  try {
    await fetch(`${config.supabaseUrl}/auth/v1/logout`, {
      method: 'POST',
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${accessToken}`
      }
    });
  } catch (_) {
    // Best effort only. The runner never prints or persists the token.
  }
}

function expectResponse(label, response, status, code = '') {
  const actualCode = responseErrorCode(response.body);
  if (response.status !== status || (code && actualCode !== code)) {
    throw new Error(`${label}_unexpected:${response.status}:${actualCode}`);
  }
}

async function runAllowed(config, accessToken) {
  const command = buildRunnerCommand(config);
  const created = await invoke(config, accessToken, command);
  expectResponse('create', created, 201);
  validateSafeCalculationResponse(created.body);
  if (created.body.idempotent_replay !== false) throw new Error('create_replay_flag_invalid');

  const replay = await invoke(config, accessToken, command);
  expectResponse('replay', replay, 200);
  validateSafeCalculationResponse(replay.body);
  if (replay.body.idempotent_replay !== true) throw new Error('replay_flag_missing');
  if (replay.body.calculation.id !== created.body.calculation.id) throw new Error('replay_calculation_changed');

  const conflict = await invoke(config, accessToken, buildRunnerCommand(config, {
    requestId: randomUUID(),
    idempotencyKey: config.idempotencyKey,
    title: `${config.title} changed`
  }));
  expectResponse('conflict', conflict, 409, 'idempotency_conflict');

  const stale = await invoke(config, accessToken, buildRunnerCommand(config, {
    requestId: randomUUID(),
    idempotencyKey: `${config.idempotencyKey}:stale`,
    expectedUpdatedAt: '1970-01-01T00:00:00.000Z'
  }));
  expectResponse('stale', stale, 409, 'source_changed');

  return Object.freeze({
    scenario: 'allowed',
    statuses: { create: 201, replay: 200, conflict: 409, stale: 409 },
    createdCalculationId: created.body.calculation.id,
    requestId: command.request_id,
    cleanupRequired: true
  });
}

async function runForbidden(config, accessToken) {
  const response = await invoke(config, accessToken, buildRunnerCommand(config));
  expectResponse('forbidden', response, 403, 'forbidden');
  if (text(response.body?.permission) !== PERMISSION) throw new Error('forbidden_permission_drift');
  return Object.freeze({ scenario: 'forbidden', statuses: { forbidden: 403 }, cleanupRequired: false });
}

async function runInactive(config, accessToken) {
  const response = await invoke(config, accessToken, buildRunnerCommand(config));
  expectResponse('inactive', response, 403, 'inactive_profile');
  return Object.freeze({ scenario: 'inactive', statuses: { inactive: 403 }, cleanupRequired: false });
}

export async function runStagingAuthE2E(env = process.env) {
  const config = readStagingAuthE2EConfig(env);
  const accessToken = await signIn(config);
  try {
    if (config.scenario === 'allowed') return await runAllowed(config, accessToken);
    if (config.scenario === 'forbidden') return await runForbidden(config, accessToken);
    return await runInactive(config, accessToken);
  } finally {
    await signOut(config, accessToken);
  }
}

function safeFailure(error) {
  const message = text(error?.message || error).slice(0, 300);
  return message.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]');
}

const isEntrypoint = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isEntrypoint) {
  runStagingAuthE2E()
    .then((summary) => {
      console.log(JSON.stringify({ ok: true, ...summary }, null, 2));
    })
    .catch((error) => {
      console.error(JSON.stringify({ ok: false, error: safeFailure(error) }, null, 2));
      process.exitCode = 1;
    });
}
