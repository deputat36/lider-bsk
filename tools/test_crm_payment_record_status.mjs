import assert from 'node:assert/strict';
import {
  paymentRecordStatusModel,
  rawPaymentRecordStatus
} from '../crm/v4/assets/v4/payment-record-status-model-v1.js';

assert.equal(rawPaymentRecordStatus(null), '');
assert.equal(rawPaymentRecordStatus('  Проведён  '), 'Проведён');

const planned = paymentRecordStatusModel('Планируется');
assert.equal(planned.known, true);
assert.equal(planned.key, 'planned');
assert.equal(planned.posted, false);
assert.equal(planned.reason, 'not_posted');
assert.deepEqual(planned.transitions.map((item) => item.key), ['posted', 'cancelled']);

const posted = paymentRecordStatusModel('Проведён');
assert.equal(posted.known, true);
assert.equal(posted.key, 'posted');
assert.equal(posted.posted, true);
assert.equal(posted.terminal, true);
assert.equal(posted.reason, 'posted');
assert.equal(posted.warning, '');

const postedAlias = paymentRecordStatusModel('Проведен');
assert.equal(postedAlias.key, 'posted');
assert.equal(postedAlias.label, 'Проведён');

const cancelled = paymentRecordStatusModel('Отменен');
assert.equal(cancelled.key, 'cancelled');
assert.equal(cancelled.posted, false);
assert.equal(cancelled.reason, 'cancelled');

const unknown = paymentRecordStatusModel('Ожидает проверки');
assert.equal(unknown.known, false);
assert.equal(unknown.posted, false);
assert.equal(unknown.reason, 'unknown_status');
assert.match(unknown.warning, /не включён в подтверждённый факт/i);

const empty = paymentRecordStatusModel('');
assert.equal(empty.known, false);
assert.equal(empty.label, 'Статус не указан');
assert.equal(empty.reason, 'unknown_status');

console.log('CRM payment record status registry behavior is valid.');
