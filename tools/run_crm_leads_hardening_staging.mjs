// Real HTTP proof against one isolated staging deployment. No production URL or privileged key.
import assert from 'node:assert/strict';
const url = 'https://otulfnouybahfnsycxqn.supabase.co';
const key = 'sb_publishable_iRCLPHgRaI5SNo9h4efMQw_W7Kdby1D';
const slug = 'leader-crm-leads-hardening';
const runKey = `${process.env.GITHUB_RUN_ID}:${process.env.GITHUB_RUN_ATTEMPT}`;
const markerFile = process.env.HARDENING_FIXTURE_FILE;
const request = async (path, body, token, method = 'POST') => {
  const res = await fetch(url + path, { method, signal: AbortSignal.timeout(20000), headers: { apikey: key, ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json', ...(method === 'DELETE' ? { Prefer: 'return=representation' } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: res.status, body: await res.json().catch(() => null) };
};
async function bootstrap(action, args = {}) {
  const oidc = await fetch(process.env.ACTIONS_ID_TOKEN_REQUEST_URL + '&audience=leader-staging-authenticated-e2e', { signal: AbortSignal.timeout(15000), headers: { Authorization: `bearer ${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` } });
  const signed = await oidc.json();
  assert(oidc.ok && signed.value, 'oidc_failed');
  const result = await request('/functions/v1/leader-staging-authenticated-e2e-bootstrap', { action, run_key: runKey, ...args }, signed.value);
  assert(result.body?.ok === true, `bootstrap_${action}:${result.status}:${result.body?.error}`);
  return result.body;
}
const created = [];
let fixture, token;
async function cleanup() {
  if (!fixture) return;
  await bootstrap('set_worker_active', { marker: fixture.marker, active: true });
  await bootstrap('set_role', { marker: fixture.marker, role: 'owner' });
  const cleaned = await bootstrap('cleanup', { marker: fixture.marker });
  assert(Object.values(cleaned.residue).every(value => value === 0), 'fixture_residue');
  console.log(JSON.stringify({ ok: true, cleanup: true, auth_user_deleted: cleaned.auth_user_deleted, residue: cleaned.residue }));
}
async function main() {
  assert(/^\d+:\d+$/.test(runKey), 'github_run_required');
  if (process.env.HARDENING_RECOVER_MARKER) await bootstrap('cleanup', { marker: process.env.HARDENING_RECOVER_MARKER });
  fixture = await bootstrap('prepare');
  try {
  // Only a runner-local marker is retained for emergency cleanup, never credentials or tokens.
  if (markerFile) { const { writeFile } = await import('node:fs/promises'); await writeFile(markerFile, JSON.stringify({ marker: fixture.marker, run_key: runKey })); }
  for (const value of [fixture.password, fixture.email, fixture.marker, fixture.lead_id]) console.log('::add-mask::' + value);
  const auth = await request('/auth/v1/token?grant_type=password', { email: fixture.email, password: fixture.password });
  assert.equal(auth.status, 200, 'auth_failed');
  token = auth.body.access_token;
  console.log('::add-mask::' + token);
  const invoke = body => request('/functions/v1/' + slug, body, token);
    const seed = await bootstrap('prepare_leads_hardening', { marker: fixture.marker });
    for (const length of [2001, 3000]) {
      const message = 'Я'.repeat(length - 8) + '\nQR 1000';
      const made = await invoke({ action: 'create', name: fixture.marker + '-manual-' + length, source: 'Synthetic E2E', message });
      if (made.body?.lead?.id) created.push(made.body.lead.id);
      assert.equal(made.status, 200, 'create_' + length + ':' + made.body?.error);
      assert.equal(made.body.lead.message, message);
      const edited = await invoke({ action: 'update', id: fixture.lead_id, message });
      assert.equal(edited.status, 200, 'edit_' + length + ':' + edited.body?.error);
      assert.equal(edited.body.lead.message, message);
    }
    const initial = await request('/rest/v1/leader_leads?select=id,message,payload&id=eq.' + fixture.lead_id, undefined, token, 'GET');
    assert.equal(initial.body?.[0]?.message?.length, 3000);
    const edited = await invoke({ action: 'update', id: fixture.lead_id, lead_quality: 'Целевая' });
    assert.equal(edited.status, 200);
    const readback = await request('/rest/v1/leader_leads?select=id,message,payload&id=eq.' + fixture.lead_id, undefined, token, 'GET');
    assert.deepEqual(readback.body, initial.body, 'description_or_parameters_lost');
    for (const action of ['create', 'update']) {
      const result = await invoke({ action, id: fixture.lead_id, name: fixture.marker + '-overlimit', message: 'Я'.repeat(3001) });
      assert.equal(result.status, 400);
      assert.equal(result.body.error, 'message_too_long');
    }
    for (const body of [{ prepayment: 1 }, { payment_status: 'Оплачено' }]) assert.equal((await invoke({ action: 'create_order_from_offer', offer_id: seed.offer_id, ...body })).status, 403);
    assert.equal((await invoke({ action: 'create_order', rows: [{ name: fixture.marker }], totals: { total: 10 } })).status, 403);
    const converted = await invoke({ action: 'create_order_from_offer', offer_id: seed.offer_id, prepayment: 0, payment_status: 'Не оплачено', actor_id: crypto.randomUUID() });
    assert.equal(converted.status, 200, 'manager_conversion:' + converted.body?.error);
    assert(converted.body.order?.id);
    for (const field of ['client_phone', 'contractor_cost', 'client_total', 'profit', 'data', 'prepayment']) assert.equal(field in converted.body.order, false, 'response_privacy:' + field);
    const orderId = converted.body.order.id;
    const actions = ['dashboard', 'list', 'list_orders', 'create', 'update', 'ensure_client', 'create_order', 'create_order_from_offer'];
    for (const role of ['owner', 'admin', 'manager', 'accountant', 'designer', 'installer', 'contractor']) {
      await bootstrap('set_role', { marker: fixture.marker, role });
      for (const action of actions) {
        const result = await invoke({ action });
        const allowed = ['owner', 'admin', 'manager'].includes(role) && !(role === 'manager' && action === 'create_order') || role === 'accountant' && action === 'list_orders';
        assert.equal(result.status === 403, !allowed, `matrix:${role}:${action}:${result.status}`);
        if (action === 'list_orders' && allowed) {
          assert.equal(result.status, 200, 'orders:' + role);
          const order = result.body.orders?.find(row => row.id === orderId);
          assert(order, 'positive_order_read:' + role);
          if (role === 'manager') for (const field of ['client_total', 'contractor_cost', 'profit', 'prepayment', 'balance', 'payment_status', 'data']) assert.equal(field in order, false, 'manager_projection:' + field);
          if (role === 'accountant') assert.equal('client_phone' in order, false);
        }
      }
      if (['owner', 'admin', 'manager'].includes(role)) {
        const replay = await invoke({ action: 'create_order_from_offer', offer_id: seed.offer_id });
        assert.equal(replay.status, 200, 'conversion_replay:' + role);
        assert.equal(replay.body.order.id, orderId);
        assert.equal(replay.body.already_created, true);
      }
      console.log(JSON.stringify({ ok: true, role, actions: actions.length, allowed_and_denied: true }));
    }
    await bootstrap('set_worker_active', { marker: fixture.marker, active: false });
    assert.equal((await invoke({ action: 'list' })).status, 403);
    const pending = await invoke({ action: 'ensure_profile', role: 'owner', is_active: true });
    assert.equal(pending.status, 200);
    assert.equal(pending.body.profile.is_active, false);
    assert.equal((await request('/functions/v1/' + slug, { action: 'list' })).status, 401);
    console.log(JSON.stringify({ ok: true, project_ref: 'otulfnouybahfnsycxqn', real_http: true, full_description_roundtrip: [2001, 3000], overlimit_denied: 3001, finance_fields_denied: true, idempotent_conversion: true, inactive_denied: true, no_production_calls: true }));
  } catch (error) { console.error('scenario_failed:' + error.message); throw error; }
  finally { await cleanup(); }
}
main().catch(error => { console.error(String(error.message).slice(0, 250)); process.exitCode = 1; });
