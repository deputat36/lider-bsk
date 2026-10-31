// Identical reviewed bundle for the two explicitly authorized Leader environments.
const PROJECT_REFS = new Set(['otulfnouybahfnsycxqn', 'ofewxuqfjhamgerwzull'])
const ACTIONS: Record<string, { permission: string; rpc: string }> = {
  'offer.transition': { permission: 'offers.transition', rpc: 'leader_transition_offer_rpc' },
  'offer.update': { permission: 'offers.write', rpc: 'leader_update_offer_rpc' },
}
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
const statusFor = (code: string) => ['forbidden', 'inactive_profile'].includes(code) ? 403 : ['conflict','duplicate_request','invalid_transition','source_not_current','order_already_created','offer_not_editable'].includes(code) ? 409 : ['not_found'].includes(code) ? 404 : ['offer_operation_failed','persistence_failed'].includes(code) ? 500 : 400
const boundedFetch = (url: string, init: RequestInit) => fetch(url, { ...init, signal: AbortSignal.timeout(15000) })

Deno.serve(async (req: Request) => {
  let requestId: string | null = null
  const correlationId = crypto.randomUUID()
  const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify({ ...body, correlation_id: correlationId }), { status, headers })
  const fail = (status: number, code: string) => reply(status, { ok: false, request_id: requestId, error: { code }, module: 'offers', timestamp: new Date().toISOString() })
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
    const auth = await boundedFetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: authorization } })
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
      if (size > 131072) { await reader.cancel(); return fail(413, 'payload_too_large') }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    let input: Record<string, unknown> | null
    try { input = object(JSON.parse(new TextDecoder().decode(bytes))) } catch (_) { return fail(400, 'invalid_payload') }
    if (!input || !Object.hasOwn(ACTIONS, text(input.action))) return fail(400, 'invalid_payload')
    const operation = ACTIONS[text(input.action)]
    if (typeof input.request_id === 'string' && /^[0-9a-f-]{36}$/i.test(input.request_id)) requestId = input.request_id
    const serviceHeaders = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
    const permission = await boundedFetch(`${url}/rest/v1/rpc/leader_actor_has_crm_action_rpc`, {
      method: 'POST', headers: serviceHeaders, body: JSON.stringify({ p_actor_id: user.id, p_action: operation.permission }),
    })
    if (!permission.ok) return fail(503, 'permission_check_failed')
    if (await permission.json() !== true) return fail(403, 'forbidden')
    const offerId = text(object(input.payload)?.offer_id)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(offerId)) return fail(400, 'validation_error')
    const visible = await boundedFetch(`${url}/rest/v1/leader_commercial_offers?select=id&id=eq.${encodeURIComponent(offerId)}&limit=1`, { headers: { apikey: anon, Authorization: authorization } })
    if (!visible.ok) return fail(503, 'object_check_failed')
    const rows = await visible.json()
    if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.id !== offerId) return fail(404, 'not_found')
    const rpc = await boundedFetch(`${url}/rest/v1/rpc/${operation.rpc}`, {
      method: 'POST', headers: serviceHeaders, body: JSON.stringify({ p_payload: { actor_id: user.id, actor_email: user.email, request: input } }),
    })
    if (!rpc.ok) return fail(500, 'offer_operation_failed')
    const result = object(await rpc.json())
    if (!result) return fail(500, 'offer_operation_failed')
    if (result.ok !== true) {
      const code = text(object(result.error)?.code)
      const allowed = new Set(['validation_error','invalid_payload','forbidden','not_found','conflict','duplicate_request','invalid_transition','source_not_current','order_already_created','offer_not_editable','persistence_failed','offer_operation_failed'])
      const safe = allowed.has(code) ? code : 'offer_operation_failed'
      return reply(statusFor(safe), { ok: false, error: { code: safe }, request_id: requestId, module: 'offers', timestamp: new Date().toISOString() })
    }
    return reply(200, result)
  } catch (_) {
    console.error(JSON.stringify({ module: 'offers', action: 'write', code: 'offer_operation_failed', request_id: requestId, correlation_id: correlationId, timestamp: new Date().toISOString() }))
    return fail(500, 'offer_operation_failed')
  }
})
