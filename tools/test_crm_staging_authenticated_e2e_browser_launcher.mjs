#!/usr/bin/env node

import assert from 'node:assert/strict';
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

assert.throws(
  () => browserLaunchPlan({ chrome: '/usr/bin/google-chrome', profileDir: '/tmp/profile', url: 'http://127.0.0.1/' }),
  /browser_launch_input_invalid/
);

console.log('Authenticated staging E2E browser launcher uses headed Chrome in isolated Xvfb with no headless flag.');
