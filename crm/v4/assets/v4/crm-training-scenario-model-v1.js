export const CRM_TRAINING_SCENARIO_VERSION = 1;

export const CRM_TRAINING_STEP_IDS = Object.freeze(['lead', 'need', 'offer', 'order', 'finish']);

export const CRM_TRAINING_SCENARIO = Object.freeze({
  id: 'banner-coffee-shop-v1',
  title: 'Учебный заказ: баннер для кофейни',
  clientLabel: 'Учебный клиент «Кофейня Север»',
  warning: 'Это локальная тренировка. Она не создаёт клиента, заявку, КП, заказ или задачу в Supabase.',
  steps: Object.freeze([
    Object.freeze({
      id: 'lead',
      title: 'Принять обращение',
      objective: 'Определить источник, услугу и следующий контакт.',
      facts: Object.freeze(['Источник: ВКонтакте', 'Услуга: баннер', 'Размер: 3000 × 1000 мм', 'Следующий контакт: завтра, 10:00']),
      result: 'Заявка принята, следующий контакт назначен.'
    }),
    Object.freeze({
      id: 'need',
      title: 'Уточнить потребность',
      objective: 'Собрать данные, достаточные для расчёта и макета.',
      facts: Object.freeze(['Материал: баннер 440 г/м²', 'Люверсы: через 30 см', 'Макет требуется', 'Монтаж не требуется', 'Полнота потребности: 85%']),
      result: 'Потребность заполнена не менее чем на 80%.'
    }),
    Object.freeze({
      id: 'offer',
      title: 'Подготовить расчёт и КП',
      objective: 'Проверить состав работ и клиентскую стоимость.',
      facts: Object.freeze(['Печать баннера', 'Обработка края и люверсы', 'Разработка макета', 'Учебная итоговая стоимость: 12 800 ₽']),
      result: 'Расчёт проверен, коммерческое предложение подготовлено.'
    }),
    Object.freeze({
      id: 'order',
      title: 'Оформить заказ',
      objective: 'Зафиксировать срок, ответственного и производственный маршрут.',
      facts: Object.freeze(['Статус: принят', 'Ответственный: учебный менеджер', 'Макет: на согласовании', 'Производство: не передано']),
      result: 'Учебный заказ оформлен и передан на контроль.'
    }),
    Object.freeze({
      id: 'finish',
      title: 'Довести до выдачи',
      objective: 'Проверить положительное завершение без подмены отменой.',
      facts: Object.freeze(['Макет согласован', 'Производство завершено', 'Заказ выдан', 'Монтаж: не требуется']),
      result: 'Учебный заказ успешно завершён. Отмена не считается выполнением.'
    })
  ])
});

function validCompleted(value) {
  const source = Array.isArray(value) ? value : [];
  const unique = [...new Set(source.map((item) => String(item || '').trim()))];
  const completed = [];
  for (const id of CRM_TRAINING_STEP_IDS) {
    if (!unique.includes(id)) break;
    completed.push(id);
  }
  return completed;
}

export function normalizeTrainingScenarioState(value = {}) {
  const completed = validCompleted(value?.completed);
  return Object.freeze({
    started: value?.started === true || completed.length > 0,
    completed: Object.freeze(completed),
    collapsed: value?.collapsed === true
  });
}

export function startTrainingScenario(value = {}) {
  const state = normalizeTrainingScenarioState(value);
  return normalizeTrainingScenarioState({ ...state, started: true });
}

export function resetTrainingScenario() {
  return normalizeTrainingScenarioState();
}

export function trainingScenarioProgress(value = {}) {
  const state = normalizeTrainingScenarioState(value);
  const completed = state.completed.length;
  const total = CRM_TRAINING_STEP_IDS.length;
  return Object.freeze({
    completed,
    total,
    percent: total ? Math.round((completed / total) * 100) : 0,
    finished: completed === total
  });
}

export function currentTrainingStep(value = {}) {
  const state = normalizeTrainingScenarioState(value);
  if (!state.started) return null;
  return CRM_TRAINING_STEP_IDS[state.completed.length] || null;
}

export function completeTrainingStep(value = {}, stepId = '') {
  const state = normalizeTrainingScenarioState(value);
  const id = String(stepId || '').trim();
  const current = currentTrainingStep(state);
  if (!state.started || !current || id !== current) return state;
  return normalizeTrainingScenarioState({
    started: true,
    completed: [...state.completed, id],
    collapsed: state.collapsed
  });
}

export function setTrainingScenarioCollapsed(value = {}, collapsed = true) {
  const state = normalizeTrainingScenarioState(value);
  return normalizeTrainingScenarioState({ ...state, collapsed: collapsed === true });
}

export function trainingStepDefinition(stepId = '') {
  const id = String(stepId || '').trim();
  return CRM_TRAINING_SCENARIO.steps.find((step) => step.id === id) || null;
}
