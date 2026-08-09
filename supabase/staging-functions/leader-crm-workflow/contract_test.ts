import { assertEquals } from 'jsr:@std/assert@1'
import { validateWorkflowRequest } from './contract.ts'

const base = {
  request_id: '11111111-1111-4111-8111-111111111111',
  expected_updated_at: '2026-08-09T16:00:00.000Z',
}
Deno.test('accepts offer transition', () => {
  const result = validateWorkflowRequest({ ...base, action: 'offer.transition', payload: {
    offer_id: '22222222-2222-4222-8222-222222222222', idempotency_key: 'offer:sent', status: 'Отправлено',
  } })
  assertEquals(result.ok, true)
})
Deno.test('accepts review without treating it as approved', () => {
  const result = validateWorkflowRequest({ ...base, action: 'design_task.transition', payload: {
    task_id: '22222222-2222-4222-8222-222222222222', idempotency_key: 'design:review', status: 'На согласовании',
  } })
  assertEquals(result.ok, true)
})
Deno.test('rejects server-owned fields via invalid action/payload shape', () => {
  const result = validateWorkflowRequest({ ...base, action: 'design_task.transition', payload: { status: 'Согласовано' } })
  assertEquals(result.ok, false)
})
