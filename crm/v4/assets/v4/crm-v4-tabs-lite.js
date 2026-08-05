import './crm-empty-state-enhancer-v1.js';
import { applyV4TabButtonVisibility, canOpenV4Tab, firstAllowedV4Tab } from './role-tab-permissions-v1.js';
import {
  CRM_NAVIGATION_TABS,
  crmNavigationUrl,
  normalizeCrmNavigationTab,
  readCrmLeadRoute,
  readCrmNavigationTab
} from './crm-navigation-route-v1.js';

const MANAGED_TABS = new Set(['management_dashboard', 'orders', 'order_control', 'finance_control', 'production', 'public_lead_audit', 'contact_control', 'user_admin']);
const SETTABLE_TABS = new Set([...MANAGED_TABS, 'leads', 'card']);
const ROUTABLE_TABS = new Set(CRM_NAVIGATION_TABS);
const DUPLICATE_TRANSITION_WINDOW_MS = 120;
const TAB_RENDER_TIMEOUT_MS = 1200;

let lastTransitionTab = '';
let lastTransitionAt = 0;
let feedbackTimer = 0;

function workspace() {
  return document.getElementById('crmWorkspace');
}

function showElement(id) {
  const element = document.getElementById(id);
  if (element) element.style.display = '';
  return element;
}

function hideElement(id) {
  const element = document.getElementById(id);
  if (element) element.style.display = 'none';
  return element;
}

function showNextCard() {
  const next = document.querySelector('.v4-next-card');
  if (next) next.style.display = '';
}

function hideNextCard() {
  const next = document.querySelector('.v4-next-card');
  if (next) next.style.display = 'none';
}

function normalizeTab(tab, allowedTabs = SETTABLE_TABS) {
  const value = String(tab || '').trim();
  return allowedTabs.has(value) ? value : '';
}

function readInitialTab() {
  return normalizeTab(readCrmNavigationTab(window.location.href), ROUTABLE_TABS);
}

function requestedInitialTab() {
  if (readCrmLeadRoute(window.location.href) && canOpenV4Tab('card')) return 'card';
  const requested = readInitialTab();
  if (requested && canOpenV4Tab(requested)) return requested;
  if (canOpenV4Tab('leads')) return 'leads';
  return firstAllowedV4Tab();
}

function syncTabUrl(tab, historyMode) {
  const normalized = normalizeCrmNavigationTab(tab);
  if (!normalized || historyMode === 'none') return;
  const nextUrl = crmNavigationUrl(window.location.href, normalized);
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl === currentUrl) return;
  const method = historyMode === 'replace' ? 'replaceState' : 'pushState';
  window.history[method]({ ...(window.history.state || {}), v4Tab: normalized }, '', nextUrl);
}

function feedbackHost() {
  let section = document.getElementById('v4TabLoadFeedback');
  if (section) return section;
  section = document.createElement('section');
  section.id = 'v4TabLoadFeedback';
  section.className = 'v4-card';
  section.hidden = true;
  section.setAttribute('role', 'status');
  section.setAttribute('aria-live', 'polite');
  const nav = document.getElementById('v4LayoutTabs');
  if (nav) nav.insertAdjacentElement('afterend', section);
  else workspace()?.prepend(section);
  return section;
}

function hideFeedback() {
  const section = document.getElementById('v4TabLoadFeedback');
  if (section) {
    section.hidden = true;
    section.innerHTML = '';
  }
}

function showFeedback(tab) {
  const section = feedbackHost();
  section.hidden = false;
  section.innerHTML = `<div class="v4-empty"><b>Раздел не загрузился</b><p>CRM не смогла инициализировать эту вкладку. Повторите открытие. Если ошибка сохранится, обновите страницу с очисткой кеша.</p><button type="button" class="v4-primary" data-v4-tab-retry="${tab}">Повторить</button></div>`;
}

function managedSection(tab) {
  return document.querySelector(`[data-v4-managed-section="${tab}"]`);
}

function tabHasVisibleSection(tab) {
  if (tab === 'leads') {
    const section = document.getElementById('leadsSection');
    return Boolean(section && section.style.display !== 'none');
  }
  if (tab === 'card') {
    const section = document.getElementById('leadCardSection');
    return Boolean(section && section.style.display !== 'none' && !section.classList.contains('hidden'));
  }
  const section = managedSection(tab);
  return Boolean(section && section.hidden !== true);
}

function watchTabRender(tab) {
  window.clearTimeout(feedbackTimer);
  hideFeedback();
  workspace()?.setAttribute('aria-busy', 'true');
  feedbackTimer = window.setTimeout(() => {
    feedbackTimer = 0;
    workspace()?.removeAttribute('aria-busy');
    if (document.body.dataset.v4Tab !== tab) return;
    if (tabHasVisibleSection(tab)) hideFeedback();
    else showFeedback(tab);
  }, TAB_RENDER_TIMEOUT_MS);
}

