// Identical reviewed bundle for the two explicitly authorized Leader environments.
const PROJECT_REFS = new Set(['otulfnouybahfnsycxqn', 'ofewxuqfjhamgerwzull'])
const ACTIONS = new Set(['client.list', 'client.get', 'client.create', 'client.update'])
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
const statusFor = (code: string) => ['forbidden', 'inactive_profile'].includes(code) ? 403 : ['source_changed', 'idempotency_conflict', 'duplicate_phone'].includes(code) ? 409 : ['client_not_found'].includes(code) ? 404 : code === 'client_operation_failed' ? 500 : 400

Deno.serve(async (req: Request) => {
  let requestId: string | null = null
  const correlationId = crypto.randomUUID()
  const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify({ ...body, correlation_id: correlationId }), { status, headers })
  const fail = (status: number, code: string) => reply(status, { ok: false, request_id: requestId, error: { code }, module: 'clients', timestamp: new Date().toISOString() })
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return fail(405, 'method_not_allowed')
  const url = text(Deno.env.get('SUPABASE_URL')).replace(/\/$/, '')
  const key = text(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))
  const anon = text(Deno.env.get('SUPABASE_ANON_KEY'))
  if (![...PROJECT_REFS].some(ref => url === `https://${ref}.supabase.co`)) return fail(503, 'wrong_environment')
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
      method: 'POST', headers: serviceHeaders, body: JSON.stringify({ p_actor_id: user.id, p_action: text(input.action) === 'client.list' || text(input.action) === 'client.get' ? 'clients.read' : 'clients.write' }),
    })
    if (!permission.ok) return fail(503, 'permission_check_failed')
    if (await permission.json() !== true) return fail(403, 'forbidden')
    const rpc = await fetch(`${url}/rest/v1/rpc/leader_client_registry_rpc`, {
      method: 'POST', headers: serviceHeaders, body: JSON.stringify({ p_payload: { actor_id: user.id, request: input } }),
    })
    if (!rpc.ok) return fail(500, 'client_operation_failed')
    const result = object(await rpc.json())
    if (!result) return fail(500, 'client_operation_failed')
    if (result.ok !== true) {
      const code = text(object(result.error)?.code)
      const allowed = new Set(['invalid_payload', 'inactive_profile', 'forbidden', 'client_not_found', 'source_changed', 'duplicate_phone', 'idempotency_conflict', 'client_operation_failed'])
      const safe = allowed.has(code) ? code : 'client_operation_failed'
      return reply(statusFor(safe), { ok: false, error: { code: safe }, existing_client_id: safe === 'duplicate_phone' ? result.existing_client_id : undefined, request_id: requestId, module: 'clients', timestamp: new Date().toISOString() })
    }
    return reply(input.action === 'client.create' && result.idempotent_replay !== true ? 201 : 200, result)
  } catch (_) {
    console.error(JSON.stringify({ module: 'clients', action: 'write', code: 'client_operation_failed', request_id: requestId, correlation_id: correlationId, timestamp: new Date().toISOString() }))
    return fail(500, 'client_operation_failed')
  }
})
