import { V4_CONFIG } from './config.js';

const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn';

function isStagingEnvironment(value) {
  try {
    return new URL(String(value || '')).hostname.toLowerCase() === `${STAGING_PROJECT_REF}.supabase.co`;
  } catch (_) {
    return false;
  }
}

// Root browser bootstrap only. It deliberately stays outside lead models so the
// protected staging UI cannot create a cyclic top-level-await dependency through
// lead-assignment-model -> bootstrap -> UI -> list-model -> assignment-model.
// Production configuration is a strict no-op and never imports staging modules.
if (
  typeof document !== 'undefined'
  && typeof window !== 'undefined'
  && isStagingEnvironment(V4_CONFIG.supabaseUrl)
) {
  try {
    // Use the exact same versioned URL as the lazy card bundle. This makes the
    // route-change listener available before a fast user/E2E click opens a lead,
    // while the later lazy import resolves to the same module instance.
    await Promise.all([
      import('./lead-card.js?v=20260805-tab-loader-1'),
      import('./lead-workflow-staging-ui-v1.js')
    ]);
  } catch (error) {
    console.error('[leader-crm] staging lead workflow bootstrap failed', error);
  }
}
