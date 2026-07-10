import { applyV4TabButtonVisibility, canOpenV4Tab, firstAllowedV4Tab } from './role-tab-permissions-v1.js';

const MANAGED_TABS = new Set(['management_dashboard', 'orders', 'order_control', 'finance_control', 'production', 'public_lead_audit', 'contact_control', 'user_admin']);
const SETTABLE_TABS = new Set([...MANAGED_TABS, 'leads', 'card']);
const ROUTABLE_TABS = new Set([...MANAGED_TABS, 'leads']);

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
  const params = new URLSearchParams(window.location.search || '');
  const queryTab = normalizeTab(params.get('tab'), ROUTABLE_TABS);
  if (queryTab) return queryTab;

  const hashTab = normalizeTab((window.location.hash || '').replace(/^#/, ''), ROUTABLE_TABS);
  if (hashTab) return hashTab;

  return '';
}

function hideAllWorkSections() {
  hideElement('leadsSection');
  hideElement('leadCardSection');
  hideNextCard();
  document.querySelectorAll('[data-v4-managed-section]').forEach((section) => { section.hidden = true; });
}

function permittedTab(requested) {
  const normalized = normalizeTab(requested);
  if (normalized && canOpenV4Tab(normalized)) return normalized;
  return firstAllowedV4Tab();
}

function dispatchDenied(requested, reason) {
  document.dispatchEvent(new CustomEvent('leader-v4:tab-denied', { detail: { requested, reason } }));
}

function setActiveTab(tab) {
  applyV4TabButtonVisibility(document);
  const activeTab = permittedTab(tab);
  if (!activeTab) {
    document.body.dataset.v4Tab = '';
    hideAllWorkSections();
    dispatchDenied(normalizeTab(tab), 'role_has_no_tabs');
    return false;
  }

  document.body.dataset.v4Tab = activeTab;
  document.querySelectorAll('[data-v4-tab-button]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.v4TabButton === activeTab);
  });

  if (activeTab === 'leads') {
    document.querySelectorAll('[data-v4-managed-section]').forEach((section) => { section.hidden = true; });
    showElement('leadsSection');
    const card = showElement('leadCardSection');
    if (card) card.classList.add('hidden');
    showNextCard();
  }

  if (activeTab === 'card') {
    document.querySelectorAll('[data-v4-managed-section]').forEach((section) => { section.hidden = true; });
    hideElement('leadsSection');
    const card = showElement('leadCardSection');
    if (card) card.classList.remove('hidden');
    hideNextCard();
  }

  if (MANAGED_TABS.has(activeTab)) {
    hideElement('leadsSection');
    hideElement('leadCardSection');
    hideNextCard();
    document.querySelectorAll('[data-v4-managed-section]').forEach((section) => {
      section.hidden = section.dataset.v4ManagedSection !== activeTab;
    });
  }

  document.dispatchEvent(new CustomEvent('leader-v4:tab-opened', { detail: { tab: activeTab } }));
  return true;
}

function bootTabsLite() {
  window.v4SetTab = setActiveTab;

  document.addEventListener('click', (event) => {
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
    setActiveTab(tab);
  });

  document.addEventListener('leader-v4:crm-ready', () => {
    applyV4TabButtonVisibility(document);
    const current = normalizeTab(document.body?.dataset?.v4Tab);
    setActiveTab(current || readInitialTab() || firstAllowedV4Tab());
  });

  const initialTab = readInitialTab();
  if (initialTab) window.setTimeout(() => setActiveTab(initialTab), 0);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootTabsLite); else bootTabsLite();
