import {
  allowedStatusTransitions,
  statusDefinition,
  statusDomain
} from './status-transitions-v1.js';

export function rawPaymentRecordStatus(value) {
  return String(value ?? '').trim();
}

export function paymentRecordStatusModel(rawValue) {
  const raw = rawPaymentRecordStatus(rawValue);
  const current = statusDefinition('payment_record', raw);
  if (!current) {
    return Object.freeze({
      known: false,
      raw,
      key: '',
      label: raw || 'Статус не указан',
      posted: false,
      terminal: false,
      transitions: Object.freeze([]),
      reason: 'unknown_status',
      warning: raw
        ? `Неизвестный статус платежа «${raw}» не включён в подтверждённый факт.`
        : 'Платёж без статуса не включён в подтверждённый факт.'
    });
  }

  const definitions = statusDomain('payment_record')?.statuses || {};
  const transitions = allowedStatusTransitions('payment_record', current.key)
    .map((key) => definitions[key])
    .filter(Boolean)
    .map((item) => Object.freeze({ key: item.key, label: item.label, terminal: item.terminal === true }));
  const posted = current.key === 'posted';
  const reason = posted
    ? 'posted'
    : current.key === 'cancelled'
      ? 'cancelled'
      : 'not_posted';

  return Object.freeze({
    known: true,
    raw,
    key: current.key,
    label: current.label,
    posted,
    terminal: current.terminal === true,
    transitions: Object.freeze(transitions),
    reason,
    warning: posted ? '' : `Платёж со статусом «${current.label}» не включён в подтверждённый факт.`
  });
}
