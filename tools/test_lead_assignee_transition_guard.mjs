import assert from 'node:assert/strict';
import {
  LEAD_ASSIGNEE_REQUIRED_STATUSES,
  evaluateLeadAssigneeTransition,
  leadHasAssignee,
  leadStatusRequiresAssignee
} from '../crm/v4/assets/v4/lead-assignee-transition-guard-model-v1.js';

assert.deepEqual(LEAD_ASSIGNEE_REQUIRED_STATUSES, [
  'В работе',
  'Уточнение деталей',
  'Расчёт подготовлен',
  'КП отправлено',
  'Ждём ответ',
  'Нужно пересчитать',
  'Согласовано'
]);

for (const status of LEAD_ASSIGNEE_REQUIRED_STATUSES) {
  assert.equal(leadStatusRequiresAssignee(status), true, `${status} должен требовать ответственного`);
}

assert.equal(leadStatusRequiresAssignee('Отказ'), false);
assert.equal(leadStatusRequiresAssignee('Спам'), false);
assert.equal(leadHasAssignee({ assigned_to: ' user-1 ' }), true);
assert.equal(leadHasAssignee({ assigned_to: '   ' }), false);
assert.equal(leadHasAssignee({}), false);

const blocked = evaluateLeadAssigneeTransition({ status: 'Новая', assigned_to: null }, 'В работе');
assert.equal(blocked.allowed, false);
assert.equal(blocked.code, 'assignee_required');
assert.equal(blocked.requiresAssignee, true);
assert.match(blocked.message, /Сначала назначьте ответственного/);

const assigned = evaluateLeadAssigneeTransition({ status: 'Новая', assigned_to: 'user-1' }, 'КП отправлено');
assert.equal(assigned.allowed, true);
assert.equal(assigned.code, 'assignee_present');

const refusal = evaluateLeadAssigneeTransition({ status: 'Новая', assigned_to: null }, 'Отказ');
assert.equal(refusal.allowed, true);
assert.equal(refusal.code, 'assignee_not_required');

const spam = evaluateLeadAssigneeTransition({ status: 'Новая', assigned_to: null }, 'Спам');
assert.equal(spam.allowed, true);
assert.equal(spam.code, 'assignee_not_required');

const unchangedHistorical = evaluateLeadAssigneeTransition({ status: 'В работе', assigned_to: null }, 'В работе');
assert.equal(unchangedHistorical.allowed, true);
assert.equal(unchangedHistorical.code, 'no_change');

const invalid = evaluateLeadAssigneeTransition({ status: 'Новая', assigned_to: null }, '');
assert.equal(invalid.allowed, false);
assert.equal(invalid.code, 'invalid_target_status');

console.log('Lead assignee transition guard model is valid.');
