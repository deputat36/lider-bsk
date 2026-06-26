const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
}

function cleanText(value: unknown, max = 1000) {
  return String(value ?? '').trim().slice(0, max)
}

function num(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

async function rest(supabaseUrl: string, serviceRole: string, path: string, init: RequestInit = {}) {
  return await fetch(supabaseUrl + path, {
    ...init,
    headers: {
      'apikey': serviceRole,
      'Authorization': 'Bearer ' + serviceRole,
      ...(init.headers || {}),
    },
  })
}

async function readOne(supabaseUrl: string, serviceRole: string, path: string) {
  const res = await rest(supabaseUrl, serviceRole, path)
  if (!res.ok) throw new Error(await res.text())
  const rows = await res.json()
  return Array.isArray(rows) ? rows[0] || null : null
}

async function callRpc(supabaseUrl: string, serviceRole: string, name: string, payload: Record<string, unknown>) {
  return await rest(supabaseUrl, serviceRole, '/rest/v1/rpc/' + encodeURIComponent(name), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

async function getUserFromRequest(req: Request, supabaseUrl: string, anonKey: string) {
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { error: json(401, { error: 'missing_token' }) }

  const userRes = await fetch(supabaseUrl + '/auth/v1/user', {
    headers: { 'apikey': anonKey, 'Authorization': 'Bearer ' + token },
  })
  if (!userRes.ok) return { error: json(401, { error: 'bad_token' }) }
  const user = await userRes.json()
  if (!user?.id) return { error: json(401, { error: 'bad_user' }) }
  return { user }
}

async function checkUser(req: Request, supabaseUrl: string, anonKey: string, serviceRole: string) {
  const userCheck = await getUserFromRequest(req, supabaseUrl, anonKey)
  if (userCheck.error) return { error: userCheck.error }
  const user = userCheck.user

  const profileRes = await rest(
    supabaseUrl,
    serviceRole,
    '/rest/v1/leader_user_profiles?user_id=eq.' + encodeURIComponent(user.id) + '&is_active=eq.true&select=user_id,email,role,is_active&limit=1',
  )
  if (!profileRes.ok) return { error: json(403, { error: 'profile_check_failed' }) }
  const profiles = await profileRes.json()
  if (!Array.isArray(profiles) || profiles.length === 0) return { error: json(403, { error: 'access_denied' }) }
  return { user, profile: profiles[0] }
}

const profileFields = 'user_id,email,role,is_active,full_name'
const leadFields = 'id,created_at,name,phone,source,service,message,status,lead_quality,estimated_amount,next_contact_at,page_url,utm_source,utm_medium,utm_campaign,utm_content,utm_term,budget,city,converted_order_id,converted_client_id'
const clientFields = 'id,owner_id,name,phone,source,comment,created_at,updated_at'
const orderFields = 'id,order_number,created_at,project_name,client_name,client_phone,status,payment_status,deadline,client_total,contractor_cost,profit,balance,source,layout_status,production_status,lead_id,client_id'

async function ensureProfile(req: Request, supabaseUrl: string, anonKey: string, serviceRole: string) {
  const userCheck = await getUserFromRequest(req, supabaseUrl, anonKey)
  if (userCheck.error) return userCheck.error
  const user = userCheck.user
  const userId = cleanText(user.id, 80)
  const email = cleanText(String(user.email || '').toLowerCase(), 240)
  if (!userId) return json(401, { error: 'bad_user' })
  if (!email) return json(400, { error: 'authenticated_email_required' })

  const existing = await readOne(
    supabaseUrl,
    serviceRole,
    '/rest/v1/leader_user_profiles?user_id=eq.' + encodeURIComponent(userId) + '&select=' + encodeURIComponent(profileFields) + '&limit=1',
  )

  if (existing) {
    if (cleanText(existing.email || '', 240).toLowerCase() !== email) {
      const updateRes = await rest(supabaseUrl, serviceRole, '/rest/v1/leader_user_profiles?user_id=eq.' + encodeURIComponent(userId) + '&select=' + encodeURIComponent(profileFields), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({ email, updated_at: new Date().toISOString() }),
      })
      if (!updateRes.ok) return json(500, { error: 'profile_update_failed', details: await updateRes.text() })
      const rows = await updateRes.json()
      return json(200, { ok: true, profile: Array.isArray(rows) ? rows[0] : null })
    }
    return json(200, { ok: true, profile: existing })
  }

  const ownerRes = await rest(supabaseUrl, serviceRole, '/rest/v1/leader_user_profiles?role=eq.owner&is_active=eq.true&select=user_id&limit=1')
  if (!ownerRes.ok) return json(500, { error: 'owner_check_failed', details: await ownerRes.text() })
  const ownerRows = await ownerRes.json()
  const role = Array.isArray(ownerRows) && ownerRows.length ? 'manager' : 'owner'
  const insertRes = await rest(supabaseUrl, serviceRole, '/rest/v1/leader_user_profiles?select=' + encodeURIComponent(profileFields), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
    body: JSON.stringify({ user_id: userId, email, role, is_active: true }),
  })
  if (!insertRes.ok) return json(500, { error: 'profile_insert_failed', details: await insertRes.text() })
  const rows = await insertRes.json()
  return json(200, { ok: true, profile: Array.isArray(rows) ? rows[0] : null })
}

function calcStats(leads: any[]) {
  const active = leads.filter(l => (l.status || 'Новая') !== 'Спам')
  return {
    new: active.filter(l => (l.status || 'Новая') === 'Новая').length,
    work: active.filter(l => (l.status || '') === 'В работе').length,
    waiting: active.filter(l => ['Ждём ответ','КП отправлено','Уточнение деталей'].includes(l.status || '')).length,
    converted: active.filter(l => (l.status || '') === 'Создан заказ').length,
    total_active: active.length,
  }
}

async function dashboard(supabaseUrl: string, serviceRole: string) {
  const statsRes = await rest(supabaseUrl, serviceRole, '/rest/v1/leader_leads?select=id,status&status=not.eq.Спам&order=created_at.desc&limit=300')
  if (!statsRes.ok) return json(500, { error: 'dashboard_stats_failed', details: await statsRes.text() })
  const all = await statsRes.json()
  const recentRes = await rest(supabaseUrl, serviceRole, '/rest/v1/leader_leads?select=' + encodeURIComponent(leadFields) + '&status=not.eq.Спам&order=created_at.desc&limit=12')
  if (!recentRes.ok) return json(500, { error: 'dashboard_recent_failed', details: await recentRes.text() })
  return json(200, { ok: true, stats: calcStats(Array.isArray(all) ? all : []), recent: await recentRes.json() })
}

async function listLeads(supabaseUrl: string, serviceRole: string, body: Record<string, unknown>) {
  const rawLimit = Number(body.limit || 80)
  const limit = Math.max(20, Math.min(Number.isFinite(rawLimit) ? rawLimit : 80, 120))
  const leadsRes = await rest(supabaseUrl, serviceRole, '/rest/v1/leader_leads?select=' + encodeURIComponent(leadFields) + '&order=created_at.desc&limit=' + limit)
  if (!leadsRes.ok) return json(500, { error: 'leads_read_failed', details: await leadsRes.text() })
  return json(200, { ok: true, leads: await leadsRes.json() })
}

async function listOrders(supabaseUrl: string, serviceRole: string) {
  const res = await rest(supabaseUrl, serviceRole, '/rest/v1/leader_orders?select=' + encodeURIComponent(orderFields) + '&order=created_at.desc&limit=80')
  if (!res.ok) return json(500, { error: 'orders_read_failed', details: await res.text() })
  return json(200, { ok: true, orders: await res.json() })
}

async function createLead(supabaseUrl: string, serviceRole: string, body: Record<string, unknown>) {
  const payload = {
    name: cleanText(body.name, 200), phone: cleanText(body.phone, 80), source: cleanText(body.source, 120) || 'Ручная заявка',
    service: cleanText(body.service, 200), message: cleanText(body.message, 2000), status: cleanText(body.status, 80) || 'Новая',
    budget: body.budget === undefined || body.budget === null || body.budget === '' ? null : num(body.budget), city: cleanText(body.city, 120),
    page_url: cleanText(body.page_url, 500) || 'manual://crm-v2', payload: { created_from: 'crm_v2', manual: true },
  }
  if (!payload.name && !payload.phone && !payload.message) return json(400, { error: 'lead_data_required' })
  const res = await rest(supabaseUrl, serviceRole, '/rest/v1/leader_leads?select=' + encodeURIComponent(leadFields), { method: 'POST', headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' }, body: JSON.stringify(payload) })
  if (!res.ok) return json(500, { error: 'lead_insert_failed', details: await res.text() })
  const rows = await res.json()
  return json(200, { ok: true, lead: Array.isArray(rows) ? rows[0] : null })
}

async function updateLead(supabaseUrl: string, serviceRole: string, body: Record<string, unknown>) {
  const id = cleanText(body.id, 80)
  if (!id) return json(400, { error: 'id_required' })
  const patch: Record<string, unknown> = {}
  if ('status' in body) patch.status = cleanText(body.status, 80)
  if ('lead_quality' in body) patch.lead_quality = cleanText(body.lead_quality, 80)
  if ('estimated_amount' in body) patch.estimated_amount = Number(body.estimated_amount) || null
  if ('next_contact_at' in body) patch.next_contact_at = cleanText(body.next_contact_at, 80) || null
  if ('message' in body) patch.message = cleanText(body.message, 2000)
  if ('reject_reason' in body) patch.reject_reason = cleanText(body.reject_reason, 300)
  const res = await rest(supabaseUrl, serviceRole, '/rest/v1/leader_leads?id=eq.' + encodeURIComponent(id) + '&select=' + encodeURIComponent(leadFields), { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' }, body: JSON.stringify(patch) })
  if (!res.ok) return json(500, { error: 'lead_update_failed', details: await res.text() })
  const rows = await res.json()
  return json(200, { ok: true, lead: Array.isArray(rows) ? rows[0] : null })
}

async function ensureClient(supabaseUrl: string, serviceRole: string, ownerId: string, body: Record<string, unknown>) {
  const name = cleanText(body.name, 200)
  const phone = cleanText(body.phone, 80)
  const source = cleanText(body.source, 120) || 'Сайт'
  const comment = cleanText(body.comment, 1000)
  if (!name && !phone) return { ok: false, error: 'client_data_required' }
  if (phone) {
    const foundRes = await rest(supabaseUrl, serviceRole, '/rest/v1/leader_clients?phone=eq.' + encodeURIComponent(phone) + '&select=' + encodeURIComponent(clientFields) + '&limit=1')
    if (foundRes.ok) { const found = await foundRes.json(); if (Array.isArray(found) && found[0]) return { ok: true, client: found[0], existed: true } }
  }
  const insertRes = await rest(supabaseUrl, serviceRole, '/rest/v1/leader_clients?select=' + encodeURIComponent(clientFields), { method: 'POST', headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' }, body: JSON.stringify({ owner_id: ownerId, name, phone, source, comment }) })
  if (!insertRes.ok) return { ok: false, error: 'client_insert_failed', details: await insertRes.text() }
  const rows = await insertRes.json()
  return { ok: true, client: Array.isArray(rows) ? rows[0] : null, existed: false }
}

async function ensureClientResponse(supabaseUrl: string, serviceRole: string, ownerId: string, body: Record<string, unknown>) {
  const result = await ensureClient(supabaseUrl, serviceRole, ownerId, body)
  if (!result.ok) return json(500, result)
  return json(200, result)
}

function itemPayload(ownerId: string, orderId: string, r: Record<string, unknown>) {
  const qty = num(r.qty || r.quantity || 1)
  const price = num(r.price || r.contractor_price)
  const contractorSum = num(r.contractor_sum || (qty * price))
  const clientSum = num(r.client_sum || r.total || 0)
  return { owner_id: ownerId, order_id: orderId, name: cleanText(r.name, 300), unit: cleanText(r.unit, 50), quantity: qty, contractor_price: price, contractor_sum: contractorSum, markup_percent: r.markup === '' || r.markup === null || r.markup === undefined ? null : num(r.markup), client_sum: clientSum, comment: cleanText(r.comment, 1000) }
}

async function createOrder(supabaseUrl: string, serviceRole: string, ownerId: string, body: Record<string, unknown>) {
  const rows = Array.isArray(body.rows) ? body.rows as Record<string, unknown>[] : []
  if (!rows.length) return json(400, { error: 'order_rows_required' })
  const clientResult = await ensureClient(supabaseUrl, serviceRole, ownerId, { name: body.client_name, phone: body.client_phone, source: body.source || 'CRM', comment: body.comment || '' })
  if (!clientResult.ok) return json(500, clientResult)
  const totals = (body.totals || {}) as Record<string, unknown>
  const orderPayload = { owner_id: ownerId, client_id: clientResult.client?.id || null, lead_id: cleanText(body.lead_id, 80) || null, project_name: cleanText(body.project_name, 300) || 'Заказ из CRM', client_name: cleanText(body.client_name, 200), client_phone: cleanText(body.client_phone, 80), status: cleanText(body.status, 80) || 'Новый', payment_status: cleanText(body.payment_status, 80) || 'Не оплачено', deadline: cleanText(body.deadline, 40) || null, contractor_cost: num(totals.cost), client_total: num(totals.total), profit: num(totals.profit), prepayment: num(body.prepayment || totals.prepayment), balance: num(totals.balance), source: cleanText(body.source, 120), layout_status: cleanText(body.layout_status, 120) || 'Макета нет', layout_link: cleanText(body.layout_link, 500), layout_comment: cleanText(body.comment, 2000), production_status: cleanText(body.production_status, 120) || 'Не передано', data: { order_type: cleanText(body.order_type, 80) || 'Смешанный', source_ui: 'crm_v2', raw_rows: rows } }
  const orderRes = await rest(supabaseUrl, serviceRole, '/rest/v1/leader_orders?select=' + encodeURIComponent(orderFields), { method: 'POST', headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' }, body: JSON.stringify(orderPayload) })
  if (!orderRes.ok) return json(500, { error: 'order_insert_failed', details: await orderRes.text() })
  const orderRows = await orderRes.json()
  const order = Array.isArray(orderRows) ? orderRows[0] : null
  if (order?.id) {
    const itemRows = rows.map((r) => itemPayload(ownerId, order.id, r)).filter((r) => r.name)
    if (itemRows.length) {
      const itemRes = await rest(supabaseUrl, serviceRole, '/rest/v1/leader_order_items', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body: JSON.stringify(itemRows) })
      if (!itemRes.ok) return json(500, { error: 'order_items_insert_failed', details: await itemRes.text(), order })
    }
    const leadId = cleanText(body.lead_id, 80)
    if (leadId) await rest(supabaseUrl, serviceRole, '/rest/v1/leader_leads?id=eq.' + encodeURIComponent(leadId), { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body: JSON.stringify({ status: 'Создан заказ', converted_order_id: order.id, converted_client_id: clientResult.client?.id || null, converted_at: new Date().toISOString() }) })
  }
  return json(200, { ok: true, order, client: clientResult.client, client_existed: clientResult.existed })
}

async function createOrderFromOffer(supabaseUrl: string, serviceRole: string, ownerId: string, actorEmail: string, body: Record<string, unknown>) {
  const offerId = cleanText(body.offer_id, 80)
  if (!offerId) return json(400, { error: 'offer_id_required' })
  const rpcRes = await callRpc(supabaseUrl, serviceRole, 'leader_create_order_from_offer_rpc', {
    p_payload: {
      ...body,
      offer_id: offerId,
      actor_id: ownerId,
      actor_email: actorEmail || null,
    },
  })
  if (!rpcRes.ok) return json(500, { error: 'create_order_from_offer_rpc_failed', details: await rpcRes.text() })
  return json(200, await rpcRes.json())
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceRole) return json(500, { error: 'server_not_configured' })
  let body: Record<string, unknown> = {}
  if (req.method === 'POST') { try { body = await req.json() } catch (_) { body = {} } }
  const action = cleanText(body.action || new URL(req.url).searchParams.get('action') || 'dashboard', 60)
  if (action === 'ensure_profile') return await ensureProfile(req, supabaseUrl, anonKey, serviceRole)
  const checked = await checkUser(req, supabaseUrl, anonKey, serviceRole)
  if (checked.error) return checked.error
  const ownerId = checked.user.id as string
  const actorEmail = cleanText(checked.user.email || checked.profile?.email, 200)
  if (action === 'dashboard') return await dashboard(supabaseUrl, serviceRole)
  if (action === 'list') return await listLeads(supabaseUrl, serviceRole, body)
  if (action === 'list_orders') return await listOrders(supabaseUrl, serviceRole)
  if (action === 'create') return await createLead(supabaseUrl, serviceRole, body)
  if (action === 'update') return await updateLead(supabaseUrl, serviceRole, body)
  if (action === 'ensure_client') return await ensureClientResponse(supabaseUrl, serviceRole, ownerId, body)
  if (action === 'create_order') return await createOrder(supabaseUrl, serviceRole, ownerId, body)
  if (action === 'create_order_from_offer') return await createOrderFromOffer(supabaseUrl, serviceRole, ownerId, actorEmail, body)
  return json(400, { error: 'unknown_action' })
})
