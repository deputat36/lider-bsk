import { CRM_EDGE_ACTION_GATE_VERSION } from './crm-canonical-action-map-v1.js'

export const canonicalCorsHeaders = Object.freeze({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'X-CRM-Action-Gate': CRM_EDGE_ACTION_GATE_VERSION,
})

function clean(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max)
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: canonicalCorsHeaders })
}

async function parseBody(req) {
  if (req.method !== 'POST') return {}
  try {
    const value = await req.json()
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch (_) {
    return {}
  }
}

async function authenticatedUser(req, supabaseUrl, anonKey) {
  const authorization = req.headers.get('authorization') || ''
  const token = authorization.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { error: json(401, { error: 'missing_token', gate: CRM_EDGE_ACTION_GATE_VERSION }) }

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
    },
  })
  if (!response.ok) return { error: json(401, { error: 'bad_token', gate: CRM_EDGE_ACTION_GATE_VERSION }) }

  const user = await response.json()
  const actorId = clean(user?.id, 80)
  if (!actorId) return { error: json(401, { error: 'bad_user', gate: CRM_EDGE_ACTION_GATE_VERSION }) }
  return { user, actorId, authorization }
}

async function hasCanonicalPermission(supabaseUrl, serviceRole, actorId, action) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/leader_actor_has_crm_action_rpc`, {
    method: 'POST',
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_actor_id: actorId, p_action: action }),
  })
  if (!response.ok) {
    return { ok: false, error: `permission_rpc_failed:${response.status}:${clean(await response.text(), 500)}` }
  }
  return { ok: true, allowed: (await response.json()) === true }
}

async function forwardToImplementation(req, body, options, env, authorization) {
  const sourceUrl = new URL(req.url)
  const target = new URL(`${env.supabaseUrl}/functions/v1/${options.implementationSlug}`)
  target.search = sourceUrl.search

  const headers = {
    apikey: env.anonKey,
    Authorization: authorization,
    'Content-Type': 'application/json',
    'X-CRM-Action-Gate': CRM_EDGE_ACTION_GATE_VERSION,
  }

  const response = await fetch(target, {
    method: req.method === 'GET' ? 'GET' : 'POST',
    headers,
    body: req.method === 'GET' ? undefined : JSON.stringify(body),
  })

  const responseHeaders = new Headers(response.headers)
  for (const [key, value] of Object.entries(canonicalCorsHeaders)) responseHeaders.set(key, value)
  responseHeaders.set('X-CRM-Implementation', options.implementationSlug)
  return new Response(response.body, { status: response.status, headers: responseHeaders })
}

export async function runCanonicalEdgeWrapper(req, options) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: canonicalCorsHeaders })
  if (!['GET', 'POST'].includes(req.method)) return json(405, { error: 'method_not_allowed', gate: CRM_EDGE_ACTION_GATE_VERSION })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceRole) return json(500, { error: 'server_not_configured', gate: CRM_EDGE_ACTION_GATE_VERSION })

  const body = await parseBody(req)
  const plan = options.plan(body, new URL(req.url))
  if (!plan?.known) return json(400, { error: 'unknown_action', action: clean(plan?.action, 80), gate: CRM_EDGE_ACTION_GATE_VERSION })

  const auth = await authenticatedUser(req, supabaseUrl, anonKey)
  if (auth.error) return auth.error

  if (!plan.bootstrap) {
    for (const permission of plan.permissions || []) {
      const decision = await hasCanonicalPermission(supabaseUrl, serviceRole, auth.actorId, permission)
      if (!decision.ok) return json(500, { error: 'permission_check_failed', details: decision.error, gate: CRM_EDGE_ACTION_GATE_VERSION })
      if (!decision.allowed) {
        return json(403, {
          error: 'forbidden',
          action: clean(plan.action, 80),
          required_permission: permission,
          gate: CRM_EDGE_ACTION_GATE_VERSION,
        })
      }
    }
  }

  return await forwardToImplementation(
    req,
    body,
    options,
    { supabaseUrl, anonKey, serviceRole },
    auth.authorization,
  )
}
