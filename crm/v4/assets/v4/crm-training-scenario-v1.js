import { statusDefinition, validateStatusTransition } from './status-transitions-v1.js';
import { roleAccessSummary } from './role-tab-permissions-v1.js';

const STORAGE_KEY = 'leader_crm_v4_training_scenario_v1';
const VERSION = 2;

export const TRAINING_TRACK_IDS = Object.freeze(['manager', 'production', 'installation']);
export const TRAINING_TRACK_STEP_IDS = Object.freeze({
  manager: Object.freeze(['lead', 'need', 'offer', 'order', 'production']),
  production: Object.freeze(['production_brief', 'production_start', 'production_finish']),
  installation: Object.freeze(['installation_brief', 'installation_schedule', 'installation_finish'])
});
export const TRAINING_STEP_IDS = TRAINING_TRACK_STEP_IDS.manager;
export const TRAINING_PHASES = Object.freeze([...TRAINING_STEP_IDS, 'done']);

const TRACK_TITLES = Object.freeze({
  manager: 'Маршрут менеджера',
  production: 'Маршрут производства',
  installation: 'Маршрут монтажа'
});

const PHASE_TITLES = Object.freeze({
  lead: 'Принять заявку',
  need: 'Уточнить потребность',
  offer: 'Проверить расчёт и КП',
  order: 'Создать заказ',
  production: 'Пройти производство',
  production_brief: 'Проверить задание',
  production_start: 'Запустить производство',
  production_finish: 'Довести до выдачи',
  installation_brief: 'Проверить монтаж',
  installation_schedule: 'Подтвердить выезд',
  installation_finish: 'Завершить монтаж',
  done: 'Учебный маршрут завершён'
});

function normalizedTrack(value) {
  const track = String(value || '').trim();
  return TRAINING_TRACK_IDS.includes(track) ? track : 'manager';
}

function stepsForTrack(track) {
  return TRAINING_TRACK_STEP_IDS[normalizedTrack(track)];
}

function completedList(value, track) {
  const allowed = new Set(stepsForTrack(track));
  const source = Array.isArray(value) ? value : [];
  return [...new Set(source.map((item) => String(item || '').trim()).filter((item) => allowed.has(item)))];
}

function freezeState(value) {
  return Object.freeze({
    version: VERSION,
    track: value.track,
    phase: value.phase,
    completed: Object.freeze([...value.completed]),
    productionStatus: value.productionStatus,
    installationStatus: value.installationStatus,
    lastError: value.lastError || ''
  });
}

export function availableTrainingTracks(access = {}) {
  const tabs = new Set(Array.isArray(access?.tabs) ? access.tabs.map(String) : []);
  const productionKinds = new Set(Array.isArray(access?.productionKinds) ? access.productionKinds.map(String) : []);
  const tracks = [];
  if (tabs.has('leads') && tabs.has('orders')) tracks.push('manager');
  if (tabs.has('production') && productionKinds.has('production')) tracks.push('production');
  if (tabs.has('production') && productionKinds.has('installation')) tracks.push('installation');
  return Object.freeze(tracks);
}

export function trainingTrackForAccess(access = {}) {
  const role = String(access?.role || '').trim().toLowerCase();
  const available = availableTrainingTracks(access);
  if (role === 'installer' && available.includes('installation')) return 'installation';
  if (['designer', 'contractor', 'production'].includes(role) && available.includes('production')) return 'production';
  if (['owner', 'admin', 'manager'].includes(role) && available.includes('manager')) return 'manager';
  return available[0] || 'manager';
}

export function createTrainingScenarioState(track = 'manager') {
  const normalized = normalizedTrack(track);
  return freezeState({
    track: normalized,
    phase: stepsForTrack(normalized)[0],
    completed: [],
    productionStatus: 'Не передано',
    installationStatus: 'Не назначен',
    lastError: ''
  });
}

export function normalizeTrainingScenarioState(value = {}, fallbackTrack = 'manager') {
  const track = TRAINING_TRACK_IDS.includes(value?.track) ? value.track : normalizedTrack(fallbackTrack);
  const steps = stepsForTrack(track);
  const completed = completedList(value?.completed, track);
  const phase = [...steps, 'done'].includes(value?.phase) ? value.phase : steps[0];
  const production = statusDefinition('production', value?.productionStatus);
  const installation = statusDefinition('installation', value?.installationStatus);
  return freezeState({
    track,
    phase,
    completed,
    productionStatus: production?.label || 'Не передано',
    installationStatus: installation?.label || 'Не назначен',
    lastError: String(value?.lastError || '').slice(0, 240)
  });
}

