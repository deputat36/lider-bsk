import assert from 'node:assert/strict';
import {
  ORDER_CONTRACT_MODEL_VERSION,
  normalizeOrderContractDraft,
  orderContractDraftNumber,
  orderContractPaymentText,
  orderContractSections,
  orderContractTotal,
  orderContractWarnings,
  suggestedOrderContractTemplate
} from '../crm/v4/assets/v4/order-contract-model-v1.js';

assert.equal(ORDER_CONTRACT_MODEL_VERSION, 1);
assert.equal(suggestedOrderContractTemplate('Изготовление и монтаж световой вывески'), 'advertising_installation');
assert.equal(suggestedOrderContractTemplate('Ремонт световой панели'), 'repair_maintenance');
assert.equal(suggestedOrderContractTemplate('Разработка логотипа'), 'general_services');

const number = orderContractDraftNumber({ order_number: 'L-204' }, new Date('2026-07-13T10:00:00Z'));
assert.equal(number, 'ДОГ-2026-ЧЕРНОВИК-L-204');

const draft = normalizeOrderContractDraft({
  templateId: 'advertising_installation',
  number,
  date: '2026-07-13',
  executor: 'Плательщик налога на профессиональный доход',
  executorDetails: 'ИНН: 123456789012',
  customer: 'ООО «Учебный заказчик»',
  customerDetails: 'ИНН: 1234567890',
  workAddress: 'г. Борисоглебск',
  items: [
    { name: 'Изготовление вывески', quantity: 1, unit: 'шт.', price: 35000, sum: 35000 },
    { name: 'Монтаж', quantity: 1, unit: 'усл.', client_sum: 3000 }
  ]
});

assert.equal(draft.paymentMode, 'split_50_50');
assert.equal(draft.warrantyMonths, 12);
assert.equal(orderContractTotal(draft), 38000);
assert.match(orderContractPaymentText(draft), /50%/);

const sections = orderContractSections(draft);
assert.ok(sections.length >= 7);
assert.ok(sections.some((section) => section.title.includes('Гарантийные')));
assert.match(sections.flatMap((section) => section.paragraphs).join('\n'), /налог на профессиональный доход/);
assert.match(sections.flatMap((section) => section.paragraphs).join('\n'), /Акт сдачи-приёмки/);

const warnings = orderContractWarnings(draft);
assert.deepEqual(warnings, ['Это несохранённый черновик: проверьте реквизиты и юридические условия перед подписанием.']);

const incomplete = orderContractWarnings({
  templateId: 'advertising_installation',
  items: []
});
assert.ok(incomplete.some((warning) => warning.includes('Исполнитель')));
assert.ok(incomplete.some((warning) => warning.includes('Заказчик')));
assert.ok(incomplete.some((warning) => warning.includes('Спецификации')));
assert.ok(incomplete.some((warning) => warning.includes('адрес объекта')));

const normalized = normalizeOrderContractDraft({
  templateId: 'unknown',
  penaltyPercent: 999,
  deadlineDays: -5,
  items: [{ name: '  Услуга  ', quantity: '2', price: '1 500,50' }]
});
assert.equal(normalized.templateId, 'general_services');
assert.equal(normalized.penaltyPercent, 10);
assert.equal(normalized.deadlineDays, 10);
assert.equal(normalized.items[0].name, 'Услуга');
assert.equal(normalized.items[0].sum, 3001);

console.log('CRM order contract draft model is valid and browser-local.');
