import assert from 'node:assert/strict';
import {
  LEAD_ASSIGNABLE_ROLES,
  buildLeadSelfAssignment,
  leadResponsibilityState,
  leadTakeButtonModel,
  normalizeLeadAssignmentRole
} from '../crm/v4/assets/v4/lead-assignment-model-v1.js';
import { leadPrimaryAction } from '../crm/v4/assets/v4/lead-status-ui-model-v1.js';

assert.deepEqual(LEAD_ASSIGNABLE_ROLES, ['owner', 'admin', 'manager']);
assert.equal(normalizeLeadAssignmentRole(' Manager '), 'manager');

const manager = { currentUserId: 'user-1', currentUserRole: 'manager', actorLabel: 'Менеджер' };
const designer = { currentUserId: 'user-2', currentUserRole: 'designer', actorLabel: 'Дизайнер' };

const unassigned = leadResponsibilityState({ assigned_to: null }, manager);
assert.equal(unassigned.key, 'unassigned');
assert.equal(unassigned.label, 'Без ответственного');
assert.equal(unassigned.canTake, true);

const unavailable = leadResponsibilityState({ assigned_to: null }, designer);
assert.equal(unavailable.key, 'unassigned');
assert.equal(unavailable.canTake, false);

const mine = leadResponsibilityState({ assigned_to: 'user-1' }, manager);
assert.equal(mine.key, 'mine');
assert.equal(mine.label, 'Ответственный: вы');

const other = leadResponsibilityState({ assigned_to: 'user-9' }, manager);
assert.equal(other.key, 'other');
assert.equal(other.label, 'Назначена другому сотруднику');
assert.equal(other.canTake, false);

const newAssignment = buildLeadSelfAssignment({ id: 'lead-1', status: 'Новая', assigned_to: null }, manager);
assert.ok(newAssignment);
assert.deepEqual(newAssignment.patch, { assigned_to: 'user-1', status: 'В работе' });
assert.equal(newAssignment.previousStatus, 'Новая');
assert.equal(newAssignment.nextStatus, 'В работе');
assert.match(newAssignment.event.body, /Менеджер/);
assert.ok(Object.isFrozen(newAssignment));
assert.ok(Object.isFrozen(newAssignment.patch));

const activeAssignment = buildLeadSelfAssignment({ id: 'lead-2', status: 'Ждём ответ', assigned_to: null }, manager);
assert.deepEqual(activeAssignment.patch, { assigned_to: 'user-1', status: 'Ждём ответ' });
assert.equal(buildLeadSelfAssignment({ id: 'lead-3', status: 'Новая', assigned_to: 'user-9' }, manager), null);
assert.equal(buildLeadSelfAssignment({ id: 'lead-4', status: 'Новая', assigned_to: null }, designer), null);

assert.deepEqual(leadTakeButtonModel({ status: 'Новая', assigned_to: null }, manager), {
  visible: true,
  action: 'take',
  label: 'Взять в работу',
  disabled: false
});
assert.deepEqual(leadTakeButtonModel({ status: 'Новая', assigned_to: 'user-1' }, manager), {
  visible: true,
  action: 'work',
  label: 'Принять заявку',
  disabled: false
});
assert.equal(leadTakeButtonModel({ status: 'В работе', assigned_to: 'user-1' }, manager).visible, false);
assert.equal(leadTakeButtonModel({ status: 'Новая', assigned_to: 'user-9' }, manager).visible, false);

const takePrimary = leadPrimaryAction(
  { id: 'lead-1', status: 'Новая', assigned_to: null },
  { currentUserId: 'user-1', currentUserRole: 'manager' }
);
assert.equal(takePrimary.type, 'assign_self');
assert.equal(takePrimary.label, 'Взять заявку в работу');

const minePrimary = leadPrimaryAction(
  { id: 'lead-1', status: 'Новая', assigned_to: 'user-1' },
  { currentUserId: 'user-1', currentUserRole: 'manager' }
);
assert.equal(minePrimary.type, 'transition');
assert.equal(minePrimary.targetStatus, 'В работе');

const otherPrimary = leadPrimaryAction(
  { id: 'lead-1', status: 'Новая', assigned_to: 'user-9' },
  { currentUserId: 'user-1', currentUserRole: 'manager' }
);
assert.equal(otherPrimary.type, 'none');
assert.equal(otherPrimary.label, 'Заявка у другого сотрудника');

console.log('CRM lead assignment model is valid.');
