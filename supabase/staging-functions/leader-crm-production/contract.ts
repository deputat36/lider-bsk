export const PRODUCTION_EDGE_CONTRACT_VERSION = 'leader-crm-production-edge-v1'
export const PRODUCTION_ACTION = 'production_job.update'
export const PRODUCTION_PERMISSION = 'production.write'
export const INTERNAL_COMMENT_PERMISSION = 'orders.update'
export const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'
export const MAX_BODY_BYTES = 96 * 1024

const REQUEST_FIELDS = Object.freeze(new Set([
  'action',
  'request_id',
  'expected_updated_at',
  'payload',
]))

const PAYLOAD_FIELDS = Object.freeze(new Set([
  'job_id',
  'idempotency_key',
  'patch',
]))

const PATCH_FIELDS = Object.freeze(new Set([
  'title',
  'production_status',
  'layout_status',
  'priority',
  'deadline',
  'file_url',
  'technical_task',
  'contractor_comment',
  'internal_comment',
]))

export type JsonObject = Record<string, unknown>

type ValidationError = {
  ok: false
  code: 'invalid_payload' | 'unknown_action'
  message: string
}

export type ValidationResult =
  | { ok: true; request: JsonObject; permissions: string[] }
  | ValidationError

export function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as JsonObject
}

export function cleanText(value: unknown, max = 1000): string {
  return String(value ?? '').trim().slice(0, max)
}

export function projectRefFromUrl(value: string): string {
  try {
    return new URL(value).hostname.split('.')[0] || ''
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

function validIsoDateTime(value: unknown): boolean {
  const raw = cleanText(value, 80)
  return Boolean(raw && Number.isFinite(Date.parse(raw)))
}

function validOptionalText(value: unknown, max: number): boolean {
  return value === undefined || value === null || typeof value === 'string' && value.trim().length <= max
}

function validOptionalDateTime(value: unknown): boolean {
  return value === undefined || value === null || value === '' || validIsoDateTime(value)
}

export function validateProductionRequest(value: unknown): ValidationResult {
  const request = asObject(value)
  if (!request || !hasOnlyFields(request, REQUEST_FIELDS)) {
    return { ok: false, code: 'invalid_payload', message: 'Invalid request envelope' }
  }
  if (cleanText(request.action, 80) !== PRODUCTION_ACTION) {
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
  if (!validUuid(payload.job_id)) {
    return { ok: false, code: 'invalid_payload', message: 'job_id must be UUID' }
  }

  const idempotencyKey = cleanText(payload.idempotency_key, 1000)
  if (!idempotencyKey || idempotencyKey.length > 160) {
    return { ok: false, code: 'invalid_payload', message: 'idempotency_key must contain 1 to 160 characters' }
  }

  const patch = asObject(payload.patch)
  if (!patch || Object.keys(patch).length === 0 || !hasOnlyFields(patch, PATCH_FIELDS)) {
    return { ok: false, code: 'invalid_payload', message: 'patch must be a non-empty object with supported fields' }
  }

  if (!validOptionalText(patch.title, 500)
    || !validOptionalText(patch.production_status, 200)
    || !validOptionalText(patch.layout_status, 200)
    || !validOptionalText(patch.priority, 100)
    || !validOptionalText(patch.file_url, 2000)
    || !validOptionalText(patch.technical_task, 12000)
    || !validOptionalText(patch.contractor_comment, 8000)
    || !validOptionalText(patch.internal_comment, 8000)
    || !validOptionalDateTime(patch.deadline)) {
    return { ok: false, code: 'invalid_payload', message: 'One or more patch fields are invalid' }
  }

  const permissions = [PRODUCTION_PERMISSION]
  if (Object.prototype.hasOwnProperty.call(patch, 'internal_comment')) {
    permissions.push(INTERNAL_COMMENT_PERMISSION)
  }

  return {
    ok: true,
    permissions,
    request: {
      action: PRODUCTION_ACTION,
      request_id: cleanText(request.request_id, 80),
      expected_updated_at: cleanText(request.expected_updated_at, 80),
      payload: {
        job_id: cleanText(payload.job_id, 80),
        idempotency_key: idempotencyKey,
        patch,
      },
    },
  }
}

export function rpcStatus(code: unknown): number {
  switch (cleanText(code, 80)) {
    case 'validation_error':
    case 'invalid_payload':
    case 'unknown_action':
    case 'invalid_transition':
      return 400
    case 'forbidden':
      return 403
    case 'not_found':
      return 404
    case 'conflict':
    case 'duplicate_request':
      return 409
    default:
      return 500
  }
}
