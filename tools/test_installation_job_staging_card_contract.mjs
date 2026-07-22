import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const card = await readFile(new URL('../crm/v4/assets/v4/installation-job-staging-card-v1.js', import.meta.url), 'utf8');
const harness = await readFile(new URL('../crm/v4/assets/v4/staging-installation-harness-v1.js', import.meta.url), 'utf8');
const page = await readFile(new URL('../crm/v4/staging-installation.html', import.meta.url), 'utf8');
const productionCard = await readFile(new URL('../crm/v4/assets/v4/installation-job-card-v2.js', import.meta.url), 'utf8');
const productionIndex = await readFile(new URL('../crm/v4/index.html', import.meta.url), 'utf8');

for (const marker of [
  'invokeStagingInstallationJobRead',
  'invokeStagingInstallationJob',
  'capabilities?.can_write === true',
  'expectedUpdatedAt: old.updated_at',
  'createInstallationJobIdempotencyKey',
  'readAfterSuccess: async () => await readBundle(jobId)',
  'Внутренние комментарии не читаются и не создаются'
]) assert.ok(card.includes(marker), `missing card marker: ${marker}`);

for (const forbidden of [
  ".from('", '.insert(', '.update(', '.delete(', '.upsert(', '.rpc(',
  'service_role', 'SUPABASE_SERVICE_ROLE_KEY', 'client_name', 'client_phone',
  'installer_cost', 'client_price', 'internal_comment'
]) assert.equal(card.includes(forbidden), false, `staging card forbidden marker: ${forbidden}`);

for (const marker of [
  'isV4StagingInstallationPage',
  "V4_CONFIG.environment === 'staging_installation'",
  "leader_crm_v4_staging_installation_session",
  'signInWithPassword',
  "signOut({ scope: 'local' })",
  'openStagingInstallationJobCard'
]) assert.ok(harness.includes(marker), `missing harness marker: ${marker}`);

for (const forbidden of ['service_role', 'SUPABASE_SERVICE_ROLE_KEY', '.from(', '.rpc(']) {
  assert.equal(harness.includes(forbidden), false, `harness forbidden marker: ${forbidden}`);
}

assert.ok(page.includes('meta name="robots" content="noindex,nofollow,noarchive"'));
assert.ok(page.includes('staging-installation-harness-v1.js'));
assert.ok(page.includes('Не используйте реальные данные'));
assert.equal(productionIndex.includes('staging-installation-harness-v1.js'), false);
assert.equal(productionIndex.includes('installation-job-staging-card-v1.js'), false);
assert.ok(productionCard.includes(".from('leader_installation_jobs').update(patch)"));
assert.equal(productionCard.includes('invokeStagingInstallationJob'), false);

console.log('Installation staging card isolation contract tests passed.');
