import {
  allowedStatusTransitions,
  canTransitionStatus,
  statusDefinition,
  statusDomain
} from './status-transitions-v1.js';

export const LEAD_QUICK_FILTERS = Object.freeze([
  Object.freeze({ value: 'active', label: 'Активные в работе' }),
  Object.freeze({ value: 'no_phone', label: 'Без телефона' }),
  Object.freeze({ value: 'no_next_contact', label: 'Без следующего контакта' }),
  Object.freeze({ value: 'site', label: 'Заявки с сайта' }),
  Object.freeze({ value: 'archive', label: 'Архив / завершённые' })
]);

export function rawLeadStatus(value) {
  return String(value ?? '').trim() || 'Новая';
}

export function leadStatusDefinitions() {
  return Object.values(statusDomain('lead')?.statuses || {});
}

export function unknownLeadStatuses(leads = []) {
  const result = new Set();
  for (const lead of leads || []) {
    const raw = rawLeadStatus(lead?.status);
    if (!statusDefinition('lead', raw)) result.add(raw);
  }
  return [...result].sort((left, right) => left.localeCompare(right, 'ru-RU'));
}

export function leadStatusFilterOptions(leads = [], currentValue = 'active') {
  const options = [
    ...LEAD_QUICK_FILTERS,
    { value: 'Все', label: 'Все статусы' },
    ...leadStatusDefinitions().map((item) => ({ value: item.label, label: item.label, unknown: false }))
  ];

  const unknown = unknownLeadStatuses(leads);
  const current = String(currentValue || '').trim();
  if (current && !LEAD_QUICK_FILTERS.some((item) => item.value === current) && current !== 'Все' && !statusDefinition('lead', current)) {
    unknown.push(current);
  }

  for (const raw of [...new Set(unknown)]) {
    options.push({ value: raw, label: `Неизвестный статус: ${raw}`, unknown: true });
  }

  const seen = new Set();
  return options.filter((item) => {
    if (seen.has(item.value)) return false;
    seen.add(item.value);
    return true;
  });
}

export function leadStatusUiModel(rawValue) {
  const raw = rawLeadStatus(rawValue);
  const current = statusDefinition('lead', raw);
  if (!current) {
    return Object.freeze({
      known: false,
      raw,
      key: '',
      label: raw,
      terminal: false,
      transitions: Object.freeze([]),
      warning: `Неизвестный статус «${raw}» сохранён без изменения. Смена статуса заблокирована до сопоставления с registry.`
    });
  }

  const definitions = statusDomain('lead')?.statuses || {};
  const transitions = allowedStatusTransitions('lead', current.key)
    .map((key) => definitions[key])
    .filter(Boolean)
    .map((item) => Object.freeze({
      key: item.key,
      label: item.label,
      terminal: item.terminal === true
    }));

  return Object.freeze({
    known: true,
    raw,
    key: current.key,
    label: current.label,
    terminal: current.terminal === true,
    transitions: Object.freeze(transitions),
    warning: ''
  });
}

export function canLeadStatusTransition(fromValue, toValue) {
  return canTransitionStatus('lead', rawLeadStatus(fromValue), rawLeadStatus(toValue));
}
