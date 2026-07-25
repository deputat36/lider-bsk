import fs from 'node:fs/promises'

const endpoint = process.env.PUBLIC_INTAKE_STAGING_ENDPOINT ||
  'https://otulfnouybahfnsycxqn.supabase.co/functions/v1/leader-public-lead-staging'
const cleanupEndpoint = process.env.PUBLIC_INTAKE_STAGING_CLEANUP_ENDPOINT ||
  'https://otulfnouybahfnsycxqn.supabase.co/functions/v1/leader-public-lead-staging-cleanup'
const runId = `staging-public-intake-${Date.now()}`
const reportPath = process.env.PUBLIC_INTAKE_STAGING_REPORT || 'public-intake-staging-smoke-report.json'

const report = {
  status: 'running',
  endpoint_project: 'otulfnouybahfnsycxqn',
  function: 'leader-public-lead-staging',
  cleanup_function: 'leader-public-lead-staging-cleanup',
  run_id: runId,
  started_at: new Date().toISOString(),
  cases: [],
  request_ids: [],
}

async function readJson(response) {
  const text = await response.text()
  try { return JSON.parse(text) } catch { return { raw: text.slice(0, 500) } }
}

async function post(label, payload) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://www.lider-bsk.ru',
      'user-agent': 'lider-public-intake-staging-smoke-v1',
    },
    body: JSON.stringify(payload),
  })
  const body = await readJson(response)
  const item = { label, status: response.status, body }
  report.cases.push(item)
  if (payload.request_id) report.request_ids.push(payload.request_id)
  return item
}

async function cleanup(label) {
  const response = await fetch(cleanupEndpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'lider-public-intake-staging-smoke-v1',
    },
    body: JSON.stringify({ run_id: runId }),
  })
  return { label, status: response.status, body: await readJson(response) }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

let failure = null
try {
  const acceptedId = `${runId}-accepted`
  const accepted = await post('accepted', {
    request_id: acceptedId,
    name: 'Staging Smoke',
    phone: '+7 900 555-00-01',
    service: 'Проверка публичной заявки',
    message: 'Синтетическая staging-заявка. Удалить после проверки.',
    city: 'Борисоглебск',
    contact_method: 'Телефон',
  })
  assert(accepted.status === 200 && accepted.body?.ok === true, 'accepted request did not return 200/ok')

  const duplicate = await post('duplicate', {
    request_id: acceptedId,
    name: 'Staging Smoke',
    phone: '+7 900 555-00-01',
    service: 'Проверка публичной заявки',
    message: 'Повтор той же staging-заявки.',
  })
  assert(duplicate.status === 200 && duplicate.body?.ok === true && duplicate.body?.duplicate === true,
    'duplicate request did not use idempotent duplicate path')

  const invalidId = `${runId}-invalid`
  const invalid = await post('validation', { request_id: invalidId, name: 'Staging Smoke' })
  assert(invalid.status === 400 && invalid.body?.error === 'phone_or_message_required',
    'validation case did not return phone_or_message_required')

  const honeypotId = `${runId}-honeypot`
  const honeypot = await post('honeypot', {
    request_id: honeypotId,
    phone: '+7 900 555-00-02',
    message: 'This must not become a lead',
    website: 'bot-filled.example',
  })
  assert(honeypot.status === 200 && honeypot.body?.ok === true, 'honeypot case did not return safe 200')

  const ratePhone = '+7 900 555-09-99'
  const rateCases = []
  for (let index = 1; index <= 6; index += 1) {
    const requestId = `${runId}-rate-${index}`
    rateCases.push(await post(`rate_${index}`, {
      request_id: requestId,
      name: 'Staging Rate Smoke',
      phone: ratePhone,
      service: 'Проверка лимита',
      message: `Синтетическая попытка ${index}. Удалить после проверки.`,
    }))
  }
  for (const item of rateCases.slice(0, 5)) {
    assert(item.status === 200 && item.body?.ok === true, `${item.label} should be accepted before the phone limit`)
  }
  const limited = rateCases[5]
  assert(limited.status === 429 && limited.body?.error === 'rate_limited' && Number(limited.body?.retry_after_seconds) > 0,
    'sixth phone attempt did not return 429 with retry_after_seconds')

  report.summary = {
    accepted: true,
    duplicate_idempotency: true,
    validation: true,
    honeypot: true,
    phone_rate_limit: true,
  }
} catch (error) {
  failure = error instanceof Error ? error : new Error(String(error))
} finally {
  try {
    const firstCleanup = await cleanup('cleanup')
    report.cleanup = firstCleanup
    assert(firstCleanup.status === 200 && firstCleanup.body?.ok === true, 'staging cleanup did not return 200/ok')
    if (!failure) {
      assert(firstCleanup.body?.leads_deleted === 6, 'cleanup did not delete exactly 6 synthetic leads')
      assert(firstCleanup.body?.audit_deleted === 10, 'cleanup did not delete exactly 10 synthetic audit rows')
      assert(firstCleanup.body?.receipts_deleted === 8, 'cleanup did not delete exactly 8 synthetic rate receipts')
    }

    const residueCheck = await cleanup('cleanup_residue_check')
    report.cleanup_residue_check = residueCheck
    assert(residueCheck.status === 200 && residueCheck.body?.ok === true, 'cleanup residue check did not return 200/ok')
    assert(residueCheck.body?.leads_deleted === 0, 'synthetic lead residue remained after cleanup')
    assert(residueCheck.body?.audit_deleted === 0, 'synthetic audit residue remained after cleanup')
    assert(residueCheck.body?.receipts_deleted === 0, 'synthetic rate receipt residue remained after cleanup')
  } catch (cleanupError) {
    if (!failure) failure = cleanupError instanceof Error ? cleanupError : new Error(String(cleanupError))
    report.cleanup_error = cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
  }
}

report.finished_at = new Date().toISOString()
report.status = failure ? 'failed' : 'passed'
if (failure) report.error = failure.message
await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8')

if (failure) {
  console.error(failure.message)
  process.exit(1)
}
console.log(JSON.stringify({ ...report.summary, cleanup: true, residue_zero: true }))
