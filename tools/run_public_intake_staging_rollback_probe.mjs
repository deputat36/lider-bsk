import fs from 'node:fs/promises'

const endpoint = 'https://otulfnouybahfnsycxqn.supabase.co/functions/v1/leader-public-lead-staging'
const expectedStatus = Number(process.env.EXPECTED_STATUS || 410)
const expectedError = process.env.EXPECTED_ERROR || 'staging_rollback_locked'
const requestId = `staging-public-intake-${Date.now()}-rollback-probe`
const reportPath = 'public-intake-staging-rollback-probe.json'

const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    origin: 'https://www.lider-bsk.ru',
    'user-agent': 'lider-public-intake-staging-rollback-probe-v1',
  },
  body: JSON.stringify({
    request_id: requestId,
    name: 'Staging Rollback Probe',
    phone: '+7 900 555-04-70',
    message: 'This probe must not create a lead.',
  }),
})

const text = await response.text()
let body = null
try { body = JSON.parse(text) } catch { body = { raw: text.slice(0, 500) } }

const report = {
  status: response.status === expectedStatus && body?.error === expectedError ? 'passed' : 'failed',
  project: 'otulfnouybahfnsycxqn',
  function: 'leader-public-lead-staging',
  expected_status: expectedStatus,
  actual_status: response.status,
  expected_error: expectedError,
  actual_error: body?.error || null,
  request_id: requestId,
  finished_at: new Date().toISOString(),
}

await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8')
if (report.status !== 'passed') {
  console.error(JSON.stringify(report))
  process.exit(1)
}
console.log(JSON.stringify(report))
