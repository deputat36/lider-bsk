import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import {
  CATALOG_ACTION,
  CATALOG_EDGE_CONTRACT_VERSION,
  CATALOG_PERMISSION,
  STAGING_PROJECT_REF,
  asObject,
  cleanText,
  projectRefFromUrl,
  rpcStatus,
  validateCatalogRequest,
} from './contract.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

async function serviceFetch(supabaseUrl: string, serviceRole: string, path: string, init: RequestInit = {}) {
  return await fetch(supabaseUrl + path, {
    ...init,
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      ...(init.headers || {}),
    },
  })
}

async function authenticatedUser(req: Request, supabaseUrl: string, anonKey: string) {
  const authorization = req.headers.get('authorization') || ''
  const token = authorization.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { error: json(401, { error: 'missing_or_invalid_jwt' }) }
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  })
  if (!response.ok) return { error: json(401, { error: 'missing_or_invalid_jwt' }) }
  const user = asObject(await response.json())
  const id = cleanText(user?.id, 80)
  if (!id) return { error: json(401, { error: 'missing_or_invalid_jwt' }) }
  return { user: { id, email: cleanText(user?.email, 240).toLowerCase() } }
}

async function canonicalPermission(supabaseUrl: string, serviceRole: string, actorId: string) {
  const response = await serviceFetch(supabaseUrl, serviceRole, '/rest/v1/rpc/leader_actor_has_crm_action_rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_actor_id: actorId, p_action: CATALOG_PERMISSION }),
  })
  if (!response.ok) {
    console.error('leader-crm-catalog permission transport failure', { status: response.status })
    return { error: json(500, { error: 'permission_check_failed' }) }
  }
  return { allowed: (await response.json()) === true }
}

function safeRpcError(value: unknown) {
  const result = asObject(value)
  const error = asObject(result?.error)
  const code = cleanText(error?.code, 80) || 'catalog_manage_failed'
  const known = new Set([
    'invalid_payload', 'unknown_action', 'inactive_profile', 'forbidden',
    'catalog_duplicate', 'catalog_not_found', 'source_changed',
    'idempotency_conflict', 'catalog_manage_failed',
  ])
  const safeCode = known.has(code) ? code : 'catalog_manage_failed'
  return {
    status: rpcStatus(safeCode),
    body: {
      ok: false,
      request_id: cleanText(result?.request_id, 80) || null,
      error: {
        code: safeCode,
        message: safeCode === 'catalog_manage_failed'
          ? 'Catalog command could not be persisted'
          : cleanText(error?.message, 300) || safeCode,
      },
    },
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!supabaseUrl || !anonKey || !serviceRole) return json(500, { error: 'server_not_configured' })

  if (projectRefFromUrl(supabaseUrl) !== STAGING_PROJECT_REF) {
    return json(503, { error: 'wrong_environment', expected: 'staging', contract: CATALOG_EDGE_CONTRACT_VERSION })
  }

  const length = Number(req.headers.get('content-length') || 0)
  if (Number.isFinite(length) && length > 64 * 1024) return json(413, { error: 'payload_too_large' })

  const checked = await authenticatedUser(req, supabaseUrl, anonKey)
  if (checked.error) return checked.error

  let input: unknown
  try { input = await req.json() } catch { return json(400, { error: 'invalid_payload' }) }

  const validation = validateCatalogRequest(input)
  if (!validation.ok) {
    return json(rpcStatus(validation.code), {
      ok: false,
      request_id: cleanText(asObject(input)?.request_id, 80) || null,
      error: { code: validation.code, message: validation.message },
    })
  }

  const permission = await canonicalPermission(supabaseUrl, serviceRole, checked.user.id)
  if (permission.error) return permission.error
  if (!permission.allowed) {
    return json(403, {
      error: 'forbidden',
      action: CATALOG_ACTION,
      permission: CATALOG_PERMISSION,
      contract: CATALOG_EDGE_CONTRACT_VERSION,
    })
  }

  const rpcResponse = await serviceFetch(supabaseUrl, serviceRole, '/rest/v1/rpc/leader_manage_catalog_rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_payload: {
        actor_id: checked.user.id,
        actor_email: checked.user.email,
        request: validation.request,
      },
    }),
  })
  if (!rpcResponse.ok) {
    console.error('leader-crm-catalog rpc transport failure', {
      status: rpcResponse.status,
      request_id: validation.request.request_id,
    })
    return json(500, {
      ok: false,
      request_id: validation.request.request_id,
      error: { code: 'catalog_manage_failed', message: 'Catalog RPC unavailable' },
    })
  }

  const result = asObject(await rpcResponse.json())
  if (!result) return json(500, { ok: false, error: { code: 'catalog_manage_failed', message: 'Invalid RPC response' } })
  if (result.ok !== true) {
    const safe = safeRpcError(result)
    return json(safe.status, safe.body)
  }

  const replay = result.idempotent_replay === true
  const operation = cleanText(result.operation, 20)
  return json(replay || operation === 'update' ? 200 : 201, result)
})
