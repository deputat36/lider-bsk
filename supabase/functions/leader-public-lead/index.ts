const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
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

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
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

async function writeAudit(params: {
  supabaseUrl: string
  anonKey: string
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
        'apikey': params.anonKey,
        'Authorization': 'Bearer ' + params.anonKey,
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !anonKey) return json(500, { error: 'server_not_configured' })

  let body: Record<string, unknown>
  try { body = await req.json() } catch (_) { return json(400, { error: 'bad_json' }) }

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
    anonKey,
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

  if (cleanText(body.website, 200)) {
    await writeAudit({ ...auditBase, result: 'suspicious', reason: 'honeypot_filled', payload: { form: 'site_public_form_v7' } })
    return json(200, { ok: true, request_id: requestId })
  }

  const name = cleanText(body.name, 200)
  const service = cleanText(body.service, 200)
  const message = cleanText(body.message, 3000)
  const contactMethod = cleanText(body.contact_method, 120)
  if (!phone && !message) {
    await writeAudit({ ...auditBase, result: 'rejected', reason: 'phone_or_message_required', payload: { form: 'site_public_form_v7', service } })
    return json(400, { error: 'phone_or_message_required', request_id: requestId })
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
    source: cleanText(body.source, 120) || 'Сайт',
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
      'apikey': anonKey,
      'Authorization': 'Bearer ' + anonKey,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(insertBody),
  })

  if (!res.ok) {
    const details = await res.text()
    if (res.status === 409 || isDuplicateRequest(details)) {
      await writeAudit({ ...auditBase, result: 'duplicate', reason: 'request_id_conflict', payload: { form: 'site_public_form_v7', request_id: requestId } })
      return json(200, { ok: true, request_id: requestId, duplicate: true })
    }
    await writeAudit({ ...auditBase, result: 'error', reason: 'insert_failed', payload: { form: 'site_public_form_v7', details: details.slice(0, 500) } })
    return json(500, { error: 'insert_failed', request_id: requestId, details })
  }

  await writeAudit({ ...auditBase, result: 'accepted', reason: 'lead_insert_created', payload })
  return json(200, { ok: true, request_id: requestId })
})
