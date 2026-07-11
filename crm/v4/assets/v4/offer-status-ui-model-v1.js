import {
  allowedStatusTransitions,
  statusDefinition,
  statusDomain,
  validateStatusTransition
} from './status-transitions-v1.js';

const ACTION_BY_TARGET = Object.freeze({
  sent: Object.freeze({ action: 'mark-offer-sent', danger: false }),
  agreed: Object.freeze({ action: 'approve-offer', danger: false }),
  rejected: Object.freeze({ action: 'reject-offer', danger: true })
});

export function rawOfferStatus(value) {
  return String(value ?? '').trim() || 'Черновик';
}

export function offerStatusUiModel(rawValue) {
  const raw = rawOfferStatus(rawValue);
  const current = statusDefinition('offer', raw);
  if (!current) {
    return Object.freeze({
      known: false,
      raw,
      key: '',
      label: raw,
      cssClass: 'is-unknown',
      terminal: false,
      actions: Object.freeze([]),
      warning: `Неизвестный статус КП «${raw}» сохранён без изменения. Переход заблокирован до сопоставления с registry.`
    });
  }

  const definitions = statusDomain('offer')?.statuses || {};
  const actions = allowedStatusTransitions('offer', current.key)
    .map((key) => ({ definition: definitions[key], ui: ACTION_BY_TARGET[key] }))
    .filter((item) => item.definition && item.ui)
    .map((item) => Object.freeze({
      key: item.definition.key,
      label: item.definition.label,
      action: item.ui.action,
      danger: item.ui.danger
    }));

  const cssClass = current.key === 'agreed'
    ? 'is-good'
    : current.key === 'sent'
      ? 'is-warn'
      : current.key === 'rejected'
        ? 'is-error'
        : '';

  return Object.freeze({
    known: true,
    raw,
    key: current.key,
    label: current.label,
    cssClass,
    terminal: current.terminal === true,
    actions: Object.freeze(actions),
    warning: ''
  });
}

export function offerStatusTargetForAction(action) {
  const entry = Object.entries(ACTION_BY_TARGET).find(([, item]) => item.action === action);
  if (!entry) return '';
  return statusDomain('offer')?.statuses?.[entry[0]]?.label || '';
}

export function validateOfferStatusTransition(fromValue, toValue) {
  return validateStatusTransition('offer', rawOfferStatus(fromValue), rawOfferStatus(toValue));
}

export function leadStatusForOfferStatus(value) {
  const key = statusDefinition('offer', rawOfferStatus(value))?.key || '';
  if (key === 'sent') return 'КП отправлено';
  if (key === 'agreed') return 'Согласовано';
  if (key === 'rejected') return 'Нужно пересчитать';
  return 'Расчёт подготовлен';
}

export function calculationStatusForOfferStatus(value) {
  const key = statusDefinition('offer', rawOfferStatus(value))?.key || '';
  if (key === 'sent') return 'КП отправлено';
  if (key === 'agreed') return 'Согласован';
  if (key === 'rejected') return 'Отклонён';
  return 'КП сформировано';
}
