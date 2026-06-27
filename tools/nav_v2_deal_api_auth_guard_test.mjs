#!/usr/bin/env node

const SUPABASE_URL = process.env.NAV_V2_SUPABASE_URL || 'https://ofewxuqfjhamgerwzull.supabase.co';
const API_KEY = process.env.NAV_V2_API_KEY || 'sb_publishable_ZiX8_Mnf0dY6S__tKO2A4A_uD94G2cs';
const DEAL_ID = process.env.NAV_V2_DEAL_ID || '00000000-0000-0000-0000-000000000000';
const ACTION = process.env.NAV_V2_ACTION || 'get_deal_card';
const PREFLIGHT_ONLY = process.env.NAV_V2_AUTH_GUARD_PREFLIGHT_ONLY === '1';
const READ_ACTIONS = new Set(['get_deal_card', 'get_deal_card_lite']);
const ALLOWED_REJECTION_STATUSES = new Set([401, 403]);

const CASES = [
  {
    name: 'missing_authorization',
    headers: {},
  },
  {
    name: 'invalid_bearer_token',
    headers: { Authorization: 'Bearer invalid-nav-v2-token' },
  },
];

function assertReadAction(value) {
  if (!READ_ACTIONS.has(value)) {
    throw new Error('NAV_V2_ACTION must be one of: get_deal_card, get_deal_card_lite');
  }
}

async function postWithoutValidAuth(testCase, action) {
  const edgeUrl = `${SUPABASE_URL}/functions/v1/nav-v2-deal-api`;
  const response = await fetch(edgeUrl, {
    method: 'POST',
    headers: {
      ...testCase.headers,
      apikey: API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, deal_id: DEAL_ID }),
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = null;
  }

  if (response.ok) {
    throw new Error(`${testCase.name} unexpectedly succeeded: ${JSON.stringify(json)}`);
  }
  if (!ALLOWED_REJECTION_STATUSES.has(response.status)) {
    throw new Error(`${testCase.name} expected rejection with 401/403, got ${response.status}: ${text.slice(0, 200)}`);
  }
  if (json?.data || json?.ok === true) {
    throw new Error(`${testCase.name} rejection must not include successful data payload: ${JSON.stringify(json)}`);
  }

  return { check: testCase.name, action, status: response.status };
}

async function main() {
  assertReadAction(ACTION);
  if (PREFLIGHT_ONLY) {
    console.log(JSON.stringify({ ok: true, preflight_only: true, action: ACTION }, null, 2));
    return;
  }

  const checks = [];
  for (const testCase of CASES) {
    checks.push(await postWithoutValidAuth(testCase, ACTION));
  }
  console.log(JSON.stringify({ ok: true, action: ACTION, checks }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
