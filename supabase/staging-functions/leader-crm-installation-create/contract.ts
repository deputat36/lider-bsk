export const INSTALLATION_CREATE_EDGE_CONTRACT_VERSION = 'leader-crm-installation-create-edge-v1'
export const INSTALLATION_CREATE_ACTION = 'installation_job.create_from_order'
export const INSTALLATION_CREATE_PERMISSION = 'installation.write'
export const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'
export const MAX_BODY_BYTES = 64 * 1024

export type JsonObject = Record<string, unknown>

type ValidationError = {
  ok: false
  code: 'validation_error' | 'unknown_action'
  message: string
}

export type ValidationResult =
  | { ok: true; request: JsonObject; permissions: string[] }
  | ValidationError

const REQUEST_FIELDS = Object.freeze(new Set(['action','request_id','expected_updated_at','payload']))
const PAYLOAD_FIELDS = Object.freeze(new Set(['order_id','production_job_id','idempotency_key','job']))
const JOB_FIELDS = Object.freeze(new Set([
  'title','priority','installer_name','installer_phone','address','scheduled_at',
  'installer_cost','client_price','technical_task','tools_required',
]))

export function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as JsonObject
}

export function cleanText(value: unknown, max = 1000): string {
  return String(value ?? '').trim().slice(0, max)
}

export function projectRefFromUrl(value: string): string {
  try { return new URL(value).hostname.split('.')[0] || '' } catch { return '' }
}

export function preferredEnvironmentKey(primary: unknown, keySet: unknown): string {
  const direct = cleanText(primary, 3000)
  if (direct) return direct
  try { return cleanText(asObject(JSON.parse(String(keySet || '')))?.default, 3000) } catch { return '' }
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

function nullableText(input: JsonObject, key: string, max: number): { ok: true; value: string | null } | ValidationError {
  const value = input[key]
  if (value !== null && value !== undefined && typeof value !== 'string') {
    return { ok: false, code: 'validation_error', message: `${key} must be a string or null` }
  }
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (normalized.length > max) return { ok: false, code: 'validation_error', message: `${key} is too long` }
  return { ok: true, value: normalized || null }
}

function nonNegativeNumber(input: JsonObject, key: string): { ok: true; value: number | null } | ValidationError {
  const value = input[key]
  if (value === null || value === undefined) return { ok: true, value: null }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return { ok: false, code: 'validation_error', message: `${key} must be a non-negative number or null` }
  }
  return { ok: true, value }
}

export function validateInstallationCreateRequest(value: unknown): ValidationResult {
  const request = asObject(value)
  if (!request || !hasOnlyFields(request, REQUEST_FIELDS)) {
    return { ok: false, code: 'validation_error', message: 'Invalid request envelope' }
  }
  if (cleanText(request.action, 80) !== INSTALLATION_CREATE_ACTION) {
    return { ok: false, code: 'unknown_action', message: 'Unsupported action' }
  }
  if (!validUuid(request.request_id)) return { ok: false, code: 'validation_error', message: 'request_id must be UUID' }
  if (!validIsoDateTime(request.expected_updated_at)) {
    return { ok: false, code: 'validation_error', message: 'expected_updated_at is invalid' }
  }

  const payload = asObject(request.payload)
  if (!payload || !hasOnlyFields(payload, PAYLOAD_FIELDS)) {
    return { ok: false, code: 'validation_error', message: 'Invalid business payload' }
  }
  if (!validUuid(payload.order_id)) return { ok: false, code: 'validation_error', message: 'order_id must be UUID' }
  if (!validUuid(payload.production_job_id)) {
    return { ok: false, code: 'validation_error', message: 'production_job_id must be UUID' }
  }
  if (typeof payload.idempotency_key !== 'string') {
    return { ok: false, code: 'validation_error', message: 'idempotency_key must be a string' }
  }
  const idempotencyKey = payload.idempotency_key.trim()
  if (!idempotencyKey || idempotencyKey.length > 180) {
    return { ok: false, code: 'validation_error', message: 'idempotency_key must contain 1 to 180 characters' }
  }

  const job = asObject(payload.job)
  if (!job || !hasOnlyFields(job, JOB_FIELDS)) {
    return { ok: false, code: 'validation_error', message: 'Invalid installation job payload' }
  }
  if (typeof job.title !== 'string' || !job.title.trim() || job.title.trim().length > 500) {
    return { ok: false, code: 'validation_error', message: 'title must contain 1 to 500 characters' }
  }
  const priority = cleanText(job.priority, 80)
  if (!['Обычный','Высокий','Срочно'].includes(priority)) {
    return { ok: false, code: 'validation_error', message: 'priority is invalid' }
  }
  if (typeof job.installer_name !== 'string' || !job.installer_name.trim() || job.installer_name.trim().length > 300) {
    return { ok: false, code: 'validation_error', message: 'installer_name is required' }
  }
  if (typeof job.address !== 'string' || !job.address.trim() || job.address.trim().length > 1000) {
    return { ok: false, code: 'validation_error', message: 'address is required' }
  }
  if (!validIsoDateTime(job.scheduled_at)) {
    return { ok: false, code: 'validation_error', message: 'scheduled_at must be ISO datetime' }
  }

  const installerPhone = nullableText(job, 'installer_phone', 100)
  if (!installerPhone.ok) return installerPhone
  const technicalTask = nullableText(job, 'technical_task', 12000)
  if (!technicalTask.ok) return technicalTask
  const toolsRequired = nullableText(job, 'tools_required', 4000)
  if (!toolsRequired.ok) return toolsRequired
  const installerCost = nonNegativeNumber(job, 'installer_cost')
  if (!installerCost.ok) return installerCost
  const clientPrice = nonNegativeNumber(job, 'client_price')
  if (!clientPrice.ok) return clientPrice

  return {
    ok: true,
    permissions: [INSTALLATION_CREATE_PERMISSION],
    request: {
      action: INSTALLATION_CREATE_ACTION,
      request_id: cleanText(request.request_id, 80),
      expected_updated_at: cleanText(request.expected_updated_at, 80),
      payload: {
        order_id: cleanText(payload.order_id, 80),
        production_job_id: cleanText(payload.production_job_id, 80),
        idempotency_key: idempotencyKey,
        job: {
          title: job.title.trim(),
          priority,
          installer_name: job.installer_name.trim(),
          installer_phone: installerPhone.value,
          address: job.address.trim(),
          scheduled_at: cleanText(job.scheduled_at, 80),
          installer_cost: installerCost.value,
          client_price: clientPrice.value,
          technical_task: technicalTask.value,
          tools_required: toolsRequired.value,
        },
      },
    },
  }
}

export function rpcStatus(code: unknown): number {
  switch (cleanText(code, 80)) {
    case 'validation_error':
    case 'unknown_action': return 400
    case 'forbidden': return 403
    case 'not_found': return 404
    case 'conflict':
    case 'duplicate_request': return 409
    default: return 500
  }
}
