import {
  allowedStatusTransitions,
  statusDefinition,
  statusDomain
} from './status-transitions-v1.js';

export function rawPaymentStatus(value) {
  return String(value ?? '').trim() || 'Не оплачено';
}

export function paymentStatusUiModel(rawValue) {
  const raw = rawPaymentStatus(rawValue);
  const current = statusDefinition('payment', raw);
  if (!current) {
    return Object.freeze({
      known: false,
      raw,
      key: '',
      label: raw,
      cssClass: 'is-warn',
      terminal: false,
      settled: false,
      needsAttention: true,
      transitions: Object.freeze([]),
      warning: `Неизвестный статус оплаты «${raw}» сохранён без изменения. Заказ оставлен в финансовом контроле до сопоставления с registry.`
    });
  }

  const definitions = statusDomain('payment')?.statuses || {};
  const transitions = allowedStatusTransitions('payment', current.key)
    .map((key) => definitions[key])
    .filter(Boolean)
    .map((item) => Object.freeze({ key: item.key, label: item.label, terminal: item.terminal === true }));
  const settled = current.key === 'paid';
  const cssClass = settled
    ? 'is-good'
    : current.key === 'unpaid'
      ? 'is-danger'
      : 'is-warn';

  return Object.freeze({
    known: true,
    raw,
    key: current.key,
    label: current.label,
    cssClass,
    terminal: current.terminal === true,
    settled,
    needsAttention: !settled,
    transitions: Object.freeze(transitions),
    warning: ''
  });
}

export function paymentNeedsAttention(value) {
  return paymentStatusUiModel(value).needsAttention;
}