function withError(state, message) {
  return normalizeTrainingScenarioState({ ...state, lastError: message }, state.track);
}

function advance(state, currentPhase, nextPhase) {
  if (state.phase !== currentPhase) {
    return withError(state, `Сначала завершите этап «${PHASE_TITLES[state.phase] || state.phase}».`);
  }
  return normalizeTrainingScenarioState({
    ...state,
    phase: nextPhase,
    completed: [...state.completed, currentPhase],
    lastError: ''
  }, state.track);
}

export function trainingScenarioProgress(value) {
  const state = normalizeTrainingScenarioState(value, value?.track);
  const completed = state.completed.length;
  const total = stepsForTrack(state.track).length;
  return Object.freeze({ completed, total, percent: total ? Math.round((completed / total) * 100) : 0 });
}

function applyProductionTransition(state, target) {
  const managerPhase = state.track === 'manager' && state.phase === 'production';
  const productionPhase = state.track === 'production' && ['production_start', 'production_finish'].includes(state.phase);
  if (!managerPhase && !productionPhase) return withError(state, 'Статусы производства доступны только на соответствующем учебном этапе.');
  const transition = validateStatusTransition('production', state.productionStatus, target);
  if (!transition.ok) return withError(state, `Переход «${state.productionStatus} → ${target || 'не указан'}» запрещён registry.`);

  if (state.track === 'manager') {
    const done = transition.to === 'issued';
    return normalizeTrainingScenarioState({
      ...state,
      phase: done ? 'done' : 'production',
      completed: done ? [...state.completed, 'production'] : state.completed,
      productionStatus: transition.label,
      lastError: ''
    }, state.track);
  }

  if (state.phase === 'production_start' && transition.to === 'in_production') {
    return normalizeTrainingScenarioState({
      ...state,
      phase: 'production_finish',
      completed: [...state.completed, 'production_start'],
      productionStatus: transition.label,
      lastError: ''
    }, state.track);
  }

  const done = state.phase === 'production_finish' && transition.to === 'issued';
  return normalizeTrainingScenarioState({
    ...state,
    phase: done ? 'done' : state.phase,
    completed: done ? [...state.completed, 'production_finish'] : state.completed,
    productionStatus: transition.label,
    lastError: ''
  }, state.track);
}

function applyInstallationTransition(state, target) {
  if (state.track !== 'installation' || !['installation_schedule', 'installation_finish'].includes(state.phase)) {
    return withError(state, 'Статусы монтажа доступны только на соответствующем учебном этапе.');
  }
  const transition = validateStatusTransition('installation', state.installationStatus, target);
  if (!transition.ok) return withError(state, `Переход «${state.installationStatus} → ${target || 'не указан'}» запрещён registry.`);

  if (state.phase === 'installation_schedule' && transition.to === 'scheduled') {
    return normalizeTrainingScenarioState({
      ...state,
      phase: 'installation_finish',
      completed: [...state.completed, 'installation_schedule'],
      installationStatus: transition.label,
      lastError: ''
    }, state.track);
  }

  const done = state.phase === 'installation_finish' && transition.to === 'completed';
  return normalizeTrainingScenarioState({
    ...state,
    phase: done ? 'done' : state.phase,
    completed: done ? [...state.completed, 'installation_finish'] : state.completed,
    installationStatus: transition.label,
    lastError: ''
  }, state.track);
}

export function applyTrainingScenarioAction(value, action = {}) {
  const state = normalizeTrainingScenarioState(value, value?.track);
  const type = String(action?.type || '').trim();
  if (type === 'reset') return createTrainingScenarioState(state.track);
  if (type === 'select_track') return createTrainingScenarioState(action?.track);

  if (state.track === 'manager') {
    if (type === 'schedule_contact') return advance(state, 'lead', 'need');
    if (type === 'confirm_need') return advance(state, 'need', 'offer');
    if (type === 'approve_offer') return advance(state, 'offer', 'order');
    if (type === 'create_order') return advance(state, 'order', 'production');
  }
  if (state.track === 'production' && type === 'confirm_production_brief') return advance(state, 'production_brief', 'production_start');
  if (state.track === 'installation' && type === 'confirm_installation_brief') return advance(state, 'installation_brief', 'installation_schedule');
  if (type === 'production_transition') return applyProductionTransition(state, String(action?.status || '').trim());
  if (type === 'installation_transition') return applyInstallationTransition(state, String(action?.status || '').trim());
  return withError(state, 'Неизвестное учебное действие.');
}

