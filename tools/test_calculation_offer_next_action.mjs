import assert from 'node:assert/strict';
import {
  calculationOfferNextAction,
  offerCalculationAvailability,
  offerEligibleCalculations,
  preferredOfferCalculationId
} from '../crm/v4/assets/v4/calculation-offer-next-action-model-v1.js';

const free = { id: 'calc-free', title: 'Баннер', version_number: 2, client_total: 15000 };
const second = { id: 'calc-second', title: 'Табличка', version_number: 1, client_total: 3000 };
const offered = { ...free, id: 'calc-offered', commercial_offer_id: 'offer-1' };
const ordered = { ...free, id: 'calc-ordered', order_id: 'order-1' };
const zero = { ...free, id: 'calc-zero', client_total: 0 };
const partiallyLinkedOffer = { id: 'offer-partial', calculation_id: free.id, status: 'Черновик' };

assert.deepEqual(calculationOfferNextAction(free), {
  kind: 'create',
  label: 'Сформировать КП',
  enabled: true,
  calculationId: 'calc-free'
});
assert.equal(calculationOfferNextAction(offered).kind, 'offer');
assert.equal(calculationOfferNextAction(ordered).kind, 'order');
assert.equal(calculationOfferNextAction(zero).kind, 'blocked');
assert.equal(calculationOfferNextAction(free, [partiallyLinkedOffer]).kind, 'offer', 'an existing offer must block a retry even when the calculation pointer was not updated');

assert.deepEqual(offerEligibleCalculations([offered, free, ordered, zero]).map((item) => item.id), ['calc-free']);
assert.deepEqual(offerEligibleCalculations([free], [partiallyLinkedOffer]), []);
assert.equal(preferredOfferCalculationId([free], ''), 'calc-free', 'the only eligible calculation must be selected');
assert.equal(preferredOfferCalculationId([free, second], ''), '', 'multiple calculations require a choice unless the user came from a card');
assert.equal(preferredOfferCalculationId([free, second], 'calc-second'), 'calc-second');
assert.equal(preferredOfferCalculationId([free, second], 'missing'), '');

assert.equal(offerCalculationAvailability([]).available, false);
assert.equal(offerCalculationAvailability([free]).message, 'Единственный доступный расчёт выбран автоматически.');
assert.match(offerCalculationAvailability([offered, ordered]).message, /уже создано КП или заказ/);
assert.match(offerCalculationAvailability([free], [partiallyLinkedOffer]).message, /уже создано КП или заказ/);
assert.match(offerCalculationAvailability([zero]).message, /положительной суммой/);

console.log('Calculation to offer next-action behavior is valid.');
