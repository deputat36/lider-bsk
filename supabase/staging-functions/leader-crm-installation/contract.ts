export const INSTALLATION_EDGE_CONTRACT_VERSION = 'leader-crm-installation-edge-v2'
export const INSTALLATION_UPDATE_ACTION = 'installation_job.update'
export const INSTALLATION_UPDATE_PERMISSION = 'installation.write'
export const INSTALLATION_READ_ACTION = 'installation_job.read'
export const INSTALLATION_READ_PERMISSION = 'installation.read'
export const INSTALLATION_ACTION = INSTALLATION_UPDATE_ACTION
export const INSTALLATION_PERMISSION = INSTALLATION_UPDATE_PERMISSION
export const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'
export const MAX_BODY_BYTES = 64 * 1024

const UPDATE_REQUEST_FIELDS = Object.freeze(new Set([
  'action',
  'request_id',
  'expected_updated_at',
  'payload',
]))

const READ_REQUEST_FIELDS = Object.freeze(new Set([
  'action',
  'request_id',
  'payload',
]))

const UPDATE_PAYLOAD_FIELDS = Object.freeze(new Set([
  'job_id',
  'idempotency_key',
  'patch',
]))

const READ_PAYLOAD_FIELDS = Object.freeze(new Set([
  'job_id',
]))

const PATCH_FIELDS = Object.freeze(new Set([
  'title',
  'install_status',
  'installer_name',
  'installer_phone',
  'address',
  'scheduled_at',
  'before_photo_url',
  'after_photo_url',
  'technical_task',
  'tools_required',
  'installer_comment',
]))

export type JsonObject = Record<string, unknown>

type ValidationError = {
  ok: false
  code: 'validation_error' | 'unknown_action'
  message: string
}

export type ValidationResult =
  | { ok: true; kind: 'read' | 'update'; request: JsonObject; permissions: string[] }
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

export function preferredEnvironmentKey(primary: unknown, keySet: unknown): string {
  const direct = cleanText(primary, 3000)
  if (direct) return direct
  try {
    return cleanText(asObject(JSON.parse(String(keySet || '')))?.default, 3000)
  } catch {
    return ''
  }
}

