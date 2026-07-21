import {
  PRODUCTION_ACTION,
  PRODUCTION_PERMISSION,
  STAGING_PROJECT_REF,
  isJwtApiKey,
  preferredEnvironmentKey,
  projectRefFromUrl,
  rpcStatus,
  validateProductionJobUpdateRequest,
} from './contract.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    action: PRODUCTION_ACTION,
    request_id: '81000000-0000-4000-8000-000000000001',
    expected_updated_at: '2026-07-21T12:00:00.000Z',
    payload: {
      job_id: '81000000-0000-4000-8000-000000000002',
      idempotency_key: 'production-job:update:test:v1',
      patch: {
        title: 'Производственное задание',
        production_status: 'В очереди',
        layout_status: 'На согласовании',
        priority: 'Высокая',
        deadline: '2026-07-25T12:00:00.000Z',
        file_url: 'https://example.test/layout.pdf',
        technical_task: 'Тестовое техническое задание',
        contractor_comment: 'Комментарий производству',
        internal_comment: 'Внутренний комментарий',
      },
    },
    ...overrides,
  }
}

Deno.test('production permission and staging ref are canonical', () => {
  assert(PRODUCTION_PERMISSION === 'production.write', 'permission drifted')
  assert(projectRefFromUrl(`https://${STAGING_PROJECT_REF}.supabase.co`) === STAGING_PROJECT_REF, 'staging ref drifted')
  assert(projectRefFromUrl('not-a-url') === '', 'invalid URL must fail closed')
})

Deno.test('environment key helpers support legacy and modern keys', () => {
  assert(preferredEnvironmentKey('legacy-key', '') === 'legacy-key', 'direct key must win')
  assert(preferredEnvironmentKey('', JSON.stringify({ default: 'publishable-key' })) === 'publishable-key', 'key set fallback failed')
  assert(preferredEnvironmentKey('', 'bad-json') === '', 'invalid key set must fail closed')
  assert(isJwtApiKey('a.b.c'), 'legacy JWT key detection failed')
  assert(!isJwtApiKey('sb_secret_example'), 'modern secret key must not be treated as JWT')
})

Deno.test('valid production update request is minimized', () => {
  const result = validateProductionJobUpdateRequest(request())
  assert(result.ok, 'valid request rejected')
  assert(result.request.action === PRODUCTION_ACTION, 'action drifted')
  const payload = result.request.payload as Record<string, unknown>
  assert(Object.keys(payload).sort().join(',') === 'idempotency_key,job_id,patch', 'payload projection drifted')
  const patch = payload.patch as Record<string, unknown>
  assert(Object.keys(patch).sort().join(',') === [
    'contractor_comment',
    'deadline',
    'file_url',
    'internal_comment',
    'layout_status',
    'priority',
    'production_status',
    'technical_task',
    'title',
  ].join(','), 'patch projection drifted')
})

Deno.test('browser actor and server-owned fields are rejected', () => {
  const actor = validateProductionJobUpdateRequest({
    ...request(),
    actor_id: '81000000-0000-4000-8000-000000000003',
  })
  assert(!actor.ok && actor.code === 'validation_error', 'browser actor accepted')

  const base = request()
  const payload = base.payload as Record<string, unknown>
  const patch = payload.patch as Record<string, unknown>
  for (const field of [
    'owner_id',
    'order_id',
    'created_by',
    'updated_at',
    'sent_to_contractor_at',
    'ready_at',
    'issued_at',
    'contractor_cost',
    'client_total',
  ]) {
    const result = validateProductionJobUpdateRequest({
      ...base,
      payload: { ...payload, patch: { ...patch, [field]: 'forbidden' } },
    })
    assert(!result.ok && result.code === 'validation_error', `${field} accepted`)
  }
})

Deno.test('IDs timestamps deadline and lengths fail closed', () => {
  assert(!validateProductionJobUpdateRequest({ ...request(), request_id: 'bad' }).ok, 'bad request id accepted')
  assert(!validateProductionJobUpdateRequest({ ...request(), expected_updated_at: 'bad' }).ok, 'bad expected timestamp accepted')

  const base = request()
  const payload = base.payload as Record<string, unknown>
  const patch = payload.patch as Record<string, unknown>
  assert(!validateProductionJobUpdateRequest({ ...base, payload: { ...payload, job_id: 'bad' } }).ok, 'bad job id accepted')
  assert(!validateProductionJobUpdateRequest({ ...base, payload: { ...payload, idempotency_key: 'x'.repeat(161) } }).ok, 'long idempotency key accepted')
  assert(!validateProductionJobUpdateRequest({ ...base, payload: { ...payload, patch: {} } }).ok, 'empty patch accepted')
  assert(!validateProductionJobUpdateRequest({ ...base, payload: { ...payload, patch: { ...patch, title: '' } } }).ok, 'empty title accepted')
  assert(!validateProductionJobUpdateRequest({ ...base, payload: { ...payload, patch: { ...patch, deadline: 'bad' } } }).ok, 'bad deadline accepted')
  assert(!validateProductionJobUpdateRequest({ ...base, payload: { ...payload, patch: { ...patch, technical_task: 'x'.repeat(12001) } } }).ok, 'long task accepted')
  assert(!validateProductionJobUpdateRequest({ ...base, payload: { ...payload, patch: { ...patch, internal_comment: 42 } } }).ok, 'non-string internal comment accepted')
})

Deno.test('nullable patch fields are normalized without actor data', () => {
  const base = request()
  const payload = base.payload as Record<string, unknown>
  const result = validateProductionJobUpdateRequest({
    ...base,
    payload: {
      ...payload,
      patch: {
        deadline: null,
        file_url: '   ',
        contractor_comment: null,
        internal_comment: '  note  ',
      },
    },
  })
  assert(result.ok, 'nullable patch rejected')
  const patch = (result.request.payload as Record<string, unknown>).patch as Record<string, unknown>
  assert(patch.deadline === null, 'deadline null drifted')
  assert(patch.file_url === null, 'empty file URL must normalize to null')
  assert(patch.contractor_comment === null, 'comment null drifted')
  assert(patch.internal_comment === 'note', 'internal comment normalization failed')
  assert(!('actor_id' in result.request), 'actor must not enter validated request')
})

Deno.test('unknown action and response statuses are stable', () => {
  const unknown = validateProductionJobUpdateRequest({ ...request(), action: 'production_job.delete' })
  assert(!unknown.ok && unknown.code === 'unknown_action', 'unknown action code drifted')
  assert(rpcStatus('validation_error') === 400, 'validation status drifted')
  assert(rpcStatus('forbidden') === 403, 'forbidden status drifted')
  assert(rpcStatus('not_found') === 404, 'not-found status drifted')
  assert(rpcStatus('conflict') === 409, 'conflict status drifted')
  assert(rpcStatus('invalid_transition') === 409, 'transition status drifted')
  assert(rpcStatus('persistence_failed') === 500, 'failure status drifted')
})
