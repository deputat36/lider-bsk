import {
  OFFER_ACTION,
  OFFER_PERMISSION,
  STAGING_PROJECT_REF,
  isJwtApiKey,
  preferredEnvironmentKey,
  projectRefFromUrl,
  rpcStatus,
  validateOfferRequest,
} from './contract.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    action: OFFER_ACTION,
    request_id: '61000000-0000-4000-8000-000000000001',
    expected_updated_at: '2026-07-21T12:00:00.000Z',
    payload: {
      calculation_id: '61000000-0000-4000-8000-000000000002',
      idempotency_key: 'offer:test:v1',
      title: 'Коммерческое предложение',
      valid_until: '2026-08-21',
      extra_comment: 'Тестовый комментарий',
    },
    ...overrides,
  }
}

Deno.test('offer permission and staging ref are canonical', () => {
  assert(OFFER_PERMISSION === 'offers.write', 'permission drifted')
  assert(projectRefFromUrl(`https://${STAGING_PROJECT_REF}.supabase.co`) === STAGING_PROJECT_REF, 'staging ref drifted')
  assert(projectRefFromUrl('not-a-url') === '', 'invalid URL must fail closed')
})

Deno.test('environment key helpers support legacy and new keys', () => {
  assert(preferredEnvironmentKey('legacy-key', '') === 'legacy-key', 'direct key must win')
  assert(preferredEnvironmentKey('', JSON.stringify({ default: 'publishable-key' })) === 'publishable-key', 'key set fallback failed')
  assert(preferredEnvironmentKey('', 'bad-json') === '', 'invalid key set must fail closed')
  assert(isJwtApiKey('a.b.c'), 'legacy JWT key detection failed')
  assert(!isJwtApiKey('sb_secret_example'), 'new secret key must not be treated as JWT')
})

Deno.test('valid offer request is minimized', () => {
  const result = validateOfferRequest(request())
  assert(result.ok, 'valid request rejected')
  assert(result.request.action === OFFER_ACTION, 'action drifted')
  const payload = result.request.payload as Record<string, unknown>
  assert(Object.keys(payload).sort().join(',') === 'calculation_id,extra_comment,idempotency_key,title,valid_until', 'payload projection drifted')
})

Deno.test('browser actor and server fields are rejected', () => {
  const envelope = validateOfferRequest({ ...request(), actor_id: '61000000-0000-4000-8000-000000000003' })
  assert(!envelope.ok && envelope.code === 'invalid_payload', 'browser actor accepted')

  const base = request()
  const payload = base.payload as Record<string, unknown>
  for (const field of ['status', 'offer_number', 'client_total', 'calculation_snapshot']) {
    const result = validateOfferRequest({ ...base, payload: { ...payload, [field]: 'forbidden' } })
    assert(!result.ok && result.code === 'invalid_payload', `${field} accepted`)
  }
})

Deno.test('IDs timestamps dates and lengths fail closed', () => {
  assert(!validateOfferRequest({ ...request(), request_id: 'bad' }).ok, 'bad request id accepted')
  assert(!validateOfferRequest({ ...request(), expected_updated_at: 'bad' }).ok, 'bad timestamp accepted')

  const base = request()
  const payload = base.payload as Record<string, unknown>
  assert(!validateOfferRequest({ ...base, payload: { ...payload, calculation_id: 'bad' } }).ok, 'bad calculation id accepted')
  assert(!validateOfferRequest({ ...base, payload: { ...payload, valid_until: '2026-02-31' } }).ok, 'invalid date accepted')
  assert(!validateOfferRequest({ ...base, payload: { ...payload, idempotency_key: 'x'.repeat(161) } }).ok, 'long idempotency key accepted')
  assert(!validateOfferRequest({ ...base, payload: { ...payload, title: '' } }).ok, 'empty title accepted')
  assert(!validateOfferRequest({ ...base, payload: { ...payload, extra_comment: 'x'.repeat(4001) } }).ok, 'long comment accepted')
})

Deno.test('unknown action and response statuses are stable', () => {
  const unknown = validateOfferRequest({ ...request(), action: 'offer.update' })
  assert(!unknown.ok && unknown.code === 'unknown_action', 'unknown action code drifted')
  assert(rpcStatus('invalid_payload') === 400, 'validation status drifted')
  assert(rpcStatus('forbidden') === 403, 'forbidden status drifted')
  assert(rpcStatus('calculation_not_found') === 404, 'not-found status drifted')
  assert(rpcStatus('idempotency_conflict') === 409, 'conflict status drifted')
  assert(rpcStatus('offer_create_failed') === 500, 'failure status drifted')
})
