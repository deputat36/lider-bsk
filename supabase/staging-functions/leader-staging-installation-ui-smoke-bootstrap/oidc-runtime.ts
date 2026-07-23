import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5.9.6'

const STAGING_REF = 'otulfnouybahfnsycxqn'
const ISSUER = 'https://token.actions.githubusercontent.com'
const AUDIENCE = 'leader-staging-installation-ui-smoke'
const REPOSITORY = 'deputat36/lider-bsk'
const REPOSITORY_ID = '1236281954'
const OWNER_ID = '203537570'
const ACTOR_ID = '203537570'
const BRANCH_REF = 'refs/heads/fix/staging-installation-read-rpc-drift-v1'
const WORKFLOW_REF = `${REPOSITORY}/.github/workflows/crm-staging-installation-authenticated-ui-smoke-runtime.yml@${BRANCH_REF}`
const SUBJECT = `repo:${REPOSITORY}:ref:${BRANCH_REF}`
const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks`))

type JsonObject = Record<string, unknown>

function response(status: number, value: JsonObject) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Pragma': 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    }
  })
}

function text(value: unknown) {
  return String(value ?? '').trim()
}

function bearer(req: Request) {
  const value = text(req.headers.get('authorization'))
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : ''
}

function runKey(payload: JsonObject) {
  const runId = text(payload.run_id)
  const attempt = text(payload.run_attempt)
  if (!/^\d+$/.test(runId) || !/^\d+$/.test(attempt)) throw new Error('github_run_claim_invalid')
  return `${runId}:${attempt}`
}

async function verifiedClaims(req: Request) {
  const token = bearer(req)
  if (!token) throw new Error('github_oidc_missing')
  const verified = await jwtVerify(token, JWKS, {
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithms: ['RS256']
  })
  const claims = verified.payload as JsonObject
  const expected: Record<string, string> = {
    repository: REPOSITORY,
    repository_id: REPOSITORY_ID,
    repository_owner_id: OWNER_ID,
    actor_id: ACTOR_ID,
    ref: BRANCH_REF,
    ref_type: 'branch',
    workflow_ref: WORKFLOW_REF,
    event_name: 'push',
    runner_environment: 'github-hosted',
    repository_visibility: 'public',
    sub: SUBJECT
  }
  for (const [key, value] of Object.entries(expected)) {
    if (text(claims[key]) !== value) throw new Error(`github_claim_rejected:${key}`)
  }
  if (!/^[0-9a-f]{40}$/i.test(text(claims.sha))) throw new Error('github_sha_claim_invalid')
  return { runKey: runKey(claims) }
}

function randomPassword() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const body = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
  return `Ui!${body}Z9`
}

function exactStagingUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === `${STAGING_REF}.supabase.co` && url.pathname === '/'
  } catch (_) {
    return false
  }
}

function decodeJwtHeader(value: string) {
  try {
    const first = value.split('.')[0]
    if (!first) return null
    const base64 = first.replaceAll('-', '+').replaceAll('_', '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    return JSON.parse(atob(padded)) as JsonObject
  } catch (_) {
    return null
  }
}

function serviceEnvironment() {
  const url = text(Deno.env.get('SUPABASE_URL'))
  const key = text(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))
  if (!exactStagingUrl(url) || !key) throw new Error('staging_service_environment_invalid')
  return { url: url.replace(/\/$/, ''), key }
}

function serviceHeaders(key: string, json = true) {
  const headers: Record<string, string> = {
    apikey: key,
    Accept: 'application/json'
  }
  if (json) headers['Content-Type'] = 'application/json'
  const jwtHeader = decodeJwtHeader(key)
  if (text(jwtHeader?.alg).toUpperCase() === 'HS256') {
    headers.Authorization = `Bearer ${key}`
  }
  return headers
}

async function serviceRequest(path: string, init: RequestInit = {}) {
  const env = serviceEnvironment()
  const result = await fetch(`${env.url}${path}`, {
    ...init,
    headers: {
      ...serviceHeaders(env.key, init.body !== undefined),
      ...(init.headers || {})
    }
  })
  const body = await result.json().catch(() => ({})) as JsonObject
  return { ok: result.ok, status: result.status, body }
}

async function rpc(name: string, args: JsonObject) {
  return await serviceRequest(`/rest/v1/rpc/${name}`, {
    method: 'POST',
    body: JSON.stringify(args)
  })
}

async function createAuthUser(email: string, password: string, runKeyValue: string) {
  return await serviceRequest('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      app_metadata: { staging_installation_ui_smoke: true, run_key: runKeyValue },
      user_metadata: { synthetic: true }
    })
  })
}

async function deleteAuthUser(userId: string) {
  return await serviceRequest(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE'
  })
}

async function prepare(runKeyValue: string) {
  const suffix = crypto.randomUUID().replaceAll('-', '')
  const email = `installation-ui-${runKeyValue.replace(':', '-')}-${suffix}@example.invalid`
  const password = randomPassword()
  const created = await createAuthUser(email, password, runKeyValue)
  const userId = text(created.body.id || (created.body.user as JsonObject | undefined)?.id)
  if (!created.ok || !userId) throw new Error(`auth_create_failed:${created.status}`)
  try {
    const prepared = await rpc('leader_prepare_installation_ui_smoke_rpc', {
      p_run_key: runKeyValue,
      p_user_id: userId,
      p_email: email
    })
    if (!prepared.ok || prepared.body.ok !== true) {
      throw new Error(`fixture_prepare_failed:${prepared.status}`)
    }
    return {
      ok: true,
      action: 'prepare',
      run_key: runKeyValue,
      email,
      password,
      job_id: prepared.body.job_id,
      role: prepared.body.role,
      expected_status: prepared.body.expected_status
    }
  } catch (error) {
    await deleteAuthUser(userId).catch(() => undefined)
    throw error
  }
}

async function cleanup(runKeyValue: string) {
  const inspected = await rpc('leader_inspect_installation_ui_smoke_rpc', { p_run_key: runKeyValue })
  if (!inspected.ok || inspected.body.ok !== true) {
    throw new Error(`fixture_inspect_failed:${inspected.status}`)
  }
  const userId = text(inspected.body.auth_user_id)
  if (inspected.body.exists === true && userId) {
    const deleted = await deleteAuthUser(userId)
    if (!deleted.ok && deleted.status !== 404) throw new Error(`auth_delete_failed:${deleted.status}`)
  }
  const cleaned = await rpc('leader_cleanup_installation_ui_smoke_rpc', { p_run_key: runKeyValue })
  if (!cleaned.ok || cleaned.body.ok !== true) {
    throw new Error(`fixture_cleanup_failed:${cleaned.status}`)
  }
  const residue = (cleaned.body.residue || {}) as JsonObject
  for (const value of Object.values(residue)) {
    if (Number(value) !== 0) throw new Error('fixture_cleanup_residue')
  }
  return {
    ok: true,
    action: 'cleanup',
    run_key: runKeyValue,
    already_clean: cleaned.body.already_clean === true,
    residue
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return response(405, { ok: false, error: 'method_not_allowed' })
  try {
    const verified = await verifiedClaims(req)
    const body = await req.json().catch(() => ({})) as JsonObject
    const action = text(body.action)
    const suppliedRunKey = text(body.run_key)
    if (suppliedRunKey && suppliedRunKey !== verified.runKey) throw new Error('run_key_claim_mismatch')
    if (action === 'prepare') return response(201, await prepare(verified.runKey))
    if (action === 'cleanup') return response(200, await cleanup(verified.runKey))
    return response(400, { ok: false, error: 'unknown_action' })
  } catch (error) {
    return response(403, {
      ok: false,
      error: text((error as Error)?.message || 'oidc_bootstrap_failed').slice(0, 180)
    })
  }
})
