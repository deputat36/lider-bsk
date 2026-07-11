import assert from 'node:assert/strict';
import {
  canLeadStatusTransition,
  leadStatusFilterOptions,
  leadStatusUiModel,
  rawLeadStatus,
  unknownLeadStatuses
} from '../crm/v4/assets/v4/lead-status-ui-model-v1.js';

assert.equal(rawLeadStatus(null), 'Новая');
assert.equal(rawLeadStatus('  КП отправлено  '), 'КП отправлено');

const liveStatuses = [
  { status: 'Новая' },
  { status: 'Уточнение деталей' },
  { status: 'Расчёт подготовлен' },
  { status: 'КП отправлено' },
  { status: 'Создан заказ' }
];
assert.deepEqual(unknownLeadStatuses(liveStatuses), []);

const unknown = 'Legacy Custom Status';
assert.deepEqual(unknownLeadStatuses([{ status: unknown }, { status: unknown }]), [unknown]);

const filterOptions = leadStatusFilterOptions([{ status: unknown }], unknown);
const unknownOption = filterOptions.find((item) => item.value === unknown);
assert.ok(unknownOption);
assert.equal(unknownOption.label, `Неизвестный статус: ${unknown}`);
assert.equal(unknownOption.unknown, true);
assert.ok(filterOptions.some((item) => item.value === 'Новая' && item.label === 'Новая'));
assert.ok(filterOptions.some((item) => item.value === 'archive'));

const currentUnknownOnly = leadStatusFilterOptions([], unknown);
assert.ok(currentUnknownOnly.some((item) => item.value === unknown));

const newModel = leadStatusUiModel('Новая');
assert.equal(newModel.known, true);
assert.equal(newModel.key, 'new');
assert.equal(newModel.terminal, false);
assert.deepEqual(
  newModel.transitions.map((item) => item.label),
  ['В работе', 'Уточнение деталей', 'Отказ', 'Спам']
);

const terminalModel = leadStatusUiModel('Создан заказ');
assert.equal(terminalModel.known, true);
assert.equal(terminalModel.terminal, true);
assert.deepEqual(terminalModel.transitions, []);

const unknownModel = leadStatusUiModel(unknown);
assert.equal(unknownModel.known, false);
assert.equal(unknownModel.raw, unknown);
assert.deepEqual(unknownModel.transitions, []);
assert.match(unknownModel.warning, /сохранён без изменения/);

assert.equal(canLeadStatusTransition('Новая', 'В работе'), true);
assert.equal(canLeadStatusTransition('Новая', 'Создан заказ'), false);
assert.equal(canLeadStatusTransition('Создан заказ', 'В работе'), false);
assert.equal(canLeadStatusTransition(unknown, 'В работе'), false);

console.log('CRM lead status UI registry behavior is valid.');
