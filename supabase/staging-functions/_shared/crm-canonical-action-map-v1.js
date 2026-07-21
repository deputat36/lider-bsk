export const CRM_EDGE_ACTION_GATE_VERSION = '20260721-canonical-action-gate-1'

export const LEADS_ACTION_PERMISSION = Object.freeze({
  dashboard: Object.freeze(['leads.read']),
  list: Object.freeze(['leads.read']),
  list_orders: Object.freeze(['orders.read']),
  create: Object.freeze(['leads.create']),
  update: Object.freeze(['leads.update']),
  ensure_client: Object.freeze(['clients.write']),
  create_order: Object.freeze(['orders.create']),
  create_order_from_offer: Object.freeze(['orders.create']),
})

export const ORDER_UPDATE_FIELD_PERMISSION = Object.freeze({
  status: 'orders.update',
  layout_status: 'orders.update',
  production_status: 'orders.update',
  layout_comment: 'orders.update',
  deadline: 'orders.update',
  payment_status: 'finance.write',
})

function clean(value, max = 80) {
  return String(value ?? '').trim().slice(0, max)
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

export function leadsActionPlan(body = {}, urlAction = '') {
  const action = clean(body?.action || urlAction || 'dashboard', 60)
  if (action === 'ensure_profile') {
    return Object.freeze({ action, known: true, bootstrap: true, permissions: Object.freeze([]) })
  }
  const permissions = LEADS_ACTION_PERMISSION[action]
  return Object.freeze({
    action,
    known: Array.isArray(permissions),
    bootstrap: false,
    permissions: Object.freeze([...(permissions || [])]),
  })
}

export function orderActionPlan(body = {}) {
  const action = clean(body?.action || 'list', 40)
  if (action === 'list') {
    return Object.freeze({ action, known: true, bootstrap: false, permissions: Object.freeze(['orders.read']), fields: Object.freeze([]) })
  }
  if (action !== 'update') {
    return Object.freeze({ action, known: false, bootstrap: false, permissions: Object.freeze([]), fields: Object.freeze([]) })
  }

  const fields = Object.keys(ORDER_UPDATE_FIELD_PERMISSION).filter((field) => Object.prototype.hasOwnProperty.call(body || {}, field))
  const permissions = fields.length
    ? unique(fields.map((field) => ORDER_UPDATE_FIELD_PERMISSION[field]))
    : ['orders.update']

  return Object.freeze({
    action,
    known: true,
    bootstrap: false,
    permissions: Object.freeze(permissions),
    fields: Object.freeze(fields),
  })
}
