#!/usr/bin/env node

const SUPABASE_URL = process.env.NAV_V2_SUPABASE_URL || 'https://ofewxuqfjhamgerwzull.supabase.co';
const API_KEY = process.env.NAV_V2_API_KEY || 'sb_publishable_ZiX8_Mnf0dY6S__tKO2A4A_uD94G2cs';
const DEAL_ID = process.env.NAV_V2_DEAL_ID || '00000000-0000-0000-0000-000000000000';
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

async function postWithoutValidAuth(testCase) {
  const edgeUrl = `${SUPABASE_URL}/functions/v1/nav-v2-deal-api`;
  const response = await fetch(edgeUrl, {
    method: 'POST',
    headers: {
      ...testCase.headers,
      apikey: API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'get_deal_card', deal_id: DEAL_ID }),
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

  return { check: testCase.name, status: response.status };
}

async function main() {
  const checks = [];
  for (const testCase of CASES) {
    checks.push(await postWithoutValidAuth(testCase));
  }
  console.log(JSON.stringify({ ok: true, checks }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
