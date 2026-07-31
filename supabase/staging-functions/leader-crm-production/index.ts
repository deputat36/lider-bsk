import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import {
  MAX_BODY_BYTES,
  PRODUCTION_ACTION,
  PRODUCTION_EDGE_CONTRACT_VERSION,
  STAGING_PROJECT_REF,
  asObject,
  cleanText,
  isJwtApiKey,
  preferredEnvironmentKey,
  projectRefFromUrl,
  rpcStatus,
  validateProductionRequest,
} from './contract.ts'
import {
  PRODUCTION_CREATE_ACTION,
  validateProductionCreateRequest,
} from './create-contract.ts'

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

async function adminFetch(
  supabaseUrl: string,
  adminKey: string,
  path: string,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers || {})
  headers.set('apikey', adminKey)
  if (isJwtApiKey(adminKey)) headers.set('Authorization', `Bearer ${adminKey}`)
  return await fetch(supabaseUrl + path, { ...init, headers })
}

async function authenticatedUser(req: Request, supabaseUrl: string, publicKey: string) {
  const authorization = req.headers.get('authorization') || ''
  const token = authorization.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { error: json(401, { error: 'missing_or_invalid_jwt' }) }

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: publicKey, Authorization: `Bearer ${token}` },
  })
  if (!response.ok) return { error: json(401, { error: 'missing_or_invalid_jwt' }) }

  const user = asObject(await response.json())
  const id = cleanText(user?.id, 80)
  if (!id) return { error: json(401, { error: 'missing_or_invalid_jwt' }) }
  return { user: { id, email: cleanText(user?.email, 240).toLowerCase() } }
}

async function canonicalPermission(
  supabaseUrl: string,
  adminKey: string,
  actorId: string,
  permission: string,
) {
  const response = await adminFetch(
    supabaseUrl,
    adminKey,
    '/rest/v1/rpc/leader_actor_has_crm_action_rpc',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_actor_id: actorId, p_action: permission }),
    },
  )
  if (!response.ok) {
    console.error('leader-crm-production permission transport failure', {
      status: response.status,
      permission,
    })
    return { error: json(500, { error: 'permission_check_failed' }) }
  }
  return { allowed: (await response.json()) === true }
}

function safeRpcError(value: unknown) {
  const result = asObject(value)
  const error = asObject(result?.error)
  const code = cleanText(error?.code, 80) || 'persistence_failed'
  const known = new Set([
    'validation_error',
    'unknown_action',
    'forbidden',
    'not_found',
    'conflict',
    'duplicate_request',
    'invalid_transition',
    'persistence_failed',
  ])
  const safeCode = known.has(code) ? code : 'persistence_failed'
  return {
    status: rpcStatus(safeCode),
    body: {
      ok: false,
      request_id: cleanText(result?.request_id, 80) || null,
      error: {
        code: safeCode,
        message: safeCode === 'persistence_failed'
          ? 'Production command could not be persisted'
          : cleanText(error?.message, 300) || safeCode,
      },
    },
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const publicKey = preferredEnvironmentKey(
    Deno.env.get('SUPABASE_ANON_KEY'),
    Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'),
  )
  const adminKey = preferredEnvironmentKey(
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    Deno.env.get('SUPABASE_SECRET_KEYS'),
  )
  if (!supabaseUrl || !publicKey || !adminKey) {
    return json(500, { error: 'server_not_configured' })
  }

  if (projectRefFromUrl(supabaseUrl) !== STAGING_PROJECT_REF) {
    return json(503, {
      error: 'wrong_environment',
      expected: 'staging',
      contract: PRODUCTION_EDGE_CONTRACT_VERSION,
    })
  }

  const contentLength = Number(req.headers.get('content-length') || 0)
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json(413, { error: 'payload_too_large' })
  }

  const checked = await authenticatedUser(req, supabaseUrl, publicKey)
  if (checked.error) return checked.error

  let input: unknown
  try {
    input = await req.json()
  } catch {
    return json(400, { error: 'validation_error' })
  }

  const action = cleanText(asObject(input)?.action, 80)
  const validation = action === PRODUCTION_CREATE_ACTION
    ? validateProductionCreateRequest(input)
    : validateProductionRequest(input)
  if (!validation.ok) {
    return json(rpcStatus(validation.code), {
      ok: false,
      request_id: cleanText(asObject(input)?.request_id, 80) || null,
      error: { code: validation.code, message: validation.message },
    })
  }

  for (const permission of validation.permissions) {
    const permissionResult = await canonicalPermission(
      supabaseUrl,
      adminKey,
      checked.user.id,
      permission,
    )
    if (permissionResult.error) return permissionResult.error
    if (!permissionResult.allowed) {
      return json(403, {
        error: 'forbidden',
        action,
        permission,
        contract: PRODUCTION_EDGE_CONTRACT_VERSION,
      })
    }
  }

  const rpcName = action === PRODUCTION_CREATE_ACTION
    ? 'leader_create_production_job_from_order_rpc'
    : 'leader_update_production_job_rpc'
  const rpcResponse = await adminFetch(
    supabaseUrl,
    adminKey,
    `/rest/v1/rpc/${rpcName}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_payload: {
          actor_id: checked.user.id,
          actor_email: checked.user.email,
          request: validation.request,
        },
      }),
    },
  )

  if (!rpcResponse.ok) {
    console.error('leader-crm-production rpc transport failure', {
      status: rpcResponse.status,
      action,
      rpc: rpcName,
      request_id: validation.request.request_id,
    })
    return json(500, {
      ok: false,
      request_id: validation.request.request_id,
      error: { code: 'persistence_failed', message: 'Production command RPC unavailable' },
    })
  }

  const result = asObject(await rpcResponse.json())
  if (!result) {
    return json(500, {
      ok: false,
      request_id: validation.request.request_id,
      error: { code: 'persistence_failed', message: 'Invalid RPC response' },
    })
  }
  if (result.ok !== true) {
    const safe = safeRpcError(result)
    return json(safe.status, safe.body)
  }

  return json(result.idempotent_replay === true ? 200 : 201, result)
})
