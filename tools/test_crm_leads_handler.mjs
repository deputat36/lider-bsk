import test from 'node:test';
import assert from 'node:assert/strict';

const url = 'https://staging.invalid';
const actor = '90000000-0000-4000-8000-000000000601';
const leadId = '90000000-0000-4000-8000-000000000602';
const offerId = '90000000-0000-4000-8000-000000000603';
const orderId = '90000000-0000-4000-8000-000000000604';
let handler;
globalThis.Deno = {
  env: { get: key => ({ SUPABASE_URL: url, SUPABASE_ANON_KEY: 'public-key', SUPABASE_SERVICE_ROLE_KEY: 'service-key' })[key] },
  serve: fn => { handler = fn; },
};
await import('../supabase/functions/leader-crm-leads/index.ts');

function fixture(role = 'owner', options = {}) {
  const state = { calls: [], lead: { id: leadId, name: 'Synthetic', message: 'A'.repeat(3000), status: 'Новая', payload: { parameters: 'preserved' } }, profile: { user_id: actor, role, is_active: options.active !== false } };
  const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  globalThis.fetch = async (input, init = {}) => {
    const endpoint = new URL(input);
    const path = endpoint.pathname;
    const method = init.method || 'GET';
    const headers = new Headers(init.headers);
    const body = init.body ? JSON.parse(init.body) : null;
    state.calls.push({ path, method, headers, body, endpoint });
    if (options.networkFailure) throw new Error('private upstream failure');
    if (path === '/auth/v1/user') return headers.get('authorization') === 'Bearer caller-token' ? response({ id: actor, email: 'synthetic@example.invalid' }) : response({}, 401);
    if (path === '/rest/v1/leader_user_profiles') {
      if (method === 'POST') { state.profile = body; return response([body]); }
      return response(options.noProfile || !state.profile.is_active && endpoint.searchParams.get('is_active') ? [] : [state.profile]);
    }
    if (path === '/rest/v1/rpc/leader_actor_has_crm_action_rpc') return response(options.canonicalDenied ? false : body.p_action !== 'finance.write' || ['owner', 'admin'].includes(role));
    if (path === '/rest/v1/leader_leads') {
      assert.equal(headers.get('authorization'), 'Bearer caller-token', 'lead data must respect caller RLS');
      assert.equal(headers.get('apikey'), 'public-key');
      if (options.hiddenLead) return response([]);
      if (method === 'POST') state.lead = { ...body, id: leadId };
      if (method === 'PATCH') state.lead = { ...state.lead, ...body };
      return response([state.lead]);
    }
    if (path === '/rest/v1/leader_commercial_offers') return response(options.hiddenOffer ? [] : [{ id: offerId }]);
    if (path === '/rest/v1/rpc/leader_create_order_from_offer_rpc') return response({ ok: true, order: { id: orderId, status: 'Новый', client_phone: 'PRIVATE', contractor_cost: 500, data: { secret: true } }, client: { secret: true }, items_created: 1 });
    if (path === '/rest/v1/leader_orders') {
      const fields = endpoint.searchParams.get('select')?.split(',') || [];
      return response([Object.fromEntries(fields.map(key => [key, key === 'id' ? orderId : key]))]);
    }
    if (path === '/rest/v1/leader_clients') return response([{ id: 'client', owner_id: actor }]);
    throw new Error('unhandled synthetic path ' + path);
  };
  state.invoke = async (body, { method = 'POST', token = 'caller-token', raw } = {}) => {
    const req = new Request(url + '/functions/v1/leader-crm-leads' + (method === 'GET' ? '?action=' + body.action : ''), {
      method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), 'Content-Type': 'application/json' },
      ...(method === 'POST' ? { body: raw ?? JSON.stringify(body) } : {}),
    });
    const result = await handler(req);
    return { status: result.status, body: await result.json(), headers: result.headers };
  };
  return state;
}

const actions = ['dashboard', 'list', 'list_orders', 'create', 'update', 'ensure_client', 'create_order', 'create_order_from_offer'];
for (const role of ['owner', 'admin', 'manager', 'accountant', 'designer', 'installer', 'contractor', 'unknown']) {
  test(role + ' generic action matrix', async () => {
    for (const action of actions) {
      const f = fixture(role);
      const result = await f.invoke({ action });
      const allowed = ['owner', 'admin', 'manager'].includes(role) && !(role === 'manager' && action === 'create_order') || role === 'accountant' && action === 'list_orders';
      assert.equal(result.status === 403, !allowed, action + ':' + result.status);
      if (!allowed) assert.equal(f.calls.some(c => !['/auth/v1/user', '/rest/v1/leader_user_profiles', '/rest/v1/rpc/leader_actor_has_crm_action_rpc'].includes(c.path)), false, 'denied action reached business data');
    }
  });
}

test('canonical permission denial blocks an otherwise allowed role before data access', async () => {
  const f = fixture('owner', { canonicalDenied: true });
  assert.equal((await f.invoke({ action: 'list' })).status, 403);
  assert.equal(f.calls.length, 3);
});

test('fresh Auth and inactive profile deny business access', async () => {
  for (const token of ['', 'expired-token']) assert.equal((await fixture().invoke({ action: 'list' }, { token })).status, 401);
  assert.equal((await fixture('owner', { active: false }).invoke({ action: 'list' })).status, 403);
});