function readState(fallbackTrack) {
  try {
    return normalizeTrainingScenarioState(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}'), fallbackTrack);
  } catch (_) {
    return createTrainingScenarioState(fallbackTrack);
  }
}

function writeState(value) {
  const state = normalizeTrainingScenarioState(value, value?.track);
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

function tabControl(tab) {
  return document.querySelector(`[data-v4-tab-button="${String(tab || '').trim()}"]`);
}

function tabAvailable(tab) {
  const control = tabControl(tab);
  return Boolean(control && !control.hidden && !control.disabled && control.getAttribute('aria-hidden') !== 'true' && control.style.display !== 'none');
}

function currentTrainingAccess() {
  const summary = roleAccessSummary();
  const tabs = (summary.tabs || []).filter(tabAvailable);
  return Object.freeze({
    role: summary.role || '',
    tabs: Object.freeze(tabs),
    productionKinds: Object.freeze(tabs.includes('production') ? [...(summary.productionKinds || [])] : [])
  });
}

function tabHint(tab, label) {
  const available = currentAccess.tabs.includes(tab);
  return `<div class="v4-training-message"><b>Рабочий раздел:</b> ${esc(label)}. ${available
    ? `<button type="button" data-training-open-tab="${esc(tab)}">Открыть доступную вкладку</button>`
    : '<span>Для текущей роли вкладка недоступна, поэтому этот шаг остаётся только локальной тренировкой.</span>'}</div>`;
}

function stepList(state) {
  return stepsForTrack(state.track).map((id, index) => {
    const done = state.completed.includes(id);
    const active = state.phase === id;
    return `<li class="${done ? 'is-done' : active ? 'is-active' : ''}"><b>${done ? '✓' : index + 1}</b><span>${esc(PHASE_TITLES[id])}</span></li>`;
  }).join('');
}

function trackChooser() {
  if (currentTracks.length < 2) return '';
  return `<div class="v4-training-actions" aria-label="Выбор учебного маршрута">${currentTracks.map((track) => (
    `<button type="button" class="${currentState.track === track ? 'v4-primary' : ''}" data-training-track="${track}">${esc(TRACK_TITLES[track])}</button>`
  )).join('')}</div>`;
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
    ${tabHint('leads', 'Заявки')}
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
    ${tabHint('leads', 'Карточка заявки')}
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
    ${tabHint('leads', 'Расчёты и КП в карточке заявки')}
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
    ${tabHint('orders', 'Заказы')}
    <button type="button" class="v4-primary" data-training-action="create_order">Передать в производство</button>`;
}

function productionButtons(status) {
  const targets = {
    'Не передано': ['В производстве'],
    'В очереди': ['В производстве'],
    'В производстве': ['Готово'],
    'Готово': ['Выдано']
  }[status] || [];
  const valid = targets.map((target) => `<button type="button" class="v4-primary" data-training-production-status="${esc(target)}">${esc(target)}</button>`).join('');
  const invalid = status === 'Не передано'
    ? '<button type="button" class="v4-training-danger" data-training-production-status="Выдано">Попробовать сразу «Выдано»</button>'
    : '';
  return valid + invalid;
}

function productionStep(state, specialized = false) {
  return `
    <div class="v4-training-kicker">${specialized ? 'Производство' : 'Этап 5 · Производство'}</div>
    <h3>${state.phase === 'production_start' ? 'Примите задание в работу' : 'Меняйте статус последовательно'}</h3>
    <div class="v4-training-status"><span>Текущий статус</span><b>${esc(state.productionStatus)}</b></div>
    <p>CRM разрешает только переходы из canonical registry. На первом шаге можно специально проверить защиту от пропуска этапов.</p>
    ${tabHint('production', 'Производство')}
    <div class="v4-training-actions">${productionButtons(state.productionStatus)}</div>`;
}

function productionBriefStep() {
  return `
    <div class="v4-training-kicker">Этап 1 · Производственное задание</div>
    <h3>Проверьте комплектность перед запуском</h3>
    <div class="v4-training-data">
      <div><span>Заказ</span><b>№УЧЕБНЫЙ-001</b></div>
      <div><span>Изделие</span><b>Световая вывеска</b></div>
      <div><span>Макет</span><b>Согласован</b></div>
      <div><span>Материал</span><b>Композит + акрил</b></div>
      <div><span>Срок</span><b>18 июля</b></div>
      <div><span>Контроль</span><b>Фото готового изделия</b></div>
    </div>
    <p>Не начинайте работу без понятного макета, размеров, материалов и срока.</p>
    ${tabHint('production', 'Производство')}
    <button type="button" class="v4-primary" data-training-action="confirm_production_brief">Задание проверено</button>`;
}

function installationButtons(status) {
  const targets = {
    'Не назначен': ['Запланирован'],
    'Запланирован': ['В работе'],
    'Перенесён': ['Запланирован', 'В работе'],
    'В работе': ['Выполнен']
  }[status] || [];
  const valid = targets.map((target) => `<button type="button" class="v4-primary" data-training-installation-status="${esc(target)}">${esc(target)}</button>`).join('');
  const invalid = status === 'Не назначен'
    ? '<button type="button" class="v4-training-danger" data-training-installation-status="Выполнен">Попробовать сразу «Выполнен»</button>'
    : '';
  return valid + invalid;
}

function installationBriefStep() {
  return `
    <div class="v4-training-kicker">Этап 1 · Монтажное задание</div>
    <h3>Проверьте выезд до подтверждения</h3>
    <div class="v4-training-data">
      <div><span>Заказ</span><b>№УЧЕБНЫЙ-001</b></div>
      <div><span>Адрес</span><b>Учебная улица, 10</b></div>
      <div><span>Дата</span><b>20 июля, 09:00</b></div>
      <div><span>Изделие</span><b>Световая вывеска</b></div>
      <div><span>Крепёж</span><b>Подготовлен</b></div>
      <div><span>Контроль</span><b>Фото до и после</b></div>
    </div>
    <p>До выезда проверьте адрес, время, комплект инструмента, крепёж и доступ к месту монтажа.</p>
    ${tabHint('production', 'Монтаж')}
    <button type="button" class="v4-primary" data-training-action="confirm_installation_brief">Данные выезда проверены</button>`;
}

function installationStep(state) {
  return `
    <div class="v4-training-kicker">Монтаж</div>
    <h3>${state.phase === 'installation_schedule' ? 'Подтвердите выезд' : 'Зафиксируйте выполнение'}</h3>
    <div class="v4-training-status"><span>Текущий статус</span><b>${esc(state.installationStatus)}</b></div>
    <p>Статусы монтажа меняются последовательно. Прямое завершение неназначенного монтажа должно быть отклонено registry.</p>
    ${tabHint('production', 'Монтаж')}
    <div class="v4-training-actions">${installationButtons(state.installationStatus)}</div>`;
}

function doneStep(state) {
  const text = state.track === 'manager'
    ? 'Вы прошли путь от заявки до выдачи без создания записей в рабочей CRM.'
    : state.track === 'production'
      ? 'Вы проверили задание и последовательно довели учебное производство до выдачи.'
      : 'Вы проверили выезд и последовательно завершили учебный монтаж.';
  return `
    <div class="v4-training-complete">
      <b>✓</b>
      <h3>${esc(TRACK_TITLES[state.track])} завершён</h3>
      <p>${esc(text)}</p>
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
  if (state.phase === 'production_brief') return productionBriefStep();
  if (['production_start', 'production_finish'].includes(state.phase)) return productionStep(state, true);
  if (state.phase === 'installation_brief') return installationBriefStep();
  if (['installation_schedule', 'installation_finish'].includes(state.phase)) return installationStep(state);
  return doneStep(state);
}

let currentState = createTrainingScenarioState();
let currentAccess = Object.freeze({ role: '', tabs: Object.freeze([]), productionKinds: Object.freeze([]) });
let currentTracks = Object.freeze(['manager']);

function render() {
  const progress = trainingScenarioProgress(currentState);
  const roleLabel = currentAccess.role || 'роль не определена';
  const tabsLabel = currentAccess.tabs.length ? currentAccess.tabs.join(', ') : 'нет доступных вкладок';
  host().innerHTML = `
    <div class="v4-training-modal" role="dialog" aria-modal="true" aria-labelledby="crmTrainingTitle">
      <div class="v4-training-card">
        <header class="v4-training-head">
          <div><div class="v4-training-kicker">Локальное обучение</div><h2 id="crmTrainingTitle">${esc(TRACK_TITLES[currentState.track])}</h2><p>Все действия остаются только в этом браузере.</p></div>
          <button type="button" data-training-close aria-label="Закрыть обучение">Закрыть</button>
        </header>
        <div class="v4-training-safe"><b>Безопасный режим:</b> модуль не отправляет запросы и не создаёт клиентов, заявки, КП или заказы в Supabase.</div>
        ${trackChooser()}
        <div class="v4-training-progress"><span>${progress.completed} из ${progress.total}</span><progress max="${progress.total}" value="${progress.completed}">${progress.percent}%</progress></div>
        <div class="v4-training-layout">
          <ol class="v4-training-steps">${stepList(currentState)}</ol>
          <main class="v4-training-stage">
            ${currentState.lastError ? `<div class="v4-training-error" role="alert">${esc(currentState.lastError)}</div>` : ''}
            ${phaseContent(currentState)}
          </main>
        </div>
        <footer class="v4-training-foot"><span>Вымышленный пример · ${esc(roleLabel)} · ${esc(tabsLabel)}</span><button type="button" data-training-action="reset">Сбросить сценарий</button></footer>
      </div>
    </div>`;
}

function openScenario() {
  currentAccess = currentTrainingAccess();
  const available = availableTrainingTracks(currentAccess);
  const preferred = trainingTrackForAccess(currentAccess);
  currentTracks = available.length ? available : Object.freeze([preferred]);
  const saved = readState(preferred);
  currentState = currentTracks.includes(saved.track) ? saved : writeState(createTrainingScenarioState(preferred));
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
    document.dispatchEvent(new CustomEvent('leader-v4:training-scenario-completed', { detail: { localOnly: true, track: currentState.track } }));
  }
}

