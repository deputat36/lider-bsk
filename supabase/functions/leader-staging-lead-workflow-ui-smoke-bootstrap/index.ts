import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const EXPECTED_AUDIENCE = 'leader-staging-lead-workflow-ui-smoke'
const EXPECTED_REPOSITORY = 'deputat36/lider-bsk'
const EXPECTED_REF = 'refs/heads/agent/staging-lead-workflow-ui-smoke-v1'
const MARKER_PREFIX = 'leader-lead-ui-smoke:'
const JSON_HEADERS = Object.freeze({
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
})

function text(value: unknown, max = 1000) {
  return String(value ?? '').trim().slice(0, max)
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

function base64UrlBytes(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function decodeJsonSegment(value: string) {
  return JSON.parse(new TextDecoder().decode(base64UrlBytes(value)))
}

function audienceMatches(value: unknown) {
  if (Array.isArray(value)) return value.includes(EXPECTED_AUDIENCE)
  return value === EXPECTED_AUDIENCE
}

async function verifyGithubOidc(req: Request) {
  const authorization = req.headers.get('authorization') || ''
  const token = authorization.replace(/^Bearer\s+/i, '').trim()
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('oidc_token_missing_or_invalid')

  const header = decodeJsonSegment(parts[0])
  const claims = decodeJsonSegment(parts[1])
  if (header?.alg !== 'RS256' || !text(header?.kid, 200)) throw new Error('oidc_header_invalid')

  const jwksResponse = await fetch('https://token.actions.githubusercontent.com/.well-known/jwks', {
    headers: { Accept: 'application/json' },
  })
  if (!jwksResponse.ok) throw new Error(`oidc_jwks_failed:${jwksResponse.status}`)
  const jwks = await jwksResponse.json()
  const jwk = Array.isArray(jwks?.keys) ? jwks.keys.find((item: any) => item?.kid === header.kid) : null
  if (!jwk) throw new Error('oidc_key_not_found')

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const verified = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    base64UrlBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  )
  if (!verified) throw new Error('oidc_signature_invalid')

  const now = Math.floor(Date.now() / 1000)
  if (claims?.iss !== 'https://token.actions.githubusercontent.com') throw new Error('oidc_issuer_invalid')
  if (!audienceMatches(claims?.aud)) throw new Error('oidc_audience_invalid')
  if (!Number.isFinite(Number(claims?.exp)) || Number(claims.exp) <= now - 30) throw new Error('oidc_expired')
  if (Number.isFinite(Number(claims?.nbf)) && Number(claims.nbf) > now + 30) throw new Error('oidc_not_yet_valid')
  if (text(claims?.repository, 300) !== EXPECTED_REPOSITORY) throw new Error('oidc_repository_invalid')
  if (text(claims?.ref, 500) !== EXPECTED_REF) throw new Error('oidc_ref_invalid')
  if (text(claims?.event_name, 100) !== 'push') throw new Error('oidc_event_invalid')

  const runId = text(claims?.run_id, 40)
  const runAttempt = text(claims?.run_attempt, 20)
  if (!/^\d+$/.test(runId) || !/^\d+$/.test(runAttempt)) throw new Error('oidc_run_identity_invalid')
  return Object.freeze({ runKey: `${runId}:${runAttempt}` })
}

function environment() {
  const supabaseUrl = text(Deno.env.get('SUPABASE_URL'), 500).replace(/\/+$/, '')
  const serviceRole = text(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), 5000)
  if (!supabaseUrl || !serviceRole) throw new Error('server_not_configured')
  if (!supabaseUrl.includes('otulfnouybahfnsycxqn.supabase.co')) throw new Error('wrong_environment')
  if (supabaseUrl.includes('ofewxuqfjhamgerwzull')) throw new Error('production_forbidden')
  return Object.freeze({ supabaseUrl, serviceRole })
}

