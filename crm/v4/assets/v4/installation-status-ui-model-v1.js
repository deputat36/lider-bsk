import {
  allowedStatusTransitions,
  statusDefinition,
  statusDomain
} from './status-transitions-v1.js';

const LEGACY_INSTALLATION_STATUS_KEYS = Object.freeze({
  'Нужно назначить': 'unassigned',
  'Проблема': 'postponed'
});

const STATUS_TIMESTAMP_FIELDS = Object.freeze({
  in_progress: 'started_at',
  completed: 'completed_at'
});

function originalInstallationStatus(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

export function rawInstallationStatus(value) {
  return originalInstallationStatus(value) || 'Не назначен';
}

export function installationStatusDefinition(value) {
  const raw = rawInstallationStatus(value);
  const direct = statusDefinition('installation', raw);
  if (direct) return direct;
  const legacyKey = LEGACY_INSTALLATION_STATUS_KEYS[raw] || '';
  return legacyKey ? statusDomain('installation')?.statuses?.[legacyKey] || null : null;
}

export function installationStatusUiModel(value) {
  const original = originalInstallationStatus(value);
  const raw = rawInstallationStatus(value);
  const current = installationStatusDefinition(value);
  if (!current) {
    return Object.freeze({
      known: false,
      original,
      raw,
      key: '',
      label: raw,
      terminal: false,
      legacy: false,
      transitions: Object.freeze([]),
      warning: `Неизвестный статус монтажа «${raw}» сохранён без изменения. Смена статуса заблокирована до сопоставления с registry.`
    });
  }

  const definitions = statusDomain('installation')?.statuses || {};
  const transitions = allowedStatusTransitions('installation', current.key)
    .map((key) => definitions[key])
    .filter(Boolean)
    .map((item) => Object.freeze({
      key: item.key,
      label: item.label,
      terminal: item.terminal === true
    }));

  return Object.freeze({
    known: true,
    original,
    raw,
    key: current.key,
    label: current.label,
    terminal: current.terminal === true,
    legacy: raw !== current.label,
    transitions: Object.freeze(transitions),
    warning: ''
  });
}

export function installationStatusSelectOptions(value) {
  const model = installationStatusUiModel(value);
  if (!model.known) {
    return Object.freeze([
      Object.freeze({ value: model.raw, label: `Неизвестный статус: ${model.raw}`, current: true, unknown: true })
    ]);
  }

  let currentLabel = model.label;
  if (model.original === null) currentLabel = 'Не назначен (raw: NULL)';
  else if (model.legacy) currentLabel = `${model.raw} (legacy: ${model.label})`;

  return Object.freeze([
    Object.freeze({ value: model.raw, label: currentLabel, current: true, unknown: false }),
    ...model.transitions.map((item) => Object.freeze({ value: item.label, label: item.label, current: false, unknown: false }))
  ]);
}

export function validateInstallationStatusTransition(fromValue, toValue) {
  const fromOriginal = originalInstallationStatus(fromValue);
  const fromRaw = rawInstallationStatus(fromValue);
  const toRaw = rawInstallationStatus(toValue);
  const from = installationStatusDefinition(fromValue);
  const to = installationStatusDefinition(toValue);

  if (!from) {
    if (fromRaw === toRaw) {
      return Object.freeze({ ok: true, unchanged: true, known: false, storedValue: fromOriginal, reason: 'unknown_status_preserved' });
    }
    return Object.freeze({ ok: false, unchanged: false, known: false, storedValue: fromOriginal, reason: 'unknown_from_status' });
  }
  if (!to) {
    return Object.freeze({ ok: false, unchanged: false, known: true, storedValue: fromOriginal, reason: 'unknown_to_status' });
  }
  if (from.key === to.key) {
    return Object.freeze({ ok: true, unchanged: true, known: true, storedValue: fromOriginal, from: from.key, to: to.key, label: to.label });
  }
  if (!from.allowedTo.includes(to.key)) {
    return Object.freeze({
      ok: false,
      unchanged: false,
      known: true,
      storedValue: fromOriginal,
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

export function installationStatusTimestampPatch(transition, existing = {}, nowValue = new Date().toISOString()) {
  if (!transition?.ok || transition.unchanged || !transition.timestampField) return {};
  return {
    [transition.timestampField]: existing?.[transition.timestampField] || nowValue
  };
}
