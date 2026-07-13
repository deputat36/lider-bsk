export const NEED_READINESS_THRESHOLD = 80;

function text(value) {
  return String(value ?? '').trim();
}

function scoreValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

export function normalizeMissingFields(value) {
  const source = Array.isArray(value) ? value : [];
  return Object.freeze([...new Set(source.map(text).filter(Boolean))]);
}

export function activeLeadNeeds(needs = []) {
  const source = Array.isArray(needs) ? needs : [];
  return Object.freeze(source.filter((need) => text(need?.status).toLocaleLowerCase('ru-RU') !== 'архив'));
}

export function evaluateNeedReadiness(need, threshold = NEED_READINESS_THRESHOLD) {
  if (!need) {
    return Object.freeze({
      state: 'missing_need',
      level: 'critical',
      ready: false,
      score: 0,
      threshold,
      missingFields: Object.freeze([]),
      needId: '',
      needTitle: '',
      title: 'Потребность не выбрана',
      message: 'Создайте или выберите потребность, чтобы расчёт и КП опирались на согласованные параметры.'
    });
  }

  const score = scoreValue(need.completeness_score);
  const missingFields = normalizeMissingFields(need.missing_fields);
  const scoreReady = score >= threshold;
  const ready = scoreReady && missingFields.length === 0;
  const level = ready ? 'ready' : scoreReady ? 'warning' : 'critical';
  const state = ready ? 'ready' : scoreReady ? 'missing_fields' : 'below_threshold';
  const needTitle = text(need.title || need.need_type || 'Потребность');
  const title = ready
    ? `Потребность готова: ${score}%`
    : scoreReady
      ? `Готовность ${score}%, но остались уточнения`
      : `Потребность заполнена на ${score}%`;
  const message = ready
    ? 'Основные параметры заполнены. Перед отправкой всё равно проверьте состав работ, сроки и комментарий для клиента.'
    : missingFields.length
      ? `Уточните: ${missingFields.join(', ')}.`
      : `Для уверенного расчёта рекомендуется не менее ${threshold}% готовности.`;

  return Object.freeze({
    state,
    level,
    ready,
    score,
    threshold,
    missingFields,
    needId: text(need.id),
    needTitle,
    title,
    message
  });
}

function context(base, extra = {}) {
  return Object.freeze({ ...base, ...extra });
}

export function calculationReadinessContext({ needs = [], selectedNeedId = '' } = {}) {
  const active = activeLeadNeeds(needs);
  const selectedId = text(selectedNeedId);

  if (!active.length) {
    return context(evaluateNeedReadiness(null), {
      context: 'calculation',
      state: 'no_active_needs',
      activeNeedCount: 0,
      action: 'open_need_form'
    });
  }

  if (!selectedId) {
    return Object.freeze({
      context: 'calculation',
      state: 'unlinked_calculation',
      level: 'warning',
      ready: false,
      score: 0,
      threshold: NEED_READINESS_THRESHOLD,
      missingFields: Object.freeze([]),
      needId: '',
      needTitle: '',
      activeNeedCount: active.length,
      action: 'focus_need_select',
      title: 'Расчёт не привязан к потребности',
      message: `Выберите одну из активных потребностей (${active.length}), чтобы сохранить связь с параметрами клиента и использовать её в КП.`
    });
  }

  const selected = active.find((need) => text(need?.id) === selectedId);
  if (!selected) {
    return Object.freeze({
      context: 'calculation',
      state: 'need_unavailable',
      level: 'critical',
      ready: false,
      score: 0,
      threshold: NEED_READINESS_THRESHOLD,
      missingFields: Object.freeze([]),
      needId: selectedId,
      needTitle: '',
      activeNeedCount: active.length,
      action: 'focus_need_select',
      title: 'Выбранная потребность недоступна',
      message: 'Обновите карточку и выберите актуальную потребность. Сохранение расчёта не блокируется автоматически.'
    });
  }

  return context(evaluateNeedReadiness(selected), {
    context: 'calculation',
    activeNeedCount: active.length,
    action: 'open_need'
  });
}

export function offerReadinessContext({ needs = [], calculations = [], selectedCalculationId = '' } = {}) {
  const selectedId = text(selectedCalculationId);
  if (!selectedId) {
    return Object.freeze({
      context: 'offer',
      state: 'select_calculation',
      level: 'neutral',
      ready: false,
      score: 0,
      threshold: NEED_READINESS_THRESHOLD,
      missingFields: Object.freeze([]),
      needId: '',
      needTitle: '',
      calculationId: '',
      action: 'focus_calculation_select',
      title: 'Сначала выберите расчёт',
      message: 'После выбора будет показана готовность связанной потребности перед формированием КП.'
    });
  }

  const calculation = (Array.isArray(calculations) ? calculations : []).find((item) => text(item?.id) === selectedId);
  if (!calculation) {
    return Object.freeze({
      context: 'offer',
      state: 'calculation_unavailable',
      level: 'critical',
      ready: false,
      score: 0,
      threshold: NEED_READINESS_THRESHOLD,
      missingFields: Object.freeze([]),
      needId: '',
      needTitle: '',
      calculationId: selectedId,
      action: 'focus_calculation_select',
      title: 'Расчёт недоступен',
      message: 'Обновите карточку и выберите сохранённый расчёт.'
    });
  }

  const needId = text(calculation.need_id);
  if (!needId) {
    return Object.freeze({
      context: 'offer',
      state: 'calculation_without_need',
      level: 'warning',
      ready: false,
      score: 0,
      threshold: NEED_READINESS_THRESHOLD,
      missingFields: Object.freeze([]),
      needId: '',
      needTitle: '',
      calculationId: selectedId,
      action: 'open_calculations',
      title: 'Расчёт не связан с потребностью',
      message: 'КП можно сформировать, но в нём может не хватить согласованных размеров, материала, сроков или условий монтажа.'
    });
  }

  const need = activeLeadNeeds(needs).find((item) => text(item?.id) === needId);
  if (!need) {
    return Object.freeze({
      context: 'offer',
      state: 'linked_need_unavailable',
      level: 'critical',
      ready: false,
      score: 0,
      threshold: NEED_READINESS_THRESHOLD,
      missingFields: Object.freeze([]),
      needId,
      needTitle: '',
      calculationId: selectedId,
      action: 'open_need_form',
      title: 'Связанная потребность недоступна',
      message: 'Проверьте карточку перед формированием КП. Возможно, потребность архивирована или ещё не загружена.'
    });
  }

  return context(evaluateNeedReadiness(need), {
    context: 'offer',
    calculationId: selectedId,
    action: 'open_need'
  });
}
