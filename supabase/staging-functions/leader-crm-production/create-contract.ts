import { asObject, cleanText, type JsonObject, type ValidationResult } from './contract.ts'

export const PRODUCTION_CREATE_ACTION = 'production_job.create_from_order'

const REQUEST_FIELDS = Object.freeze(new Set([
  'action',
  'request_id',
  'expected_updated_at',
  'payload',
]))

const PAYLOAD_FIELDS = Object.freeze(new Set([
  'order_id',
  'design_task_id',
  'idempotency_key',
  'job',
]))

const JOB_FIELDS = Object.freeze(new Set([
  'title',
  'priority',
  'deadline',
  'layout_status',
  'file_url',
  'technical_task',
  'contractor_id',
  'contractor_cost',
]))

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

function optionalText(
  input: JsonObject,
  key: string,
  max: number,
): { ok: true; value: string | null } | { ok: false; code: 'validation_error'; message: string } {
  const value = input[key]
  if (value !== null && value !== undefined && typeof value !== 'string') {
    return { ok: false, code: 'validation_error', message: `${key} must be a string or null` }
  }
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (normalized.length > max) {
    return { ok: false, code: 'validation_error', message: `${key} is too long` }
  }
  return { ok: true, value: normalized || null }
}

export function validateProductionCreateRequest(value: unknown): ValidationResult {
  const request = asObject(value)
  if (!request || !hasOnlyFields(request, REQUEST_FIELDS)) {
    return { ok: false, code: 'validation_error', message: 'Invalid request envelope' }
  }
  if (cleanText(request.action, 80) !== PRODUCTION_CREATE_ACTION) {
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
  if (payload.design_task_id !== null && payload.design_task_id !== undefined && !validUuid(payload.design_task_id)) {
    return { ok: false, code: 'validation_error', message: 'design_task_id must be UUID or null' }
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
    return { ok: false, code: 'validation_error', message: 'Invalid production job payload' }
  }
  if (typeof job.title !== 'string' || !job.title.trim() || job.title.trim().length > 500) {
    return { ok: false, code: 'validation_error', message: 'title must contain 1 to 500 characters' }
  }
  if (!['Обычная', 'Высокая', 'Срочно'].includes(cleanText(job.priority, 80))) {
    return { ok: false, code: 'validation_error', message: 'priority is invalid' }
  }
  if (cleanText(job.layout_status, 120) !== 'Макет согласован') {
    return { ok: false, code: 'validation_error', message: 'layout_status must confirm an approved layout' }
  }
  if (job.deadline !== null && job.deadline !== undefined && !validIsoDateTime(job.deadline)) {
    return { ok: false, code: 'validation_error', message: 'deadline must be an ISO datetime or null' }
  }
  if (job.contractor_id !== null && job.contractor_id !== undefined && !validUuid(job.contractor_id)) {
    return { ok: false, code: 'validation_error', message: 'contractor_id must be UUID or null' }
  }
  if (job.contractor_cost !== null && job.contractor_cost !== undefined) {
    if (typeof job.contractor_cost !== 'number' || !Number.isFinite(job.contractor_cost) || job.contractor_cost < 0) {
      return { ok: false, code: 'validation_error', message: 'contractor_cost must be a non-negative number or null' }
    }
  }

  const fileUrl = optionalText(job, 'file_url', 2000)
  if (!fileUrl.ok) return fileUrl
  const technicalTask = optionalText(job, 'technical_task', 12000)
  if (!technicalTask.ok) return technicalTask

  return {
    ok: true,
    permissions: ['production.write'],
    request: {
      action: PRODUCTION_CREATE_ACTION,
      request_id: cleanText(request.request_id, 80),
      expected_updated_at: cleanText(request.expected_updated_at, 80),
      payload: {
        order_id: cleanText(payload.order_id, 80),
        design_task_id: payload.design_task_id == null ? null : cleanText(payload.design_task_id, 80),
        idempotency_key: idempotencyKey,
        job: {
          title: job.title.trim(),
          priority: cleanText(job.priority, 80),
          deadline: job.deadline == null ? null : cleanText(job.deadline, 80),
          layout_status: 'Макет согласован',
          file_url: fileUrl.value,
          technical_task: technicalTask.value,
          contractor_id: job.contractor_id == null ? null : cleanText(job.contractor_id, 80),
          contractor_cost: job.contractor_cost == null ? null : job.contractor_cost,
        },
      },
    },
  }
}
