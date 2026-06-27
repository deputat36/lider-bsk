#!/usr/bin/env node

const SUPABASE_URL = process.env.NAV_V2_SUPABASE_URL || 'https://ofewxuqfjhamgerwzull.supabase.co';
const API_KEY = process.env.NAV_V2_API_KEY || 'sb_publishable_ZiX8_Mnf0dY6S__tKO2A4A_uD94G2cs';
const JWT = process.env.NAV_V2_JWT;
const DEAL_ID = process.env.NAV_V2_DEAL_ID;
const COMPARE_DIRECT_RPC = process.env.NAV_V2_COMPARE_DIRECT_RPC === '1';

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

function assertDealCardPayload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Payload must be an object');
  if (!payload.deal || typeof payload.deal !== 'object') throw new Error('Payload must include deal object');
  if (!payload.profile || typeof payload.profile !== 'object') throw new Error('Payload must include profile object');
  for (const key of ['participants', 'risks', 'documents', 'expenses', 'tasks', 'comments', 'events']) {
    if (!Array.isArray(payload[key])) throw new Error(`Payload field ${key} must be an array`);
  }
}

function comparableShape(payload) {
  return {
    dealKeys: Object.keys(payload.deal || {}).sort(),
    profileKeys: Object.keys(payload.profile || {}).sort(),
    arrayLengths: Object.fromEntries(
      ['participants', 'risks', 'documents', 'expenses', 'tasks', 'comments', 'events'].map((key) => [key, payload[key]?.length ?? null]),
    ),
  };
}

async function main() {
  assertUserAccessJwt(JWT);
  requireEnv('NAV_V2_DEAL_ID', DEAL_ID);
  assertApiKeyIsPublic(API_KEY);

  const edgeUrl = `${SUPABASE_URL}/functions/v1/nav-v2-deal-api`;
  const edge = await postJson(edgeUrl, { action: 'get_deal_card', deal_id: DEAL_ID });
  if (edge?.ok !== true) throw new Error(`Edge response ok=true expected: ${JSON.stringify(edge)}`);
  if (edge?.action !== 'get_deal_card') throw new Error(`Edge action mismatch: ${edge?.action}`);
  assertDealCardPayload(edge.data);

  if (COMPARE_DIRECT_RPC) {
    const rpcUrl = `${SUPABASE_URL}/rest/v1/rpc/nav_v2_get_deal_card`;
    const direct = await postJson(rpcUrl, { p_deal_id: DEAL_ID });
    assertDealCardPayload(direct);
    const edgeShape = comparableShape(edge.data);
    const directShape = comparableShape(direct);
    if (JSON.stringify(edgeShape) !== JSON.stringify(directShape)) {
      throw new Error(`Edge/direct payload shape mismatch:\nedge=${JSON.stringify(edgeShape)}\ndirect=${JSON.stringify(directShape)}`);
    }
  }

  console.log(JSON.stringify({ ok: true, action: 'get_deal_card', deal_id: DEAL_ID, compared_direct_rpc: COMPARE_DIRECT_RPC }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});