#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  CONFIRMATION,
  EVIDENCE_VERSION,
  STAGING_URL,
  assertExactStagingUrl,
  buildRuntimeSource,
  buildSmokeHtml,
  buildSmokePageSource,
  buildTemporaryConfigSource,
  loadRuntimeConfig,
  operatorPlan,
  sanitizeEvidence
} from './run_crm_staging_installation_ui_smoke.mjs';

const JOB_ID = '11111111-1111-4111-8111-111111111111';
const env = {
  STAGING_SUPABASE_URL: STAGING_URL,
  STAGING_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_value_not_real',
  STAGING_INSTALLATION_UI_EMAIL: 'synthetic-installer@example.invalid',
  STAGING_INSTALLATION_UI_PASSWORD: 'synthetic-password-value',
  STAGING_INSTALLATION_UI_JOB_ID: JOB_ID,
  STAGING_INSTALLATION_UI_ROLE: 'installer',
  STAGING_INSTALLATION_UI_EXPECTED_STATUS: 'Запланирован',
  STAGING_INSTALLATION_UI_TITLE_SUFFIX: ' · UI smoke test',
  STAGING_INSTALLATION_UI_SMOKE_CONFIRM: CONFIRMATION
};

assert.equal(assertExactStagingUrl(STAGING_URL), STAGING_URL);
assert.throws(() => assertExactStagingUrl('https://ofewxuqfjhamgerwzull.supabase.co'), /staging_environment_guard_failed/);
assert.throws(() => assertExactStagingUrl('https://evil.otulfnouybahfnsycxqn.supabase.co'), /staging_environment_guard_failed/);
assert.throws(() => assertExactStagingUrl('not-a-url'), /staging_environment_guard_failed/);

const config = loadRuntimeConfig(env);
assert.equal(config.jobId, JOB_ID);
assert.equal(config.role, 'installer');
assert.equal(config.expectedInitialStatus, 'Запланирован');
assert.equal(config.evidencePath, 'artifacts/installation-staging-ui-smoke/evidence.json');

assert.throws(() => loadRuntimeConfig({ ...env, STAGING_INSTALLATION_UI_SMOKE_CONFIRM: 'yes' }), /explicit_fixture_confirmation_required/);
assert.throws(() => loadRuntimeConfig({ ...env, STAGING_INSTALLATION_UI_ROLE: 'accountant' }), /ui_role_invalid/);
assert.throws(() => loadRuntimeConfig({ ...env, STAGING_INSTALLATION_UI_JOB_ID: 'bad' }), /job_id_invalid/);
assert.throws(() => loadRuntimeConfig({ ...env, STAGING_SUPABASE_URL: 'https://ofewxuqfjhamgerwzull.supabase.co' }), /staging_environment_guard_failed/);

const plan = operatorPlan({});
assert.equal(plan.evidence_version, EVIDENCE_VERSION);
assert.equal(plan.production_enabled, false);
assert.equal(plan.uses_real_card_source, true);
assert.equal(plan.mutation_count_expected, 1);
assert.equal(plan.screenshot_run_enabled, false);
assert.equal(plan.external_fixture_lifecycle_required, true);
assert.equal(plan.required_runtime_inputs_present.test_password, false);
assert.equal(JSON.stringify(plan).includes('synthetic-password-value'), false);

const temporaryConfig = buildTemporaryConfigSource(config);
assert.match(temporaryConfig, /otulfnouybahfnsycxqn\.supabase\.co/);
assert.match(temporaryConfig, /leader_crm_v4_staging_ui_smoke_session/);
assert.doesNotMatch(temporaryConfig, /ofewxuqfjhamgerwzull/);

const runtimeSource = buildRuntimeSource(config);
assert.match(runtimeSource, /synthetic-installer@example\.invalid/);
assert.match(runtimeSource, /synthetic-password-value/);
assert.match(runtimeSource, new RegExp(JOB_ID));
assert.doesNotMatch(runtimeSource, /service_role|sb_secret_/i);

const html = buildSmokeHtml();
assert.match(html, /installation-ui-smoke-page\.mjs/);
assert.match(html, /uiSmokeResult/);
assert.doesNotMatch(html, /password|authorization|service_role/i);

const page = buildSmokePageSource();
for (const marker of [
  "import './assets/v4/installation-job-card-v2.js'",
  'signInWithPassword',
  'data-installation-staging-edge',
  'data-save-installation-job',
  'server_read_back_timeout',
  'mutation_count:1',
  "signOut({scope:'local'})"
]) assert.match(page, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.equal((page.match(/data-save-installation-job/g) || []).length, 1);
assert.doesNotMatch(page, /service_role|sb_secret_|SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(page, /screenshot/i);

const sanitized = sanitizeEvidence({
  status: 'passed',
  email: 'hidden@example.invalid',
  password: 'hidden',
  access_token: 'hidden',
  nested: { client_phone: 'hidden', safe: true },
  mutation_count: 1
});
assert.deepEqual(sanitized, {
  status: 'passed',
  nested: { safe: true },
  mutation_count: 1
});

console.log('Installation staging UI smoke runner tests passed.');
