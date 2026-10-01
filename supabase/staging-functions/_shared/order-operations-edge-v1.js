import { orderActionPlan } from './crm-canonical-action-map-v1.js';
import { readOrderDetail } from './order-detail-read-v1.js';

export function orderOperationPlan(body = {}) {
  const permissions = {
    'order.transition': ['orders.transition'],
    'order.update': ['orders.update'],
    'order.layout_not_required': ['orders.update', 'design.write'],
    events: ['orders.read'],
  }[body.action];
  return permissions ? { action: body.action, known: true, bootstrap: false, permissions } : orderActionPlan(body);
}

export async function executeOrderOperation(context) {
  const { body, auth, env, helpers, plan } = context;
  const headers = { apikey: env.serviceRole, Authorization: `Bearer ${env.serviceRole}`, 'Content-Type': 'application/json' };
  const json = (status, data) => helpers.json(status, data, { 'Cache-Control': 'no-store' });
  const rpc = async (name, args) => {
    const response = await fetch(`${env.supabaseUrl}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(args) });
    if (!response.ok) throw new Error('rpc_failed');
    return response.json();
  };
  if (plan.action === 'get') return readOrderDetail(context);
  if (plan.action === 'update') return json(409, { ok: false, error: 'versioned_command_required' });
  if (plan.action === 'list') {
    const [costs, finance, clients] = await Promise.all(['costs.read', 'finance.read', 'clients.read'].map(p => rpc('leader_actor_has_crm_action_rpc', { p_actor_id: auth.actorId, p_action: p })));
    const fields = ['id','order_number','created_at','updated_at','project_name','status','deadline','layout_status','production_status','installation_status','priority','lead_id','client_id','current_stage','next_action','progress_percent'];
    if (clients === true) fields.push('client_name','client_phone');
    if (finance === true) fields.push('client_total','payment_status','prepayment','balance');
    if (costs === true) fields.push('contractor_cost','profit');
    const offset = Number(body.offset || 0);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) return json(400, { error: 'invalid_payload' });
    const response = await fetch(`${env.supabaseUrl}/rest/v1/leader_orders?select=${fields.join(',')}&order=created_at.desc,id.asc&limit=100&offset=${offset}`, { headers });
    if (!response.ok) return json(500, { error: 'orders_read_failed' });
    const orders = await response.json();
    return json(200, { ok: true, orders, next_offset: orders.length === 100 ? offset + 100 : null });
  }
  if (plan.action === 'events') {
    if (!/^[0-9a-f-]{36}$/i.test(String(body.order_id || ''))) return json(400, { error: 'invalid_payload' });
    const response = await fetch(`${env.supabaseUrl}/rest/v1/leader_activity_log?entity=eq.order&entity_id=eq.${body.order_id}&action=like.order.*&select=id,user_id,action,data,created_at&order=created_at.desc,id.desc&limit=50`, { headers });
    if (!response.ok) return json(500, { error: 'order_history_failed' });
    return json(200, { ok: true, events: await response.json() });
  }
  const result = await rpc('leader_write_order_operation_rpc', { p_payload: { actor_id: auth.actorId, request: body } });
  const code = result?.error?.code;
  const status = result?.ok === true ? 200 : ['forbidden','inactive_profile'].includes(code) ? 403 : code === 'order_unavailable' ? 404 : code === 'order_write_failed' ? 500 : ['invalid_payload','invalid_transition'].includes(code) ? 400 : 409;
  return json(status, result);
}
