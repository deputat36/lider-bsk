export const CRM_NAVIGATION_TABS = Object.freeze([
  'management_dashboard',
  'leads',
  'orders',
  'order_control',
  'finance_control',
  'production',
  'contact_control',
  'public_lead_audit',
  'user_admin'
]);

const NAVIGATION_TAB_SET = new Set(CRM_NAVIGATION_TABS);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeCrmNavigationTab(value) {
  const tab = String(value || '').trim();
  return NAVIGATION_TAB_SET.has(tab) ? tab : '';
}

export function readCrmNavigationTab(href) {
  const url = new URL(href, 'https://crm.invalid/');
  const queryTab = normalizeCrmNavigationTab(url.searchParams.get('tab'));
  if (queryTab) return queryTab;
  return normalizeCrmNavigationTab(url.hash.replace(/^#/, ''));
}

export function readCrmLeadRoute(href) {
  const url = new URL(href, 'https://crm.invalid/');
  const value = String(url.searchParams.get('lead') || url.searchParams.get('id') || '').trim();
  return UUID_PATTERN.test(value) ? value : '';
}

export function crmNavigationUrl(href, tab) {
  const url = new URL(href, 'https://crm.invalid/');
  const normalized = normalizeCrmNavigationTab(tab);
  if (!normalized) return `${url.pathname}${url.search}${url.hash}`;

  url.searchParams.set('tab', normalized);
  url.searchParams.delete('lead');
  url.searchParams.delete('id');
  if (normalizeCrmNavigationTab(url.hash.replace(/^#/, ''))) url.hash = '';
  return `${url.pathname}${url.search}${url.hash}`;
}
