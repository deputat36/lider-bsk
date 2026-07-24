import { checkPublicIntakeRateLimit, publicIntakeRateLimitIdentity } from './rate-limit.ts'

const DEFAULT_ALLOWED_ORIGINS = [
  'https://www.lider-bsk.ru',
  'https://lider-bsk.ru',
]
const MAX_BODY_BYTES = 25_000
const RATE_LIMIT_WINDOW_SECONDS = 300
const RATE_LIMIT_IP_MAX = 20
const RATE_LIMIT_PHONE_MAX = 5

function allowedOrigins() {
  const configured = Deno.env.get('LEADER_PUBLIC_ALLOWED_ORIGINS')
  if (!configured) return DEFAULT_ALLOWED_ORIGINS
  return configured
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

function originFromRequest(req: Request) {
  return req.headers.get('origin') || ''
}

function isAllowedOrigin(req: Request) {
  const origin = originFromRequest(req)
  if (!origin) return true
  return allowedOrigins().includes(origin)
}

function corsHeadersFor(req: Request) {
  const origin = originFromRequest(req)
  const allowOrigin = origin && allowedOrigins().includes(origin) ? origin : DEFAULT_ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Origin',
  }
}

function cleanText(value: unknown, max = 1000) {
  return String(value ?? '').trim().slice(0, max)
}

function normalizePhone(value: unknown) {
  const raw = cleanText(value, 80)
  const digits = raw.replace(/\D+/g, '')
  if (!digits) return ''
  if (digits.length === 11 && digits.startsWith('8')) return '7' + digits.slice(1)
  if (digits.length === 10) return '7' + digits
  return digits
}

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: corsHeadersFor(req) })
}

function requestIdFromBody(body: Record<string, unknown>) {
  const incoming = cleanText(body.request_id, 120)
  if (incoming) return incoming
  return 'server-' + crypto.randomUUID()
}

function isDuplicateRequest(details: string) {
  const text = details.toLowerCase()
  return text.includes('duplicate key') || text.includes('leader_leads_request_id_key') || text.includes('23505')
}

type BackendCredential = {
  headers: Record<string, string>
  source: 'secret_key' | 'legacy_service_role'
}

function backendCredential(): BackendCredential | null {
  const secretKeysRaw = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (secretKeysRaw) {
    try {
      const parsed = JSON.parse(secretKeysRaw)
      const secretKey = typeof parsed?.default === 'string' ? parsed.default.trim() : ''
      if (secretKey) {
        return { headers: { apikey: secretKey }, source: 'secret_key' }
      }
    } catch (_) {
      // Ignore malformed modern key configuration and try the explicit legacy transition key.
    }
  }

  const legacyServiceRole = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim()
  if (legacyServiceRole) {
    return {
      headers: {
        apikey: legacyServiceRole,
        Authorization: 'Bearer ' + legacyServiceRole,
      },
      source: 'legacy_service_role',
    }
  }

  return null
}

