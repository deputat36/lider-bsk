export const DESIGN_EDGE_CONTRACT_VERSION = 'leader-crm-design-edge-v1'
export const DESIGN_ACTION = 'design_task.create_from_order'
export const DESIGN_PERMISSION = 'design.write'
export const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'

export const DESIGN_WRITE_ROLES = Object.freeze(new Set([
  'owner',
  'admin',
  'manager',
  'designer',
]))

const REQUEST_FIELDS = Object.freeze(new Set([
  'action',
  'request_id',
  'expected_updated_at',
  'payload',
]))

const PAYLOAD_FIELDS = Object.freeze(new Set([
  'order_id',
  'production_job_id',
  'idempotency_key',
  'need_ids',
  'task',
]))

const TASK_FIELDS = Object.freeze(new Set([
  'title',
  'priority',
  'deadline',
  'task_text',
  'reference_link',
]))

export type JsonObject = Record<string, unknown>

export type ValidationResult =
  | { ok: true; request: JsonObject }
  | { ok: false; code: 'validation_error' | 'unknown_action'; message: string }

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

export function canWriteDesign(role: unknown): boolean {
  return DESIGN_WRITE_ROLES.has(normalizeRole(role))
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

function validIsoDateTime(value: unknown): boolean {
  const raw = cleanText(value, 80)
  return Boolean(raw && Number.isFinite(Date.parse(raw)))
}

export function validateDesignRequest(value: unknown): ValidationResult {
  const request = asObject(value)
  if (!request || !hasOnlyFields(request, REQUEST_FIELDS)) {
    return { ok: false, code: 'validation_error', message: 'Invalid request envelope' }
  }

  if (cleanText(request.action, 80) !== DESIGN_ACTION) {
    return { ok: false, code: 'unknown_action', message: 'Unsupported action' }
  }
  if (!validUuid(request.request_id)) {
    return { ok: false, code: 'validation_error', message: 'request_id must be UUID' }
  }
  if (!validIsoDateTime(request.expected_updated_at)) {
    return { ok: false, code: 'validation_error', message: 'expected_updated_at is invalid' }
  }

  const payload = asObject(request.payload)
  if (!payload || !hasOnlyFields(payload, PAYLOAD_FIELDS)) {
    return { ok: false, code: 'validation_error', message: 'Invalid business payload' }
  }
  if (!validUuid(payload.order_id)) {
    return { ok: false, code: 'validation_error', message: 'order_id must be UUID' }
  }
  if (payload.production_job_id !== undefined && payload.production_job_id !== null && cleanText(payload.production_job_id, 80) !== '' && !validUuid(payload.production_job_id)) {
    return { ok: false, code: 'validation_error', message: 'production_job_id must be UUID or null' }
  }

  const idempotencyKey = cleanText(payload.idempotency_key, 180)
  if (!idempotencyKey || idempotencyKey.length > 180) {
    return { ok: false, code: 'validation_error', message: 'idempotency_key is required' }
  }

  if (!Array.isArray(payload.need_ids) || payload.need_ids.length === 0 || payload.need_ids.some((item) => !validUuid(item))) {
    return { ok: false, code: 'validation_error', message: 'need_ids must be a non-empty UUID array' }
  }
  if (new Set(payload.need_ids.map((item) => cleanText(item, 80).toLowerCase())).size !== payload.need_ids.length) {
    return { ok: false, code: 'validation_error', message: 'need_ids must be unique' }
  }

  const task = asObject(payload.task)
  if (!task || !hasOnlyFields(task, TASK_FIELDS)) {
    return { ok: false, code: 'validation_error', message: 'Task contains unknown or server-owned fields' }
  }
  if (!cleanText(task.title, 300)) {
    return { ok: false, code: 'validation_error', message: 'Task title is required' }
  }
  if (task.deadline !== undefined && task.deadline !== null && cleanText(task.deadline, 80) !== '' && !validIsoDateTime(task.deadline)) {
    return { ok: false, code: 'validation_error', message: 'Task deadline is invalid' }
  }

  return {
    ok: true,
    request: {
      action: DESIGN_ACTION,
      request_id: cleanText(request.request_id, 80),
      expected_updated_at: cleanText(request.expected_updated_at, 80),
      payload: {
        order_id: cleanText(payload.order_id, 80),
        production_job_id: cleanText(payload.production_job_id, 80) || null,
        idempotency_key: idempotencyKey,
        need_ids: payload.need_ids.map((item) => cleanText(item, 80)),
        task: {
          title: cleanText(task.title, 300),
          priority: cleanText(task.priority, 80) || null,
          deadline: cleanText(task.deadline, 80) || null,
          task_text: cleanText(task.task_text, 6000) || null,
          reference_link: cleanText(task.reference_link, 1000) || null,
        },
      },
    },
  }
}

export function rpcStatus(code: unknown): number {
  switch (cleanText(code, 80)) {
    case 'validation_error':
    case 'unknown_action':
      return 400
    case 'access_denied':
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
