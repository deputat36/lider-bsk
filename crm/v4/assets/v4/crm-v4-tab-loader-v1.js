import { canOpenV4Tab } from './role-tab-permissions-v1.js';

const modulePromises = new Map();
const loadPromises = new Map();
let cardBundlePromise = null;

function loaderFeedback() {
  let host = document.getElementById('v4TabLoadFeedback');
  if (host) return host;
  host = document.createElement('section');
  host.id = 'v4TabLoadFeedback';
  host.className = 'v4-card';
  host.hidden = true;
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  const nav = document.getElementById('v4LayoutTabs');
  if (nav) nav.insertAdjacentElement('afterend', host);
  else document.getElementById('crmWorkspace')?.prepend(host);
  return host;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>\"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[char]));
}

function showLoading(tab, message) {
  if (document.body?.dataset?.v4Tab !== tab) return;
  const host = loaderFeedback();
  host.dataset.v4LoaderState = 'loading';
  host.dataset.v4LoaderTab = tab;
  host.hidden = false;
  host.innerHTML = `<div class="v4-empty"><b>${escapeHtml(message)}</b><p>Раздел появится сразу после загрузки нужного модуля.</p></div>`;
}

function showError(tab, message) {
  if (document.body?.dataset?.v4Tab !== tab) return;
  const host = loaderFeedback();
  host.dataset.v4LoaderState = 'error';
  host.dataset.v4LoaderTab = tab;
  host.hidden = false;
  host.innerHTML = `<div class="v4-empty is-error"><b>${escapeHtml(message)}</b><p>Остальные разделы CRM продолжают работать.</p><button type="button" class="v4-primary" data-v4-tab-retry="${escapeHtml(tab)}">Повторить</button></div>`;
}

function hideLoading(tab) {
  const host = document.getElementById('v4TabLoadFeedback');
  if (!host || host.dataset.v4LoaderTab !== tab) return;
  host.hidden = true;
  host.innerHTML = '';
  delete host.dataset.v4LoaderState;
  delete host.dataset.v4LoaderTab;
}

function managedModule(importModule, extras = []) {
  return async () => {
    const [primary] = await Promise.all([importModule(), ...extras.map((load) => load())]);
    return primary;
  };
}

const TAB_REGISTRY = Object.freeze({
  management_dashboard: Object.freeze({
    requiredPermission: 'management_dashboard',
    importModule: managedModule(
      () => import('./management-dashboard-v3.js?v=20260805-tab-loader-1'),
      [
        () => import('./management-workload-panel-v1.js?v=20260712-workload-1'),
        () => import('./lead-operational-quality-v1.js?v=20260718-deferred-1')
      ]
    ),
    mount: (module) => module.mount?.(),
    load: (module) => module.load?.(),
    refresh: (module) => module.refresh?.(),
    loadingMessage: 'Загружаю рабочий стол…',
    errorMessage: 'Рабочий стол не загрузился.'
  }),
  orders: Object.freeze({
    requiredPermission: 'orders',
    importModule: managedModule(
      () => import('./orders-fast-loader-v1.js?v=20260805-tab-loader-1'),
      [
        () => import('./orders.js?v=20260805-tab-loader-1'),
        () => import('./order-card-v1.js?v=20260805-tab-loader-1'),
        () => import('./order-act-preview-v1.js?v=20260805-tab-loader-1')
      ]
    ),
    mount: (module) => module.mount?.(),
    load: (module) => module.load?.(),
    refresh: (module) => module.refresh?.(),
    loadingMessage: 'Загружаю заказы…',
    errorMessage: 'Раздел заказов не загрузился.'
  }),
  order_control: Object.freeze({
    requiredPermission: 'order_control',
    importModule: managedModule(
      () => import('./order-control-v2.js?v=20260805-tab-loader-1'),
      [() => import('./order-operational-quality-v1.js?v=20260805-tab-loader-1')]
    ),
    mount: (module) => module.mount?.(),
    load: (module) => module.load?.(),
    refresh: (module) => module.refresh?.(),
    loadingMessage: 'Загружаю контроль заказов…',
    errorMessage: 'Контроль заказов не загрузился.'
  }),
  finance_control: Object.freeze({
    requiredPermission: 'finance_control',
    importModule: managedModule(
      () => import('./finance-control-v2.js?v=20260805-tab-loader-1'),
      [() => import('./finance-plan-actual-panel-v1.js?v=20260713-finance-1')]
    ),
    mount: (module) => module.mount?.(),
    load: (module) => module.load?.(),
    refresh: (module) => module.refresh?.(),
    loadingMessage: 'Загружаю финансовый контроль…',
    errorMessage: 'Финансовый контроль не загрузился.'
  }),
  production: Object.freeze({
    requiredPermission: 'production',
    importModule: managedModule(
      () => import('./production-board-v3.js?v=20260805-tab-loader-1'),
      [
        () => import('./production-alerts-v1.js?v=20260805-tab-loader-1'),
        () => import('./production-job-card-v2.js?v=20260805-tab-loader-1'),
        () => import('./installation-job-card-v2.js?v=20260805-tab-loader-1')
      ]
    ),
    mount: (module) => module.mount?.(),
    load: (module) => module.load?.(),
    refresh: (module) => module.refresh?.(),
    loadingMessage: 'Загружаю производство и монтаж…',
    errorMessage: 'Производство и монтаж не загрузились.'
  }),
  contact_control: Object.freeze({
    requiredPermission: 'contact_control',
    importModule: managedModule(() => import('./contact-control-v1.js?v=20260805-tab-loader-1')),
    mount: (module) => module.mount?.(),
    load: (module) => module.load?.(),
    refresh: (module) => module.refresh?.(),
    loadingMessage: 'Загружаю контроль контактов…',
    errorMessage: 'Контроль контактов не загрузился.'
  }),
  public_lead_audit: Object.freeze({
    requiredPermission: 'public_lead_audit',
    importModule: managedModule(
      () => import('./public-lead-audit-v1.js?v=20260805-tab-loader-1'),
      [
        () => import('./public-lead-audit-helper-v1.js?v=20260710-audit-v9-1'),
        () => import('./public-lead-audit-summary-v1.js?v=20260629-request-summary-1'),
        () => import('./public-lead-request-id-v1.js?v=20260710-request-id-1')
      ]
    ),
    mount: (module) => module.mount?.(),
    load: (module) => module.load?.(),
    refresh: (module) => module.refresh?.(),
    loadingMessage: 'Загружаю аудит заявок…',
    errorMessage: 'Аудит заявок не загрузился.'
  }),
  user_admin: Object.freeze({
    requiredPermission: 'user_admin',
    importModule: managedModule(() => import('./user-admin-v1.js?v=20260805-tab-loader-1')),
    mount: (module) => module.mount?.(),
    load: (module) => module.load?.(),
    refresh: (module) => module.refresh?.(),
    loadingMessage: 'Загружаю доступ и роли…',
    errorMessage: 'Раздел доступа и ролей не загрузился.'
  })
});