export function isJwtApiKey(value: unknown): boolean {
  return cleanText(value, 3000).split('.').length === 3
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

function normalizeNullableText(
  patch: JsonObject,
  key: string,
  max: number,
): { ok: true; value: string | null } | ValidationError {
  const value = patch[key]
  if (value !== null && typeof value !== 'string') {
    return { ok: false, code: 'validation_error', message: `${key} must be a string or null` }
  }
  const raw = typeof value === 'string' ? value.trim() : ''
  if (raw.length > max) {
    return { ok: false, code: 'validation_error', message: `${key} is too long` }
  }
  return { ok: true, value: raw || null }
}

function validateReadRequest(request: JsonObject): ValidationResult {
  if (!hasOnlyFields(request, READ_REQUEST_FIELDS)) {
    return { ok: false, code: 'validation_error', message: 'Invalid read request envelope' }
  }
  if (!validUuid(request.request_id)) {
    return { ok: false, code: 'validation_error', message: 'request_id must be UUID' }
  }
  const payload = asObject(request.payload)
  if (!payload || !hasOnlyFields(payload, READ_PAYLOAD_FIELDS) || !validUuid(payload.job_id)) {
    return { ok: false, code: 'validation_error', message: 'Read payload requires job_id UUID' }
  }
  return {
    ok: true,
    kind: 'read',
    permissions: [INSTALLATION_READ_PERMISSION],
    request: {
      action: INSTALLATION_READ_ACTION,
      request_id: cleanText(request.request_id, 80),
      payload: { job_id: cleanText(payload.job_id, 80) },
    },
  }
}

function validateUpdateRequest(request: JsonObject): ValidationResult {
  if (!hasOnlyFields(request, UPDATE_REQUEST_FIELDS)) {
    return { ok: false, code: 'validation_error', message: 'Invalid update request envelope' }
  }
  if (!validUuid(request.request_id)) {
    return { ok: false, code: 'validation_error', message: 'request_id must be UUID' }
  }
  if (!validIsoDateTime(request.expected_updated_at)) {
    return { ok: false, code: 'validation_error', message: 'expected_updated_at is invalid' }
  }

  const payload = asObject(request.payload)
  if (!payload || !hasOnlyFields(payload, UPDATE_PAYLOAD_FIELDS)) {
    return { ok: false, code: 'validation_error', message: 'Invalid business payload' }
  }
  if (!validUuid(payload.job_id)) {
    return { ok: false, code: 'validation_error', message: 'job_id must be UUID' }
  }
  if (typeof payload.idempotency_key !== 'string') {
    return { ok: false, code: 'validation_error', message: 'idempotency_key must be a string' }
  }
  const idempotencyKey = payload.idempotency_key.trim()
  if (!idempotencyKey || idempotencyKey.length > 160) {
    return { ok: false, code: 'validation_error', message: 'idempotency_key must contain 1 to 160 characters' }
  }

  const patch = asObject(payload.patch)
  if (!patch || Object.keys(patch).length === 0 || !hasOnlyFields(patch, PATCH_FIELDS)) {
    return { ok: false, code: 'validation_error', message: 'patch must be a non-empty allowlisted object' }
  }

  const normalizedPatch: JsonObject = {}
  for (const [key, max] of [
    ['installer_name', 500],
    ['installer_phone', 120],
    ['address', 2000],
    ['before_photo_url', 2000],
    ['after_photo_url', 2000],
    ['technical_task', 12000],
    ['tools_required', 8000],
    ['installer_comment', 8000],
  ] as const) {
    if (!(key in patch)) continue
    const normalized = normalizeNullableText(patch, key, max)
    if (!normalized.ok) return normalized
    normalizedPatch[key] = normalized.value
  }

  if ('title' in patch) {
    if (typeof patch.title !== 'string') {
      return { ok: false, code: 'validation_error', message: 'title must be a string' }
    }
    const title = patch.title.trim()
    if (!title || title.length > 500) {
      return { ok: false, code: 'validation_error', message: 'title must contain 1 to 500 characters' }
    }
    normalizedPatch.title = title
  }

  if ('install_status' in patch) {
    if (typeof patch.install_status !== 'string') {
      return { ok: false, code: 'validation_error', message: 'install_status must be a string' }
    }
    const status = patch.install_status.trim()
    if (!status || status.length > 120) {
      return { ok: false, code: 'validation_error', message: 'install_status must contain 1 to 120 characters' }
    }
    normalizedPatch.install_status = status
  }

  if ('scheduled_at' in patch) {
    if (patch.scheduled_at !== null && !validIsoDateTime(patch.scheduled_at)) {
      return { ok: false, code: 'validation_error', message: 'scheduled_at must be ISO datetime or null' }
    }
    normalizedPatch.scheduled_at = patch.scheduled_at === null ? null : cleanText(patch.scheduled_at, 80)
  }

  return {
    ok: true,
    kind: 'update',
    permissions: [INSTALLATION_UPDATE_PERMISSION],
    request: {
      action: INSTALLATION_UPDATE_ACTION,
      request_id: cleanText(request.request_id, 80),
      expected_updated_at: cleanText(request.expected_updated_at, 80),
      payload: {
        job_id: cleanText(payload.job_id, 80),
        idempotency_key: idempotencyKey,
        patch: normalizedPatch,
      },
    },
  }
}

export function validateInstallationRequest(value: unknown): ValidationResult {
  const request = asObject(value)
  if (!request) return { ok: false, code: 'validation_error', message: 'Invalid request envelope' }
  const action = cleanText(request.action, 80)
  if (action === INSTALLATION_READ_ACTION) return validateReadRequest(request)
  if (action === INSTALLATION_UPDATE_ACTION) return validateUpdateRequest(request)
  return { ok: false, code: 'unknown_action', message: 'Unsupported action' }
}

export function rpcStatus(code: unknown): number {
  switch (cleanText(code, 80)) {
    case 'validation_error':
    case 'unknown_action':
      return 400
    case 'forbidden':
      return 403
    case 'not_found':
      return 404
    case 'conflict':
    case 'invalid_transition':
    case 'duplicate_request':
      return 409
    default:
      return 500
  }
}
