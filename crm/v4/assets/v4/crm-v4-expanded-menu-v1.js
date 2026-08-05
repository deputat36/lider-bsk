import { applyV4TabButtonVisibility } from './role-tab-permissions-v1.js';

const CRM_V4_MENU = Object.freeze([
  { tab: 'management_dashboard', label: 'Дашборд' },
  { tab: 'leads', label: 'Заявки' },
  { tab: 'orders', label: 'Заказы' },
  { tab: 'order_control', label: 'Контроль заказов' },
  { tab: 'finance_control', label: 'Финансы' },
  { tab: 'production', label: 'Производство' },
  { tab: 'contact_control', label: 'Контроль контактов' },
  { tab: 'public_lead_audit', label: 'Аудит заявок' },
  { tab: 'user_admin', label: 'Доступ и роли' }
]);

let menuBuilt = false;
let scheduledFrame = 0;

function menuRoot() {
  return document.getElementById('v4LayoutTabs');
}

function setButtonLabel(button, label) {
  const badge = button.querySelector('.v4-production-tab-badge');
  const currentLabel = [...button.childNodes]
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent || '')
    .join('')
    .trim();

  if (currentLabel === label && (!badge || button.contains(badge))) return;
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

function buildMenuOnce(nav) {
  const title = nav.querySelector('b');
  let previous = title || null;

  CRM_V4_MENU.forEach((item) => {
    const button = ensureButton(nav, item);
    if (previous) previous.insertAdjacentElement('afterend', button);
    else nav.insertAdjacentElement('afterbegin', button);
    previous = button;
  });

  menuBuilt = true;
}

function syncMenuState() {
  const nav = menuRoot();
  if (!nav) return;
  if (!menuBuilt) buildMenuOnce(nav);

  applyV4TabButtonVisibility(nav);
  const activeTab = document.body?.dataset?.v4Tab || '';
  nav.querySelectorAll('[data-v4-tab-button]').forEach((button) => {
    const active = !button.hidden && button.dataset.v4TabButton === activeTab;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
}

function scheduleMenuSync() {
  if (scheduledFrame) return;
  scheduledFrame = window.requestAnimationFrame(() => {
    scheduledFrame = 0;
    syncMenuState();
  });
}

function bootExpandedMenu() {
  scheduleMenuSync();
  document.addEventListener('leader-v4:crm-ready', scheduleMenuSync);
  document.addEventListener('leader-v4:tab-opened', scheduleMenuSync);
  document.addEventListener('leader-v4:tab-denied', scheduleMenuSync);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootExpandedMenu, { once: true });
else bootExpandedMenu();
