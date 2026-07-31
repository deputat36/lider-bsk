import {
  INSTALLATION_CREATE_ACTION,
  INSTALLATION_CREATE_PERMISSION,
  STAGING_PROJECT_REF,
  validateInstallationCreateRequest,
} from './contract.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function validRequest() {
  return {
    action: INSTALLATION_CREATE_ACTION,
    request_id: 'b7314000-0000-4000-8000-000000000001',
    expected_updated_at: '2026-07-31T20:00:00Z',
    payload: {
      order_id: 'b7314000-0000-4000-8000-000000000002',
      production_job_id: 'b7314000-0000-4000-8000-000000000003',
      idempotency_key: 'LIDER-INSTALLATION-CREATE-TEST',
      job: {
        title: 'Монтаж вывески',
        priority: 'Высокий',
        installer_name: 'Монтажник Тестовый',
        installer_phone: '+79990000001',
        address: 'Борисоглебск, тестовый адрес, 1',
        scheduled_at: '2026-08-05T09:00:00Z',
        installer_cost: 1200,
        client_price: 1800,
        technical_task: 'Установить и проверить крепления',
        tools_required: 'Лестница, перфоратор, уровень',
      },
    },
  }
}

Deno.test('installation create permission and staging ref are canonical', () => {
  assert(INSTALLATION_CREATE_PERMISSION === 'installation.write', 'permission drifted')
  assert(STAGING_PROJECT_REF === 'otulfnouybahfnsycxqn', 'staging ref drifted')
})

Deno.test('valid installation create request normalizes safely', () => {
  const result = validateInstallationCreateRequest(validRequest())
  assert(result.ok, 'valid request rejected')
  assert(result.permissions.length === 1 && result.permissions[0] === 'installation.write', 'permission mismatch')
  const payload = result.request.payload as Record<string, unknown>
  const job = payload.job as Record<string, unknown>
  assert(job.installer_cost === 1200, 'installer cost lost')
  assert(job.address === 'Борисоглебск, тестовый адрес, 1', 'address lost')
})

Deno.test('server-owned fields are rejected', () => {
  const request = validRequest()
  ;(request.payload.job as Record<string, unknown>).install_status = 'Выполнен'
  const result = validateInstallationCreateRequest(request)
  assert(!result.ok && result.code === 'validation_error', 'server-owned field accepted')
})

Deno.test('missing address is rejected', () => {
  const request = validRequest()
  request.payload.job.address = ' '
  const result = validateInstallationCreateRequest(request)
  assert(!result.ok && result.code === 'validation_error', 'missing address accepted')
})

Deno.test('missing schedule is rejected', () => {
  const request = validRequest()
  request.payload.job.scheduled_at = 'tomorrow'
  const result = validateInstallationCreateRequest(request)
  assert(!result.ok && result.code === 'validation_error', 'invalid schedule accepted')
})

Deno.test('negative cost is rejected', () => {
  const request = validRequest()
  request.payload.job.installer_cost = -1
  const result = validateInstallationCreateRequest(request)
  assert(!result.ok && result.code === 'validation_error', 'negative cost accepted')
})
