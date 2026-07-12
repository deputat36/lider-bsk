import {
  CRM_TRAINING_SCENARIO,
  CRM_TRAINING_STEP_IDS,
  completeTrainingStep,
  currentTrainingStep,
  normalizeTrainingScenarioState,
  resetTrainingScenario,
  setTrainingScenarioCollapsed,
  startTrainingScenario,
  trainingScenarioProgress
} from './crm-training-scenario-model-v1.js';

const STORAGE_KEY = 'leader_crm_v4_training_scenario_v1';
const HOST_ID = 'crmTrainingScenarioV1';
let state = normalizeTrainingScenarioState();

function esc(value) {
  return String(value ?? '').replace(/[&<>\"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function readState() {
  try {
    return normalizeTrainingScenarioState(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}'));
  } catch (_) {
    return normalizeTrainingScenarioState();
  }
}

function writeState(value) {
  state = normalizeTrainingScenarioState(value);
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  return state;
}

function clearState() {
  try { window.localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  state = resetTrainingScenario();
}

function ensureHost() {
  let host = document.getElementById(HOST_ID);
  if (host) return host;
  const quickStartBody = document.getElementById('crmQuickStartBody');
  if (!quickStartBody) return null;
  host = document.createElement('section');
  host.id = HOST_ID;
  host.className = 'v4-training-scenario';
  host.setAttribute('aria-labelledby', 'crmTrainingScenarioTitle');
  const footer = quickStartBody.querySelector('.v4-quick-start-footer');
  if (footer) footer.insertAdjacentElement('beforebegin', host);
  else quickStartBody.appendChild(host);
  return host;
}

function stepHtml(step, index, currentId) {
  const completed = state.completed.includes(step.id);
  const current = step.id === currentId;
  const locked = !completed && !current;
  const facts = step.facts.map((fact) => `<li>${esc(fact)}</li>`).join('');
  const status = completed ? 'Выполнено локально' : current ? 'Текущий шаг' : 'Откроется после предыдущего шага';
  return `<article class="v4-training-step ${completed ? 'is-done' : ''} ${current ? 'is-current' : ''} ${locked ? 'is-locked' : ''}" data-training-step="${esc(step.id)}"><div class="v4-training-step-number">${index + 1}</div><div><div class="v4-training-step-head"><h4>${esc(step.title)}</h4><span>${esc(status)}</span></div><p>${esc(step.objective)}</p><ul>${facts}</ul><div class="v4-training-result"><b>Результат:</b> ${esc(step.result)}</div>${current ? `<button type="button" class="v4-primary" data-training-complete="${esc(step.id)}">Выполнить учебный шаг</button>` : ''}</div></article>`;
}

function render() {
  const host = ensureHost();
  if (!host) return;
  const progress = trainingScenarioProgress(state);
  const currentId = currentTrainingStep(state);
  const steps = CRM_TRAINING_SCENARIO.steps.map((step, index) => stepHtml(step, index, currentId)).join('');
  const started = state.started;
  const finished = progress.finished;
  host.innerHTML = `<div class="v4-training-head"><div><p class="v4-kicker">Безопасное обучение</p><h3 id="crmTrainingScenarioTitle">${esc(CRM_TRAINING_SCENARIO.title)}</h3><p>${esc(CRM_TRAINING_SCENARIO.clientLabel)}. Пройдите рабочий маршрут без создания записей в CRM.</p></div><div class="v4-training-progress"><span>${progress.completed} из ${progress.total} шагов</span><progress max="${progress.total}" value="${progress.completed}">${progress.completed} из ${progress.total}</progress></div></div><div class="v4-training-warning"><b>Важно:</b> ${esc(CRM_TRAINING_SCENARIO.warning)} Прогресс реального quick-start не изменяется.</div><div class="v4-training-actions">${!started ? '<button type="button" class="v4-primary" data-training-start>Начать тренировку</button>' : ''}${started && !finished ? `<button type="button" data-training-collapse>${state.collapsed ? 'Показать шаги' : 'Скрыть шаги'}</button>` : ''}${started ? '<button type="button" data-training-reset>Сбросить тренировку</button>' : ''}</div>${finished ? '<div class="v4-training-finished"><b>Тренировка завершена.</b> Вы прошли путь от обращения до выдачи, не создавая данных в production.</div>' : ''}<div class="v4-training-steps" ${!started || state.collapsed ? 'hidden' : ''}>${steps}</div><p class="v4-training-local-note">Хранение: только localStorage этого браузера, ключ <code>${STORAGE_KEY}</code>. Клиенты, заявки, КП, заказы, задачи и платежи в Supabase не создаются.</p>`;
}

function boot() {
  state = readState();
  render();
  document.addEventListener('leader-v4:crm-ready', render);
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-training-start]')) {
      writeState(startTrainingScenario(state));
      render();
      return;
    }
    const complete = event.target.closest?.('[data-training-complete]');
    if (complete) {
      writeState(completeTrainingStep(state, complete.dataset.trainingComplete));
      render();
      return;
    }
    if (event.target.closest?.('[data-training-collapse]')) {
      writeState(setTrainingScenarioCollapsed(state, !state.collapsed));
      render();
      return;
    }
    if (event.target.closest?.('[data-training-reset]')) {
      clearState();
      render();
    }
  });
}

if (!window.LeaderV4TrainingScenarioV1Booted) {
  window.LeaderV4TrainingScenarioV1Booted = true;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}

export { render as renderTrainingScenario };
