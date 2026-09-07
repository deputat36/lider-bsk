import assert from 'node:assert/strict';
import {
  OFFER_CLIENT_PRIVACY_V1,
  normalizeIncludeClientDetails,
  offerGreeting,
  offerClientIdentityLines,
  storedOfferClientDetails,
  storedOfferIncludesClientDetails,
  offerClientPrivacyLabel,
  offerCreateSummary,
} from '../crm/v4/assets/v4/offer-client-privacy-v1.js';

assert.match(OFFER_CLIENT_PRIVACY_V1, /^offer-client-privacy-v1-/);
assert.equal(normalizeIncludeClientDetails(undefined), false);
assert.equal(normalizeIncludeClientDetails(false), false);
assert.equal(normalizeIncludeClientDetails(true), true);

assert.equal(offerGreeting({ name: 'Иван' }, false), 'Здравствуйте!');
assert.equal(offerGreeting({ name: 'Иван' }, true), 'Здравствуйте, Иван!');
assert.deepEqual(offerClientIdentityLines({ name: 'Иван', phone: '+7 900 000-00-00' }, false), []);
assert.deepEqual(offerClientIdentityLines({ name: 'Иван', phone: '+7 900 000-00-00' }, true), [
  'Клиент: Иван',
  'Телефон: +7 900 000-00-00',
]);
assert.deepEqual(offerClientIdentityLines({ name: '', phone: '+7 900 000-00-00' }, true), [
  'Телефон: +7 900 000-00-00',
]);

const anonymous = { full_text: 'КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ\nРА «Лидер»\n\nСостав предложения' };
assert.equal(storedOfferIncludesClientDetails(anonymous), false);
assert.deepEqual(storedOfferClientDetails(anonymous), { include: false, name: '', phone: '' });

const personalized = { full_text: 'КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ\nКлиент: Иван\nТелефон: +7 900 000-00-00\n\nСостав предложения' };
assert.equal(storedOfferIncludesClientDetails(personalized), true);
assert.deepEqual(storedOfferClientDetails(personalized), {
  include: true,
  name: 'Иван',
  phone: '+7 900 000-00-00',
});

assert.equal(offerClientPrivacyLabel(false), 'Без данных клиента');
assert.equal(offerClientPrivacyLabel(true), 'С данными клиента');
assert.deepEqual(offerCreateSummary({
  calculation: { id: 'c1', title: 'Вывеска', client_total: 54000 },
  includeClientDetails: false,
  validUntil: '2026-09-15',
}), {
  calculationTitle: 'Вывеска',
  total: 54000,
  privacyLabel: 'Без данных клиента',
  validUntil: '2026-09-15',
  ready: true,
});

console.log('offer client privacy v1 tests: PASS');
