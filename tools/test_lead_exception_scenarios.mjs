import assert from 'node:assert/strict';
import {
  LEAD_EXCEPTION_SCENARIOS,
  buildLeadExceptionApplication,
  buildLeadExceptionPlan,
  leadExceptionApplyOutcome,
  leadExceptionContactDate,
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
assert.match(changed.saveNotice, /одним действием/i);

const contactDate = leadExceptionContactDate(changed.nextContact, new Date('2026-07-21T06:30:00Z'));
assert.equal(contactDate.toISOString(), '2026-07-22T10:00:00.000Z');
assert.equal(leadExceptionContactDate(null), null);
assert.equal(leadExceptionContactDate(changed.nextContact, 'invalid'), null);

const application = buildLeadExceptionApplication('client_changed', {
  id: '11111111-1111-4111-8111-111111111111',
  status: 'КП отправлено'
}, new Date('2026-07-21T06:30:00Z'));
assert.equal(application.leadId, '11111111-1111-4111-8111-111111111111');
assert.deepEqual(application.leadPatch, {
  status: 'Нужно пересчитать',
  next_contact_at: '2026-07-22T10:00:00.000Z'
});
assert.equal(application.timelineEvent.oldStatus, 'КП отправлено');
assert.equal(application.timelineEvent.newStatus, 'Нужно пересчитать');
assert.match(application.timelineEvent.body, /новую версию расчёта/i);
assert.ok(Object.isFrozen(application));
assert.ok(Object.isFrozen(application.leadPatch));
assert.ok(Object.isFrozen(application.timelineEvent));
assert.equal(buildLeadExceptionApplication('client_changed', {}), null);

const success = leadExceptionApplyOutcome({ leadSaved: true, eventSaved: true });
assert.equal(success.phase, 'success');
assert.equal(success.retryHistory, false);
assert.match(success.message, /история обновлены/i);

const deduplicated = leadExceptionApplyOutcome({ leadSaved: true, eventSaved: true, deduplicated: true });
assert.match(deduplicated.message, /не была продублирована/i);

const partial = leadExceptionApplyOutcome({ leadSaved: true, eventSaved: false });
assert.equal(partial.phase, 'partial');
assert.equal(partial.retryHistory, true);
assert.match(partial.message, /повторите только запись/i);

const failed = leadExceptionApplyOutcome({ leadSaved: false, eventSaved: false });
assert.equal(failed.phase, 'error');
assert.equal(failed.retryHistory, false);

const noContact = leadExceptionScenario('no_contact');
assert.equal(noContact.status, 'Ждём ответ');
assert.match(noContact.consequence, /не переводит заявку/i);

assert.equal(buildLeadExceptionPlan('unknown'), null);
assert.equal(leadExceptionScenario(''), null);
assert.ok(Object.isFrozen(LEAD_EXCEPTION_SCENARIOS));
assert.ok(Object.isFrozen(changed));

console.log('Lead exception scenario and one-action application model are valid.');
