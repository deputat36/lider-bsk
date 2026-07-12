const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
}

function clean(value: unknown, max = 1000) {
  return String(value ?? '').trim().slice(0, max)
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

async function rest(url: string, serviceRole: string, path: string, init: RequestInit = {}) {
  return await fetch(url + path, {
    ...init,
    headers: {
      'apikey': serviceRole,
      'Authorization': 'Bearer ' + serviceRole,
      ...(init.headers || {}),
    },
  })
}

async function checkUser(req: Request, url: string, anon: string, serviceRole: string) {
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { error: json(401, { error: 'missing_token' }) }

  const userRes = await fetch(url + '/auth/v1/user', {
    headers: { 'apikey': anon, 'Authorization': 'Bearer ' + token },
  })
  if (!userRes.ok) return { error: json(401, { error: 'bad_token' }) }
  const user = await userRes.json()
  if (!user?.id) return { error: json(401, { error: 'bad_user' }) }

  const profileRes = await rest(
    url,
    serviceRole,
    '/rest/v1/leader_user_profiles?user_id=eq.' + encodeURIComponent(user.id) + '&is_active=eq.true&select=user_id,email,role,is_active&limit=1',
  )
  if (!profileRes.ok) return { error: json(403, { error: 'profile_check_failed' }) }
  const profiles = await profileRes.json()
  if (!Array.isArray(profiles) || profiles.length === 0) return { error: json(403, { error: 'access_denied' }) }
  return { user, profile: profiles[0] }
}

const ROLE_MATRIX_VERSION = '20260712-edge-role-matrix-2'

const CANONICAL_ROLES = new Set([
  'owner',
  'admin',
  'manager',
  'accountant',
  'designer',
  'installer',
  'contractor',
])

const ORDER_ACTIONS_BY_ROLE: Record<string, Set<string>> = {
  owner: new Set(['*']),
  admin: new Set(['*']),
  manager: new Set([
    'list',
    'update:status',
    'update:layout_status',
    'update:production_status',
    'update:layout_comment',
    'update:deadline',
  ]),
  accountant: new Set(['list', 'update:payment_status']),
  designer: new Set(),
  installer: new Set(),
  contractor: new Set(),
}

const ORDER_FIELDS_BY_ROLE: Record<string, string> = {
  owner: 'id,order_number,created_at,project_name,client_name,client_phone,status,payment_status,deadline,client_total,contractor_cost,profit,balance,source,layout_status,layout_comment,production_status,lead_id,client_id',
  admin: 'id,order_number,created_at,project_name,client_name,client_phone,status,payment_status,deadline,client_total,contractor_cost,profit,balance,source,layout_status,layout_comment,production_status,lead_id,client_id',
  manager: 'id,order_number,created_at,project_name,client_name,client_phone,status,payment_status,deadline,client_total,balance,source,layout_status,layout_comment,production_status,lead_id,client_id',
  accountant: 'id,order_number,created_at,client_name,client_phone,status,payment_status,deadline,client_total,balance,source,lead_id,client_id',
}

const UPDATE_FIELDS = [
  'status',
  'payment_status',
  'layout_status',
  'production_status',
  'layout_comment',
  'deadline',
]

function profileRole(profile: Record<string, unknown> | null | undefined) {
  return clean(profile?.role, 80).toLowerCase()
}

function isCanonicalRole(profile: Record<string, unknown> | null | undefined) {
  return CANONICAL_ROLES.has(profileRole(profile))
}

function canOrderAction(profile: Record<string, unknown> | null | undefined, permission: string) {
  const permissions = ORDER_ACTIONS_BY_ROLE[profileRole(profile)]
  return Boolean(permissions?.has('*') || permissions?.has(permission))
}

function unauthorized(action: string, profile: Record<string, unknown> | null | undefined, permission?: string) {
  return json(403, {
    error: 'forbidden',
    action,
    permission: permission || null,
    role: profileRole(profile),
    matrix: ROLE_MATRIX_VERSION,
  })
}

function requestedUpdateFields(body: Record<string, unknown>) {
  return UPDATE_FIELDS.filter((field) => field in body)
}

function validateOrderUpdate(profile: Record<string, unknown> | null | undefined, body: Record<string, unknown>) {
  const fields = requestedUpdateFields(body)
  if (!fields.length) {
    return { error: json(400, { error: 'no_update_fields', matrix: ROLE_MATRIX_VERSION }) }
  }

  for (const field of fields) {
    const permission = `update:${field}`
    if (!canOrderAction(profile, permission)) {
      return { error: unauthorized('update', profile, permission) }
    }
  }

  return { fields }
}

function orderFieldsForRole(profile: Record<string, unknown> | null | undefined) {
  return ORDER_FIELDS_BY_ROLE[profileRole(profile)] || ''
}

async function listOrders(url: string, serviceRole: string, profile: Record<string, unknown>) {
  const fields = orderFieldsForRole(profile)
  if (!fields) return unauthorized('list', profile, 'orders.read')

  const res = await rest(
    url,
    serviceRole,
    '/rest/v1/leader_orders?select=' + encodeURIComponent(fields) + '&order=created_at.desc&limit=80',
  )
  if (!res.ok) return json(500, { error: 'orders_read_failed', details: await res.text() })
  return json(200, { ok: true, orders: await res.json(), matrix: ROLE_MATRIX_VERSION })
}

async function updateOrder(
  url: string,
  serviceRole: string,
  profile: Record<string, unknown>,
  body: Record<string, unknown>,
  fields: string[],
) {
  const id = clean(body.id, 80)
  if (!id) return json(400, { error: 'id_required' })

  const patch: Record<string, unknown> = {}
  for (const field of fields) {
    if (field === 'status') patch.status = clean(body.status, 120)
    if (field === 'payment_status') patch.payment_status = clean(body.payment_status, 120)
    if (field === 'layout_status') patch.layout_status = clean(body.layout_status, 120)
    if (field === 'production_status') patch.production_status = clean(body.production_status, 120)
    if (field === 'layout_comment') patch.layout_comment = clean(body.layout_comment, 2000)
    if (field === 'deadline') patch.deadline = clean(body.deadline, 40) || null
  }

  const responseFields = orderFieldsForRole(profile)
  if (!responseFields) return unauthorized('update', profile, 'orders.update')

  const res = await rest(url, serviceRole, '/rest/v1/leader_orders?id=eq.' + encodeURIComponent(id) + '&select=' + encodeURIComponent(responseFields), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) return json(500, { error: 'order_update_failed', details: await res.text() })
  const rows = await res.json()
  return json(200, { ok: true, order: Array.isArray(rows) ? rows[0] : null, matrix: ROLE_MATRIX_VERSION })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anon || !serviceRole) return json(500, { error: 'server_not_configured' })

  const checked = await checkUser(req, url, anon, serviceRole)
  if (checked.error) return checked.error
  if (!isCanonicalRole(checked.profile)) return unauthorized('profile', checked.profile, 'canonical_role')

  let body: Record<string, unknown> = {}
  if (req.method === 'POST') {
    try { body = await req.json() } catch (_) { body = {} }
  }
  const action = clean(body.action || 'list', 40)

  if (action === 'list') {
    if (!canOrderAction(checked.profile, 'list')) return unauthorized(action, checked.profile, 'orders.read')
    return await listOrders(url, serviceRole, checked.profile)
  }

  if (action === 'update') {
    const validation = validateOrderUpdate(checked.profile, body)
    if (validation.error) return validation.error
    return await updateOrder(url, serviceRole, checked.profile, body, validation.fields || [])
  }

  return json(400, { error: 'unknown_action' })
})
