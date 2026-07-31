import {
  PRODUCTION_CREATE_ACTION,
  PRODUCTION_CREATE_PERMISSION,
  STAGING_PROJECT_REF,
  validateProductionCreateRequest,
} from './contract.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function validRequest() {
  return {
    action: PRODUCTION_CREATE_ACTION,
    request_id: 'b7312000-0000-4000-8000-000000000001',
    expected_updated_at: '2026-07-31T20:00:00Z',
    payload: {
      order_id: 'b7312000-0000-4000-8000-000000000002',
      design_task_id: 'b7312000-0000-4000-8000-000000000003',
      idempotency_key: 'LIDER-PRODUCTION-CREATE-TEST',
      job: {
        title: 'Баннер 2x1 м',
        priority: 'Высокая',
        deadline: '2026-08-05T12:00:00Z',
        layout_status: 'Макет согласован',
        file_url: 'https://example.invalid/layout.pdf',
        technical_task: 'Печать, люверсы по периметру',
        contractor_id: null,
        contractor_cost: 1700,
      },
    },
  }
}

Deno.test('production create permission and staging ref are canonical', () => {
  assert(PRODUCTION_CREATE_PERMISSION === 'production.write', 'permission drifted')
  assert(STAGING_PROJECT_REF === 'otulfnouybahfnsycxqn', 'staging ref drifted')
})

Deno.test('valid create request normalizes safely', () => {
  const result = validateProductionCreateRequest(validRequest())
  assert(result.ok, 'valid request rejected')
  assert(result.permissions.length === 1 && result.permissions[0] === 'production.write', 'permission mismatch')
  assert(result.request.action === PRODUCTION_CREATE_ACTION, 'action mismatch')
  const payload = result.request.payload as Record<string, unknown>
  const job = payload.job as Record<string, unknown>
  assert(job.contractor_cost === 1700, 'contractor cost lost')
  assert(job.layout_status === 'Макет согласован', 'layout status lost')
})

Deno.test('unknown and server-owned fields are rejected', () => {
  const request = validRequest()
  ;(request.payload.job as Record<string, unknown>).production_status = 'В очереди'
  const result = validateProductionCreateRequest(request)
  assert(!result.ok && result.code === 'validation_error', 'server-owned field accepted')
})

Deno.test('unapproved layout is rejected before transport', () => {
  const request = validRequest()
  request.payload.job.layout_status = 'На согласовании'
  const result = validateProductionCreateRequest(request)
  assert(!result.ok && result.code === 'validation_error', 'unapproved layout accepted')
})

Deno.test('negative contractor cost is rejected', () => {
  const request = validRequest()
  request.payload.job.contractor_cost = -1
  const result = validateProductionCreateRequest(request)
  assert(!result.ok && result.code === 'validation_error', 'negative cost accepted')
})

Deno.test('invalid action is rejected', () => {
  const request = validRequest()
  request.action = 'production_job.update'
  const result = validateProductionCreateRequest(request)
  assert(!result.ok && result.code === 'unknown_action', 'unknown action accepted')
})
