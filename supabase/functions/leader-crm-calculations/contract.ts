export const CALCULATION_EDGE_CONTRACT_VERSION = 'leader-crm-calculations-edge-v1'
export const CALCULATION_ACTION = 'calculation.create_version'
export const CALCULATION_PERMISSION = 'calculation.write'
export const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'
export const MAX_CALCULATION_ITEMS = 200

export const CALCULATION_WRITE_ROLES = Object.freeze(new Set([
  'owner',
  'admin',
  'manager',
]))

const REQUEST_FIELDS = Object.freeze(new Set([
  'action',
  'request_id',
  'expected_updated_at',
  'payload',
]))

const PAYLOAD_FIELDS = Object.freeze(new Set([
  'source_calculation_id',
  'idempotency_key',
  'title',
  'need_id',
  'public_comment',
  'internal_comment',
  'items',
]))

const ITEM_FIELDS = Object.freeze(new Set([
  'catalog_id',
  'category',
  'item_type',
  'name',
  'unit',
  'qty',
  'contractor_price',
  'client_price',
  'comment',
  'data',
  'sort_order',
]))

export type JsonObject = Record<string, unknown>

type ValidationError = {
  ok: false
  code: 'invalid_payload' | 'unknown_action' | 'empty_items' | 'invalid_item'
  message: string
}

type ItemValidationResult =
  | { ok: true; item: JsonObject }
  | ValidationError

export type ValidationResult =
  | { ok: true; request: JsonObject }
  | ValidationError

export function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as JsonObject
}

export function cleanText(value: unknown, max = 1000): string {
  return String(value ?? '').trim().slice(0, max)
}

export function normalizeRole(value: unknown): string {
  return cleanText(value, 80).toLowerCase()
}

export function canWriteCalculation(role: unknown): boolean {
  return CALCULATION_WRITE_ROLES.has(normalizeRole(role))
}

export function projectRefFromUrl(value: string): string {
  try {
    const host = new URL(value).hostname
    return host.split('.')[0] || ''
  } catch {
    return ''
  }
}

function hasOnlyFields(value: JsonObject, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key))
}

function validUuid(value: unknown): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleanText(value, 80))
}

function validOptionalUuid(value: unknown): boolean {
  return value === undefined || value === null || cleanText(value, 80) === '' || validUuid(value)
}

