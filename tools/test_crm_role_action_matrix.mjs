import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CRM_V4_ACTIONS, CRM_V4_ROLE_ACTIONS } from '../crm/v4/assets/v4/action-permissions-v1.js';

const contract = JSON.parse(
  readFileSync(new URL('../contracts/crm-v4-role-action-matrix-v1.json', import.meta.url), 'utf8')
);

const canonicalRoles = ['owner', 'admin', 'manager', 'accountant', 'designer', 'installer', 'contractor'];
const sourceActions = Object.values(CRM_V4_ACTIONS);

assert.equal(contract.version, 1);
assert.equal(contract.contract, 'crm-v4-role-action-matrix');
assert.deepEqual(contract.canonical_roles, canonicalRoles);
assert.deepEqual(Object.keys(contract.roles), canonicalRoles);
assert.equal(sourceActions.length, 39, 'The canonical browser registry must contain 39 action keys');
assert.equal(new Set(sourceActions).size, sourceActions.length, 'Browser action keys must be unique');
assert.deepEqual(contract.all_actions, sourceActions, 'JSON all_actions must follow the browser registry exactly');
assert.equal(new Set(contract.all_actions).size, contract.all_actions.length, 'Contract action keys must be unique');

for (const action of contract.all_actions) {
  assert.match(action, /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/, `Invalid action key: ${action}`);
}

for (const role of canonicalRoles) {
  const source = [...(CRM_V4_ROLE_ACTIONS[role] || [])];
  const expected = contract.roles[role] || [];
  assert.deepEqual(expected, source, `Role/action drift for ${role}`);
  assert.equal(new Set(expected).size, expected.length, `Duplicate action in ${role}`);
  for (const action of expected) {
    assert.ok(contract.all_actions.includes(action), `${role} references unknown action ${action}`);
  }
}

assert.deepEqual(contract.roles.owner, contract.all_actions);
assert.deepEqual(contract.roles.admin, contract.all_actions);
assert.equal(contract.roles.manager.length, 30);
assert.equal(contract.roles.accountant.length, 8);
assert.equal(contract.roles.designer.length, 4);
assert.equal(contract.roles.installer.length, 2);
assert.equal(contract.roles.contractor.length, 2);
assert.equal(contract.unknown_role, 'deny');
assert.equal(contract.unknown_action, 'deny');
assert.equal(contract.inactive_profile, 'deny');
assert.equal(contract.production_deployment, 'requires_explicit_approval');

console.log('CRM v4 browser and canonical role/action contract are identical.');
