import { execFileSync } from 'node:child_process';
import { writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

const env = process.env;
const root = path.join(env.RUNNER_TEMP, 'crm-authenticated-e2e');
const commandPath = path.join(env.RUNNER_TEMP, 'crm-worker-last-command.json');
const assert = (value, code) => { if (!value) throw Error(code); };
async function bootstrap(action, fields = {}) {
  assert(env.BOOTSTRAP_URL === 'https://otulfnouybahfnsycxqn.supabase.co/functions/v1/leader-staging-authenticated-e2e-bootstrap', 'staging_only');
  const response = await fetch(env.BOOTSTRAP_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + env.OIDC_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ action, marker: env.STAGING_CRM_E2E_MARKER, run_key: env.STAGING_CRM_E2E_RUN_KEY, ...fields }) });
  const body = await response.json();
  assert(response.ok && body.ok === true, 'worker_bootstrap:' + action + ':' + (body.error || response.status));
  return body;
}
async function run(script, args, output, workerEnv) {
  // OIDC remains only in the orchestrator. API/browser children need only the synthetic login.
  const childEnv = { ...env, ...workerEnv };
  delete childEnv.OIDC_TOKEN;
  delete childEnv.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  const stdout = execFileSync(process.execPath, [script, ...args], { env: childEnv, encoding: 'utf8', maxBuffer: 1048576, stdio: ['ignore', 'pipe', 'pipe'] });
  await writeFile(path.join(root, output), stdout, { mode: 0o600 });
}
async function main() {
  const fixture = await bootstrap('prepare_workers');
  const workerEnv = { STAGING_CRM_E2E_WORKER_ORDER_ID: fixture.worker_order_id, STAGING_CRM_E2E_WORKER_COMMAND_PATH: commandPath };
  for (const role of ['designer', 'contractor', 'installer']) {
    await bootstrap('set_role', { role: 'manager' });
    const created = role === 'designer' ? fixture : await bootstrap('advance_workers', { target: role === 'contractor' ? 'production' : 'installation' });
    workerEnv.STAGING_CRM_E2E_WORKER_ENTITY_ID = role === 'designer' ? created.worker_task_id : role === 'contractor' ? created.worker_production_id : created.worker_installation_id;
    workerEnv.STAGING_CRM_E2E_EXPECTED_ROLE = role;
    await bootstrap('set_role', { role });
    await run('tools/run_crm_staging_worker_role_api.mjs', [], role + '-api.json', workerEnv);
    await bootstrap('set_worker_active', { active: false });
    try { await run('tools/run_crm_staging_worker_role_api.mjs', ['--replay-denied'], role + '-inactive.json', workerEnv); }
    finally { await bootstrap('set_worker_active', { active: true }); }
    workerEnv.STAGING_CRM_E2E_EVIDENCE_PATH = path.join(root, role + '-ui.json');
    await run('tools/run_crm_staging_authenticated_e2e.mjs', ['--mode=worker-ui'], role + '-ui.log', workerEnv);
    const evidence = JSON.parse(await readFile(workerEnv.STAGING_CRM_E2E_EVIDENCE_PATH, 'utf8'));
    assert(evidence.status === 'passed' && evidence.worker_actions === true && evidence.authenticated === true && evidence.ui_allowed_controls === true && evidence.ui_forbidden_controls === true, 'worker_ui_evidence:' + role);
    console.log(JSON.stringify({ role, positive_api: true, positive_ui: true, inactive_replay_denied: true }));
  }
  await bootstrap('set_role', { role: 'manager' });
  const final = await bootstrap('inspect_workers');
  await writeFile(path.join(root, 'worker-completion.json'), JSON.stringify(final), { mode: 0o600 });
}
main().catch(error => { console.error(JSON.stringify({ ok: false, error: String(error.message).slice(0,240) })); process.exitCode = 1; }).finally(() => rm(commandPath, { force: true }));
