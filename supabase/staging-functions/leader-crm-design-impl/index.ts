import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import {
  DESIGN_ACTION,
  DESIGN_EDGE_CONTRACT_VERSION,
  STAGING_PROJECT_REF,
  asObject,
  canWriteDesign,
  cleanText,
  projectRefFromUrl,
  rpcStatus,
  validateDesignRequest,
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

async function serviceFetch(
  supabaseUrl: string,
  serviceRole: string,
  path: string,
  init: RequestInit = {},
) {
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
  if (!token) return { error: json(401, { error: 'missing_token' }) }

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
    },
  })
  if (!response.ok) return { error: json(401, { error: 'bad_token' }) }

  const user = asObject(await response.json())
  const id = cleanText(user?.id, 80)
  if (!id) return { error: json(401, { error: 'bad_user' }) }
  return { user: { id, email: cleanText(user?.email, 240).toLowerCase() } }
}

async function activeProfile(
  supabaseUrl: string,
  serviceRole: string,
  userId: string,
) {
  const response = await serviceFetch(
    supabaseUrl,
    serviceRole,
    `/rest/v1/leader_user_profiles?user_id=eq.${encodeURIComponent(userId)}&is_active=eq.true&select=user_id,email,role,is_active&limit=1`,
  )
  if (!response.ok) return { error: json(403, { error: 'profile_check_failed' }) }

  const rows = await response.json()
  const profile = Array.isArray(rows) ? asObject(rows[0]) : null
  if (!profile) return { error: json(403, { error: 'access_denied' }) }
  return { profile }
}

function safeRpcError(value: unknown) {
  const result = asObject(value)
  const error = asObject(result?.error)
  const code = cleanText(error?.code, 80) || 'persistence_failed'
  const known = new Set([
    'validation_error',
    'unknown_action',
    'access_denied',
    'forbidden',
    'not_found',
    'conflict',
    'duplicate_request',
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
          ? 'Design task could not be persisted'
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
  if (!supabaseUrl || !anonKey || !serviceRole) {
    return json(500, { error: 'server_not_configured' })
  }

  const projectRef = projectRefFromUrl(supabaseUrl)
  if (projectRef !== STAGING_PROJECT_REF) {
    return json(503, {
      error: 'wrong_environment',
      expected: 'staging',
      contract: DESIGN_EDGE_CONTRACT_VERSION,
    })
  }

  const contentLength = Number(req.headers.get('content-length') || 0)
  if (Number.isFinite(contentLength) && contentLength > 64 * 1024) {
    return json(413, { error: 'payload_too_large' })
  }

  const checked = await authenticatedUser(req, supabaseUrl, anonKey)
  if (checked.error) return checked.error

  const profileResult = await activeProfile(supabaseUrl, serviceRole, checked.user.id)
  if (profileResult.error) return profileResult.error
  if (!canWriteDesign(profileResult.profile.role)) {
    return json(403, {
      error: 'forbidden',
      action: DESIGN_ACTION,
      permission: 'design.write',
      contract: DESIGN_EDGE_CONTRACT_VERSION,
    })
  }

  let input: unknown
  try {
    input = await req.json()
  } catch {
    return json(400, { error: 'invalid_json' })
  }

  const validation = validateDesignRequest(input)
  if (!validation.ok) {
    return json(rpcStatus(validation.code), {
      ok: false,
      request_id: cleanText(asObject(input)?.request_id, 80) || null,
      error: { code: validation.code, message: validation.message },
    })
  }

  const rpcResponse = await serviceFetch(
    supabaseUrl,
    serviceRole,
    '/rest/v1/rpc/leader_create_design_task_from_order_rpc',
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
    console.error('leader-crm-design rpc transport failure', {
      status: rpcResponse.status,
      request_id: validation.request.request_id,
    })
    return json(500, {
      ok: false,
      request_id: validation.request.request_id,
      error: { code: 'persistence_failed', message: 'Design task RPC unavailable' },
    })
  }

  const rpcResult = await rpcResponse.json()
  const result = asObject(rpcResult)
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
