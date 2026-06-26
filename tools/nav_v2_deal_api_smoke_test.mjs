#!/usr/bin/env node

const SUPABASE_URL = process.env.NAV_V2_SUPABASE_URL || 'https://ofewxuqfjhamgerwzull.supabase.co';
const JWT = process.env.NAV_V2_JWT;
const DEAL_ID = process.env.NAV_V2_DEAL_ID;
const COMPARE_DIRECT_RPC = process.env.NAV_V2_COMPARE_DIRECT_RPC === '1';

function requireEnv(name, value) {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${JWT}`,
      apikey: JWT,
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
  requireEnv('NAV_V2_JWT', JWT);
  requireEnv('NAV_V2_DEAL_ID', DEAL_ID);

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
