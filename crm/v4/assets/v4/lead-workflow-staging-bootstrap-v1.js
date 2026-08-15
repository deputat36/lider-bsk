import { V4_CONFIG } from './config.js';

const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn';
const WORKFLOW_SELECTOR = [
  '[data-lead-primary-action]',
  '[data-lead-status]',
  '[data-next-contact]',
  '#leadsSection button[data-action="take"]',
  '#leadsSection button[data-action="work"]'
].join(',');

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
  let handlerReady = false;
  let queuedTarget = null;

  // A very fast click can happen while the protected sidecar module is still
  // loading. Capture only workflow mutations, prevent the legacy handler from
  // seeing them, and replay the latest connected target once the protected
  // handler is installed. This avoids a lost first click without weakening RBAC.
  const holdUntilReady = (event) => {
    if (handlerReady || !event.target?.closest) return;
    const target = event.target.closest(WORKFLOW_SELECTOR);
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    queuedTarget = target;
  };

  document.addEventListener('click', holdUntilReady, true);

  try {
    await import('./lead-workflow-staging-ui-v1.js');
    handlerReady = true;
    document.removeEventListener('click', holdUntilReady, true);

    const replayTarget = queuedTarget;
    queuedTarget = null;
    if (replayTarget?.isConnected && !replayTarget.disabled) {
      window.setTimeout(() => replayTarget.click(), 0);
    }

    // Use the exact same versioned URL as the lazy card bundle. This makes the
    // route-change listener available before a fast lead-open flow finishes,
    // while the later lazy import resolves to the same module instance.
    await import('./lead-card.js?v=20260805-tab-loader-1');
  } catch (error) {
    document.removeEventListener('click', holdUntilReady, true);
    console.error('[leader-crm] staging lead workflow bootstrap failed', error);
  }
}
