import fs from 'node:fs/promises'

const endpoint = process.env.PUBLIC_INTAKE_STAGING_ENDPOINT ||
  'https://otulfnouybahfnsycxqn.supabase.co/functions/v1/leader-public-lead-staging'
const runId = `staging-public-intake-${Date.now()}`
const reportPath = process.env.PUBLIC_INTAKE_STAGING_REPORT || 'public-intake-staging-smoke-report.json'

const report = {
  status: 'running',
  endpoint_project: 'otulfnouybahfnsycxqn',
  function: 'leader-public-lead-staging',
  run_id: runId,
  started_at: new Date().toISOString(),
  cases: [],
  request_ids: [],
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
  const text = await response.text()
  let body = null
  try { body = JSON.parse(text) } catch { body = { raw: text.slice(0, 500) } }
  const item = { label, status: response.status, body }
  report.cases.push(item)
  if (payload.request_id) report.request_ids.push(payload.request_id)
  return item
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

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

  report.status = 'passed'
  report.finished_at = new Date().toISOString()
  report.summary = {
    accepted: true,
    duplicate_idempotency: true,
    validation: true,
    honeypot: true,
    phone_rate_limit: true,
  }
} catch (error) {
  report.status = 'failed'
  report.finished_at = new Date().toISOString()
  report.error = error instanceof Error ? error.message : String(error)
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8')
  console.error(report.error)
  process.exit(1)
}

await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8')
console.log(JSON.stringify(report.summary))
