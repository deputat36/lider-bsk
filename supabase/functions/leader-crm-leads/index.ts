const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}

type RestAccess = string | { apiKey: string; bearer: string }
const MESSAGE_MAX_LENGTH = 3000

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

async function rest(supabaseUrl: string, access: RestAccess, path: string, init: RequestInit = {}) {
  const apiKey = typeof access === 'string' ? access : access.apiKey
  const authorization = typeof access === 'string' ? 'Bearer ' + access : access.bearer
  return await fetch(supabaseUrl + path, {
    ...init,
    signal: init.signal || AbortSignal.timeout(15000),
    headers: {
      'apikey': apiKey,
      'Authorization': authorization,
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

async function getUserFromRequest(req: Request, supabaseUrl: string, anonKey: string) {
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { error: json(401, { error: 'missing_token' }) }

  const userRes = await fetch(supabaseUrl + '/auth/v1/user', {
    signal: AbortSignal.timeout(15000),
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

const ORDER_LIST_FIELDS_BY_ROLE: Record<string, string> = {
  owner: orderFields,
  admin: orderFields,
  manager: 'id,order_number,created_at,updated_at,project_name,client_name,client_phone,status,deadline,source,layout_status,production_status,installation_status,priority,current_stage,next_action,progress_percent',
  accountant: 'id,order_number,created_at,updated_at,project_name,status,payment_status,deadline,client_total,contractor_cost,prepayment,balance',
}

const CANONICAL_ROLES = new Set([
  'owner',
  'admin',
  'manager',
  'accountant',
  'designer',
  'installer',
  'contractor',
])

const GENERIC_LEADS_ROLES = new Set([
  'owner',
  'admin',
  'manager',
])

const ACCOUNTANT_GENERIC_ACTIONS = new Set([
  'list_orders',
])

const ACTION_PERMISSION: Record<string, string> = {
  dashboard: 'leads.read',
  list: 'leads.read',
  list_orders: 'orders.read',
  create: 'leads.create',
  update: 'leads.update',
  ensure_client: 'clients.write',
  create_order: 'orders.create',
  create_order_from_offer: 'orders.create',
}

const ROLE_PERMISSIONS: Record<string, Set<string>> = {
  owner: new Set(['*']),
  admin: new Set(['*']),
  manager: new Set(Object.values(ACTION_PERMISSION)),
  accountant: new Set(['orders.read']),
}

function profileRole(profile: Record<string, unknown> | null | undefined) {
  return cleanText(profile?.role, 80).toLowerCase()
}

function canUseGenericLeads(profile: Record<string, unknown> | null | undefined, action = '') {
  const currentRole = profileRole(profile)
  return CANONICAL_ROLES.has(currentRole) && (
    GENERIC_LEADS_ROLES.has(currentRole)
    || (currentRole === 'accountant' && ACCOUNTANT_GENERIC_ACTIONS.has(action))
  )
}

function canRunGenericAction(profile: Record<string, unknown> | null | undefined, permission: string) {
  const permissions = ROLE_PERMISSIONS[profileRole(profile)]
  return Boolean(permission && (permissions?.has('*') || permissions?.has(permission)))
}

function orderListFields(profile: Record<string, unknown> | null | undefined) {
  return ORDER_LIST_FIELDS_BY_ROLE[profileRole(profile)] || ''
}

function forbidden(action: string, profile: Record<string, unknown> | null | undefined) {
  return json(403, { error: 'forbidden', action, role: profileRole(profile) })
}

async function hasCanonicalPermission(supabaseUrl: string, serviceRole: string, actorId: string, permission: string) {
  const res = await rest(supabaseUrl, serviceRole, '/rest/v1/rpc/leader_actor_has_crm_action_rpc', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_actor_id: actorId, p_action: permission }),
  })
  return res.ok && await res.json() === true
}

async function canReadObject(supabaseUrl: string, caller: RestAccess, table: string, id: string) {
  const res = await rest(supabaseUrl, caller, '/rest/v1/' + table + '?select=id&id=eq.' + encodeURIComponent(id) + '&limit=1')
  if (!res.ok) return false
  const rows = await res.json()
  return Array.isArray(rows) && rows.length === 1 && rows[0]?.id === id
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function projectOfferOrder(value: unknown) {
  const order = record(value)
  const id = cleanText(order?.id, 80)
  if (!id) return null
  return {
    id,
    order_number: order?.order_number ?? null,
    project_name: cleanText(order?.project_name, 300) || null,
    status: cleanText(order?.status, 120) || null,
    deadline: cleanText(order?.deadline, 40) || null,
    layout_status: cleanText(order?.layout_status, 120) || null,
    production_status: cleanText(order?.production_status, 120) || null,
    installation_status: cleanText(order?.installation_status, 120) || null,
    created_at: cleanText(order?.created_at, 80) || null,
    updated_at: cleanText(order?.updated_at, 80) || null,
  }
}

function projectOfferOrderResult(value: unknown) {
  const result = record(value)
  if (!result || result.ok !== true) return null
  const order = projectOfferOrder(result.order)
  if (!order) return null
  const linkErrors = Array.isArray(result.link_errors)
    ? result.link_errors.map((item) => cleanText(item, 200)).filter(Boolean).slice(0, 10)
    : []
  return {
    ok: true,
    already_created: result.already_created === true,
    order,
    items_created: Math.max(0, Math.trunc(num(result.items_created))),
    link_errors: linkErrors,
  }
}

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

  const insertRes = await rest(supabaseUrl, serviceRole, '/rest/v1/leader_user_profiles?select=' + encodeURIComponent(profileFields), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
    body: JSON.stringify({ user_id: userId, email, role: 'manager', is_active: false }),
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

async function dashboard(supabaseUrl: string, serviceRole: RestAccess) {
  const statsRes = await rest(supabaseUrl, serviceRole, '/rest/v1/leader_leads?select=id,status&status=not.eq.Спам&order=created_at.desc&limit=300')
  if (!statsRes.ok) return json(500, { error: 'dashboard_stats_failed', details: await statsRes.text() })
  const all = await statsRes.json()
  const recentRes = await rest(supabaseUrl, serviceRole, '/rest/v1/leader_leads?select=' + encodeURIComponent(leadFields) + '&status=not.eq.Спам&order=created_at.desc&limit=12')
  if (!recentRes.ok) return json(500, { error: 'dashboard_recent_failed', details: await recentRes.text() })
  return json(200, { ok: true, stats: calcStats(Array.isArray(all) ? all : []), recent: await recentRes.json() })
}

async function listLeads(supabaseUrl: string, serviceRole: RestAccess, body: Record<string, unknown>) {
  const rawLimit = Number(body.limit || 80)
  const limit = Math.max(20, Math.min(Number.isFinite(rawLimit) ? rawLimit : 80, 120))
  const leadsRes = await rest(supabaseUrl, serviceRole, '/rest/v1/leader_leads?select=' + encodeURIComponent(leadFields) + '&order=created_at.desc&limit=' + limit)
  if (!leadsRes.ok) return json(500, { error: 'leads_read_failed', details: await leadsRes.text() })
  return json(200, { ok: true, leads: await leadsRes.json() })
}

async function listOrders(supabaseUrl: string, serviceRole: string, profile: Record<string, unknown> | null | undefined, actorId: string) {
  const fields = orderListFields(profile)
  if (!fields) return forbidden('list_orders', profile)
  // As in the installed canonical orders endpoint, direct SELECT is closed.
  // Intersect the role projection with the current server permissions.
  const [costs, finance, clients] = await Promise.all(['costs.read', 'finance.read', 'clients.read'].map(permission => hasCanonicalPermission(supabaseUrl, serviceRole, actorId, permission)))
  const permittedFields = fields.split(',').filter(field => {
    if (['contractor_cost', 'profit'].includes(field)) return costs
    if (['client_total', 'payment_status', 'prepayment', 'balance'].includes(field)) return finance
    if (['client_name', 'client_phone'].includes(field)) return clients
    return true
  }).join(',')
  const res = await rest(supabaseUrl, serviceRole, '/rest/v1/leader_orders?select=' + encodeURIComponent(permittedFields) + '&order=created_at.desc&limit=80')
  if (!res.ok) return json(500, { error: 'orders_read_failed', details: await res.text() })
  return json(200, { ok: true, orders: await res.json() })
}

async function createLead(supabaseUrl: string, serviceRole: RestAccess, body: Record<string, unknown>) {
  const message = String(body.message ?? '').trim()
  if (message.length > MESSAGE_MAX_LENGTH) return json(400, { error: 'message_too_long', max_length: MESSAGE_MAX_LENGTH })
  const payload = {
    name: cleanText(body.name, 200), phone: cleanText(body.phone, 80), source: cleanText(body.source, 120) || 'Ручная заявка',
    service: cleanText(body.service, 200), message, status: cleanText(body.status, 80) || 'Новая',
    budget: body.budget === undefined || body.budget === null || body.budget === '' ? null : num(body.budget), city: cleanText(body.city, 120),
    page_url: cleanText(body.page_url, 500) || 'manual://crm-v2', payload: { created_from: 'crm_v2', manual: true },
  }
  if (!payload.name && !payload.phone && !payload.message) return json(400, { error: 'lead_data_required' })
  const res = await rest(supabaseUrl, serviceRole, '/rest/v1/leader_leads?select=' + encodeURIComponent(leadFields), { method: 'POST', headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' }, body: JSON.stringify(payload) })
  if (!res.ok) return json(500, { error: 'lead_insert_failed', details: await res.text() })
  const rows = await res.json()
  return json(200, { ok: true, lead: Array.isArray(rows) ? rows[0] : null })
}

async function updateLead(supabaseUrl: string, serviceRole: string, body: Record<string, unknown>, caller: RestAccess) {
  const id = cleanText(body.id, 80)
  if (!id) return json(400, { error: 'id_required' })
  const patch: Record<string, unknown> = {}
  if ('status' in body) patch.status = cleanText(body.status, 80)
  if ('lead_quality' in body) patch.lead_quality = cleanText(body.lead_quality, 80)
  if ('estimated_amount' in body) patch.estimated_amount = Number(body.estimated_amount) || null
  if ('next_contact_at' in body) patch.next_contact_at = cleanText(body.next_contact_at, 80) || null
  if ('message' in body) {
    const message = String(body.message ?? '').trim()
    if (message.length > MESSAGE_MAX_LENGTH) return json(400, { error: 'message_too_long', max_length: MESSAGE_MAX_LENGTH })
    patch.message = message
  }
  if ('reject_reason' in body) patch.reject_reason = cleanText(body.reject_reason, 300)
  if (!Object.keys(patch).length) return json(400, { error: 'no_update_fields' })
  // Direct UPDATE is closed in staging. Keep the service write behind role/action,
  // caller-visible object and explicit field guards instead of widening table grants.
  if (!await canReadObject(supabaseUrl, caller, 'leader_leads', id)) return json(404, { error: 'not_found' })
  const res = await rest(supabaseUrl, serviceRole, '/rest/v1/leader_leads?id=eq.' + encodeURIComponent(id) + '&select=' + encodeURIComponent(leadFields), { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' }, body: JSON.stringify(patch) })
  if (!res.ok) return json(500, { error: 'lead_update_failed', details: await res.text() })
  const rows = await res.json()
  if (!Array.isArray(rows) || !rows[0]) return json(404, { error: 'not_found' })
  return json(200, { ok: true, lead: rows[0] })
}

async function ensureClient(supabaseUrl: string, serviceRole: string, ownerId: string, body: Record<string, unknown>, caller: RestAccess) {
  const name = cleanText(body.name, 200)
  const phone = cleanText(body.phone, 80)
  const source = cleanText(body.source, 120) || 'Сайт'
  const comment = cleanText(body.comment, 1000)
  if (!name && !phone) return { ok: false, error: 'client_data_required' }
  if (phone) {
    const foundRes = await rest(supabaseUrl, caller, '/rest/v1/leader_clients?phone=eq.' + encodeURIComponent(phone) + '&select=' + encodeURIComponent(clientFields) + '&limit=1')
    if (foundRes.ok) { const found = await foundRes.json(); if (Array.isArray(found) && found[0]) return { ok: true, client: found[0], existed: true } }
  }
  const insertRes = await rest(supabaseUrl, serviceRole, '/rest/v1/leader_clients?select=' + encodeURIComponent(clientFields), { method: 'POST', headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' }, body: JSON.stringify({ owner_id: ownerId, name, phone, source, comment }) })
  if (!insertRes.ok) return { ok: false, error: 'client_insert_failed', details: await insertRes.text() }
  const rows = await insertRes.json()
  return { ok: true, client: Array.isArray(rows) ? rows[0] : null, existed: false }
}

async function ensureClientResponse(supabaseUrl: string, serviceRole: string, ownerId: string, body: Record<string, unknown>, caller: RestAccess) {
  const result = await ensureClient(supabaseUrl, serviceRole, ownerId, body, caller)
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

async function createOrder(supabaseUrl: string, serviceRole: string, ownerId: string, body: Record<string, unknown>, caller: RestAccess) {
  const rows = Array.isArray(body.rows) ? body.rows as Record<string, unknown>[] : []
  if (!rows.length) return json(400, { error: 'order_rows_required' })
  const clientResult = await ensureClient(supabaseUrl, serviceRole, ownerId, { name: body.client_name, phone: body.client_phone, source: body.source || 'CRM', comment: body.comment || '' }, caller)
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
  const payload = {
    offer_id: offerId, actor_id: ownerId, actor_email: actorEmail,
    project_name: cleanText(body.project_name, 300), order_type: cleanText(body.order_type, 80),
    deadline: cleanText(body.deadline, 40) || null, layout_status: cleanText(body.layout_status, 120),
    comment: cleanText(body.comment, 3000), payment_status: cleanText(body.payment_status, 80) || 'Не оплачено',
    prepayment: num(body.prepayment),
  }
  const res = await rest(supabaseUrl, serviceRole, '/rest/v1/rpc/leader_create_order_from_offer_rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_payload: payload }),
  })
  if (!res.ok) return json(500, { error: 'order_from_offer_rpc_failed', details: await res.text() })
  const projected = projectOfferOrderResult(await res.json())
  if (!projected) return json(500, { error: 'order_from_offer_projection_failed' })
  return json(200, projected)
}

Deno.serve(async (req: Request) => {
  try {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (!['GET', 'POST'].includes(req.method)) return json(405, { error: 'method_not_allowed' })
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceRole) return json(500, { error: 'server_not_configured' })
  let body: Record<string, unknown> = {}
  if (req.method === 'POST') {
    try { const value = await req.json(); if (!record(value)) return json(400, { error: 'invalid_json' }); body = value }
    catch (_) { return json(400, { error: 'invalid_json' }) }
  }
  const action = cleanText(body.action || new URL(req.url).searchParams.get('action') || 'dashboard', 60)
  if (req.method === 'GET' && !['dashboard', 'list', 'list_orders'].includes(action)) return json(405, { error: 'post_required' })
  if (action === 'ensure_profile') return await ensureProfile(req, supabaseUrl, anonKey, serviceRole)
  const checked = await checkUser(req, supabaseUrl, anonKey, serviceRole)
  if (checked.error) return checked.error
  if (!canUseGenericLeads(checked.profile, action)) return forbidden(action, checked.profile)
  const permission = ACTION_PERMISSION[action]
  if (!permission) return json(400, { error: 'unknown_action' })
  if (!canRunGenericAction(checked.profile, permission)) return forbidden(action, checked.profile)
  const ownerId = checked.user.id as string
  if (!await hasCanonicalPermission(supabaseUrl, serviceRole, ownerId, permission)) return forbidden(action, checked.profile)
  const caller: RestAccess = { apiKey: anonKey, bearer: req.headers.get('authorization') || '' }
  // This legacy command accepts financial snapshots. Managers use the approved-offer route.
  if (action === 'create_order' && !await hasCanonicalPermission(supabaseUrl, serviceRole, ownerId, 'finance.write')) return forbidden(action, checked.profile)
  if (action === 'create_order_from_offer') {
    const financeInput = num(body.prepayment) !== 0 || Boolean(body.payment_status && body.payment_status !== 'Не оплачено')
    if (financeInput && !await hasCanonicalPermission(supabaseUrl, serviceRole, ownerId, 'finance.write')) return json(403, { error: 'forbidden_fields', fields: ['prepayment', 'payment_status'] })
    const offerId = cleanText(body.offer_id, 80)
    if (offerId && !await canReadObject(supabaseUrl, caller, 'leader_commercial_offers', offerId)) return json(404, { error: 'not_found' })
  }
  if (action === 'create_order' && body.lead_id && !await canReadObject(supabaseUrl, caller, 'leader_leads', cleanText(body.lead_id, 80))) return json(404, { error: 'not_found' })
  const actorEmail = cleanText(checked.user.email || checked.profile?.email, 200)
  if (action === 'dashboard') return await dashboard(supabaseUrl, caller)
  if (action === 'list') return await listLeads(supabaseUrl, caller, body)
  if (action === 'list_orders') return await listOrders(supabaseUrl, serviceRole, checked.profile, ownerId)
  if (action === 'create') return await createLead(supabaseUrl, caller, body)
  if (action === 'update') return await updateLead(supabaseUrl, serviceRole, body, caller)
  if (action === 'ensure_client') return await ensureClientResponse(supabaseUrl, serviceRole, ownerId, body, caller)
  if (action === 'create_order') return await createOrder(supabaseUrl, serviceRole, ownerId, body, caller)
  if (action === 'create_order_from_offer') return await createOrderFromOffer(supabaseUrl, serviceRole, ownerId, actorEmail, body)
  return json(400, { error: 'unknown_action' })
  } catch (_) {
    return json(503, { error: 'temporarily_unavailable' })
  }
})
