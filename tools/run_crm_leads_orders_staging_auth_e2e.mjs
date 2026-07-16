#!/usr/bin/env node

const STAGING_REF = 'otulfnouybahfnsycxqn';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const FUNCTION_SLUG = 'leader-crm-leads-staging';

const MANAGER_FIELDS = Object.freeze([
  'id', 'order_number', 'created_at', 'updated_at', 'project_name',
  'client_name', 'client_phone', 'status', 'deadline', 'source',
  'layout_status', 'production_status', 'installation_status', 'priority',
  'current_stage', 'next_action', 'progress_percent'
].sort());

const ACCOUNTANT_FIELDS = Object.freeze([
  'id', 'order_number', 'created_at', 'updated_at', 'project_name',
  'status', 'payment_status', 'deadline', 'client_total',
  'contractor_cost', 'prepayment', 'balance'
].sort());

const SCENARIOS = new Set([
  'manager_list_orders_projection',
  'accountant_list_orders_projection',
  'accountant_dashboard_forbidden',
  'restricted_list_orders_forbidden',
  'inactive_profile_forbidden'
]);

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function jsonBody(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch (_) {
    throw new Error(`Non-JSON response with HTTP ${response.status}`);
  }
}

async function signIn(url, key, email, password) {
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const body = await jsonBody(response);
  if (!response.ok || !body.access_token) {
    throw new Error(`Staging sign-in failed with HTTP ${response.status}`);
  }
  return body.access_token;
}

async function logout(url, key, token) {
  try {
    await fetch(`${url}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${token}` }
    });
  } catch (_) {
    // Best effort only. Credentials and tokens are never printed.
  }
}

function requestForScenario(scenario) {
  return scenario === 'accountant_dashboard_forbidden'
    ? { action: 'dashboard' }
    : { action: 'list_orders' };
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} projection mismatch: ${actual.join(',')}`);
  }
}

function validateSuccess(scenario, status, body, orderId) {
  if (status !== 200 || body?.ok !== true || !Array.isArray(body.orders)) {
    throw new Error(`${scenario} expected HTTP 200 with orders array, got ${status}`);
  }
  const order = body.orders.find((item) => item?.id === orderId);
  if (!order) throw new Error('Synthetic staging order was not returned');
  const expected = scenario.startsWith('manager_') ? MANAGER_FIELDS : ACCOUNTANT_FIELDS;
  exactKeys(order, expected, `${scenario} order`);
}

function validateForbidden(scenario, status, body) {
  if (status !== 403) throw new Error(`${scenario} expected HTTP 403, got ${status}`);
  const expected = scenario === 'inactive_profile_forbidden' ? 'access_denied' : 'forbidden';
  if (body?.error !== expected) {
    throw new Error(`${scenario} expected ${expected}, got ${String(body?.error || '')}`);
  }
}

async function main() {
  const url = required('LIDER_STAGING_SUPABASE_URL');
  if (url !== STAGING_URL) throw new Error('Only the exact lider-bsk-staging URL is allowed');

  const key = required('LIDER_STAGING_PUBLISHABLE_KEY');
  const email = required('LIDER_STAGING_EMAIL');
  const password = required('LIDER_STAGING_PASSWORD');
  const scenario = required('LIDER_STAGING_SCENARIO');
  if (!SCENARIOS.has(scenario)) throw new Error(`Unknown scenario: ${scenario}`);

  const projectionScenario = scenario.endsWith('_projection');
  const orderId = projectionScenario ? required('LIDER_STAGING_ORDER_ID') : '';
  const token = await signIn(url, key, email, password);

  try {
    const response = await fetch(`${url}/functions/v1/${FUNCTION_SLUG}`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestForScenario(scenario))
    });
    const body = await jsonBody(response);

    if (projectionScenario) validateSuccess(scenario, response.status, body, orderId);
    else validateForbidden(scenario, response.status, body);

    process.stdout.write(`${JSON.stringify({
      ok: true,
      environment: 'staging',
      function: FUNCTION_SLUG,
      scenario,
      httpStatus: response.status,
      projectionValidated: projectionScenario
    })}\n`);
  } finally {
    await logout(url, key, token);
  }
}

main().catch((error) => {
  process.stderr.write(`CRM leads orders staging E2E failed: ${error.message}\n`);
  process.exitCode = 1;
});
