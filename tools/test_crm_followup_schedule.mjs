import assert from 'node:assert/strict';
import {
  FOLLOWUP_CLOSED_STATUSES,
  buildFollowupPostponePlan,
  followupDate,
  isFollowupClosedStatus,
  isOverdueFollowupLead
} from '../crm/v4/assets/v4/followup-schedule-model-v1.js';

const now = new Date('2026-07-21T06:30:00.000Z');

assert.ok(FOLLOWUP_CLOSED_STATUSES.includes('Отказ'));
assert.equal(isFollowupClosedStatus('КП отправлено'), false);
assert.equal(isFollowupClosedStatus('Спам'), true);

const plusHour = followupDate('plus1h', now);
assert.equal(plusHour.getTime() > now.getTime(), true);
assert.equal(plusHour.getMinutes(), 0);
assert.equal(followupDate('unknown', now), null);

const tomorrow = followupDate('tomorrow', now);
assert.equal(tomorrow.getDate(), now.getDate() + 1);
assert.equal(tomorrow.getHours(), 10);
assert.equal(tomorrow.getMinutes(), 0);

const newLead = { id: 'lead-new', status: 'Новая', next_contact_at: '2026-07-20T09:00:00.000Z' };
const newLeadSnapshot = structuredClone(newLead);
const newPlan = buildFollowupPostponePlan(newLead, 'tomorrow', now);
assert.ok(newPlan);
assert.equal(newPlan.previousStatus, 'Новая');
assert.equal(newPlan.nextStatus, 'Ждём ответ');
assert.equal(newPlan.patch.status, 'Ждём ответ');
assert.deepEqual(newLead, newLeadSnapshot, 'Pure model must not mutate the lead');
assert.ok(Object.isFrozen(newPlan));
assert.ok(Object.isFrozen(newPlan.patch));

const offerLead = { id: 'lead-offer', status: 'КП отправлено', next_contact_at: '2026-07-20T09:00:00.000Z' };
const offerPlan = buildFollowupPostponePlan(offerLead, 'plus1h', now);
assert.equal(offerPlan.nextStatus, 'КП отправлено');
assert.equal(offerPlan.patch.status, 'КП отправлено');
assert.match(offerPlan.event.body, /без изменения/i);

const recalcPlan = buildFollowupPostponePlan(
  { id: 'lead-recalc', status: 'Нужно пересчитать', next_contact_at: null },
  'plus3d',
  now
);
assert.equal(recalcPlan.patch.status, 'Нужно пересчитать');
assert.equal(recalcPlan.previousContactAt, null);
assert.match(recalcPlan.event.body, /не назначен/i);

assert.equal(buildFollowupPostponePlan({ id: 'closed', status: 'Отказ' }, 'tomorrow', now), null);
assert.equal(buildFollowupPostponePlan({ id: '', status: 'В работе' }, 'tomorrow', now), null);

assert.equal(isOverdueFollowupLead(offerLead, now), true);
assert.equal(isOverdueFollowupLead({ ...offerLead, next_contact_at: '2026-07-22T09:00:00.000Z' }, now), false);
assert.equal(isOverdueFollowupLead({ ...offerLead, status: 'Спам' }, now), false);
assert.equal(isOverdueFollowupLead({ ...offerLead, next_contact_at: null }, now), false);

console.log('CRM safe followup schedule model is valid.');
