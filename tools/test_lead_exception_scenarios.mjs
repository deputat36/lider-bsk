import assert from 'node:assert/strict';
import {
  LEAD_EXCEPTION_SCENARIOS,
  buildLeadExceptionPlan,
  leadExceptionScenario
} from '../crm/v4/assets/v4/lead-exception-scenarios-v1.js';

assert.equal(LEAD_EXCEPTION_SCENARIOS.length, 6, 'v1 must expose six focused scenarios');
assert.equal(new Set(LEAD_EXCEPTION_SCENARIOS.map((item) => item.key)).size, LEAD_EXCEPTION_SCENARIOS.length, 'scenario keys must be unique');

for (const item of LEAD_EXCEPTION_SCENARIOS) {
  assert.ok(item.label, `${item.key}: label is required`);
  assert.ok(item.status, `${item.key}: status is required`);
  assert.ok(item.eventType, `${item.key}: event type is required`);
  assert.ok(item.comment.length > 40, `${item.key}: comment must be actionable`);
  assert.ok(item.consequence.length > 30, `${item.key}: consequence must explain impact`);
  assert.ok(item.nextContact, `${item.key}: active lead scenario must keep a next contact`);
  assert.ok(!['Отказ', 'Спам', 'Не отвечает'].includes(item.status), `${item.key}: v1 must not suggest an irreversible terminal status`);
}

const changed = buildLeadExceptionPlan('client_changed');
assert.equal(changed.status, 'Нужно пересчитать');
assert.equal(changed.eventType, 'Проблема');
assert.equal(changed.nextContact.days, 1);
assert.match(changed.comment, /старую согласованную версию не изменять/i);
assert.match(changed.saveNotice, /ещё не сохранены/i);

const noContact = leadExceptionScenario('no_contact');
assert.equal(noContact.status, 'Ждём ответ');
assert.match(noContact.consequence, /не переводит заявку/i);

assert.equal(buildLeadExceptionPlan('unknown'), null);
assert.equal(leadExceptionScenario(''), null);
assert.ok(Object.isFrozen(LEAD_EXCEPTION_SCENARIOS));
assert.ok(Object.isFrozen(changed));

console.log('Lead exception scenario model is valid.');
