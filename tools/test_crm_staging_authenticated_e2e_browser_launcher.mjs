#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  browserLaunchPlan,
  operatorPlan
} from './run_crm_staging_authenticated_e2e.mjs';

const plan = browserLaunchPlan({
  xvfbRun: '/usr/bin/xvfb-run',
  chrome: '/usr/bin/google-chrome',
  profileDir: '/tmp/leader-crm-e2e-profile',
  url: 'http://127.0.0.1:43123/index.html?tab=leads'
});

assert.equal(plan.binary, '/usr/bin/xvfb-run');
assert.equal(plan.args[0], '-a');
assert.equal(plan.args[1], '-s');
assert.match(plan.args[2], /1440x1000x24/);
assert.ok(plan.args.includes('/usr/bin/google-chrome'));
assert.ok(plan.args.includes('--disable-background-timer-throttling'));
assert.ok(plan.args.includes('--disable-renderer-backgrounding'));
assert.ok(plan.args.includes('--window-size=1366,900'));
assert.ok(plan.args.includes('--user-data-dir=/tmp/leader-crm-e2e-profile'));
assert.ok(plan.args.includes('http://127.0.0.1:43123/index.html?tab=leads'));
assert.equal(plan.args.some((item) => String(item).startsWith('--headless')), false);

assert.equal(operatorPlan().browser_mode, 'xvfb_headed_chrome');
assert.equal(operatorPlan().browser_transport_bridge, 'same_origin_beacon_to_exact_staging_rpc_with_db_assertion');

const runnerSource = await readFile(new URL('./run_crm_staging_authenticated_e2e.mjs', import.meta.url), 'utf8');
assert.match(runnerSource, /navigator\.sendBeacon\('\/__crm_e2e_staging_rpc_proxy'/);
assert.match(runnerSource, /__crm_e2e_staging_request_proxy/);
assert.match(runnerSource, /staging_request_proxy_route_forbidden/);
assert.match(runnerSource, /requestHeaders: incomingHeaders/);
assert.doesNotMatch(runnerSource, /form\.action='\/__crm_e2e_staging_rpc_proxy'/);
assert.match(runnerSource, /status:201,headers:\{'Content-Type':'application\/json'/);
assert.match(runnerSource, /final_lead_assignment_persistence_failed/);
assert.match(runnerSource, /lead_assignment_db_persisted_final/);
assert.match(runnerSource, /lead_assignment_ui_confirmed/);
assert.match(runnerSource, /await waitForWorkflowRpc\(local\.getWorkflowRpcState\)/);
assert.ok(runnerSource.includes('await loginManager();record(\'login_first_entry\');await openSyntheticLead();await assignLead();await createNeedAndCalculation()'));
assert.ok(runnerSource.includes("profileDir: path.join(tempRoot, 'chrome-profile-manager')"));
assert.ok(runnerSource.includes('evidence.assignment_persistence = true'));
assert.doesNotMatch(runnerSource, /e2e_phase=/);
assert.doesNotMatch(runnerSource, /assigned_card_diag/);
assert.doesNotMatch(runnerSource, /openAssignedLead/);
assert.doesNotMatch(runnerSource, /progress\\\('lead_open_clicked'\\\)/);
assert.match(runnerSource, /progress\('need_ui_wait'\)/);
assert.doesNotMatch(runnerSource, /const needsModule=await import\('\.\/assets\/v4\/needs\.js\?v=20260805-tab-loader-1'\)/);
assert.doesNotMatch(runnerSource, /__crm_e2e_staging_rpc_proxy[^\n]+signal:init\?\.signal/);

assert.throws(
  () => browserLaunchPlan({ chrome: '/usr/bin/google-chrome', profileDir: '/tmp/profile', url: 'http://127.0.0.1/' }),
  /browser_launch_input_invalid/
);

console.log('Authenticated staging E2E uses one headed Chrome session and a same-origin, user-JWT-only transport bridge for allowlisted CRM staging calls, then resumes after the required order refresh.');
