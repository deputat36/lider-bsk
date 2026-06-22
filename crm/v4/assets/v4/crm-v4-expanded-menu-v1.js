const CRM_V4_MENU = [
  { tab: 'management_dashboard', label: 'Дашборд' },
  { tab: 'leads', label: 'Заявки' },
  { tab: 'orders', label: 'Заказы' },
  { tab: 'order_control', label: 'Контроль заказов' },
  { tab: 'finance_control', label: 'Финансы' },
  { tab: 'production', label: 'Производство' },
  { tab: 'contact_control', label: 'Контроль контактов' },
  { tab: 'public_lead_audit', label: 'Аудит заявок' }
];

function menuRoot() {
  return document.getElementById('v4LayoutTabs');
}

function setButtonLabel(button, label) {
  const badge = button.querySelector('.v4-production-tab-badge');
  button.textContent = label;
  if (badge) button.appendChild(badge);
}

function ensureButton(nav, item) {
  let button = nav.querySelector(`[data-v4-tab-button="${item.tab}"]`);
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.dataset.v4TabButton = item.tab;
  }
  setButtonLabel(button, item.label);
  return button;
}

function syncExpandedMenu() {
  const nav = menuRoot();
  if (!nav) return;

  const title = nav.querySelector('b');
  let previous = title || null;

  CRM_V4_MENU.forEach((item) => {
    const button = ensureButton(nav, item);
    if (previous) previous.insertAdjacentElement('afterend', button);
    else nav.insertAdjacentElement('afterbegin', button);
    previous = button;
  });

  const activeTab = document.body?.dataset?.v4Tab || 'leads';
  nav.querySelectorAll('[data-v4-tab-button]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.v4TabButton === activeTab);
  });
}

function bootExpandedMenu() {
  syncExpandedMenu();
  document.addEventListener('leader-v4:crm-ready', () => window.setTimeout(syncExpandedMenu, 100));
  document.addEventListener('leader-v4:tab-opened', () => window.setTimeout(syncExpandedMenu, 50));
  window.setTimeout(syncExpandedMenu, 350);
  window.setTimeout(syncExpandedMenu, 1200);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootExpandedMenu); else bootExpandedMenu();
