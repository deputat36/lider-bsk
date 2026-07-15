import assert from 'node:assert/strict';
import {
  paymentNeedsAttention,
  paymentStatusUiModel,
  rawPaymentStatus
} from '../crm/v4/assets/v4/payment-status-ui-model-v1.js';

assert.equal(rawPaymentStatus(''), 'Не оплачено');
assert.equal(rawPaymentStatus(null), 'Не оплачено');

const unpaid = paymentStatusUiModel('Не оплачено');
assert.equal(unpaid.known, true);
assert.equal(unpaid.key, 'unpaid');
assert.equal(unpaid.label, 'Не оплачено');
assert.equal(unpaid.needsAttention, true);
assert.equal(unpaid.settled, false);
assert.deepEqual(unpaid.transitions.map((item) => item.key), ['prepayment', 'partial', 'paid']);

const prepayment = paymentStatusUiModel('Предоплата');
assert.equal(prepayment.key, 'prepayment');
assert.equal(prepayment.needsAttention, true);
assert.equal(prepayment.cssClass, 'is-warn');

const partial = paymentStatusUiModel('Частично оплачено');
assert.equal(partial.key, 'partial');
assert.equal(partial.needsAttention, true);

const paid = paymentStatusUiModel('Оплачено');
assert.equal(paid.key, 'paid');
assert.equal(paid.terminal, true);
assert.equal(paid.settled, true);
assert.equal(paid.needsAttention, false);
assert.equal(paid.cssClass, 'is-good');
assert.deepEqual(paid.transitions, []);

const unknown = paymentStatusUiModel('Оплата на проверке банка');
assert.equal(unknown.known, false);
assert.equal(unknown.label, 'Оплата на проверке банка');
assert.equal(unknown.needsAttention, true);
assert.equal(unknown.settled, false);
assert.match(unknown.warning, /сохранён без изменения/i);
assert.match(unknown.warning, /финансовом контроле/i);
assert.deepEqual(unknown.transitions, []);

assert.equal(paymentNeedsAttention('Оплачено'), false);
assert.equal(paymentNeedsAttention('Не оплачено'), true);
assert.equal(paymentNeedsAttention('Оплата на проверке банка'), true);

console.log('CRM payment status UI registry behavior is valid.');
