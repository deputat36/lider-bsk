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

  const allowedResponse = await fetch(`${url}/functions/v1/leader-crm-workflow`, { method: 'POST', headers, body: JSON.stringify({ action: 'design_task.transition', request_id: crypto.randomUUID(), expected_updated_at: new Date().toISOString(), payload: { task_id: FAKE_ID, idempotency_key: `role-probe:${expectedRole}:design`, status: 'В работе', layout_link: null } }) });
  const allowed = await json(allowedResponse); const allowedCode = text(allowed?.error?.code || allowed?.error);
  if (allowedResponse.status !== 404 || allowedCode !== 'not_found') throw new Error(`allowed_action_blocked:${allowedResponse.status}:${allowedCode}`);

  let forbiddenDirect = 'not_applicable_full_access';
  if (expectedRole === 'manager') {
    const escalationResponse = await fetch(`${url}/rest/v1/leader_user_profiles?user_id=eq.${encodeURIComponent(userId)}`, { method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify({ role: 'owner' }) });
    const escalation = await json(escalationResponse);
    const verifyResponse = await fetch(`${url}/rest/v1/leader_user_profiles?select=role&user_id=eq.${encodeURIComponent(userId)}`, { headers });
    const verify = await json(verifyResponse);
    if (verify?.[0]?.role !== 'manager') throw new Error('manager_self_escalation_succeeded');
    if (escalationResponse.ok && Array.isArray(escalation) && escalation.length > 0) throw new Error('manager_profile_update_returned_row');
    forbiddenDirect = 'self_role_escalation_rejected';
  }
  console.log(JSON.stringify({ ok: true, project_ref: STAGING_REF, role: expectedRole, authenticated: true, allowed_action_reached_server_contract: true, forbidden_direct_api: forbiddenDirect, production_enabled: false }));
}
main().catch((error) => { console.error(JSON.stringify({ ok: false, project_ref: STAGING_REF, error: text(error?.message).slice(0, 180), production_enabled: false })); process.exitCode = 1; });
