#!/usr/bin/env node

const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn';
const STAGING_URL = `https://${STAGING_PROJECT_REF}.supabase.co`;
const FUNCTION_SLUG = 'leader-crm-orders';

const MANAGER_FIELDS = Object.freeze([
  'id',
  'order_number',
  'created_at',
  'updated_at',
  'project_name',
  'client_name',
  'client_phone',
  'status',
  'deadline',
  'source',
  'layout_status',
  'production_status',
  'installation_status',
  'priority',
  'current_stage',
  'next_action',
  'progress_percent'
].sort());

const ACCOUNTANT_FIELDS = Object.freeze([
  'id',
  'order_number',
  'created_at',
  'updated_at',
  'project_name',
  'status',
  'payment_status',
  'deadline',
  'client_total',
  'contractor_cost',
  'prepayment',
  'balance'
].sort());

const SCENARIOS = new Set([
  'manager_list_projection',
  'manager_allowed_update',
  'manager_finance_update_forbidden',
  'accountant_list_projection',
  'accountant_payment_update',
  'accountant_mixed_update_forbidden',
  'restricted_role_list_forbidden',
  'inactive_profile_forbidden'
]);

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
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

async function responseJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch (_) {
    throw new Error(`Non-JSON response with HTTP ${response.status}`);
  }
}

async function signIn(url, publishableKey, email, password) {
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  });
  const body = await responseJson(response);
  if (!response.ok || !body.access_token) {
    throw new Error(`Staging sign-in failed with HTTP ${response.status}`);
  }
  return body.access_token;
}

async function logout(url, publishableKey, token) {
  try {
    await fetch(`${url}/auth/v1/logout`, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${token}`
      }
    });
  } catch (_) {
    // Best effort only. The runner never prints credentials or tokens.
  }
}

function requestForScenario(scenario, orderId) {
  switch (scenario) {
    case 'manager_list_projection':
    case 'accountant_list_projection':
    case 'restricted_role_list_forbidden':
    case 'inactive_profile_forbidden':
      return { action: 'list' };
    case 'manager_allowed_update':
      return { action: 'update', id: orderId, status: 'В работе' };
    case 'manager_finance_update_forbidden':
      return { action: 'update', id: orderId, payment_status: 'Оплачено' };
    case 'accountant_payment_update':
      return { action: 'update', id: orderId, payment_status: 'Частично оплачено' };
    case 'accountant_mixed_update_forbidden':
      return {
        action: 'update',
        id: orderId,
        payment_status: 'Оплачено',
        status: 'В работе'
      };
    default:
      throw new Error(`Unsupported scenario: ${scenario}`);
  }
}

function validateForbidden(scenario, status, body) {
  if (status !== 403) throw new Error(`${scenario} expected HTTP 403, got ${status}`);
  const expectedError = scenario === 'inactive_profile_forbidden' ? 'access_denied' : 'forbidden';
  if (body?.error !== expectedError) {
    throw new Error(`${scenario} expected ${expectedError}, got ${String(body?.error || '')}`);
  }
}

function validateSuccess(scenario, status, body, orderId) {
  if (status !== 200 || body?.ok !== true) {
    throw new Error(`${scenario} expected HTTP 200 with ok=true, got ${status}`);
  }

  const expectedFields = scenario.startsWith('manager_') ? MANAGER_FIELDS : ACCOUNTANT_FIELDS;
  if (scenario.endsWith('_list_projection')) {
    if (!Array.isArray(body.orders)) throw new Error('orders must be an array');
    const order = body.orders.find((item) => item?.id === orderId);
    if (!order) throw new Error('Synthetic staging order was not returned');
    exactKeys(order, expectedFields, `${scenario} order`);
    return;
  }

  if (!body.order || body.order.id !== orderId) {
    throw new Error('Updated staging order was not returned');
  }
  exactKeys(body.order, expectedFields, `${scenario} order`);
}

async function main() {
  const url = required('LIDER_STAGING_SUPABASE_URL');
  if (url !== STAGING_URL) throw new Error('Only the exact lider-bsk-staging URL is allowed');

  const publishableKey = required('LIDER_STAGING_PUBLISHABLE_KEY');
  const email = required('LIDER_STAGING_EMAIL');
  const password = required('LIDER_STAGING_PASSWORD');
  const scenario = required('LIDER_STAGING_SCENARIO');
  if (!SCENARIOS.has(scenario)) throw new Error(`Unknown scenario: ${scenario}`);

  const requiresOrder = !['restricted_role_list_forbidden', 'inactive_profile_forbidden'].includes(scenario);
  const orderId = requiresOrder ? required('LIDER_STAGING_ORDER_ID') : String(process.env.LIDER_STAGING_ORDER_ID || '').trim();

  const token = await signIn(url, publishableKey, email, password);
  try {
    const response = await fetch(`${url}/functions/v1/${FUNCTION_SLUG}`, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestForScenario(scenario, orderId))
    });
    const body = await responseJson(response);

    if (scenario.endsWith('_forbidden')) {
      validateForbidden(scenario, response.status, body);
    } else {
      validateSuccess(scenario, response.status, body, orderId);
    }

    process.stdout.write(`${JSON.stringify({
      ok: true,
      environment: 'staging',
      function: FUNCTION_SLUG,
      scenario,
      httpStatus: response.status,
      projectionValidated: !scenario.endsWith('_forbidden')
    })}\n`);
  } finally {
    await logout(url, publishableKey, token);
  }
}

main().catch((error) => {
  process.stderr.write(`CRM orders staging E2E failed: ${error.message}\n`);
  process.exitCode = 1;
});
