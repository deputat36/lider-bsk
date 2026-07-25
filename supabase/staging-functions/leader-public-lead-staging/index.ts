const ALLOWED_ORIGINS = ['https://www.lider-bsk.ru', 'https://lider-bsk.ru']
const WINDOW_SECONDS = 300
const IP_LIMIT = 20
const PHONE_LIMIT = 5
const STAGING_PEPPER = ['leader', 'staging', 'public', 'intake', '20260725'].join('-')

function clean(value: unknown, max = 1000) {
  return String(value ?? '').trim().slice(0, max)
}

function normalizePhone(value: unknown) {
  const digits = clean(value, 80).replace(/\D+/g, '')
  if (!digits) return ''
  if (digits.length === 11 && digits.startsWith('8')) return '7' + digits.slice(1)
  if (digits.length === 10) return '7' + digits
  return digits
}

function origin(req: Request) {
  return req.headers.get('origin') || ''
}

function cors(req: Request) {
  const requestOrigin = origin(req)
  return {
    'Access-Control-Allow-Origin': requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Origin',
  }
}

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: cors(req) })
}

function backendHeaders() {
  const serviceKey = clean(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), 5000)
  if (!serviceKey) return null
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('')
}

function clientIp(req: Request) {
  const forwarded = clean(req.headers.get('x-forwarded-for'), 500)
  if (forwarded) return forwarded.split(',')[0].trim()
  return clean(req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip'), 200) || 'unknown'
}

async function audit(params: {
  supabaseUrl: string
  headers: Record<string, string>
  requestId: string
  phoneNormalized: string
  result: string
  reason: string
  payload?: Record<string, unknown>
}) {
  const response = await fetch(`${params.supabaseUrl}/rest/v1/leader_public_lead_audit`, {
    method: 'POST',
    headers: { ...params.headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({
      request_id: params.requestId,
      phone_normalized: params.phoneNormalized || null,
      source_page_path: '/staging-public-intake-smoke',
      page_url: 'https://staging.invalid/public-intake-smoke',
      result: params.result,
      reason: params.reason,
      payload: params.payload || {},
    }),
  })
  return response.ok
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  if (req.method !== 'POST') return json(req, 405, { error: 'method_not_allowed' })
  if (origin(req) && !ALLOWED_ORIGINS.includes(origin(req))) return json(req, 403, { error: 'origin_not_allowed' })

  const supabaseUrl = clean(Deno.env.get('SUPABASE_URL'), 1000)
  const headers = backendHeaders()
  if (!supabaseUrl || !headers) return json(req, 500, { error: 'server_not_configured' })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch (_) {
    return json(req, 400, { error: 'bad_json' })
  }

  const requestId = clean(body.request_id, 120) || `staging-${crypto.randomUUID()}`
  const phone = clean(body.phone, 80)
  const phoneNormalized = normalizePhone(phone)
  const message = clean(body.message, 3000)
  const ipHash = await sha256Hex(`ip:${STAGING_PEPPER}:${clientIp(req)}`)
  const phoneHash = phoneNormalized ? await sha256Hex(`phone:${STAGING_PEPPER}:${phoneNormalized}`) : null

  const rateResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/leader_public_intake_rate_limit_rpc`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_request_id: requestId,
      p_ip_hash: ipHash,
      p_phone_hash: phoneHash,
      p_window_seconds: WINDOW_SECONDS,
      p_ip_limit: IP_LIMIT,
      p_phone_limit: PHONE_LIMIT,
    }),
  })

  if (!rateResponse.ok) return json(req, 503, { error: 'rate_limit_unavailable', request_id: requestId })
  const rate = await rateResponse.json().catch(() => null)
  if (!rate || typeof rate !== 'object') return json(req, 503, { error: 'rate_limit_unavailable', request_id: requestId })

  if (rate.allowed !== true) {
    await audit({
      supabaseUrl,
      headers,
      requestId,
      phoneNormalized,
      result: 'rejected',
      reason: clean(rate.reason, 120) || 'rate_limited',
      payload: { retry_after_seconds: Number(rate.retry_after_seconds || 0) || 0 },
    })
    return json(req, 429, {
      error: 'rate_limited',
      request_id: requestId,
      retry_after_seconds: Number(rate.retry_after_seconds || 0) || 0,
    })
  }

  if (clean(body.website, 200)) {
    await audit({ supabaseUrl, headers, requestId, phoneNormalized, result: 'suspicious', reason: 'honeypot_filled' })
    return json(req, 200, { ok: true, request_id: requestId })
  }

  if (!phone && !message) {
    await audit({ supabaseUrl, headers, requestId, phoneNormalized, result: 'rejected', reason: 'phone_or_message_required' })
    return json(req, 400, { error: 'phone_or_message_required', request_id: requestId })
  }

  const insertResponse = await fetch(`${supabaseUrl}/rest/v1/leader_leads`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({
      request_id: requestId,
      name: clean(body.name, 200),
      phone,
      phone_normalized: phoneNormalized,
      service: clean(body.service, 200),
      source: 'Сайт',
      message,
      page_url: 'https://staging.invalid/public-intake-smoke',
      source_page_path: '/staging-public-intake-smoke',
      submitted_at: new Date().toISOString(),
      client_user_agent: clean(req.headers.get('user-agent'), 500),
      city: clean(body.city, 120),
      contact_preference: clean(body.contact_method, 120),
      status: 'Новая',
      payload: { form: 'staging_public_intake_smoke_v1', request_id: requestId },
    }),
  })

  if (!insertResponse.ok) {
    const details = await insertResponse.text()
    if (insertResponse.status === 409 || details.includes('leader_leads_request_id_key') || details.includes('23505')) {
      await audit({ supabaseUrl, headers, requestId, phoneNormalized, result: 'duplicate', reason: 'request_id_conflict' })
      return json(req, 200, { ok: true, request_id: requestId, duplicate: true })
    }
    await audit({ supabaseUrl, headers, requestId, phoneNormalized, result: 'error', reason: 'insert_failed' })
    return json(req, 500, { error: 'insert_failed', request_id: requestId })
  }

  await audit({ supabaseUrl, headers, requestId, phoneNormalized, result: 'accepted', reason: 'lead_insert_created' })
  return json(req, 200, { ok: true, request_id: requestId })
})
