// Called only after the existing canonical orders.read gate, with a verified actor.
export async function readOrderDetail({ body, auth, env, helpers }) {
  const id = String(body.order_id || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return helpers.json(400, { error: 'invalid_order_id' });
  const headers = { apikey: env.serviceRole, Authorization: `Bearer ${env.serviceRole}`, 'Content-Type': 'application/json' };
  const allowed = async action => {
    const response = await fetch(`${env.supabaseUrl}/rest/v1/rpc/leader_actor_has_crm_action_rpc`, { method: 'POST', headers, body: JSON.stringify({ p_actor_id: auth.actorId, p_action: action }) });
    if (!response.ok) throw new Error('permission_check_failed');
    return await response.json() === true;
  };
  try {
    const [costs, finance] = await Promise.all([allowed('costs.read'), allowed('finance.read')]);
    const fields = ['id','order_number','project_name','status','deadline','layout_status','production_status','lead_id','client_id','created_at','updated_at'];
    // Client identity is needed by sales staff; accountant only needs the order reference.
    if (await allowed('clients.read')) fields.push('client_name','client_phone');
    if (costs) fields.push('contractor_cost','profit');
    if (finance) fields.push('client_total','balance','prepayment','payment_status');
    const response = await fetch(`${env.supabaseUrl}/rest/v1/leader_orders?id=eq.${id}&select=${fields.join(',')}&limit=1`, { headers });
    if (!response.ok) return helpers.json(500, { error: 'order_read_failed' });
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows[0]) return helpers.json(404, { error: 'order_not_found' });
    const itemFields = ['id','order_id','name','unit','quantity','category','item_type','created_at'];
    if (costs) itemFields.push('contractor_price','contractor_sum');
    if (finance) itemFields.push('client_sum');
    const items = [];
    for (let offset = 0; offset < 10000; offset += 500) {
      const read = await fetch(`${env.supabaseUrl}/rest/v1/leader_order_items?order_id=eq.${id}&select=${itemFields.join(',')}&order=id.asc&offset=${offset}&limit=500`, { headers });
      if (!read.ok) return helpers.json(500, { error: 'order_items_read_failed' });
      const page = await read.json();
      if (!Array.isArray(page)) return helpers.json(500, { error: 'order_items_read_failed' });
      items.push(...page);
      if (page.length < 500) return helpers.json(200, { ok: true, order: rows[0], items }, { 'Cache-Control': 'no-store' });
    }
    return helpers.json(422, { error: 'order_items_limit_exceeded' });
  } catch (_) { return helpers.json(500, { error: 'order_read_failed' }); }
}
