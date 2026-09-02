import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import {
  STAGING_PROJECT_REF, WORKFLOW_EDGE_CONTRACT_VERSION, object, projectRef,
  statusFor, text, validateWorkflowRequest,
} from './contract.ts'

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers })
function preferred(primary: string | undefined, values: string | undefined) {
  if (text(primary, 3000)) return text(primary, 3000)
  try { return text(object(JSON.parse(String(values || '')))?.default, 3000) } catch { return '' }
}
async function adminFetch(url: string, key: string, path: string, init: RequestInit = {}) {
  const requestHeaders = new Headers(init.headers || {})
  requestHeaders.set('apikey', key)
  if (key.split('.').length === 3) requestHeaders.set('Authorization', `Bearer ${key}`)
  return await fetch(url + path, { ...init, headers: requestHeaders })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  const url = Deno.env.get('SUPABASE_URL') || ''
  const publicKey = preferred(Deno.env.get('SUPABASE_ANON_KEY'), Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'))
  const adminKey = preferred(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), Deno.env.get('SUPABASE_SECRET_KEYS'))
  if (projectRef(url) !== STAGING_PROJECT_REF) return json(503, { error: 'wrong_environment', contract: WORKFLOW_EDGE_CONTRACT_VERSION })
  if (!publicKey || !adminKey) return json(500, { error: 'server_not_configured' })

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return json(401, { error: 'missing_or_invalid_jwt' })
  const userResponse = await fetch(`${url}/auth/v1/user`, { headers: { apikey: publicKey, Authorization: `Bearer ${token}` } })
  if (!userResponse.ok) return json(401, { error: 'missing_or_invalid_jwt' })
  const user = object(await userResponse.json())
  const actorId = text(user?.id, 80)
  if (!actorId) return json(401, { error: 'missing_or_invalid_jwt' })

  let input: unknown
  try { input = await req.json() } catch { return json(400, { error: 'validation_error' }) }
  const validation = validateWorkflowRequest(input)
  if (!validation.ok) return json(statusFor(validation.code), { ok: false, error: { code: validation.code } })

  const permissionResponse = await adminFetch(url, adminKey, '/rest/v1/rpc/leader_actor_has_crm_action_rpc', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_actor_id: actorId, p_action: validation.permission }),
  })
  if (!permissionResponse.ok) return json(500, { error: 'permission_check_failed' })
  if (await permissionResponse.json() !== true) return json(403, { error: 'forbidden', action: validation.action, permission: validation.permission })

  const rpc = validation.action === 'offer.transition' ? 'leader_transition_offer_rpc'
    : validation.action === 'design_task.transition' ? 'leader_transition_design_task_rpc'
      : 'leader_create_initial_calculation_rpc'
  const rpcResponse = await adminFetch(url, adminKey, `/rest/v1/rpc/${rpc}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_payload: { actor_id: actorId, actor_email: text(user?.email, 240).toLowerCase(), request: validation.request } }),
  })
  if (!rpcResponse.ok) return json(500, { error: 'workflow_rpc_transport_failed' })
  const result = object(await rpcResponse.json())
  if (result?.ok !== true) {
    const code = text(object(result?.error)?.code, 80) || 'persistence_failed'
    return json(statusFor(code), result || { ok: false, error: { code } })
  }
  return json(result.idempotent_replay === true ? 200 : 201, result)
})
