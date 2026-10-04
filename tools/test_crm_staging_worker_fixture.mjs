import test from 'node:test';
import assert from 'node:assert/strict';
import { workerFixtureTools } from '../supabase/staging-functions/leader-staging-authenticated-e2e-bootstrap/worker-fixture.mjs';
import { roleBrowserSource } from './run_crm_staging_authenticated_e2e.mjs';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const marker = 'SYNTH-CRM-E2E-123-1-test', runKey = '123:1';
function harness({ run = runKey, role = 'manager', orderOwner = 'user', reviewed = true, ready = true } = {}) {
  const writes = [];
  const order = { id: 'order', owner_id: orderOwner, updated_at: '2030-01-01Z' };
  const service = async (url, init) => {
    if (init) { writes.push({ url, init }); return { ok: true, body: [order] }; }
    let body = [];
    if (url.includes('leader_user_profiles')) body = [{ user_id: 'user', role, is_active: true, permissions: { run_key: run, synthetic_marker: marker } }];
    if (url.includes('leader_orders')) body = [order];
    if (url.includes('leader_design_tasks')) body = [{ id: 'task', task_status: reviewed ? 'На согласовании' : 'В работе', layout_link: 'https://example.invalid/worker-layout', updated_at: '2030-01-01Z' }];
    if (url.includes('leader_production_jobs')) body = [{ id: 'production', production_status: ready ? 'Готово' : 'В производстве' }];
    return { ok: true, body };
  };
  const rpc = async (name, args) => { writes.push({ name, args }); return { ok: true, body: { ok: true, entity: { id: 'created' } } }; };
  return { tools: workerFixtureTools({ service, rpc, inspect: async () => ({ user_id: 'user', lead_id: 'lead' }) }), writes };
}
test('a signed run cannot target another synthetic run', async () => {
  const { tools, writes } = harness({ run: '124:1' });
  await assert.rejects(tools.prepare(marker, runKey), /run_binding/);
  await assert.rejects(tools.active(marker, runKey, false), /run_binding/);
  assert.equal(writes.length, 0);
});
test('worker orchestration rejects worker role, foreign owner, unfinished design and production before mutation', async () => {
  for (const [options, target, code] of [[{ role: 'designer' }, 'production', /manager_required/], [{ orderOwner: 'foreign' }, 'production', /order_binding/], [{ reviewed: false }, 'production', /design_not_reviewed/], [{ ready: false }, 'installation', /production_not_ready/]]) {
    const { tools, writes } = harness(options);
    await assert.rejects(tools.advance(marker, runKey, target), code);
    assert.equal(writes.length, 0);
  }
});
test('approved handoff uses canonical commands, fresh revisions and no planned prices', async () => {
  const { tools, writes } = harness();
  assert.equal((await tools.advance(marker, runKey, 'production')).worker_production_id, 'created');
  assert.deepEqual(writes.map(value => value.args.p_payload.request.action), ['design_task.transition', 'production_job.create_from_order']);
  assert.equal(writes[1].args.p_payload.actor_id, 'user');
  assert.equal(writes[1].args.p_payload.request.expected_updated_at, '2030-01-01Z');
  assert.equal('contractor_cost' in writes[1].args.p_payload.request.payload.job, false);
  const installation = harness();
  await installation.tools.advance(marker, runKey, 'installation');
  const job = installation.writes[0].args.p_payload.request.payload.job;
  assert.equal('installer_cost' in job || 'client_price' in job, false);
});
test('active switch accepts an explicit boolean only', async () => {
  const { tools, writes } = harness();
  await assert.rejects(tools.active(marker, runKey, 'false'), /active_invalid/);
  assert.equal(writes.length, 0);
  await tools.active(marker, runKey, false);
  assert.equal(JSON.parse(writes[0].init.body).is_active, false);
});
test('all worker browser programs parse as modules and enforce the selected synthetic order', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'worker-source-'));
  try {
    for (const role of ['designer', 'contractor', 'installer']) {
      const source = roleBrowserSource(role, true), file = path.join(dir, role + '.mjs');
      assert.match(source, /worker_read_binding/);
      assert.match(source, /worker_actions:true/);
      await writeFile(file, source);
      execFileSync(process.execPath, ['--check', file]);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
