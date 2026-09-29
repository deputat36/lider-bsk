import assert from 'node:assert/strict';
import { readOrderDetail } from '../supabase/staging-functions/_shared/order-detail-read-v1.js';
import { orderActionPlan } from '../supabase/staging-functions/_shared/crm-canonical-action-map-v1.js';

assert.deepEqual(orderActionPlan({ action: 'get' }).permissions, ['orders.read']);
const original = globalThis.fetch;
const fields = [], itemFields = [];
let permissions = new Set(['clients.read']);
const response = data => new Response(JSON.stringify(data), { status: 200 });
globalThis.fetch = async (input, init) => {
  const url = new URL(input);
  if (url.pathname.endsWith('/leader_actor_has_crm_action_rpc')) return response(permissions.has(JSON.parse(init.body).p_action));
  const names = url.searchParams.get('select').split(',');
  if (url.pathname.endsWith('/leader_orders')) { fields.push(names); return response([Object.fromEntries(names.map(name => [name, 'synthetic']))]); }
  itemFields.push(names); return response([]);
};
const context = { body: { order_id: '90000000-0000-4000-8000-000000000501' }, auth: { actorId: 'synthetic' }, env: { serviceRole: 'synthetic-test', supabaseUrl: 'https://example.invalid' }, helpers: { json: (status, body) => ({ status, body }) } };
try {
  const manager = await readOrderDetail(context);
  assert.equal(manager.status, 200);
  assert(fields.at(-1).includes('client_name'));
  for (const field of ['profit','contractor_cost','balance','prepayment','client_total','data']) assert(!fields.at(-1).includes(field));
  assert(!itemFields.at(-1).includes('contractor_sum'));
  permissions = new Set(['finance.read','costs.read']);
  const accountant = await readOrderDetail(context);
  assert.equal(accountant.status, 200);
  assert(fields.at(-1).includes('profit'));
  assert(!fields.at(-1).includes('client_phone'));
  assert.equal((await readOrderDetail({ ...context, body: { order_id: 'injected' } })).status, 400);
  globalThis.fetch = async () => new Response('unavailable', { status: 503 });
  assert.equal((await readOrderDetail(context)).status, 500);
} finally { globalThis.fetch = original; }
console.log('Authorized order detail omits financial and personal fields outside the canonical action matrix.');