function hideAllWorkSections() {
  hideElement('crmQuickStart');
  hideElement('leadsSection');
  hideElement('leadCardSection');
  hideNextCard();
  hideFeedback();
  document.querySelectorAll('[data-v4-managed-section]').forEach((section) => { section.hidden = true; });
}

function permittedTab(requested) {
  const normalized = normalizeTab(requested);
  if (normalized && canOpenV4Tab(normalized)) return normalized;
  if (canOpenV4Tab('leads')) return 'leads';
  return firstAllowedV4Tab();
}

function dispatchDenied(requested, reason) {
  document.dispatchEvent(new CustomEvent('leader-v4:tab-denied', { detail: { requested, reason } }));
}

function duplicateTransition(tab, force = false) {
  if (force) return false;
  const now = Date.now();
  const duplicate = tab === lastTransitionTab && now - lastTransitionAt < DUPLICATE_TRANSITION_WINDOW_MS;
  lastTransitionTab = tab;
  lastTransitionAt = now;
  return duplicate;
}

function setActiveTab(tab, options = {}) {
  applyV4TabButtonVisibility(document);
  const activeTab = permittedTab(tab);
  if (!activeTab) {
    document.body.dataset.v4Tab = '';
    hideAllWorkSections();
    dispatchDenied(normalizeTab(tab), 'role_has_no_tabs');
    return false;
  }

  if (duplicateTransition(activeTab, options.force === true)) return true;

  hideFeedback();
  document.body.dataset.v4Tab = activeTab;
  document.querySelectorAll('[data-v4-tab-button]').forEach((button) => {
    const active = button.dataset.v4TabButton === activeTab;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });

  if (activeTab === 'leads') {
    document.querySelectorAll('[data-v4-managed-section]').forEach((section) => { section.hidden = true; });
    showElement('crmQuickStart');
    showElement('leadsSection');
    const card = showElement('leadCardSection');
    if (card) card.classList.add('hidden');
    showNextCard();
  }

  if (activeTab === 'card') {
    document.querySelectorAll('[data-v4-managed-section]').forEach((section) => { section.hidden = true; });
    hideElement('crmQuickStart');
    hideElement('leadsSection');
    const card = showElement('leadCardSection');
    if (card) card.classList.remove('hidden');
    hideNextCard();
  }

  if (MANAGED_TABS.has(activeTab)) {
    hideElement('crmQuickStart');
    hideElement('leadsSection');
    hideElement('leadCardSection');
    hideNextCard();
    document.querySelectorAll('[data-v4-managed-section]').forEach((section) => {
      section.hidden = section.dataset.v4ManagedSection !== activeTab;
    });
  }

  syncTabUrl(activeTab, options.historyMode || 'push');
  document.dispatchEvent(new CustomEvent('leader-v4:tab-opened', { detail: { tab: activeTab } }));
  return true;
}

function bootTabsLite() {
  window.v4SetTab = (tab) => setActiveTab(tab, { historyMode: 'push' });

  document.addEventListener('click', (event) => {
    const retry = event.target.closest?.('[data-v4-tab-retry]');
    if (retry) {
      event.preventDefault();
      setActiveTab(retry.dataset.v4TabRetry, { historyMode: 'none', force: true });
      return;
    }

    const restrictedOrderAction = event.target.closest?.('[data-open-order]');
    if (restrictedOrderAction && !canOpenV4Tab('orders')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      dispatchDenied('orders', 'restricted_action');
    }
  }, true);

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-v4-tab-button]');
    if (!button) return;
    const tab = normalizeTab(button.dataset.v4TabButton);
    if (!tab) return;
    event.preventDefault();
    if (!canOpenV4Tab(tab)) {
      dispatchDenied(tab, 'role_not_allowed');
      return;
    }
    setActiveTab(tab, { historyMode: 'push' });
  });

  document.addEventListener('leader-v4:crm-ready', () => {
    applyV4TabButtonVisibility(document);
    setActiveTab(requestedInitialTab(), { historyMode: 'replace', force: true });
  });

  document.addEventListener('leader-v4:tab-opened', (event) => {
    const tab = normalizeTab(event.detail?.tab);
    if (tab) watchTabRender(tab);
  });

  window.addEventListener('popstate', () => {
    setActiveTab(requestedInitialTab(), { historyMode: 'none', force: true });
  });

  const initialTab = readInitialTab();
  if (initialTab) window.setTimeout(() => setActiveTab(initialTab, { historyMode: 'none', force: true }), 0);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootTabsLite, { once: true });
else bootTabsLite();
