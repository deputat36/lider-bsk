import assert from 'node:assert/strict';
import { firstAllowedV4Tab } from '../crm/v4/assets/v4/role-tab-permissions-v1.js';

const active = (role) => ({ role, is_active: true });

assert.equal(firstAllowedV4Tab(active('owner')), 'management_dashboard');
assert.equal(firstAllowedV4Tab(active('admin')), 'management_dashboard');
assert.equal(firstAllowedV4Tab(active('manager')), 'leads');
assert.equal(firstAllowedV4Tab(active('accountant')), 'orders');
assert.equal(firstAllowedV4Tab(active('designer')), 'production');
assert.equal(firstAllowedV4Tab(active('installer')), 'production');
assert.equal(firstAllowedV4Tab(active('contractor')), 'production');
assert.equal(firstAllowedV4Tab(active('unknown')), '');

console.log('CRM role-aware landing tabs are valid.');