function importTab(tab, config) {
  if (modulePromises.has(tab)) return modulePromises.get(tab);
  const promise = config.importModule().catch((error) => {
    modulePromises.delete(tab);
    throw error;
  });
  modulePromises.set(tab, promise);
  return promise;
}

async function runTabLoad(tab, config, module, force) {
  if (loadPromises.has(tab)) return loadPromises.get(tab);
  const promise = Promise.resolve()
    .then(() => config.mount(module))
    .then(() => {
      document.dispatchEvent(new CustomEvent('leader-v4:tab-section-ready', { detail: { tab } }));
      return force ? config.refresh(module) : config.load(module);
    })
    .finally(() => loadPromises.delete(tab));
  loadPromises.set(tab, promise);
  return promise;
}

export async function loadV4Tab(tab, { force = false } = {}) {
  const config = TAB_REGISTRY[tab];
  if (!config) return false;
  if (!canOpenV4Tab(config.requiredPermission)) {
    document.dispatchEvent(new CustomEvent('leader-v4:tab-denied', { detail: { requested: tab, reason: 'role_not_allowed' } }));
    return false;
  }

  showLoading(tab, config.loadingMessage);
  try {
    const module = await importTab(tab, config);
    if (document.body?.dataset?.v4Tab !== tab) return true;
    await runTabLoad(tab, config, module, force);
    hideLoading(tab);
    return true;
  } catch (error) {
    console.warn(`CRM v4 lazy tab failed: ${tab}`, error);
    showError(tab, config.errorMessage);
    return false;
  }
}

async function loadLeadCardBundle() {
  if (!canOpenV4Tab('card')) return false;
  showLoading('card', 'Загружаю карточку заявки…');
  if (!cardBundlePromise) {
    cardBundlePromise = Promise.all([
      import('./lead-card.js?v=20260805-tab-loader-1'),
      import('./lead-timeline.js?v=20260805-tab-loader-1'),
      import('./lead-timeline-hooks.js?v=20260805-tab-loader-1'),
      import('./needs.js?v=20260805-tab-loader-1'),
      import('./calculations-saved-tools-v2.js?v=20260805-tab-loader-1'),
      import('./calculations.js?v=20260805-tab-loader-1'),
      import('./calculation-draft-review-v1.js?v=20260805-tab-loader-1'),
      import('./calculation-contractor-quote-v1.js?v=20260805-tab-loader-1'),
      import('./offers.js?v=20260805-tab-loader-1'),
      import('./offer-card-v1.js?v=20260805-tab-loader-1'),
      import('./offer-print.js?v=20260805-tab-loader-1'),
      import('./offer-order-create-v1.js?v=20260805-tab-loader-1'),
      import('./need-readiness-panel-v1.js?v=20260713-readiness-1')
    ]).catch((error) => {
      cardBundlePromise = null;
      throw error;
    });
  }
  try {
    await cardBundlePromise;
    document.dispatchEvent(new CustomEvent('leader-v4:tab-section-ready', { detail: { tab: 'card' } }));
    hideLoading('card');
    return true;
  } catch (error) {
    console.warn('CRM v4 lead card bundle failed:', error);
    showError('card', 'Карточка заявки не загрузилась.');
    return false;
  }
}

function bootTabLoader() {
  document.addEventListener('leader-v4:tab-opened', (event) => {
    const tab = String(event.detail?.tab || '');
    if (tab === 'card') {
      loadLeadCardBundle();
      return;
    }
    if (TAB_REGISTRY[tab]) loadV4Tab(tab, { force: event.detail?.force === true });
  });
}

export { TAB_REGISTRY };

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootTabLoader, { once: true });
else bootTabLoader();
