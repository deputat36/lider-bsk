export const NEED_CALCULATION_READY_THRESHOLD = 80;

function cleanText(value) {
  return String(value ?? '').trim();
}

export function normalizeNeedMissingFields(value) {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set();
  const result = [];
  for (const raw of source) {
    const item = cleanText(raw);
    if (!item) continue;
    const key = item.toLocaleLowerCase('ru-RU');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export function normalizeNeedCompletenessScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

export function needCalculationReadiness(need = {}, threshold = NEED_CALCULATION_READY_THRESHOLD) {
  const score = normalizeNeedCompletenessScore(need?.completeness_score);
  const missingFields = normalizeNeedMissingFields(need?.missing_fields);
  const safeThreshold = Math.max(0, Math.min(100, Number(threshold) || NEED_CALCULATION_READY_THRESHOLD));
  const needsAttention = score < safeThreshold || missingFields.length > 0;
  return Object.freeze({
    score,
    threshold: safeThreshold,
    missingFields: Object.freeze(missingFields),
    needsAttention,
    ready: !needsAttention,
    message: missingFields.length
      ? `Перед расчётом желательно уточнить: ${missingFields.join(', ')}.`
      : `Потребность заполнена на ${score}%. Перед расчётом желательно уточнить бриф.`
  });
}

export function needCalculationGateDecision(need = {}, { continueAnyway = false } = {}) {
  const readiness = needCalculationReadiness(need);
  if (readiness.ready || continueAnyway) {
    return Object.freeze({ action: 'calculate', readiness, overridden: readiness.needsAttention && continueAnyway });
  }
  return Object.freeze({ action: 'review', readiness, overridden: false });
}
