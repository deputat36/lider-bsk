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
