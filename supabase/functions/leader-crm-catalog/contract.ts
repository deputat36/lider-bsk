export const CATALOG_EDGE_CONTRACT_VERSION = 'leader-crm-catalog-edge-v1'
export const CATALOG_ACTION = 'catalog.manage'
export const CATALOG_PERMISSION = 'catalog.manage'
export const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'

const REQUEST_FIELDS = new Set(['action', 'request_id', 'expected_updated_at', 'payload'])
const PAYLOAD_FIELDS = new Set(['operation', 'catalog_id', 'idempotency_key', 'reason', 'patch'])
const PATCH_FIELDS = new Set([
  'category', 'name', 'unit', 'contractor_price', 'is_active', 'sort_order',
  'description', 'item_type', 'markup_percent', 'min_client_price',
  'default_client_price', 'calculation_mode', 'settings',
])
const MODES = new Set(['markup', 'fixed', 'area', 'length', 'quantity'])

export type JsonObject = Record<string, unknown>
export type ValidationResult =
  | { ok: true; request: JsonObject }
  | { ok: false; code: string; message: string }

export function asObject(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null
}

export function cleanText(value: unknown, max = 1000): string {
  return String(value ?? '').trim().slice(0, max)
}

export function projectRefFromUrl(value: string): string {
  try { return new URL(value).hostname.split('.')[0] || '' } catch { return '' }
}

function uuid(value: unknown): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleanText(value, 80))
}

function only(value: JsonObject, allowed: Set<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key))
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function validatePatch(patch: JsonObject, operation: string): ValidationResult {
  if (!only(patch, PATCH_FIELDS)) return { ok: false, code: 'invalid_payload', message: 'Patch contains unknown fields' }
  if (operation === 'create') {
    if (!cleanText(patch.name, 500) || !cleanText(patch.category, 300) || !cleanText(patch.unit, 80)) {
      return { ok: false, code: 'invalid_payload', message: 'name, category and unit are required' }
    }
  }
  for (const field of ['name', 'category', 'unit']) {
    if (Object.hasOwn(patch, field) && !cleanText(patch[field], field === 'name' ? 500 : 300)) {
      return { ok: false, code: 'invalid_payload', message: `${field} must not be empty` }
    }
  }
  for (const [field, max] of [
    ['contractor_price', 1_000_000_000], ['markup_percent', 100_000],
    ['min_client_price', 1_000_000_000], ['default_client_price', 1_000_000_000],
  ] as const) {
    if (!Object.hasOwn(patch, field) || patch[field] === null) continue
    const n = finite(patch[field])
    if (n === null || n < 0 || n > max) return { ok: false, code: 'invalid_payload', message: `${field} is invalid` }
  }
  if (Object.hasOwn(patch, 'sort_order')) {
    const n = finite(patch.sort_order)
    if (n === null || !Number.isInteger(n) || n < 0 || n > 1_000_000) return { ok: false, code: 'invalid_payload', message: 'sort_order is invalid' }
  }
  if (Object.hasOwn(patch, 'is_active') && typeof patch.is_active !== 'boolean') return { ok: false, code: 'invalid_payload', message: 'is_active must be boolean' }
  if (Object.hasOwn(patch, 'settings') && !asObject(patch.settings)) return { ok: false, code: 'invalid_payload', message: 'settings must be object' }
  if (Object.hasOwn(patch, 'calculation_mode') && !MODES.has(cleanText(patch.calculation_mode, 40).toLowerCase())) {
    return { ok: false, code: 'invalid_payload', message: 'calculation_mode is unsupported' }
  }
  return { ok: true, request: patch }
}

export function validateCatalogRequest(value: unknown): ValidationResult {
  const request = asObject(value)
  if (!request || !only(request, REQUEST_FIELDS)) return { ok: false, code: 'invalid_payload', message: 'Invalid request envelope' }
  if (cleanText(request.action, 80) !== CATALOG_ACTION) return { ok: false, code: 'unknown_action', message: 'Unsupported action' }
  if (!uuid(request.request_id)) return { ok: false, code: 'invalid_payload', message: 'request_id must be UUID' }

  const payload = asObject(request.payload)
  if (!payload || !only(payload, PAYLOAD_FIELDS)) return { ok: false, code: 'invalid_payload', message: 'Invalid business payload' }
  const operation = cleanText(payload.operation, 20).toLowerCase()
  if (!['create', 'update'].includes(operation)) return { ok: false, code: 'invalid_payload', message: 'operation must be create or update' }
  const key = cleanText(payload.idempotency_key, 200)
  if (!key || key.length > 160) return { ok: false, code: 'invalid_payload', message: 'idempotency_key is invalid' }
  const patch = asObject(payload.patch)
  if (!patch) return { ok: false, code: 'invalid_payload', message: 'patch must be object' }
  const patchResult = validatePatch(patch, operation)
  if (!patchResult.ok) return patchResult

  let expected: string | null = null
  if (operation === 'update') {
    if (!uuid(payload.catalog_id)) return { ok: false, code: 'invalid_payload', message: 'catalog_id must be UUID' }
    expected = cleanText(request.expected_updated_at, 100)
    if (!expected || !Number.isFinite(Date.parse(expected))) return { ok: false, code: 'invalid_payload', message: 'expected_updated_at is required for update' }
  } else if (payload.catalog_id != null || request.expected_updated_at != null) {
    return { ok: false, code: 'invalid_payload', message: 'Create must not contain catalog_id or expected_updated_at' }
  }

  return {
    ok: true,
    request: {
      action: CATALOG_ACTION,
      request_id: cleanText(request.request_id, 80),
      expected_updated_at: expected,
      payload: {
        operation,
        catalog_id: operation === 'update' ? cleanText(payload.catalog_id, 80) : null,
        idempotency_key: key,
        reason: cleanText(payload.reason, 1000) || null,
        patch: { ...patch },
      },
    },
  }
}

export function rpcStatus(code: unknown): number {
  switch (cleanText(code, 80)) {
    case 'invalid_payload': case 'unknown_action': return 400
    case 'forbidden': case 'inactive_profile': return 403
    case 'catalog_not_found': return 404
    case 'source_changed': case 'idempotency_conflict': case 'catalog_duplicate': return 409
    default: return 500
  }
}