function openTrainingTab(tab) {
  const target = String(tab || '').trim();
  currentAccess = currentTrainingAccess();
  if (!currentAccess.tabs.includes(target) || typeof window.v4SetTab !== 'function') {
    currentState = writeState(withError(currentState, 'Эта вкладка недоступна для текущей роли.'));
    render();
    document.dispatchEvent(new CustomEvent('leader-v4:tab-denied', { detail: { requested: target, reason: 'training_role_not_allowed' } }));
    return;
  }
  closeScenario();
  window.v4SetTab(target);
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
    const track = event.target.closest?.('[data-training-track]');
    if (track) {
      event.preventDefault();
      const target = String(track.dataset.trainingTrack || '').trim();
      if (currentTracks.includes(target)) applyAction({ type: 'select_track', track: target });
      return;
    }
    const openTab = event.target.closest?.('[data-training-open-tab]');
    if (openTab) {
      event.preventDefault();
      openTrainingTab(openTab.dataset.trainingOpenTab);
      return;
    }
    const action = event.target.closest?.('[data-training-action]');
    if (action) {
      event.preventDefault();
      applyAction({ type: action.dataset.trainingAction });
      return;
    }
    const productionTransition = event.target.closest?.('[data-training-production-status]');
    if (productionTransition) {
      event.preventDefault();
      applyAction({ type: 'production_transition', status: productionTransition.dataset.trainingProductionStatus });
      return;
    }
    const installationTransition = event.target.closest?.('[data-training-installation-status]');
    if (installationTransition) {
      event.preventDefault();
      applyAction({ type: 'installation_transition', status: installationTransition.dataset.trainingInstallationStatus });
      return;
    }
    if (event.target.classList?.contains('v4-training-modal')) closeScenario();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.querySelector('.v4-training-modal')) closeScenario();
  });
  for (const eventName of ['leader-v4:crm-ready', 'leader-v4:tab-opened']) {
    document.addEventListener(eventName, () => {
      if (!document.querySelector('.v4-training-modal')) return;
      currentAccess = currentTrainingAccess();
      const available = availableTrainingTracks(currentAccess);
      currentTracks = available.length ? available : Object.freeze([trainingTrackForAccess(currentAccess)]);
      if (!currentTracks.includes(currentState.track)) currentState = writeState(createTrainingScenarioState(trainingTrackForAccess(currentAccess)));
      render();
    });
  }
}

if (typeof document !== 'undefined' && !window.LeaderV4TrainingScenarioV1Booted) {
  window.LeaderV4TrainingScenarioV1Booted = true;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootTrainingScenario);
  else bootTrainingScenario();
}