function validIsoDateTime(value: unknown): boolean {
  const raw = cleanText(value, 80)
  return Boolean(raw && Number.isFinite(Date.parse(raw)))
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

function normalizeData(value: unknown): JsonObject {
  return asObject(value) || {}
}

function normalizeItem(value: unknown, index: number): ItemValidationResult {
  const item = asObject(value)
  if (!item || !hasOnlyFields(item, ITEM_FIELDS)) {
    return { ok: false, code: 'invalid_item', message: `Item ${index + 1} contains unknown or server-owned fields` }
  }
  if (!validOptionalUuid(item.catalog_id)) {
    return { ok: false, code: 'invalid_item', message: `Item ${index + 1} catalog_id must be UUID or null` }
  }

  const name = cleanText(item.name, 500)
  const qty = finiteNumber(item.qty)
  const contractorPrice = finiteNumber(item.contractor_price)
  const clientPrice = finiteNumber(item.client_price)
  const sortOrder = finiteNumber(item.sort_order ?? index)

  if (!name) return { ok: false, code: 'invalid_item', message: `Item ${index + 1} name is required` }
  if (qty === null || qty <= 0 || qty > 1_000_000) {
    return { ok: false, code: 'invalid_item', message: `Item ${index + 1} qty must be greater than zero` }
  }
  if (contractorPrice === null || contractorPrice < 0 || contractorPrice > 1_000_000_000) {
    return { ok: false, code: 'invalid_item', message: `Item ${index + 1} contractor_price is invalid` }
  }
  if (clientPrice === null || clientPrice < 0 || clientPrice > 1_000_000_000) {
    return { ok: false, code: 'invalid_item', message: `Item ${index + 1} client_price is invalid` }
  }
  if (sortOrder === null || !Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 1_000_000) {
    return { ok: false, code: 'invalid_item', message: `Item ${index + 1} sort_order is invalid` }
  }
  if (item.data !== undefined && !asObject(item.data)) {
    return { ok: false, code: 'invalid_item', message: `Item ${index + 1} data must be an object` }
  }

  return {
    ok: true,
    item: {
      catalog_id: cleanText(item.catalog_id, 80) || null,
      category: cleanText(item.category, 300) || null,
      item_type: cleanText(item.item_type, 200) || null,
      name,
      unit: cleanText(item.unit, 80) || null,
      qty,
      contractor_price: contractorPrice,
      client_price: clientPrice,
      comment: cleanText(item.comment, 2000) || null,
      data: normalizeData(item.data),
      sort_order: sortOrder,
    },
  }
}

export function validateCalculationRequest(value: unknown): ValidationResult {
  const request = asObject(value)
  if (!request || !hasOnlyFields(request, REQUEST_FIELDS)) {
    return { ok: false, code: 'invalid_payload', message: 'Invalid request envelope' }
  }
  if (cleanText(request.action, 80) !== CALCULATION_ACTION) {
    return { ok: false, code: 'unknown_action', message: 'Unsupported action' }
  }
  if (!validUuid(request.request_id)) {
    return { ok: false, code: 'invalid_payload', message: 'request_id must be UUID' }
  }
  if (!validIsoDateTime(request.expected_updated_at)) {
    return { ok: false, code: 'invalid_payload', message: 'expected_updated_at is invalid' }
  }

  const payload = asObject(request.payload)
  if (!payload || !hasOnlyFields(payload, PAYLOAD_FIELDS)) {
    return { ok: false, code: 'invalid_payload', message: 'Invalid business payload' }
  }
  if (!validUuid(payload.source_calculation_id)) {
    return { ok: false, code: 'invalid_payload', message: 'source_calculation_id must be UUID' }
  }
  if (!validOptionalUuid(payload.need_id)) {
    return { ok: false, code: 'invalid_payload', message: 'need_id must be UUID or null' }
  }

  const idempotencyKey = cleanText(payload.idempotency_key, 1000)
  if (!idempotencyKey || idempotencyKey.length > 160) {
    return { ok: false, code: 'invalid_payload', message: 'idempotency_key must contain 1 to 160 characters' }
  }
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    return { ok: false, code: 'empty_items', message: 'items must be a non-empty array' }
  }
  if (payload.items.length > MAX_CALCULATION_ITEMS) {
    return { ok: false, code: 'invalid_payload', message: `items must contain at most ${MAX_CALCULATION_ITEMS} rows` }
  }

  const items: JsonObject[] = []
  for (let index = 0; index < payload.items.length; index += 1) {
    const normalized = normalizeItem(payload.items[index], index)
    if (!normalized.ok) return normalized
    items.push(normalized.item)
  }

  return {
    ok: true,
    request: {
      action: CALCULATION_ACTION,
      request_id: cleanText(request.request_id, 80),
      expected_updated_at: cleanText(request.expected_updated_at, 80),
      payload: {
        source_calculation_id: cleanText(payload.source_calculation_id, 80),
        idempotency_key: idempotencyKey,
        title: cleanText(payload.title, 500) || null,
        need_id: cleanText(payload.need_id, 80) || null,
        public_comment: cleanText(payload.public_comment, 4000) || null,
        internal_comment: cleanText(payload.internal_comment, 8000) || null,
        items,
      },
    },
  }
}

export function rpcStatus(code: unknown): number {
  switch (cleanText(code, 80)) {
    case 'invalid_payload':
    case 'unknown_action':
    case 'empty_items':
    case 'invalid_item':
    case 'invalid_totals':
      return 400
    case 'inactive_profile':
    case 'forbidden':
      return 403
    case 'source_calculation_not_found':
      return 404
    case 'source_changed':
    case 'idempotency_conflict':
    case 'version_conflict':
    case 'duplicate_version_inventory':
      return 409
    default:
      return 500
  }
}
