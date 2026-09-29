#!/usr/bin/env node

const STAGING_REF = 'otulfnouybahfnsycxqn';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const PRODUCTION_REF = 'ofewxuqfjhamgerwzull';
const FAKE_ID = '90000000-0000-4000-8000-000000000487';

function text(value) { return String(value ?? '').trim(); }
function required(name) { const value = text(process.env[name]); if (!value) throw new Error(`missing:${name}`); return value; }
async function json(response) { return await response.json().catch(() => ({})); }
async function main() {
  const url = required('STAGING_SUPABASE_URL').replace(/\/+$/, '');
  const key = required('STAGING_SUPABASE_PUBLISHABLE_KEY');
  const email = required('STAGING_CRM_E2E_EMAIL');
  const password = required('STAGING_CRM_E2E_PASSWORD');
  const expectedRole = required('STAGING_CRM_E2E_EXPECTED_ROLE').toLowerCase();
  if (url !== STAGING_URL || url.includes(PRODUCTION_REF)) throw new Error('staging_guard_failed');
  if (!['manager', 'owner'].includes(expectedRole)) throw new Error('role_not_supported');
  const signedResponse = await fetch(`${url}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const signed = await json(signedResponse); const token = text(signed.access_token); const userId = text(signed.user?.id);
  if (!signedResponse.ok || !token || !userId) throw new Error('authentication_failed');
  const headers = { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const profileResponse = await fetch(`${url}/rest/v1/leader_user_profiles?select=user_id,role,is_active&user_id=eq.${encodeURIComponent(userId)}`, { headers });
  const profiles = await json(profileResponse); if (!profileResponse.ok || profiles?.[0]?.role !== expectedRole || profiles?.[0]?.is_active !== true) throw new Error('profile_role_mismatch');

  // Positive permission evidence must read a real fixture, not only reach 404.
  const leadId = required('STAGING_CRM_E2E_LEAD_ID');
  const leadResponse = await fetch(`${url}/rest/v1/leader_leads?select=id,assigned_to&id=eq.${encodeURIComponent(leadId)}`, { headers });
  const leads = await json(leadResponse);
  if (!leadResponse.ok || leads?.length !== 1 || leads[0].id !== leadId || leads[0].assigned_to !== userId) throw new Error('allowed_fixture_read_failed');

  // Even an application owner must not invoke service-only fixture RPCs.
  // If grants regress, this probe can only touch the same synthetic profile.
  const serviceOnlyResponse = await fetch(`${url}/rest/v1/rpc/leader_set_authenticated_e2e_role_rpc`, {
    method: 'POST', headers, body: JSON.stringify({ p_user_id: userId, p_marker: required('STAGING_CRM_E2E_MARKER'), p_role: expectedRole })
  });
  if (![401, 403].includes(serviceOnlyResponse.status)) throw new Error('service_only_rpc_not_denied');

  const allowedResponse = await fetch(`${url}/functions/v1/leader-crm-workflow`, { method: 'POST', headers, body: JSON.stringify({ action: 'design_task.transition', request_id: crypto.randomUUID(), expected_updated_at: new Date().toISOString(), payload: { task_id: FAKE_ID, idempotency_key: `role-probe:${expectedRole}:design`, status: 'В работе', layout_link: null } }) });
  const allowed = await json(allowedResponse); const allowedCode = text(allowed?.error?.code || allowed?.error);
  if (allowedResponse.status !== 404 || allowedCode !== 'not_found') throw new Error(`allowed_action_blocked:${allowedResponse.status}:${allowedCode}`);

  // Finance is additionally protected by server permissions and service-only RPC grants.
  const financeRpc = await fetch(`${url}/rest/v1/rpc/leader_write_finance_rpc`, { method: 'POST', headers, body: JSON.stringify({ p_payload: { actor_id: userId, request: {} } }) });
  if (![401,403].includes(financeRpc.status)) throw new Error('finance_service_rpc_not_denied');
  const detailResponse = await fetch(`${url}/functions/v1/leader-crm-orders`, { method: 'POST', headers, body: JSON.stringify({ action: 'list' }) });
  if (!detailResponse.ok) throw new Error('order_list_permission_failed');
  let moneyRecordsHidden = 'owner_read_allowed';
  if (expectedRole === 'manager') {
    const [receipts, expenses] = await Promise.all(['leader_payments','leader_expenses'].map(async table => {
      const response = await fetch(`${url}/rest/v1/${table}?select=id`, {headers});
      const data = await json(response); if (!response.ok || !Array.isArray(data)) throw new Error('finance_read_probe_failed'); return data;
    }));
    if (receipts.length || expenses.length) throw new Error('manager_financial_rows_exposed');
    const denied = await fetch(`${url}/functions/v1/leader-crm-finance`, {method:'POST',headers,body:JSON.stringify({action:'finance.payment.create',request_id:crypto.randomUUID(),expected_updated_at:new Date().toISOString(),payload:{order_id:FAKE_ID,amount:1,date:new Date().toISOString().slice(0,10),method:'Перевод',category:'Предоплата'}})});
    const deniedBody = await json(denied); if (denied.status!==403 || deniedBody?.error?.code!=='forbidden') throw new Error('manager_finance_write_not_denied');
    const orderLinkResponse = await fetch(`${url}/rest/v1/leader_leads?select=converted_order_id&id=eq.${encodeURIComponent(leadId)}`,{headers});
    const orderLink = await json(orderLinkResponse);
    const orderDetail = await fetch(`${url}/functions/v1/leader-crm-orders`,{method:'POST',headers,body:JSON.stringify({action:'get',order_id:orderLink?.[0]?.converted_order_id})});
    const detail = await json(orderDetail);if(!orderDetail.ok||!detail.order)throw new Error('manager_order_detail_unavailable');
    for(const key of ['client_total','contractor_cost','profit','balance','prepayment','data'])if(key in detail.order)throw new Error('manager_financial_field_exposed');
    for(const item of detail.items)for(const key of ['contractor_sum','contractor_price','client_sum','data'])if(key in item)throw new Error('manager_financial_item_exposed');
    moneyRecordsHidden = true;
  }
  let forbiddenDirect = 'service_only_rpc_rejected';
  if (expectedRole === 'manager') {
    const escalationResponse = await fetch(`${url}/rest/v1/leader_user_profiles?user_id=eq.${encodeURIComponent(userId)}`, { method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify({ role: 'owner' }) });
    const escalation = await json(escalationResponse);
    const verifyResponse = await fetch(`${url}/rest/v1/leader_user_profiles?select=role&user_id=eq.${encodeURIComponent(userId)}`, { headers });
    const verify = await json(verifyResponse);
    if (verify?.[0]?.role !== 'manager') throw new Error('manager_self_escalation_succeeded');
    if (escalationResponse.ok && Array.isArray(escalation) && escalation.length > 0) throw new Error('manager_profile_update_returned_row');
    forbiddenDirect = 'self_role_escalation_rejected';
  }
  console.log(JSON.stringify({ ok: true, project_ref: STAGING_REF, role: expectedRole, authenticated: true, allowed_action_reached_server_contract: true, allowed_fixture_read: true, service_only_rpc_denied: true, forbidden_direct_api: forbiddenDirect, finance_rpc_denied: true, money_records_hidden: moneyRecordsHidden, production_enabled: false }));
}
main().catch((error) => { console.error(JSON.stringify({ ok: false, project_ref: STAGING_REF, error: text(error?.message).slice(0, 180), production_enabled: false })); process.exitCode = 1; });
