#!/usr/bin/env node

const SUPABASE_URL = process.env.NAV_V2_SUPABASE_URL || 'https://ofewxuqfjhamgerwzull.supabase.co';
const API_KEY = process.env.NAV_V2_API_KEY || 'sb_publishable_ZiX8_Mnf0dY6S__tKO2A4A_uD94G2cs';
const JWT = process.env.NAV_V2_JWT;
const DEAL_ID = process.env.NAV_V2_DEAL_ID;
const ACTION = process.env.NAV_V2_ACTION || 'get_deal_card';
const COMPARE_DIRECT_RPC = process.env.NAV_V2_COMPARE_DIRECT_RPC === '1';
const PREFLIGHT_ONLY = process.env.NAV_V2_PREFLIGHT_ONLY === '1';

const READ_ACTIONS = new Set(['get_deal_card', 'get_deal_card_lite']);
const DIRECT_RPC_BY_ACTION = {
  get_deal_card: 'nav_v2_get_deal_card',
  get_deal_card_lite: 'nav_v2_get_deal_card_lite',
};

function requireEnv(name, value) {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function expectedJwtIssuer() {
  const baseUrl = requireEnv('NAV_V2_SUPABASE_URL', SUPABASE_URL).replace(/\/+$/, '');
  return `${baseUrl}/auth/v1`;
}

function decodeJwtPayloadMaybe(value) {
  const parts = String(value || '').split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(payload);
  } catch (_) {
    return null;
  }
}

function assertReadAction(value) {
  const action = String(value || '').trim();
  if (!READ_ACTIONS.has(action)) {
    throw new Error('NAV_V2_ACTION must be one of: get_deal_card, get_deal_card_lite');
  }
  return action;
}

function assertUserAccessJwt(value) {
  const token = requireEnv('NAV_V2_JWT', value).trim();
  const payload = decodeJwtPayloadMaybe(token);
  if (!payload) {
    throw new Error('NAV_V2_JWT must be a JWT access token');
  }
  if (payload.iss !== expectedJwtIssuer()) {
    throw new Error('NAV_V2_JWT issuer must match NAV_V2_SUPABASE_URL');
  }
  if (payload.aud !== 'authenticated') {
    throw new Error('NAV_V2_JWT audience must be authenticated');
  }
  if (payload.role !== 'authenticated') {
    throw new Error('NAV_V2_JWT must be a user access token with role=authenticated');
  }
  if (payload.is_anonymous === true) {
    throw new Error('NAV_V2_JWT must not be an anonymous user token');
  }
  if (!payload.sub) {
    throw new Error('NAV_V2_JWT must include a user subject claim');
  }
  const expiresAt = Number(payload.exp);
  if (!Number.isFinite(expiresAt)) {
    throw new Error('NAV_V2_JWT must include an exp claim');
  }
  const now = Math.floor(Date.now() / 1000);
  if (expiresAt <= now) {
    throw new Error('NAV_V2_JWT must not be expired');
  }
  return token;
}

function assertApiKeyIsPublic(value) {
  const key = requireEnv('NAV_V2_API_KEY', value).trim();
  const secretPrefix = 'sb_' + 'secret_';
  if (key.startsWith(secretPrefix)) {
    throw new Error('NAV_V2_API_KEY must be a publishable/anon key, not a secret key');
  }

  const jwtPayload = decodeJwtPayloadMaybe(key);
  if (jwtPayload?.role === 'service_role') {
    throw new Error('NAV_V2_API_KEY must not be a service_role JWT');
  }
  return key;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${JWT}`,
      apikey: API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (error) {
    throw new Error(`${url} returned non-JSON response: ${text.slice(0, 200)}`);
  }
  if (!response.ok) {
    throw new Error(`${url} failed with ${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

function assertObjectPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Payload must be an object');
}

function assertDealCardPayload(payload) {
  assertObjectPayload(payload);
  if (!payload.deal || typeof payload.deal !== 'object') throw new Error('Payload must include deal object');
  if (!payload.profile || typeof payload.profile !== 'object') throw new Error('Payload must include profile object');
  for (const key of ['participants', 'risks', 'documents', 'expenses', 'tasks', 'comments', 'events']) {
    if (!Array.isArray(payload[key])) throw new Error(`Payload field ${key} must be an array`);
  }
}

function assertActionPayload(action, payload) {
  if (action === 'get_deal_card') {
    assertDealCardPayload(payload);
    return;
  }
  assertObjectPayload(payload);
  if (Object.keys(payload).length === 0) throw new Error('Lite payload must not be empty');
}

function comparableShape(payload) {
  assertObjectPayload(payload);
  return Object.fromEntries(
    Object.entries(payload)
      .map(([key, value]) => {
        if (Array.isArray(value)) return [key, { type: 'array', length: value.length }];
        if (value && typeof value === 'object') return [key, { type: 'object', keys: Object.keys(value).sort() }];
        return [key, { type: typeof value }];
      })
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

async function main() {
  const action = assertReadAction(ACTION);
  assertUserAccessJwt(JWT);
  requireEnv('NAV_V2_DEAL_ID', DEAL_ID);
  assertApiKeyIsPublic(API_KEY);

  if (PREFLIGHT_ONLY) {
    console.log(JSON.stringify({ ok: true, preflight_only: true, action, deal_id: DEAL_ID }, null, 2));
    return;
  }

  const edgeUrl = `${SUPABASE_URL}/functions/v1/nav-v2-deal-api`;
  const edge = await postJson(edgeUrl, { action, deal_id: DEAL_ID });
  if (edge?.ok !== true) throw new Error(`Edge response ok=true expected: ${JSON.stringify(edge)}`);
  if (edge?.action !== action) throw new Error(`Edge action mismatch: ${edge?.action}`);
  assertActionPayload(action, edge.data);

  if (COMPARE_DIRECT_RPC) {
    const rpcName = DIRECT_RPC_BY_ACTION[action];
    const rpcUrl = `${SUPABASE_URL}/rest/v1/rpc/${rpcName}`;
    const direct = await postJson(rpcUrl, { p_deal_id: DEAL_ID });
    assertActionPayload(action, direct);
    const edgeShape = comparableShape(edge.data);
    const directShape = comparableShape(direct);
    if (JSON.stringify(edgeShape) !== JSON.stringify(directShape)) {
      throw new Error(`Edge/direct payload shape mismatch:\nedge=${JSON.stringify(edgeShape)}\ndirect=${JSON.stringify(directShape)}`);
    }
  }

  console.log(JSON.stringify({ ok: true, action, deal_id: DEAL_ID, compared_direct_rpc: COMPARE_DIRECT_RPC }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});