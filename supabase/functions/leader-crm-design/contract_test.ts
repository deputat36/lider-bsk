import {
  DESIGN_ACTION,
  STAGING_PROJECT_REF,
  canWriteDesign,
  projectRefFromUrl,
  rpcStatus,
  validateDesignRequest,
} from './contract.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    action: DESIGN_ACTION,
    request_id: '11111111-1111-4111-8111-111111111111',
    expected_updated_at: '2026-07-13T12:00:00.000Z',
    payload: {
      order_id: '22222222-2222-4222-8222-222222222222',
      production_job_id: null,
      idempotency_key: 'design-task:test:v1',
      need_ids: ['33333333-3333-4333-8333-333333333333'],
      task: {
        title: 'Тестовый макет',
        priority: 'Высокий',
        deadline: null,
        task_text: 'Только техническое задание.',
        reference_link: 'https://example.invalid/reference',
      },
    },
    ...overrides,
  }
}

Deno.test('staging URL resolves exact project ref', () => {
  assert(projectRefFromUrl(`https://${STAGING_PROJECT_REF}.supabase.co`) === STAGING_PROJECT_REF, 'project ref mismatch')
  assert(projectRefFromUrl('not-a-url') === '', 'invalid URL must fail closed')
})

Deno.test('canonical design-write roles are allowed', () => {
  for (const role of ['owner', 'admin', 'manager', 'designer']) {
    assert(canWriteDesign(role), `${role} must be allowed`)
  }
  for (const role of ['accountant', 'installer', 'contractor', 'production', '', 'unknown']) {
    assert(!canWriteDesign(role), `${role} must be denied`)
  }
})

Deno.test('valid request is minimized', () => {
  const result = validateDesignRequest(request())
  assert(result.ok, 'valid request rejected')
  assert(result.request.action === DESIGN_ACTION, 'action drifted')
  const payload = result.request.payload as Record<string, unknown>
  const task = payload.task as Record<string, unknown>
  assert(Object.keys(task).sort().join(',') === 'deadline,priority,reference_link,task_text,title', 'task projection is not minimal')
  assert(!('client_name' in task), 'client data leaked')
  assert(!('profit' in task), 'finance data leaked')
})

Deno.test('server-owned fields are rejected', () => {
  const base = request()
  const payload = base.payload as Record<string, unknown>
  const result = validateDesignRequest({
    ...base,
    payload: {
      ...payload,
      task: {
        ...(payload.task as Record<string, unknown>),
        task_status: 'Завершено',
        created_by: '44444444-4444-4444-8444-444444444444',
      },
    },
  })
  assert(!result.ok && result.code === 'validation_error', 'server-owned fields must fail validation')
})

Deno.test('unknown envelope and payload fields are rejected', () => {
  const envelope = validateDesignRequest({ ...request(), actor_id: '44444444-4444-4444-8444-444444444444' })
  assert(!envelope.ok && envelope.code === 'validation_error', 'browser actor must be rejected')

  const base = request()
  const payload = base.payload as Record<string, unknown>
  const business = validateDesignRequest({ ...base, payload: { ...payload, client_total: 999999 } })
  assert(!business.ok && business.code === 'validation_error', 'finance field must be rejected')
})

Deno.test('IDs, timestamps and need uniqueness fail closed', () => {
  assert(!validateDesignRequest({ ...request(), request_id: 'bad' }).ok, 'bad request id accepted')
  assert(!validateDesignRequest({ ...request(), expected_updated_at: 'bad' }).ok, 'bad timestamp accepted')

  const base = request()
  const payload = base.payload as Record<string, unknown>
  const duplicateNeeds = validateDesignRequest({
    ...base,
    payload: {
      ...payload,
      need_ids: [
        '33333333-3333-4333-8333-333333333333',
        '33333333-3333-4333-8333-333333333333',
      ],
    },
  })
  assert(!duplicateNeeds.ok, 'duplicate needs accepted')
})

Deno.test('unknown action is stable', () => {
  const result = validateDesignRequest({ ...request(), action: 'orders.update' })
  assert(!result.ok && result.code === 'unknown_action', 'unknown action code drifted')
})

Deno.test('RPC error codes map to stable HTTP statuses', () => {
  assert(rpcStatus('validation_error') === 400, 'validation status drifted')
  assert(rpcStatus('forbidden') === 403, 'forbidden status drifted')
  assert(rpcStatus('not_found') === 404, 'not-found status drifted')
  assert(rpcStatus('conflict') === 409, 'conflict status drifted')
  assert(rpcStatus('duplicate_request') === 409, 'duplicate status drifted')
  assert(rpcStatus('persistence_failed') === 500, 'persistence status drifted')
})