async function request(env: any, path: string, options: any = {}) {
  const response = await fetch(`${env.supabaseUrl}${path}`, {
    method: options.method || 'GET',
    headers: {
      apikey: env.serviceRole,
      Authorization: `Bearer ${env.serviceRole}`,
      'Content-Type': 'application/json',
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const raw = await response.text()
  let data: any = null
  try { data = raw ? JSON.parse(raw) : null } catch (_) { data = raw }
  if (!response.ok && !options.allowNotFound) {
    throw new Error(`${options.code || 'request_failed'}:${response.status}:${text(raw, 400)}`)
  }
  return { response, data }
}

function marker(runKey: string) {
  if (!/^\d+:\d+$/.test(runKey)) throw new Error('run_key_invalid')
  return `${MARKER_PREFIX}${runKey}`
}

async function selectRows(env: any, table: string, column: string, value: string, fields = '*') {
  const params = new URLSearchParams({ select: fields, [column]: `eq.${value}` })
  const result = await request(env, `/rest/v1/${table}?${params.toString()}`, { code: `${table}_select_failed` })
  return Array.isArray(result.data) ? result.data : []
}

async function deleteRows(env: any, table: string, column: string, value: string) {
  const params = new URLSearchParams({ [column]: `eq.${value}` })
  await request(env, `/rest/v1/${table}?${params.toString()}`, {
    method: 'DELETE',
    prefer: 'return=minimal',
    code: `${table}_delete_failed`,
  })
}

async function deleteAuthUser(env: any, userId: string) {
  if (!userId) return
  await request(env, `/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    body: { should_soft_delete: false },
    allowNotFound: true,
    code: 'auth_user_delete_failed',
  })
}

async function cleanup(env: any, runKey: string) {
  const fixtureMarker = marker(runKey)
  const profiles = await selectRows(env, 'leader_user_profiles', 'full_name', fixtureMarker, 'user_id')
  const userIds = profiles.map((row: any) => text(row?.user_id, 80)).filter(Boolean)

  const rpc = await request(env, '/rest/v1/rpc/leader_staging_lead_ui_smoke_cleanup_rpc', {
    method: 'POST',
    body: { p_run_key: runKey },
    code: 'cleanup_rpc_failed',
  })
  const residue = rpc.data?.residue && typeof rpc.data.residue === 'object' ? rpc.data.residue : {}

  for (const userId of userIds) await deleteAuthUser(env, userId)

  let authResidue = 0
  for (const userId of userIds) {
    const result = await request(env, `/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      allowNotFound: true,
      code: 'auth_user_verify_failed',
    })
    if (result.response.status !== 404) authResidue += 1
  }

  return Object.freeze({
    leads: Number(residue.leads || 0),
    profiles: Number(residue.profiles || 0),
    auth_users: authResidue,
    receipts: Number(residue.receipts || 0),
  })
}

async function prepare(env: any, runKey: string) {
  await cleanup(env, runKey)
  const fixtureMarker = marker(runKey)
  const random = crypto.randomUUID().replace(/-/g, '')
  const email = `leader.lead.ui.smoke.${runKey.replace(':', '.')}.${random.slice(0, 12)}@example.com`
  const password = `L!${crypto.randomUUID()}9a`
  let userId = ''

  try {
    const created = await request(env, '/auth/v1/admin/users', {
      method: 'POST',
      body: {
        email,
        password,
        email_confirm: true,
        app_metadata: { leader_ui_smoke: true },
        user_metadata: { synthetic: true },
      },
      code: 'auth_user_create_failed',
    })
    userId = text(created.data?.id || created.data?.user?.id, 80)
    if (!userId) throw new Error('auth_user_id_missing')

    await request(env, '/rest/v1/leader_user_profiles', {
      method: 'POST',
      body: {
        user_id: userId,
        email,
        full_name: fixtureMarker,
        role: 'manager',
        is_active: true,
        permissions: {},
      },
      prefer: 'return=minimal',
      code: 'profile_create_failed',
    })

    const leadResult = await request(env, '/rest/v1/leader_leads', {
      method: 'POST',
      body: {
        status: 'Новая',
        name: 'Synthetic staging lead workflow smoke',
        phone: '+70000000000',
        source: 'Staging UI smoke',
        message: 'Synthetic fixture for authenticated staging UI smoke.',
        page_url: 'https://example.com/staging-ui-smoke',
        payload: { synthetic: true, run_key: runKey },
        service: 'Synthetic service',
        contact_preference: 'Телефон',
        city: 'Борисоглебск',
        request_id: fixtureMarker,
        lead_quality: 'Не оценена',
        estimated_amount: 0,
      },
      prefer: 'return=representation',
      code: 'lead_create_failed',
    })
    const lead = Array.isArray(leadResult.data) ? leadResult.data[0] : leadResult.data
    const leadId = text(lead?.id, 80)
    if (!leadId) throw new Error('lead_id_missing')

    return Object.freeze({
      run_key: runKey,
      email,
      password,
      lead_id: leadId,
      role: 'manager',
      expected_status: 'Новая',
    })
  } catch (error) {
    if (userId) {
      await deleteRows(env, 'leader_leads', 'request_id', fixtureMarker).catch(() => {})
      await deleteRows(env, 'leader_user_profiles', 'user_id', userId).catch(() => {})
      await deleteAuthUser(env, userId).catch(() => {})
    }
    throw error
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' })
  try {
    const identity = await verifyGithubOidc(req)
    const env = environment()
    const body = await req.json().catch(() => ({}))
    const action = text(body?.action, 40)
    if (action === 'prepare') {
      const result = await prepare(env, identity.runKey)
      return json(201, { ok: true, action, ...result })
    }
    if (action === 'cleanup') {
      const requestedRunKey = text(body?.run_key, 80)
      if (requestedRunKey !== identity.runKey) return json(403, { ok: false, error: 'run_key_mismatch' })
      const residue = await cleanup(env, requestedRunKey)
      return json(200, { ok: true, action, run_key: requestedRunKey, residue })
    }
    return json(400, { ok: false, error: 'unknown_action' })
  } catch (error) {
    return json(403, { ok: false, error: text((error as Error)?.message || 'bootstrap_failed', 300) })
  }
})
