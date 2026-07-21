import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import {
  OFFER_ACTION,
  OFFER_EDGE_CONTRACT_VERSION,
  OFFER_PERMISSION,
  STAGING_PROJECT_REF,
  asObject,
  cleanText,
  isJwtApiKey,
  preferredEnvironmentKey,
  projectRefFromUrl,
  rpcStatus,
  validateOfferRequest,
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

async function adminFetch(
  supabaseUrl: string,
  adminKey: string,
  path: string,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers || {})
  headers.set('apikey', adminKey)
  if (isJwtApiKey(adminKey)) headers.set('Authorization', `Bearer ${adminKey}`)
  return await fetch(supabaseUrl + path, {
    ...init,
    headers,
  })
}

async function authenticatedUser(
  req: Request,
  supabaseUrl: string,
  publicKey: string,
) {
  const authorization = req.headers.get('authorization') || ''
  const token = authorization.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { error: json(401, { error: 'missing_or_invalid_jwt' }) }

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: publicKey,
      Authorization: `Bearer ${token}`,
    },
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
    console.error('leader-crm-offers permission transport failure', {
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
  const code = cleanText(error?.code, 80) || 'offer_create_failed'
  const known = new Set([
    'invalid_payload',
    'unknown_action',
    'invalid_calculation',
    'invalid_valid_until',
    'inactive_profile',
    'forbidden',
    'calculation_not_found',
    'calculation_changed',
    'calculation_not_current',
    'offer_already_exists',
    'idempotency_conflict',
    'request_id_conflict',
    'offer_create_failed',
  ])
  const safeCode = known.has(code) ? code : 'offer_create_failed'
  return {
    status: rpcStatus(safeCode),
    body: {
      ok: false,
      request_id: cleanText(result?.request_id, 80) || null,
      error: {
        code: safeCode,
        message: safeCode === 'offer_create_failed'
          ? 'Commercial offer could not be persisted'
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

  const projectRef = projectRefFromUrl(supabaseUrl)
  if (projectRef !== STAGING_PROJECT_REF) {
    return json(503, {
      error: 'wrong_environment',
      expected: 'staging',
      contract: OFFER_EDGE_CONTRACT_VERSION,
    })
  }

  const contentLength = Number(req.headers.get('content-length') || 0)
  if (Number.isFinite(contentLength) && contentLength > 64 * 1024) {
    return json(413, { error: 'payload_too_large' })
  }

  const checked = await authenticatedUser(req, supabaseUrl, publicKey)
  if (checked.error) return checked.error

  let input: unknown
  try {
    input = await req.json()
  } catch {
    return json(400, { error: 'invalid_payload' })
  }

  const validation = validateOfferRequest(input)
  if (!validation.ok) {
    return json(rpcStatus(validation.code), {
      ok: false,
      request_id: cleanText(asObject(input)?.request_id, 80) || null,
      error: { code: validation.code, message: validation.message },
    })
  }

  const permissionResult = await canonicalPermission(
    supabaseUrl,
    adminKey,
    checked.user.id,
    OFFER_PERMISSION,
  )
  if (permissionResult.error) return permissionResult.error
  if (!permissionResult.allowed) {
    return json(403, {
      error: 'forbidden',
      action: OFFER_ACTION,
      permission: OFFER_PERMISSION,
      contract: OFFER_EDGE_CONTRACT_VERSION,
    })
  }

  const rpcResponse = await adminFetch(
    supabaseUrl,
    adminKey,
    '/rest/v1/rpc/leader_create_offer_from_calculation_rpc',
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
    console.error('leader-crm-offers rpc transport failure', {
      status: rpcResponse.status,
      request_id: validation.request.request_id,
    })
    return json(500, {
      ok: false,
      request_id: validation.request.request_id,
      error: { code: 'offer_create_failed', message: 'Commercial offer RPC unavailable' },
    })
  }

  const rpcResult = await rpcResponse.json()
  const result = asObject(rpcResult)
  if (!result) {
    return json(500, {
      ok: false,
      request_id: validation.request.request_id,
      error: { code: 'offer_create_failed', message: 'Invalid RPC response' },
    })
  }

  if (result.ok !== true) {
    const safe = safeRpcError(result)
    return json(safe.status, safe.body)
  }

  return json(result.idempotent_replay === true ? 200 : 201, result)
})
