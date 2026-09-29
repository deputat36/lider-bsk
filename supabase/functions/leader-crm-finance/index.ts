// Staging-only until an independently approved production rollout.
const PROJECT_REF = 'otulfnouybahfnsycxqn'
const ACTIONS = new Set(['finance.payment.create', 'finance.expense.create', 'finance.record.void'])
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}
const object = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const text = (value: unknown) => String(value ?? '').trim()
const statusFor = (code: string) => ['forbidden', 'inactive_profile'].includes(code) ? 403 : ['source_changed', 'idempotency_conflict', 'record_already_void'].includes(code) ? 409 : ['order_unavailable', 'record_not_found'].includes(code) ? 404 : code === 'finance_write_failed' ? 500 : 400

Deno.serve(async (req: Request) => {
  let requestId: string | null = null
  const correlationId = crypto.randomUUID()
  const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify({ ...body, correlation_id: correlationId }), { status, headers })
  const fail = (status: number, code: string) => reply(status, { ok: false, request_id: requestId, error: { code }, module: 'finance', timestamp: new Date().toISOString() })
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return fail(405, 'method_not_allowed')
  const url = text(Deno.env.get('SUPABASE_URL')).replace(/\/$/, '')
  const key = text(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))
  const anon = text(Deno.env.get('SUPABASE_ANON_KEY'))
  if (url !== `https://${PROJECT_REF}.supabase.co`) return fail(503, 'wrong_environment')
  if (!key || !anon) return fail(503, 'server_not_configured')
  try {
    const authorization = req.headers.get('authorization') || ''
    if (!/^Bearer\s+\S+/i.test(authorization)) return fail(401, 'missing_or_invalid_jwt')
    const auth = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: authorization } })
    if (!auth.ok) return fail(401, 'missing_or_invalid_jwt')
    const user = object(await auth.json())
    if (!user?.id) return fail(401, 'missing_or_invalid_jwt')
    // Bound the actual body as well as Content-Length; do not trust client headers.
    const reader = req.body?.getReader()
    if (!reader) return fail(400, 'invalid_payload')
    const chunks: Uint8Array[] = []; let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > 16384) { await reader.cancel(); return fail(413, 'payload_too_large') }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    let input: Record<string, unknown> | null
    try { input = object(JSON.parse(new TextDecoder().decode(bytes))) } catch (_) { return fail(400, 'invalid_payload') }
    if (!input || !ACTIONS.has(text(input.action))) return fail(400, 'invalid_payload')
    if (typeof input.request_id === 'string' && /^[0-9a-f-]{36}$/i.test(input.request_id)) requestId = input.request_id
    const serviceHeaders = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
    const permission = await fetch(`${url}/rest/v1/rpc/leader_actor_has_crm_action_rpc`, {
      method: 'POST', headers: serviceHeaders, body: JSON.stringify({ p_actor_id: user.id, p_action: 'finance.write' }),
    })
    if (!permission.ok) return fail(503, 'permission_check_failed')
    if (await permission.json() !== true) return fail(403, 'forbidden')
    const rpc = await fetch(`${url}/rest/v1/rpc/leader_write_finance_rpc`, {
      method: 'POST', headers: serviceHeaders, body: JSON.stringify({ p_payload: { actor_id: user.id, request: input } }),
    })
    if (!rpc.ok) return fail(500, 'finance_write_failed')
    const result = object(await rpc.json())
    if (!result) return fail(500, 'finance_write_failed')
    if (result.ok !== true) {
      const code = text(object(result.error)?.code)
      const allowed = new Set(['invalid_payload', 'inactive_profile', 'forbidden', 'order_unavailable', 'source_changed', 'record_not_found', 'record_already_void', 'idempotency_conflict', 'finance_write_failed'])
      const safe = allowed.has(code) ? code : 'finance_write_failed'
      return fail(statusFor(safe), safe)
    }
    return reply(result.idempotent_replay === true || input.action === 'finance.record.void' ? 200 : 201, result)
  } catch (_) {
    console.error(JSON.stringify({ module: 'finance', action: 'write', code: 'finance_write_failed', request_id: requestId, correlation_id: correlationId, timestamp: new Date().toISOString() }))
    return fail(500, 'finance_write_failed')
  }
})
