import assert from 'node:assert/strict';
import {
  CRM_NAVIGATION_TABS,
  crmNavigationUrl,
  normalizeCrmNavigationTab,
  readCrmNavigationTab
} from '../crm/v4/assets/v4/crm-navigation-route-v1.js';

assert.deepEqual(CRM_NAVIGATION_TABS, [
  'management_dashboard', 'leads', 'orders', 'order_control', 'finance_control',
  'production', 'contact_control', 'public_lead_audit', 'user_admin'
]);
assert.equal(normalizeCrmNavigationTab(' orders '), 'orders');
assert.equal(normalizeCrmNavigationTab('card'), '');
assert.equal(normalizeCrmNavigationTab('unknown'), '');

assert.equal(readCrmNavigationTab('https://example.test/crm/v4/?tab=finance_control'), 'finance_control');
assert.equal(readCrmNavigationTab('https://example.test/crm/v4/#production'), 'production');
assert.equal(readCrmNavigationTab('https://example.test/crm/v4/?tab=unknown#orders'), 'orders');

assert.equal(
  crmNavigationUrl('https://example.test/crm/v4/?lead=abc&id=old&utm_source=crm#orders', 'production'),
  '/crm/v4/?utm_source=crm&tab=production'
);
assert.equal(
  crmNavigationUrl('https://example.test/crm/v4/?tab=orders&utm_source=crm', 'orders'),
  '/crm/v4/?tab=orders&utm_source=crm'
);
assert.equal(
  crmNavigationUrl('https://example.test/crm/v4/?tab=orders#help', 'finance_control'),
  '/crm/v4/?tab=finance_control#help'
);

console.log('CRM navigation URL behavior is valid.');