test('pending bootstrap never activates or upgrades a new profile', async () => {
  const f = fixture('unknown', { noProfile: true });
  assert.equal((await f.invoke({ action: 'ensure_profile', role: 'owner', is_active: true })).status, 200);
  assert.equal(f.profile.role, 'manager');
  assert.equal(f.profile.is_active, false);
});

test('create and edit preserve 2001/3000 characters; overlimit never writes', async () => {
  for (const length of [2001, 3000]) {
    const f = fixture('manager');
    const message = 'Я'.repeat(length - 8) + '\nQR 1000';
    assert.equal(message.length, length);
    assert.equal((await f.invoke({ action: 'create', name: 'Synthetic', message })).body.lead.message, message);
    assert.equal((await f.invoke({ action: 'update', id: leadId, message })).body.lead.message, message);
    assert.equal((await f.invoke({ action: 'list' })).body.leads[0].message, message);
  }
  for (const action of ['create', 'update']) {
    const f = fixture('manager');
    const result = await f.invoke({ action, id: leadId, name: 'Synthetic', message: 'Я'.repeat(3001) });
    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'message_too_long');
    assert.equal(f.calls.some(c => ['POST', 'PATCH'].includes(c.method) && c.path === '/rest/v1/leader_leads'), false);
    assert.equal(f.lead.message.length, 3000);
  }
});

test('status-only update preserves long description and structured parameters', async () => {
  const f = fixture('manager');
  const original = structuredClone(f.lead);
  const result = await f.invoke({ action: 'update', id: leadId, status: 'В работе', payload: { overwritten: true } });
  assert.equal(result.status, 200);
  assert.equal(result.body.lead.message, original.message);
  assert.deepEqual(f.lead.payload, original.payload);
  assert.deepEqual(f.calls.find(c => c.method === 'PATCH').body, { status: 'В работе' });
});

test('unknown, empty update, inaccessible row and malformed requests have explicit outcomes', async () => {
  const f = fixture();
  assert.equal((await f.invoke({ action: 'unknown' })).status, 400);
  assert.equal((await f.invoke({ action: 'update', id: leadId, arbitrary: true })).body.error, 'no_update_fields');
  assert.equal((await fixture('manager', { hiddenLead: true }).invoke({ action: 'update', id: leadId, message: 'test' })).status, 404);
  for (const raw of ['{', 'null', '[]', '12']) assert.equal((await f.invoke({}, { raw })).body.error, 'invalid_json');
  assert.equal((await f.invoke({ action: 'create' }, { method: 'GET' })).status, 405);
  assert.equal((await f.invoke({}, { method: 'DELETE' })).status, 405);
  assert.equal((await fixture('owner', { networkFailure: true }).invoke({ action: 'list' })).body.error, 'temporarily_unavailable');
});

test('manager order list omits financial fields and uses caller RLS; accountant stays narrow', async () => {
  for (const role of ['manager', 'accountant', 'owner']) {
    const f = fixture(role);
    const result = await f.invoke({ action: 'list_orders' });
    assert.equal(result.status, 200);
    const read = f.calls.find(c => c.path === '/rest/v1/leader_orders');
    assert.equal(read.headers.get('authorization'), 'Bearer caller-token');
    if (role === 'manager') for (const key of ['client_total', 'contractor_cost', 'profit', 'prepayment', 'balance', 'payment_status', 'data']) assert.equal(key in result.body.orders[0], false);
    if (role === 'accountant') assert.equal('client_phone' in result.body.orders[0], false);
  }
});

test('approved-offer route preserves manager path, verifies object and strips private response', async () => {
  const f = fixture('manager');
  const result = await f.invoke({ action: 'create_order_from_offer', offer_id: offerId, prepayment: 0, payment_status: 'Не оплачено', actor_id: 'spoof', totals: { total: 1 } });
  assert.equal(result.status, 200);
  assert.equal(result.body.order.id, orderId);
  assert.equal('client' in result.body, false);
  for (const key of ['client_phone', 'contractor_cost', 'data']) assert.equal(key in result.body.order, false);
  const rpc = f.calls.find(c => c.path.endsWith('leader_create_order_from_offer_rpc'));
  assert.equal(rpc.body.p_payload.actor_id, actor);
  assert.equal('totals' in rpc.body.p_payload, false);
  const hidden = fixture('manager', { hiddenOffer: true });
  assert.equal((await hidden.invoke({ action: 'create_order_from_offer', offer_id: offerId })).status, 404);
  assert.equal(hidden.calls.some(c => c.path.endsWith('leader_create_order_from_offer_rpc')), false);
});

test('financial inputs and legacy financial snapshot cannot bypass manager policy', async () => {
  for (const input of [{ prepayment: 1 }, { payment_status: 'Оплачено' }]) {
    const f = fixture('manager');
    assert.equal((await f.invoke({ action: 'create_order_from_offer', offer_id: offerId, ...input })).status, 403);
    assert.equal(f.calls.some(c => c.path.endsWith('leader_create_order_from_offer_rpc')), false);
  }
  const f = fixture('manager');
  assert.equal((await f.invoke({ action: 'create_order', rows: [{ name: 'test' }], totals: { cost: 1 } })).status, 403);
  for (const role of ['owner', 'admin']) {
    const owner = fixture(role);
    assert.equal((await owner.invoke({ action: 'create_order_from_offer', offer_id: offerId, prepayment: 1, payment_status: 'Предоплата' })).status, 200);
  }
});