async function writeAudit(params: {
  supabaseUrl: string
  backendHeaders: Record<string, string>
  requestId?: string
  phoneNormalized?: string
  sourcePagePath?: string
  pageUrl?: string
  userAgent?: string
  referer?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  result: string
  reason?: string
  payload?: Record<string, unknown>
}) {
  try {
    const auditRes = await fetch(params.supabaseUrl + '/rest/v1/leader_public_lead_audit', {
      method: 'POST',
      headers: {
        ...params.backendHeaders,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        request_id: params.requestId || null,
        phone_normalized: params.phoneNormalized || null,
        source_page_path: params.sourcePagePath || null,
        page_url: params.pageUrl || null,
        user_agent: params.userAgent || null,
        referer: params.referer || null,
        utm_source: params.utmSource || null,
        utm_medium: params.utmMedium || null,
        utm_campaign: params.utmCampaign || null,
        result: params.result,
        reason: params.reason || null,
        payload: params.payload || {},
      }),
    })

    if (!auditRes.ok) {
      console.error('leader_public_lead_audit_insert_failed', {
        status: auditRes.status,
        request_id: params.requestId || null,
        result: params.result,
        details: cleanText(await auditRes.text(), 500),
      })
      return false
    }
    return true
  } catch (error) {
    console.error('leader_public_lead_audit_request_failed', {
      request_id: params.requestId || null,
      result: params.result,
      message: cleanText(error instanceof Error ? error.message : error, 500),
    })
    return false
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeadersFor(req) })
  if (req.method !== 'POST') return json(req, 405, { error: 'method_not_allowed' })
  if (!isAllowedOrigin(req)) return json(req, 403, { error: 'origin_not_allowed' })

  const contentLength = Number(req.headers.get('content-length') || '0')
  if (contentLength > MAX_BODY_BYTES) return json(req, 413, { error: 'payload_too_large' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const credential = backendCredential()
  const rateLimitSalt = (Deno.env.get('LEADER_PUBLIC_RATE_LIMIT_SALT') || '').trim()
  if (!supabaseUrl || !credential || rateLimitSalt.length < 16) {
    return json(req, 500, { error: 'server_not_configured' })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch (_) { return json(req, 400, { error: 'bad_json' }) }

  const requestId = requestIdFromBody(body)
  const phone = cleanText(body.phone, 80)
  const phoneNormalized = normalizePhone(phone)
  const pageUrl = cleanText(body.page_url, 1000)
  const pagePath = cleanText(body.page_path, 500)
  const userAgent = cleanText(req.headers.get('user-agent'), 500)
  const referer = cleanText(req.headers.get('referer'), 1000)
  const utmSource = cleanText(body.utm_source, 120)
  const utmMedium = cleanText(body.utm_medium, 120)
  const utmCampaign = cleanText(body.utm_campaign, 200)

  const auditBase = {
    supabaseUrl,
    backendHeaders: credential.headers,
    requestId,
    phoneNormalized,
    sourcePagePath: pagePath,
    pageUrl,
    userAgent,
    referer,
    utmSource,
    utmMedium,
    utmCampaign,
  }

  let rateIdentity: { ipHash: string; phoneHash: string | null }
  try {
    rateIdentity = await publicIntakeRateLimitIdentity(req, phoneNormalized, rateLimitSalt)
  } catch (_) {
    return json(req, 500, { error: 'server_not_configured', request_id: requestId })
  }

  const rateLimit = await checkPublicIntakeRateLimit({
    supabaseUrl,
    backendHeaders: credential.headers,
    requestId,
    ipHash: rateIdentity.ipHash,
    phoneHash: rateIdentity.phoneHash,
    windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
    ipLimit: RATE_LIMIT_IP_MAX,
    phoneLimit: RATE_LIMIT_PHONE_MAX,
  })

  if (!rateLimit.ok) {
    console.error('leader_public_lead_rate_limit_unavailable', { request_id: requestId, reason: rateLimit.reason })
    return json(req, 503, { error: 'rate_limit_unavailable', request_id: requestId })
  }

  if (!rateLimit.allowed) {
    await writeAudit({
      ...auditBase,
      result: 'rejected',
      reason: rateLimit.reason,
      payload: {
        form: 'site_public_form_v7',
        retry_after_seconds: rateLimit.retryAfterSeconds,
      },
    })
    return json(req, 429, {
      error: 'rate_limited',
      request_id: requestId,
      retry_after_seconds: rateLimit.retryAfterSeconds,
    })
  }

  if (cleanText(body.website, 200)) {
    await writeAudit({ ...auditBase, result: 'suspicious', reason: 'honeypot_filled', payload: { form: 'site_public_form_v7' } })
    return json(req, 200, { ok: true, request_id: requestId })
  }

  const name = cleanText(body.name, 200)
  const service = cleanText(body.service, 200)
  const message = cleanText(body.message, 3000)
  const contactMethod = cleanText(body.contact_method, 120)
  if (!phone && !message) {
    await writeAudit({ ...auditBase, result: 'rejected', reason: 'phone_or_message_required', payload: { form: 'site_public_form_v7', service } })
    return json(req, 400, { error: 'phone_or_message_required', request_id: requestId })
  }

  const budgetText = cleanText(body.budget, 120)
  const payload = {
    form: 'site_public_form_v7',
    request_id: requestId,
    page_title: cleanText(body.page_title, 300),
    page_path: pagePath,
    submitted_at: cleanText(body.submitted_at, 80),
    city: cleanText(body.city, 120),
    business: cleanText(body.business, 160),
    contact_method: contactMethod,
    contact_detail: cleanText(body.contact_detail, 300),
    consent_version: cleanText(body.consent_version, 120),
    width: cleanText(body.width, 40),
    height: cleanText(body.height, 40),
    quantity: cleanText(body.quantity, 120),
    deadline: cleanText(body.deadline, 120),
    mockup: cleanText(body.mockup, 160),
    delivery: cleanText(body.delivery, 160),
    budget_label: budgetText,
    phone_normalized: phoneNormalized,
    user_agent: userAgent,
    referer,
  }

  const insertBody = {
    request_id: requestId,
    name,
    phone,
    phone_normalized: phoneNormalized,
    service,
    source: 'Сайт',
    message,
    page_url: pageUrl,
    source_page_path: pagePath,
    submitted_at: cleanText(body.submitted_at, 80) || new Date().toISOString(),
    client_user_agent: userAgent,
    city: cleanText(body.city, 120),
    contact_preference: contactMethod,
    status: 'Новая',
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
    utm_content: cleanText(body.utm_content, 200),
    utm_term: cleanText(body.utm_term, 200),
    payload,
  }

  const res = await fetch(supabaseUrl + '/rest/v1/leader_leads', {
    method: 'POST',
    headers: {
      ...credential.headers,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(insertBody),
  })

  if (!res.ok) {
    const details = await res.text()
    if (res.status === 409 || isDuplicateRequest(details)) {
      await writeAudit({ ...auditBase, result: 'duplicate', reason: 'request_id_conflict', payload: { form: 'site_public_form_v7', request_id: requestId } })
      return json(req, 200, { ok: true, request_id: requestId, duplicate: true })
    }
    console.error('leader_public_lead_insert_failed', {
      status: res.status,
      request_id: requestId,
      details: cleanText(details, 500),
    })
    await writeAudit({ ...auditBase, result: 'error', reason: 'insert_failed', payload: { form: 'site_public_form_v7', details: details.slice(0, 500) } })
    return json(req, 500, { error: 'insert_failed', request_id: requestId })
  }

  await writeAudit({ ...auditBase, result: 'accepted', reason: 'lead_insert_created', payload })
  return json(req, 200, { ok: true, request_id: requestId })
})
