import assert from 'node:assert/strict';
import {
  calculationStatusForOfferStatus,
  leadStatusForOfferStatus,
  offerStatusTargetForAction,
  offerStatusUiModel,
  rawOfferStatus,
  validateOfferStatusTransition
} from '../crm/v4/assets/v4/offer-status-ui-model-v1.js';

assert.equal(rawOfferStatus(null), 'Черновик');
assert.equal(rawOfferStatus('  Отправлено  '), 'Отправлено');

const draft = offerStatusUiModel('Черновик');
assert.equal(draft.known, true);
assert.equal(draft.key, 'draft');
assert.deepEqual(draft.actions.map((item) => item.label), ['Отправлено']);

const sent = offerStatusUiModel('Отправлено');
assert.equal(sent.key, 'sent');
assert.deepEqual(sent.actions.map((item) => item.label), ['Согласовано', 'Отклонено']);

const legacySent = offerStatusUiModel('КП отправлено');
assert.equal(legacySent.known, true);
assert.equal(legacySent.key, 'sent');
assert.equal(legacySent.label, 'Отправлено');

const agreed = offerStatusUiModel('Согласовано');
assert.equal(agreed.terminal, true);
assert.deepEqual(agreed.actions, []);

const unknown = offerStatusUiModel('Legacy Offer State');
assert.equal(unknown.known, false);
assert.equal(unknown.raw, 'Legacy Offer State');
assert.deepEqual(unknown.actions, []);
assert.match(unknown.warning, /сохранён без изменения/);

assert.equal(validateOfferStatusTransition('Черновик', 'Отправлено').ok, true);
assert.equal(validateOfferStatusTransition('Черновик', 'Согласовано').ok, false);
assert.equal(validateOfferStatusTransition('Отправлено', 'Согласовано').ok, true);
assert.equal(validateOfferStatusTransition('Согласовано', 'Отправлено').reason, 'terminal_status');
assert.equal(validateOfferStatusTransition('Legacy Offer State', 'Отправлено').reason, 'unknown_from_status');

assert.equal(offerStatusTargetForAction('mark-offer-sent'), 'Отправлено');
assert.equal(offerStatusTargetForAction('approve-offer'), 'Согласовано');
assert.equal(offerStatusTargetForAction('unknown'), '');
assert.equal(leadStatusForOfferStatus('Отправлено'), 'КП отправлено');
assert.equal(calculationStatusForOfferStatus('Согласовано'), 'Согласован');

console.log('CRM offer status UI registry behavior is valid.');
