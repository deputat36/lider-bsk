const PRODUCTION_CONFIG = Object.freeze({
  environment: 'production',
  supabaseUrl: 'https://ofewxuqfjhamgerwzull.supabase.co',
  supabasePublishableKey: 'sb_publishable_ZiX8_Mnf0dY6S__tKO2A4A_uD94G2cs',
  authStorageKey: 'leader_crm_v4_main_session',
  stagingInstallationPage: false,
  timeouts: Object.freeze({
    sessionMs: 9000,
    loginMs: 18000,
    logoutMs: 8000,
    profileMs: 5000,
    requestMs: 12000
  })
});

const STAGING_INSTALLATION_CONFIG = Object.freeze({
  environment: 'staging_installation',
  supabaseUrl: 'https://otulfnouybahfnsycxqn.supabase.co',
  supabasePublishableKey: 'sb_publishable_iRCLPHgRaI5SNo9h4efMQw_W7Kdby1D',
  authStorageKey: 'leader_crm_v4_staging_installation_session',
  stagingInstallationPage: true,
  timeouts: Object.freeze({
    sessionMs: 9000,
    loginMs: 18000,
    logoutMs: 8000,
    profileMs: 5000,
    requestMs: 12000
  })
});

const STAGING_INSTALLATION_HOSTS = new Set([
  'deputat36.github.io',
  'localhost',
  '127.0.0.1'
]);

const STAGING_INSTALLATION_PATHS = new Set([
  '/lider-bsk/crm/v4/staging-installation.html',
  '/crm/v4/staging-installation.html'
]);

function locationPart(locationLike, key) {
  return String(locationLike?.[key] || '').trim().toLowerCase();
}

export function isV4StagingInstallationPage(locationLike = globalThis.location) {
  const hostname = locationPart(locationLike, 'hostname');
  const pathname = String(locationLike?.pathname || '').replace(/\/{2,}/g, '/');
  return STAGING_INSTALLATION_HOSTS.has(hostname)
    && STAGING_INSTALLATION_PATHS.has(pathname);
}

export function resolveV4Config(locationLike = globalThis.location) {
  return isV4StagingInstallationPage(locationLike)
    ? STAGING_INSTALLATION_CONFIG
    : PRODUCTION_CONFIG;
}

export const V4_CONFIG = resolveV4Config();
