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

const orderFields = 'id,order_number,created_at,project_name,client_name,client_phone,status,payment_status,deadline,client_total,profit,balance,source,layout_status,layout_comment,production_status,lead_id,client_id'

const ROLE_MATRIX_VERSION = '20260630-edge-role-matrix-1'

const ORDER_ACTIONS_BY_ROLE: Record<string, Set<string>> = {
  owner: new Set(['*']),
  admin: new Set(['*']),
  manager: new Set(['list', 'update:any']),
  designer: new Set(['list', 'update:layout_status', 'update:layout_comment']),
  production: new Set(['list', 'update:production_status', 'update:layout_comment']),
  installer: new Set(['list']),
}

function role(profile: Record<string, unknown> | null | undefined) {
  return clean(profile?.role, 80).toLowerCase()
}

function canOrderAction(profile: Record<string, unknown> | null | undefined, permission: string) {
  const permissions = ORDER_ACTIONS_BY_ROLE[role(profile)]
  return Boolean(permissions?.has('*') || permissions?.has(permission) || permissions?.has('update:any'))
}

function unauthorized(action: string, profile: Record<string, unknown> | null | undefined) {
  return json(403, { error: 'forbidden', action, role: role(profile), matrix: ROLE_MATRIX_VERSION })
}

function requestedUpdateFields(body: Record<string, unknown>) {
  return ['status', 'payment_status', 'layout_status', 'production_status', 'layout_comment', 'deadline']
    .filter((field) => field in body)
}

function canUpdateOrder(profile: Record<string, unknown> | null | undefined, body: Record<string, unknown>) {
  const fields = requestedUpdateFields(body)
  if (!fields.length) return true
  if (canOrderAction(profile, 'update:any')) return true
  return fields.every((field) => canOrderAction(profile, `update:${field}`))
}

async function listOrders(url: string, serviceRole: string) {
  const res = await rest(
    url,
    serviceRole,
    '/rest/v1/leader_orders?select=' + encodeURIComponent(orderFields) + '&order=created_at.desc&limit=80',
  )
  if (!res.ok) return json(500, { error: 'orders_read_failed', details: await res.text() })
  return json(200, { ok: true, orders: await res.json() })
}

async function updateOrder(url: string, serviceRole: string, body: Record<string, unknown>) {
  const id = clean(body.id, 80)
  if (!id) return json(400, { error: 'id_required' })

  const patch: Record<string, unknown> = {}
  if ('status' in body) patch.status = clean(body.status, 120)
  if ('payment_status' in body) patch.payment_status = clean(body.payment_status, 120)
  if ('layout_status' in body) patch.layout_status = clean(body.layout_status, 120)
  if ('production_status' in body) patch.production_status = clean(body.production_status, 120)
  if ('layout_comment' in body) patch.layout_comment = clean(body.layout_comment, 2000)
  if ('deadline' in body) patch.deadline = clean(body.deadline, 40) || null

  const res = await rest(url, serviceRole, '/rest/v1/leader_orders?id=eq.' + encodeURIComponent(id) + '&select=' + encodeURIComponent(orderFields), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) return json(500, { error: 'order_update_failed', details: await res.text() })
  const rows = await res.json()
  return json(200, { ok: true, order: Array.isArray(rows) ? rows[0] : null })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anon || !serviceRole) return json(500, { error: 'server_not_configured' })

  const checked = await checkUser(req, url, anon, serviceRole)
  if (checked.error) return checked.error

  let body: Record<string, unknown> = {}
  if (req.method === 'POST') {
    try { body = await req.json() } catch (_) { body = {} }
  }
  const action = clean(body.action || 'list', 40)

  if (action === 'list') {
    if (!canOrderAction(checked.profile, 'list')) return unauthorized(action, checked.profile)
    return await listOrders(url, serviceRole)
  }

  if (action === 'update') {
    if (!canUpdateOrder(checked.profile, body)) return unauthorized(action, checked.profile)
    return await updateOrder(url, serviceRole, body)
  }

  return json(400, { error: 'unknown_action' })
})
