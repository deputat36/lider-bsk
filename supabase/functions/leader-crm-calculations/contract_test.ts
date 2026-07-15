import {
  CALCULATION_ACTION,
  MAX_CALCULATION_ITEMS,
  STAGING_PROJECT_REF,
  canWriteCalculation,
  projectRefFromUrl,
  rpcStatus,
  validateCalculationRequest,
} from './contract.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function item(overrides: Record<string, unknown> = {}) {
  return {
    catalog_id: null,
    category: 'Печать',
    item_type: 'Изготовление',
    name: 'Баннер 1×2 м',
    unit: 'м²',
    qty: 2,
    contractor_price: 400,
    client_price: 700,
    comment: 'Тестовая строка',
    data: { calculation_mode: 'banner' },
    sort_order: 0,
    ...overrides,
  }
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    action: CALCULATION_ACTION,
    request_id: '11111111-1111-4111-8111-111111111111',
    expected_updated_at: '2026-07-15T12:00:00.000Z',
    payload: {
      source_calculation_id: '22222222-2222-4222-8222-222222222222',
      idempotency_key: 'calculation-version:test:v1',
      title: 'Расчёт — новая версия',
      need_id: null,
      public_comment: 'Комментарий для клиента',
      internal_comment: 'Внутренний комментарий',
      items: [item()],
    },
    ...overrides,
  }
}

Deno.test('staging URL resolves exact project ref', () => {
  assert(projectRefFromUrl(`https://${STAGING_PROJECT_REF}.supabase.co`) === STAGING_PROJECT_REF, 'project ref mismatch')
  assert(projectRefFromUrl('not-a-url') === '', 'invalid URL must fail closed')
})

Deno.test('canonical calculation-write roles are allowed', () => {
  for (const role of ['owner', 'admin', 'manager']) {
    assert(canWriteCalculation(role), `${role} must be allowed`)
  }
  for (const role of ['designer', 'accountant', 'installer', 'contractor', 'production', '', 'unknown']) {
    assert(!canWriteCalculation(role), `${role} must be denied`)
  }
})

Deno.test('valid request is minimized and server totals are absent', () => {
  const result = validateCalculationRequest(request())
  assert(result.ok, 'valid request rejected')
  assert(result.request.action === CALCULATION_ACTION, 'action drifted')
  const payload = result.request.payload as Record<string, unknown>
  const rows = payload.items as Record<string, unknown>[]
  assert(rows.length === 1, 'item projection failed')
  assert(Object.keys(rows[0]).sort().join(',') === 'catalog_id,category,client_price,comment,contractor_price,data,item_type,name,qty,sort_order,unit', 'item projection is not minimal')
  for (const forbidden of ['contractor_sum', 'client_sum', 'profit', 'margin_percent', 'markup_percent', 'calculation_id', 'lead_id']) {
    assert(!(forbidden in rows[0]), `${forbidden} leaked into client item projection`)
  }
})

Deno.test('server-owned envelope and payload fields are rejected', () => {
  const envelope = validateCalculationRequest({ ...request(), actor_id: '33333333-3333-4333-8333-333333333333' })
  assert(!envelope.ok && envelope.code === 'invalid_payload', 'browser actor must be rejected')

  const base = request()
  const payload = base.payload as Record<string, unknown>
  for (const forbidden of ['version_number', 'status', 'commercial_offer_id', 'order_id', 'client_total', 'profit']) {
    const result = validateCalculationRequest({ ...base, payload: { ...payload, [forbidden]: forbidden === 'version_number' ? 9 : 'forbidden' } })
    assert(!result.ok && result.code === 'invalid_payload', `${forbidden} must be rejected`)
  }
})

Deno.test('server-derived item fields are rejected', () => {
  const base = request()
  const payload = base.payload as Record<string, unknown>
  const result = validateCalculationRequest({
    ...base,
    payload: {
      ...payload,
      items: [item({ client_sum: 1400, profit: 600 })],
    },
  })
  assert(!result.ok && result.code === 'invalid_item', 'server-derived item fields must fail validation')
})

Deno.test('invalid IDs timestamps quantities prices and nulls fail closed', () => {
  assert(!validateCalculationRequest({ ...request(), request_id: 'bad' }).ok, 'bad request id accepted')
  assert(!validateCalculationRequest({ ...request(), expected_updated_at: 'bad' }).ok, 'bad timestamp accepted')

  const base = request()
  const payload = base.payload as Record<string, unknown>
  assert(!validateCalculationRequest({ ...base, payload: { ...payload, source_calculation_id: 'bad' } }).ok, 'bad source id accepted')
  assert(!validateCalculationRequest({ ...base, payload: { ...payload, items: [item({ qty: 0 })] } }).ok, 'zero qty accepted')
  assert(!validateCalculationRequest({ ...base, payload: { ...payload, items: [item({ contractor_price: -1 })] } }).ok, 'negative contractor price accepted')
  assert(!validateCalculationRequest({ ...base, payload: { ...payload, items: [item({ client_price: -1 })] } }).ok, 'negative client price accepted')
  assert(!validateCalculationRequest({ ...base, payload: { ...payload, items: [item({ contractor_price: null })] } }).ok, 'null contractor price accepted')
  assert(!validateCalculationRequest({ ...base, payload: { ...payload, items: [item({ client_price: null })] } }).ok, 'null client price accepted')
})

Deno.test('empty oversized lists and oversized idempotency keys are rejected', () => {
  const base = request()
  const payload = base.payload as Record<string, unknown>
  const empty = validateCalculationRequest({ ...base, payload: { ...payload, items: [] } })
  assert(!empty.ok && empty.code === 'empty_items', 'empty rows accepted')

  const oversized = validateCalculationRequest({
    ...base,
    payload: { ...payload, items: Array.from({ length: MAX_CALCULATION_ITEMS + 1 }, (_, index) => item({ sort_order: index })) },
  })
  assert(!oversized.ok && oversized.code === 'invalid_payload', 'oversized rows accepted')

  const longKey = validateCalculationRequest({ ...base, payload: { ...payload, idempotency_key: 'x'.repeat(161) } })
  assert(!longKey.ok && longKey.code === 'invalid_payload', 'oversized idempotency key was truncated instead of rejected')
})

Deno.test('unknown action is stable', () => {
  const result = validateCalculationRequest({ ...request(), action: 'calculation.update' })
  assert(!result.ok && result.code === 'unknown_action', 'unknown action code drifted')
})

Deno.test('RPC error codes map to stable HTTP statuses', () => {
  assert(rpcStatus('invalid_payload') === 400, 'validation status drifted')
  assert(rpcStatus('invalid_item') === 400, 'item status drifted')
  assert(rpcStatus('forbidden') === 403, 'forbidden status drifted')
  assert(rpcStatus('source_calculation_not_found') === 404, 'not-found status drifted')
  assert(rpcStatus('source_changed') === 409, 'source conflict status drifted')
  assert(rpcStatus('idempotency_conflict') === 409, 'idempotency status drifted')
  assert(rpcStatus('version_conflict') === 409, 'version status drifted')
  assert(rpcStatus('duplicate_version_inventory') === 409, 'duplicate inventory status drifted')
  assert(rpcStatus('calculation_version_create_failed') === 500, 'failure status drifted')
})
