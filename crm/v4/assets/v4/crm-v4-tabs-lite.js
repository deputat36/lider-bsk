const MANAGED_TABS = new Set(['orders', 'order_control', 'finance_control', 'public_lead_audit', 'contact_control']);

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

function setActiveTab(tab) {
  document.body.dataset.v4Tab = tab;
  document.querySelectorAll('[data-v4-tab-button]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.v4TabButton === tab);
  });

  if (tab === 'leads') {
    document.querySelectorAll('[data-v4-managed-section]').forEach((section) => { section.hidden = true; });
    showElement('leadsSection');
    const card = showElement('leadCardSection');
    if (card) card.classList.add('hidden');
    showNextCard();
  }

  if (tab === 'card') {
    document.querySelectorAll('[data-v4-managed-section]').forEach((section) => { section.hidden = true; });
    hideElement('leadsSection');
    const card = showElement('leadCardSection');
    if (card) card.classList.remove('hidden');
    hideNextCard();
  }

  if (MANAGED_TABS.has(tab)) {
    hideElement('leadsSection');
    hideElement('leadCardSection');
    hideNextCard();
    document.querySelectorAll('[data-v4-managed-section]').forEach((section) => {
      section.hidden = section.dataset.v4ManagedSection !== tab;
    });
  }

  document.dispatchEvent(new CustomEvent('leader-v4:tab-opened', { detail: { tab } }));
}

function bootTabsLite() {
  window.v4SetTab = setActiveTab;
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-v4-tab-button]');
    if (!button) return;
    const tab = button.dataset.v4TabButton;
    if (!tab || (!MANAGED_TABS.has(tab) && tab !== 'leads')) return;
    event.preventDefault();
    setActiveTab(tab);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootTabsLite); else bootTabsLite();
