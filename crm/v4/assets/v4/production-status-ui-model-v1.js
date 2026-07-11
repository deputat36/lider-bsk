import {
  allowedStatusTransitions,
  statusDefinition,
  statusDomain
} from './status-transitions-v1.js';

const LEGACY_PRODUCTION_STATUS_KEYS = Object.freeze({
  'Передано в производство': 'queued',
  'В работе': 'in_production',
  'Проблема': 'stopped'
});

const STATUS_TIMESTAMP_FIELDS = Object.freeze({
  queued: 'sent_to_contractor_at',
  in_production: 'sent_to_contractor_at',
  ready: 'ready_at',
  issued: 'issued_at'
});

export function rawProductionStatus(value) {
  return String(value ?? '').trim() || 'Не передано';
}

export function productionStatusDefinition(value) {
  const raw = rawProductionStatus(value);
  const direct = statusDefinition('production', raw);
  if (direct) return direct;
  const legacyKey = LEGACY_PRODUCTION_STATUS_KEYS[raw] || '';
  return legacyKey ? statusDomain('production')?.statuses?.[legacyKey] || null : null;
}

export function productionStatusUiModel(value) {
  const raw = rawProductionStatus(value);
  const current = productionStatusDefinition(raw);
  if (!current) {
    return Object.freeze({
      known: false,
      raw,
      key: '',
      label: raw,
      terminal: false,
      legacy: false,
      transitions: Object.freeze([]),
      warning: `Неизвестный статус производства «${raw}» сохранён без изменения. Смена статуса заблокирована до сопоставления с registry.`
    });
  }

  const definitions = statusDomain('production')?.statuses || {};
  const transitions = allowedStatusTransitions('production', current.key)
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
    legacy: raw !== current.label,
    transitions: Object.freeze(transitions),
    warning: ''
  });
}

export function productionStatusSelectOptions(value) {
  const model = productionStatusUiModel(value);
  if (!model.known) {
    return Object.freeze([
      Object.freeze({ value: model.raw, label: `Неизвестный статус: ${model.raw}`, current: true, unknown: true })
    ]);
  }

  const currentLabel = model.legacy ? `${model.raw} (legacy: ${model.label})` : model.label;
  return Object.freeze([
    Object.freeze({ value: model.raw, label: currentLabel, current: true, unknown: false }),
    ...model.transitions.map((item) => Object.freeze({ value: item.label, label: item.label, current: false, unknown: false }))
  ]);
}

export function validateProductionStatusTransition(fromValue, toValue) {
  const fromRaw = rawProductionStatus(fromValue);
  const toRaw = rawProductionStatus(toValue);
  const from = productionStatusDefinition(fromRaw);
  const to = productionStatusDefinition(toRaw);

  if (!from) {
    if (fromRaw === toRaw) {
      return Object.freeze({ ok: true, unchanged: true, known: false, storedValue: fromRaw, reason: 'unknown_status_preserved' });
    }
    return Object.freeze({ ok: false, unchanged: false, known: false, storedValue: fromRaw, reason: 'unknown_from_status' });
  }
  if (!to) {
    return Object.freeze({ ok: false, unchanged: false, known: true, storedValue: fromRaw, reason: 'unknown_to_status' });
  }
  if (from.key === to.key) {
    return Object.freeze({ ok: true, unchanged: true, known: true, storedValue: fromRaw, from: from.key, to: to.key, label: to.label });
  }
  if (!from.allowedTo.includes(to.key)) {
    return Object.freeze({
      ok: false,
      unchanged: false,
      known: true,
      storedValue: fromRaw,
      reason: from.terminal ? 'terminal_status' : 'transition_not_allowed',
      from: from.key,
      to: to.key
    });
  }

  return Object.freeze({
    ok: true,
    unchanged: false,
    known: true,
    storedValue: to.label,
    from: from.key,
    to: to.key,
    label: to.label,
    terminal: to.terminal === true,
    timestampField: STATUS_TIMESTAMP_FIELDS[to.key] || ''
  });
}

export function productionStatusTimestampPatch(transition, existing = {}, nowValue = new Date().toISOString()) {
  if (!transition?.ok || transition.unchanged || !transition.timestampField) return {};
  return {
    [transition.timestampField]: existing?.[transition.timestampField] || nowValue
  };
}
