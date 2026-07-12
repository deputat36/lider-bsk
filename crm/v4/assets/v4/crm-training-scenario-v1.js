import { statusDefinition, validateStatusTransition } from './status-transitions-v1.js';

const STORAGE_KEY = 'leader_crm_v4_training_scenario_v1';
const VERSION = 1;

export const TRAINING_STEP_IDS = Object.freeze(['lead', 'need', 'offer', 'order', 'production']);
export const TRAINING_PHASES = Object.freeze([...TRAINING_STEP_IDS, 'done']);

const PHASE_TITLES = Object.freeze({
  lead: 'Принять заявку',
  need: 'Уточнить потребность',
  offer: 'Проверить расчёт и КП',
  order: 'Создать заказ',
  production: 'Пройти производство',
  done: 'Учебный заказ завершён'
});

function completedList(value) {
  const source = Array.isArray(value) ? value : [];
  return [...new Set(source.map((item) => String(item || '').trim()).filter((item) => TRAINING_STEP_IDS.includes(item)))];
}

function freezeState(value) {
  return Object.freeze({
    version: VERSION,
    phase: value.phase,
    completed: Object.freeze([...value.completed]),
    productionStatus: value.productionStatus,
    lastError: value.lastError || ''
  });
}

export function createTrainingScenarioState() {
  return freezeState({
    phase: 'lead',
    completed: [],
    productionStatus: 'Не передано',
    lastError: ''
  });
}

export function normalizeTrainingScenarioState(value = {}) {
  const completed = completedList(value?.completed);
  const phase = TRAINING_PHASES.includes(value?.phase) ? value.phase : 'lead';
  const production = statusDefinition('production', value?.productionStatus);
  return freezeState({
    phase,
    completed,
    productionStatus: production?.label || 'Не передано',
    lastError: String(value?.lastError || '').slice(0, 240)
  });
}

function advance(state, currentPhase, nextPhase) {
  if (state.phase !== currentPhase) {
    return normalizeTrainingScenarioState({
      ...state,
      lastError: `Сначала завершите этап «${PHASE_TITLES[state.phase] || state.phase}».`
    });
  }
  return normalizeTrainingScenarioState({
    ...state,
    phase: nextPhase,
    completed: [...state.completed, currentPhase],
    lastError: ''
  });
}

export function trainingScenarioProgress(value) {
  const state = normalizeTrainingScenarioState(value);
  const completed = state.completed.length;
  const total = TRAINING_STEP_IDS.length;
  return Object.freeze({
    completed,
    total,
    percent: total ? Math.round((completed / total) * 100) : 0
  });
}

export function applyTrainingScenarioAction(value, action = {}) {
  const state = normalizeTrainingScenarioState(value);
  const type = String(action?.type || '').trim();

  if (type === 'reset') return createTrainingScenarioState();
  if (type === 'schedule_contact') return advance(state, 'lead', 'need');
  if (type === 'confirm_need') return advance(state, 'need', 'offer');
  if (type === 'approve_offer') return advance(state, 'offer', 'order');
  if (type === 'create_order') return advance(state, 'order', 'production');

  if (type === 'production_transition') {
    if (state.phase !== 'production') {
      return normalizeTrainingScenarioState({
        ...state,
        lastError: 'Статусы производства доступны только после создания учебного заказа.'
      });
    }
    const target = String(action?.status || '').trim();
    const transition = validateStatusTransition('production', state.productionStatus, target);
    if (!transition.ok) {
      return normalizeTrainingScenarioState({
        ...state,
        lastError: `Переход «${state.productionStatus} → ${target || 'не указан'}» запрещён registry.`
      });
    }
    const done = transition.to === 'issued';
    return normalizeTrainingScenarioState({
      ...state,
      phase: done ? 'done' : 'production',
      completed: done ? [...state.completed, 'production'] : state.completed,
      productionStatus: transition.label,
      lastError: ''
    });
  }

  return normalizeTrainingScenarioState({ ...state, lastError: 'Неизвестное учебное действие.' });
}

function readState() {
  try {
    return normalizeTrainingScenarioState(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}'));
  } catch (_) {
    return createTrainingScenarioState();
  }
}

