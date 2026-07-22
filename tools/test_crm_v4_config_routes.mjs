import assert from 'node:assert/strict';
import {
  isV4StagingInstallationPage,
  resolveV4Config
} from '../crm/v4/assets/v4/config.js';

const githubStaging = {
  hostname: 'deputat36.github.io',
  pathname: '/lider-bsk/crm/v4/staging-installation.html'
};
assert.equal(isV4StagingInstallationPage(githubStaging), true);
const staging = resolveV4Config(githubStaging);
assert.equal(staging.environment, 'staging_installation');
assert.equal(staging.supabaseUrl, 'https://otulfnouybahfnsycxqn.supabase.co');
assert.equal(staging.authStorageKey, 'leader_crm_v4_staging_installation_session');
assert.equal(staging.stagingInstallationPage, true);
assert.match(staging.supabasePublishableKey, /^sb_publishable_/);

for (const locationLike of [
  { hostname: 'deputat36.github.io', pathname: '/lider-bsk/crm/v4/index.html' },
  { hostname: 'deputat36.github.io', pathname: '/lider-bsk/crm/v4/staging-installation.html/extra' },
  { hostname: 'evil.example', pathname: '/lider-bsk/crm/v4/staging-installation.html' },
  { hostname: 'deputat36.github.io.evil.example', pathname: '/lider-bsk/crm/v4/staging-installation.html' },
  { hostname: '', pathname: '' }
]) {
  assert.equal(isV4StagingInstallationPage(locationLike), false);
  const config = resolveV4Config(locationLike);
  assert.equal(config.environment, 'production');
  assert.equal(config.supabaseUrl, 'https://ofewxuqfjhamgerwzull.supabase.co');
  assert.equal(config.authStorageKey, 'leader_crm_v4_main_session');
  assert.equal(config.stagingInstallationPage, false);
}

const localStaging = resolveV4Config({ hostname: 'localhost', pathname: '/crm/v4/staging-installation.html' });
assert.equal(localStaging.environment, 'staging_installation');

console.log('CRM v4 exact staging config route tests passed.');
