export const OFFER_EDGE_CONTRACT_VERSION = 'leader-crm-offers-edge-v1'
export const OFFER_ACTION = 'offer.create_from_calculation'
export const OFFER_PERMISSION = 'offers.write'
export const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'

export const OFFER_WRITE_ROLES = Object.freeze(new Set([
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
  'calculation_id',
  'idempotency_key',
  'title',
  'valid_until',
  'extra_comment',
]))

export type JsonObject = Record<string, unknown>

type ValidationError = {
  ok: false
  code: 'invalid_payload' | 'unknown_action'
  message: string
}

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

export function canWriteOffer(role: unknown): boolean {
  return OFFER_WRITE_ROLES.has(normalizeRole(role))
}

export function projectRefFromUrl(value: string): string {
  try {
    const host = new URL(value).hostname
    return host.split('.')[0] || ''
  } catch {
    return ''
  }
}

export function preferredEnvironmentKey(primary: unknown, keySet: unknown): string {
  const direct = cleanText(primary, 2000)
  if (direct) return direct
  try {
    const parsed = JSON.parse(String(keySet || ''))
    return cleanText(asObject(parsed)?.default, 2000)
  } catch {
    return ''
  }
}

export function isJwtApiKey(value: unknown): boolean {
  return cleanText(value, 2000).split('.').length === 3
}

function hasOnlyFields(value: JsonObject, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key))
}

function validUuid(value: unknown): boolean {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())
}

function validIsoDateTime(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const raw = value.trim()
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(raw)
    && Number.isFinite(Date.parse(raw))
}

function validDate(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const raw = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false
  const parsed = new Date(`${raw}T00:00:00.000Z`)
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === raw
}

export function validateOfferRequest(value: unknown): ValidationResult {
  const request = asObject(value)
  if (!request || !hasOnlyFields(request, REQUEST_FIELDS)) {
    return { ok: false, code: 'invalid_payload', message: 'Invalid request envelope' }
  }
  if (cleanText(request.action, 80) !== OFFER_ACTION) {
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
  if (!validUuid(payload.calculation_id)) {
    return { ok: false, code: 'invalid_payload', message: 'calculation_id must be UUID' }
  }

  if (typeof payload.idempotency_key !== 'string') {
    return { ok: false, code: 'invalid_payload', message: 'idempotency_key must be a string' }
  }
  const idempotencyKey = payload.idempotency_key.trim()
  if (!idempotencyKey || idempotencyKey.length > 160) {
    return { ok: false, code: 'invalid_payload', message: 'idempotency_key must contain 1 to 160 characters' }
  }
  if (typeof payload.title !== 'string') {
    return { ok: false, code: 'invalid_payload', message: 'title must be a string' }
  }
  const rawTitle = payload.title.trim()
  if (!rawTitle || rawTitle.length > 500) {
    return { ok: false, code: 'invalid_payload', message: 'title must contain 1 to 500 characters' }
  }
  if (!validDate(payload.valid_until)) {
    return { ok: false, code: 'invalid_payload', message: 'valid_until must be YYYY-MM-DD' }
  }
  if (payload.extra_comment !== undefined && payload.extra_comment !== null && typeof payload.extra_comment !== 'string') {
    return { ok: false, code: 'invalid_payload', message: 'extra_comment must be a string or null' }
  }
  const rawExtraComment = typeof payload.extra_comment === 'string' ? payload.extra_comment.trim() : ''
  if (rawExtraComment.length > 4000) {
    return { ok: false, code: 'invalid_payload', message: 'extra_comment must contain at most 4000 characters' }
  }

  return {
    ok: true,
    request: {
      action: OFFER_ACTION,
      request_id: cleanText(request.request_id, 80),
      expected_updated_at: cleanText(request.expected_updated_at, 80),
      payload: {
        calculation_id: cleanText(payload.calculation_id, 80),
        idempotency_key: idempotencyKey,
        title: rawTitle,
        valid_until: cleanText(payload.valid_until, 20),
        extra_comment: rawExtraComment || null,
      },
    },
  }
}

export function rpcStatus(code: unknown): number {
  switch (cleanText(code, 80)) {
    case 'invalid_payload':
    case 'unknown_action':
    case 'invalid_calculation':
    case 'invalid_valid_until':
      return 400
    case 'inactive_profile':
    case 'forbidden':
      return 403
    case 'calculation_not_found':
      return 404
    case 'calculation_changed':
    case 'calculation_not_current':
    case 'offer_already_exists':
    case 'idempotency_conflict':
    case 'request_id_conflict':
      return 409
    default:
      return 500
  }
}
