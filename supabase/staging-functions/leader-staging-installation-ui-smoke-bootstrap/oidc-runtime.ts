import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
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

function response(status: number, value: Record<string, unknown>) {
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

function runKey(payload: Record<string, unknown>) {
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
  const claims = verified.payload as Record<string, unknown>
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

function serviceClient() {
  const url = text(Deno.env.get('SUPABASE_URL'))
  const key = text(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))
  if (!exactStagingUrl(url) || !key) throw new Error('staging_service_environment_invalid')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  })
}

async function prepare(client: ReturnType<typeof createClient>, runKeyValue: string) {
  const suffix = crypto.randomUUID().replaceAll('-', '')
  const email = `installation-ui-${runKeyValue.replace(':', '-')}-${suffix}@example.invalid`
  const password = randomPassword()
  const created = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { staging_installation_ui_smoke: true, run_key: runKeyValue },
    user_metadata: { synthetic: true }
  })
  if (created.error || !created.data.user) throw new Error(`auth_create_failed:${created.error?.status || 0}`)
  const userId = created.data.user.id
  try {
    const prepared = await client.rpc('leader_prepare_installation_ui_smoke_rpc', {
      p_run_key: runKeyValue,
      p_user_id: userId,
      p_email: email
    })
    if (prepared.error || prepared.data?.ok !== true) {
      throw new Error(`fixture_prepare_failed:${prepared.error?.code || 'unknown'}`)
    }
    return {
      ok: true,
      action: 'prepare',
      run_key: runKeyValue,
      email,
      password,
      job_id: prepared.data.job_id,
      role: prepared.data.role,
      expected_status: prepared.data.expected_status
    }
  } catch (error) {
    await client.auth.admin.deleteUser(userId).catch(() => undefined)
    throw error
  }
}

async function cleanup(client: ReturnType<typeof createClient>, runKeyValue: string) {
  const inspected = await client.rpc('leader_inspect_installation_ui_smoke_rpc', { p_run_key: runKeyValue })
  if (inspected.error || inspected.data?.ok !== true) {
    throw new Error(`fixture_inspect_failed:${inspected.error?.code || 'unknown'}`)
  }
  const userId = text(inspected.data?.auth_user_id)
  if (inspected.data?.exists === true && userId) {
    const deleted = await client.auth.admin.deleteUser(userId)
    if (deleted.error && deleted.error.status !== 404) {
      throw new Error(`auth_delete_failed:${deleted.error.status || 0}`)
    }
  }
  const cleaned = await client.rpc('leader_cleanup_installation_ui_smoke_rpc', { p_run_key: runKeyValue })
  if (cleaned.error || cleaned.data?.ok !== true) {
    throw new Error(`fixture_cleanup_failed:${cleaned.error?.code || 'unknown'}`)
  }
  const residue = cleaned.data?.residue || {}
  for (const value of Object.values(residue)) {
    if (Number(value) !== 0) throw new Error('fixture_cleanup_residue')
  }
  return {
    ok: true,
    action: 'cleanup',
    run_key: runKeyValue,
    already_clean: cleaned.data?.already_clean === true,
    residue
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return response(405, { ok: false, error: 'method_not_allowed' })
  try {
    const verified = await verifiedClaims(req)
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const action = text(body.action)
    const suppliedRunKey = text(body.run_key)
    if (suppliedRunKey && suppliedRunKey !== verified.runKey) throw new Error('run_key_claim_mismatch')
    const client = serviceClient()
    if (action === 'prepare') return response(201, await prepare(client, verified.runKey))
    if (action === 'cleanup') return response(200, await cleanup(client, verified.runKey))
    return response(400, { ok: false, error: 'unknown_action' })
  } catch (error) {
    return response(403, {
      ok: false,
      error: text((error as Error)?.message || 'oidc_bootstrap_failed').slice(0, 180)
    })
  }
})
