import {
  allowedStatusTransitions,
  statusDefinition,
  statusDomain
} from './status-transitions-v1.js';

export function rawOrderStatus(value) {
  return String(value ?? '').trim() || 'Новый';
}

export function orderStatusUiModel(rawValue) {
  const raw = rawOrderStatus(rawValue);
  const current = statusDefinition('order', raw);
  if (!current) {
    return Object.freeze({
      known: false,
      raw,
      key: '',
      label: raw,
      cssClass: 'is-warn',
      terminal: false,
      active: true,
      transitions: Object.freeze([]),
      warning: `Неизвестный статус заказа «${raw}» сохранён без изменения. Заказ оставлен в активном контроле до сопоставления с registry.`
    });
  }

  const definitions = statusDomain('order')?.statuses || {};
  const transitions = allowedStatusTransitions('order', current.key)
    .map((key) => definitions[key])
    .filter(Boolean)
    .map((item) => Object.freeze({ key: item.key, label: item.label, terminal: item.terminal === true }));
  const cssClass = ['ready', 'issued', 'closed'].includes(current.key)
    ? 'is-good'
    : current.key === 'cancelled'
      ? 'is-danger'
      : ['layout_review', 'production'].includes(current.key)
        ? 'is-warn'
        : '';

  return Object.freeze({
    known: true,
    raw,
    key: current.key,
    label: current.label,
    cssClass,
    terminal: current.terminal === true,
    active: current.terminal !== true,
    transitions: Object.freeze(transitions),
    warning: ''
  });
}

export function isActiveOrderStatus(value) {
  return orderStatusUiModel(value).active;
}

export function orderStageFlags(value) {
  const model = orderStatusUiModel(value);
  const productionStarted = ['production', 'ready', 'issued', 'closed'].includes(model.key);
  const ready = ['ready', 'issued', 'closed'].includes(model.key);
  const issued = ['issued', 'closed'].includes(model.key);
  return Object.freeze({
    known: model.known,
    key: model.key,
    productionStarted,
    ready,
    issued
  });
}
