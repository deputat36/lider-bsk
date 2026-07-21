import assert from 'node:assert/strict';
import {
  FOLLOWUP_CLOSED_STATUSES,
  buildFollowupPostponePlan,
  buildOwnedFollowupPostponePlan,
  followupDate,
  followupResponsibilityModel,
  isFollowupClosedStatus,
  isOverdueFollowupLead
} from '../crm/v4/assets/v4/followup-schedule-model-v1.js';

const now = new Date('2026-07-21T06:30:00.000Z');
const manager = { currentUserId: 'user-1', currentUserRole: 'manager' };
const designer = { currentUserId: 'user-1', currentUserRole: 'designer' };

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

const unassigned = { ...offerLead, assigned_to: null };
const unassignedManager = followupResponsibilityModel(unassigned, manager);
assert.equal(unassignedManager.key, 'unassigned');
assert.equal(unassignedManager.canTake, true);
assert.equal(unassignedManager.canPostpone, false);

const unassignedDesigner = followupResponsibilityModel(unassigned, designer);
assert.equal(unassignedDesigner.key, 'unavailable');
assert.equal(unassignedDesigner.canTake, false);
assert.equal(unassignedDesigner.canPostpone, false);

const mine = { ...offerLead, assigned_to: 'user-1' };
const mineModel = followupResponsibilityModel(mine, manager);
assert.equal(mineModel.key, 'mine');
assert.equal(mineModel.canPostpone, true);
assert.equal(mineModel.canTake, false);

const other = { ...offerLead, assigned_to: 'user-2' };
const otherModel = followupResponsibilityModel(other, manager);
assert.equal(otherModel.key, 'other');
assert.equal(otherModel.canPostpone, false);
assert.equal(otherModel.canTake, false);

const ownedPlan = buildOwnedFollowupPostponePlan(mine, 'tomorrow', manager, now);
assert.ok(ownedPlan);
assert.equal(ownedPlan.assignedTo, 'user-1');
assert.equal(ownedPlan.responsibilityKey, 'mine');
assert.equal(ownedPlan.patch.status, 'КП отправлено');
assert.equal(buildOwnedFollowupPostponePlan(unassigned, 'tomorrow', manager, now), null);
assert.equal(buildOwnedFollowupPostponePlan(other, 'tomorrow', manager, now), null);
assert.equal(buildOwnedFollowupPostponePlan(mine, 'tomorrow', designer, now), null, 'same user id remains owner regardless role');

const closedModel = followupResponsibilityModel({ ...mine, status: 'Отказ' }, manager);
assert.equal(closedModel.key, 'closed');
assert.equal(closedModel.canPostpone, false);

console.log('CRM followup ownership and safe schedule model are valid.');
