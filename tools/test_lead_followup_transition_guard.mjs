import assert from 'node:assert/strict';
import {
  LEAD_FOLLOWUP_REQUIRED_STATUSES,
  OFFER_FOLLOWUP_REQUIRED_ACTIONS,
  evaluateLeadFollowupTransition,
  evaluateOfferFollowupAction,
  leadFollowupState,
  leadStatusRequiresFutureFollowup,
  offerActionRequiresFutureFollowup
} from '../crm/v4/assets/v4/lead-followup-transition-guard-model-v1.js';

const NOW = Date.parse('2026-07-23T09:00:00.000Z');
const FUTURE = '2026-07-23T10:00:00.000Z';
const PAST = '2026-07-23T08:00:00.000Z';

assert.deepEqual(LEAD_FOLLOWUP_REQUIRED_STATUSES, ['КП отправлено', 'Ждём ответ']);
assert.deepEqual(OFFER_FOLLOWUP_REQUIRED_ACTIONS, ['mark-offer-sent']);
assert.equal(leadStatusRequiresFutureFollowup('КП отправлено'), true);
assert.equal(leadStatusRequiresFutureFollowup('Ждём ответ'), true);
assert.equal(leadStatusRequiresFutureFollowup('Согласовано'), false);
assert.equal(offerActionRequiresFutureFollowup('mark-offer-sent'), true);
assert.equal(offerActionRequiresFutureFollowup('approve-offer'), false);

assert.equal(leadFollowupState({}, NOW).key, 'missing');
assert.equal(leadFollowupState({ next_contact_at: 'bad-date' }, NOW).key, 'invalid');
assert.equal(leadFollowupState({ next_contact_at: PAST }, NOW).key, 'overdue');
assert.equal(leadFollowupState({ next_contact_at: FUTURE }, NOW).key, 'scheduled');

const missing = evaluateLeadFollowupTransition({ status: 'Расчёт подготовлен' }, 'КП отправлено', NOW);
assert.equal(missing.allowed, false);
assert.equal(missing.code, 'followup_missing');
assert.match(missing.message, /будущую дату возврата к клиенту/);

const overdue = evaluateLeadFollowupTransition({ status: 'В работе', next_contact_at: PAST }, 'Ждём ответ', NOW);
assert.equal(overdue.allowed, false);
assert.equal(overdue.code, 'followup_overdue');

const scheduled = evaluateLeadFollowupTransition({ status: 'Расчёт подготовлен', next_contact_at: FUTURE }, 'КП отправлено', NOW);
assert.equal(scheduled.allowed, true);
assert.equal(scheduled.code, 'future_followup_present');

const unrelated = evaluateLeadFollowupTransition({ status: 'В работе' }, 'Уточнение деталей', NOW);
assert.equal(unrelated.allowed, true);
assert.equal(unrelated.code, 'followup_not_required');

const unchangedHistorical = evaluateLeadFollowupTransition({ status: 'Ждём ответ' }, 'Ждём ответ', NOW);
assert.equal(unchangedHistorical.allowed, true);
assert.equal(unchangedHistorical.code, 'no_change');

const offerBlocked = evaluateOfferFollowupAction({ status: 'Расчёт подготовлен' }, 'mark-offer-sent', NOW);
assert.equal(offerBlocked.allowed, false);
assert.equal(offerBlocked.code, 'followup_missing');

const offerAllowed = evaluateOfferFollowupAction({ status: 'Расчёт подготовлен', next_contact_at: FUTURE }, 'mark-offer-sent', NOW);
assert.equal(offerAllowed.allowed, true);
assert.equal(offerAllowed.code, 'offer_future_followup_present');

const offerUnrelated = evaluateOfferFollowupAction({}, 'approve-offer', NOW);
assert.equal(offerUnrelated.allowed, true);
assert.equal(offerUnrelated.code, 'offer_followup_not_required');

console.log('Lead followup transition guard model is valid.');