function writeState(value) {
  const state = normalizeTrainingScenarioState(value);
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  return state;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function money(value) {
  return `${Number(value || 0).toLocaleString('ru-RU')} ₽`;
}

function host() {
  let element = document.getElementById('crmTrainingScenarioV1');
  if (!element) {
    element = document.createElement('div');
    element.id = 'crmTrainingScenarioV1';
    document.body.appendChild(element);
  }
  return element;
}

function stepList(state) {
  return TRAINING_STEP_IDS.map((id, index) => {
    const done = state.completed.includes(id);
    const active = state.phase === id;
    return `<li class="${done ? 'is-done' : active ? 'is-active' : ''}"><b>${done ? '✓' : index + 1}</b><span>${esc(PHASE_TITLES[id])}</span></li>`;
  }).join('');
}

function leadStep() {
  return `
    <div class="v4-training-kicker">Этап 1 · Заявка</div>
    <h3>Учебная заявка на световую вывеску</h3>
    <div class="v4-training-data">
      <div><span>Клиент</span><b>Учебная кофейня «Север»</b></div>
      <div><span>Источник</span><b>Телефон</b></div>
      <div><span>Услуга</span><b>Световая вывеска</b></div>
      <div><span>Следующий контакт</span><b>Ещё не назначен</b></div>
    </div>
    <p>Первое обязательное действие менеджера — зафиксировать, когда снова связаться с клиентом.</p>
    <button type="button" class="v4-primary" data-training-action="schedule_contact">Назначить контакт на завтра, 10:00</button>`;
}

function needStep() {
  return `
    <div class="v4-training-kicker">Этап 2 · Потребность</div>
    <h3>Проверьте исходные данные</h3>
    <div class="v4-training-data">
      <div><span>Размер</span><b>3 × 0,8 м</b></div>
      <div><span>Основа</span><b>Композит</b></div>
      <div><span>Буквы</span><b>Световые, 280 мм</b></div>
      <div><span>Монтаж</span><b>Нужен</b></div>
      <div><span>Макет</span><b>Нужно разработать</b></div>
      <div><span>Срок</span><b>До 20 июля</b></div>
    </div>
    <div class="v4-training-score"><span>Полнота потребности</span><b>100%</b></div>
    <button type="button" class="v4-primary" data-training-action="confirm_need">Потребность уточнена</button>`;
}

function offerStep() {
  const client = 48000;
  const cost = 31000;
  return `
    <div class="v4-training-kicker">Этап 3 · Расчёт и КП</div>
    <h3>Проверьте экономику перед отправкой</h3>
    <div class="v4-training-data">
      <div><span>Клиенту</span><b>${money(client)}</b></div>
      <div><span>Себестоимость</span><b>${money(cost)}</b></div>
      <div><span>Плановая прибыль</span><b>${money(client - cost)}</b></div>
      <div><span>Маржа</span><b>35,4%</b></div>
    </div>
    <div class="v4-training-message">КП включает изготовление, макет, доставку и монтаж. Предоплата — 70%.</div>
    <button type="button" class="v4-primary" data-training-action="approve_offer">КП проверено и согласовано</button>`;
}

function orderStep() {
  return `
    <div class="v4-training-kicker">Этап 4 · Заказ</div>
    <h3>Учебный заказ №УЧЕБНЫЙ-001</h3>
    <div class="v4-training-data">
      <div><span>Статус</span><b>Новый</b></div>
      <div><span>Сумма</span><b>48 000 ₽</b></div>
      <div><span>Макет</span><b>Макет согласован</b></div>
      <div><span>Предоплата</span><b>33 600 ₽</b></div>
      <div><span>Срок</span><b>20 июля</b></div>
      <div><span>Ответственный</span><b>Менеджер</b></div>
    </div>
    <p>Перед передачей проверьте макет, оплату, срок и техническое задание.</p>
    <button type="button" class="v4-primary" data-training-action="create_order">Передать в производство</button>`;
}

function productionButtons(status) {
  const targets = {
    'Не передано': ['В производстве'],
    'В производстве': ['Готово'],
    'Готово': ['Выдано']
  }[status] || [];
  const valid = targets.map((target) => `<button type="button" class="v4-primary" data-training-production-status="${esc(target)}">${esc(target)}</button>`).join('');
  const invalid = status === 'Не передано'
    ? '<button type="button" class="v4-training-danger" data-training-production-status="Выдано">Попробовать сразу «Выдано»</button>'
    : '';
  return valid + invalid;
}

function productionStep(state) {
  return `
    <div class="v4-training-kicker">Этап 5 · Производство</div>
    <h3>Меняйте статус последовательно</h3>
    <div class="v4-training-status"><span>Текущий статус</span><b>${esc(state.productionStatus)}</b></div>
    <p>CRM разрешает только переходы из canonical registry. На первом шаге можно специально проверить защиту от пропуска этапов.</p>
    <div class="v4-training-actions">${productionButtons(state.productionStatus)}</div>`;
}

function doneStep() {
  return `
    <div class="v4-training-complete">
      <b>✓</b>
      <h3>Учебный заказ успешно завершён</h3>
      <p>Вы прошли путь от заявки до выдачи без создания записей в рабочей CRM.</p>
      <div class="v4-training-actions">
        <button type="button" class="v4-primary" data-training-close>Закрыть</button>
        <button type="button" data-training-action="reset">Пройти ещё раз</button>
      </div>
    </div>`;
}

function phaseContent(state) {
  if (state.phase === 'lead') return leadStep();
  if (state.phase === 'need') return needStep();
  if (state.phase === 'offer') return offerStep();
  if (state.phase === 'order') return orderStep();
  if (state.phase === 'production') return productionStep(state);
  return doneStep();
}

let currentState = createTrainingScenarioState();

function render() {
  const progress = trainingScenarioProgress(currentState);
  host().innerHTML = `
    <div class="v4-training-modal" role="dialog" aria-modal="true" aria-labelledby="crmTrainingTitle">
      <div class="v4-training-card">
        <header class="v4-training-head">
          <div><div class="v4-training-kicker">Локальное обучение</div><h2 id="crmTrainingTitle">Учебный заказ</h2><p>Все действия остаются только в этом браузере.</p></div>
          <button type="button" data-training-close aria-label="Закрыть обучение">Закрыть</button>
        </header>
        <div class="v4-training-safe"><b>Безопасный режим:</b> модуль не отправляет запросы и не создаёт клиентов, заявки, КП или заказы в Supabase.</div>
        <div class="v4-training-progress"><span>${progress.completed} из ${progress.total}</span><progress max="${progress.total}" value="${progress.completed}">${progress.percent}%</progress></div>
        <div class="v4-training-layout">
          <ol class="v4-training-steps">${stepList(currentState)}</ol>
          <main class="v4-training-stage">
            ${currentState.lastError ? `<div class="v4-training-error" role="alert">${esc(currentState.lastError)}</div>` : ''}
            ${phaseContent(currentState)}
          </main>
        </div>
        <footer class="v4-training-foot"><span>Данные: вымышленный учебный пример</span><button type="button" data-training-action="reset">Сбросить сценарий</button></footer>
      </div>
    </div>`;
}

function openScenario() {
  currentState = readState();
  render();
}

function closeScenario() {
  host().innerHTML = '';
}

function applyAction(action) {
  const previousPhase = currentState.phase;
  currentState = writeState(applyTrainingScenarioAction(currentState, action));
  render();
  if (previousPhase !== 'done' && currentState.phase === 'done') {
    document.dispatchEvent(new CustomEvent('leader-v4:training-scenario-completed', { detail: { localOnly: true } }));
  }
}

function bootTrainingScenario() {
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-open-training-scenario]')) {
      event.preventDefault();
      openScenario();
      return;
    }
    if (event.target.closest?.('[data-training-close]')) {
      event.preventDefault();
      closeScenario();
      return;
    }
    const action = event.target.closest?.('[data-training-action]');
    if (action) {
      event.preventDefault();
      applyAction({ type: action.dataset.trainingAction });
      return;
    }
    const transition = event.target.closest?.('[data-training-production-status]');
    if (transition) {
      event.preventDefault();
      applyAction({ type: 'production_transition', status: transition.dataset.trainingProductionStatus });
      return;
    }
    if (event.target.classList?.contains('v4-training-modal')) closeScenario();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.querySelector('.v4-training-modal')) closeScenario();
  });
}

if (typeof document !== 'undefined' && !window.LeaderV4TrainingScenarioV1Booted) {
  window.LeaderV4TrainingScenarioV1Booted = true;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootTrainingScenario);
  else bootTrainingScenario();
}
