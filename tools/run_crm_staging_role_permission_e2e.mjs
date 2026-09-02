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
  console.log(JSON.stringify({ ok: true, project_ref: STAGING_REF, role: expectedRole, authenticated: true, allowed_action_reached_server_contract: true, allowed_fixture_read: true, service_only_rpc_denied: true, forbidden_direct_api: forbiddenDirect, production_enabled: false }));
}
main().catch((error) => { console.error(JSON.stringify({ ok: false, project_ref: STAGING_REF, error: text(error?.message).slice(0, 180), production_enabled: false })); process.exitCode = 1; });
