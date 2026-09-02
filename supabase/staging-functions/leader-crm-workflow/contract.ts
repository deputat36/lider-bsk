export const WORKFLOW_EDGE_CONTRACT_VERSION = 'leader-crm-workflow-edge-v1'
export const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'
export const WORKFLOW_ACTION_PERMISSION = Object.freeze({
  'offer.transition': 'offers.transition',
  'design_task.transition': 'design.write',
  'calculation.create_initial': 'calculations.write',
})

export type JsonObject = Record<string, unknown>
export function object(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null
}
export function text(value: unknown, max = 1000): string { return String(value ?? '').trim().slice(0, max) }
export function projectRef(value: string): string { try { return new URL(value).hostname.split('.')[0] || '' } catch { return '' } }
export function validUuid(value: unknown): boolean {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())
}
function only(value: JsonObject, fields: string[]): boolean { return Object.keys(value).every((key) => fields.includes(key)) }
export function validateWorkflowRequest(value: unknown) {
  const request = object(value)
  const action = text(request?.action, 80)
  const payload = object(request?.payload)
  const permission = WORKFLOW_ACTION_PERMISSION[action as keyof typeof WORKFLOW_ACTION_PERMISSION]
  if (!request || !only(request, ['action','request_id','expected_updated_at','payload'])
      || !permission || !validUuid(request.request_id)
      || !Number.isFinite(Date.parse(text(request.expected_updated_at, 80))) || !payload) {
    return { ok: false as const, code: permission ? 'validation_error' : 'unknown_action' }
  }
  if (!text(payload.idempotency_key, 160)) return { ok: false as const, code: 'validation_error' }
  if (action === 'offer.transition') {
    if (!only(payload, ['offer_id','idempotency_key','status'])
        || !validUuid(payload.offer_id) || !['Отправлено','Согласовано','Отклонено'].includes(text(payload.status, 80))) {
      return { ok: false as const, code: 'validation_error' }
    }
  } else if (action === 'design_task.transition' && (!only(payload, ['task_id','idempotency_key','status','layout_link'])
      || !validUuid(payload.task_id) || !['В работе','На согласовании','Согласовано'].includes(text(payload.status, 80))
      || text(payload.layout_link, 2001).length > 2000)) {
    return { ok: false as const, code: 'validation_error' }
  } else if (action === 'calculation.create_initial') {
    const items = Array.isArray(payload.items) ? payload.items : []
    if (!only(payload, ['lead_id','need_id','idempotency_key','title','public_comment','internal_comment','items'])
        || !validUuid(payload.lead_id) || !validUuid(payload.need_id)
        || !text(payload.title, 500) || items.length < 1 || items.length > 200) {
      return { ok: false as const, code: 'validation_error' }
    }
  }
  return { ok: true as const, action, permission, request }
}

export function statusFor(code: unknown): number {
  switch (text(code, 80)) {
    case 'validation_error': case 'unknown_action': return 400
    case 'forbidden': return 403
    case 'not_found': return 404
    case 'conflict': case 'duplicate_request': case 'invalid_transition': return 409
    default: return 500
  }
}
