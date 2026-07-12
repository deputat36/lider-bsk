import { statusDefinition } from './status-transitions-v1.js';

const STORAGE_KEY = 'leader_crm_v4_quick_start_v1';

export const QUICK_START_STEP_IDS = Object.freeze(['lead', 'need', 'offer', 'order', 'finish']);

function completedList(value) {
  const source = Array.isArray(value) ? value : [];
  return [...new Set(source.map((item) => String(item || '').trim()).filter((item) => QUICK_START_STEP_IDS.includes(item)))];
}

function automaticList(value, completed) {
  const completedSet = new Set(completed);
  return completedList(value).filter((item) => completedSet.has(item));
}

export function normalizeQuickStartState(value = {}) {
  const completed = completedList(value?.completed);
  return Object.freeze({
    completed: Object.freeze(completed),
    automatic: Object.freeze(automaticList(value?.automatic, completed)),
    collapsed: value?.collapsed === true
  });
}

export function setQuickStartStep(value, stepId, done = true) {
  const state = normalizeQuickStartState(value);
  const id = String(stepId || '').trim();
  if (!QUICK_START_STEP_IDS.includes(id)) return state;
  const completed = new Set(state.completed);
  const automatic = new Set(state.automatic);
  if (done) completed.add(id);
  else completed.delete(id);
  automatic.delete(id);
  return normalizeQuickStartState({ completed: [...completed], automatic: [...automatic], collapsed: state.collapsed });
}

export function completeQuickStartAutomatically(value, stepId) {
  const state = normalizeQuickStartState(value);
  const id = String(stepId || '').trim();
  if (!QUICK_START_STEP_IDS.includes(id) || state.completed.includes(id)) return state;
  return normalizeQuickStartState({
    completed: [...state.completed, id],
    automatic: [...state.automatic, id],
    collapsed: state.collapsed
  });
}

export function quickStartProgress(value) {
  const state = normalizeQuickStartState(value);
  const completed = state.completed.length;
  const total = QUICK_START_STEP_IDS.length;
  return Object.freeze({ completed, total, percent: total ? Math.round((completed / total) * 100) : 0 });
}

function successfulFinish(order = {}) {
  const production = statusDefinition('production', order.production_status);
  if (production && ['issued', 'not_required'].includes(production.key)) return true;
  const installation = statusDefinition('installation', order.installation_status);
  if (installation && ['completed', 'not_required'].includes(installation.key)) return true;
  return statusDefinition('order', order.status)?.key === 'closed';
}

export function quickStartStepsForEvent(type, detail = {}) {
  if (type === 'leader-v4:lead-card-rendered') {
    return detail?.lead?.id && detail.lead.next_contact_at ? Object.freeze(['lead']) : Object.freeze([]);
  }
  if (type === 'leader-v4:needs-loaded') {
    const ready = Array.isArray(detail?.needs) && detail.needs.some((need) => (
      need?.status !== 'Архив' && Number(need?.completeness_score || 0) >= 80
    ));
    return ready ? Object.freeze(['need']) : Object.freeze([]);
  }
  if (type === 'leader-v4-order-updated' && detail?.order?.id) {
    return Object.freeze(successfulFinish(detail.order) ? ['order', 'finish'] : ['order']);
  }
  return Object.freeze([]);
}

export function quickStartStepsForRenderedProof(proof = {}) {
  return Object.freeze([
    ...(proof.offer === true ? ['offer'] : []),
    ...(proof.order === true ? ['order'] : [])
  ]);
}

function readState() {
  try {
    return normalizeQuickStartState(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}'));
  } catch (_) {
    return normalizeQuickStartState();
  }
}

function writeState(value) {
  const state = normalizeQuickStartState(value);
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  return state;
}

function tabControl(tab) {
  return document.querySelector(`[data-v4-tab-button="${String(tab || '').trim()}"]`);
}

function tabAvailable(tab) {
  const control = tabControl(tab);
  return Boolean(control && !control.hidden && control.getAttribute('aria-hidden') !== 'true' && control.style.display !== 'none');
}

function ensureAccessLink(host) {
  const footer = host.querySelector('.v4-quick-start-footer');
  if (!footer) return;
  let link = footer.querySelector('[data-quick-start-access-link]');
  if (!link) {
    link = document.createElement('a');
    link.href = '?tab=user_admin';
    link.className = 'v4-primary';
    link.dataset.quickStartAccessLink = '';
    link.textContent = 'Открыть доступ CRM';
    const details = footer.querySelector('details');
    if (details) footer.insertBefore(link, details);
    else footer.appendChild(link);
  }
  const available = tabAvailable('user_admin');
  link.hidden = !available;
  link.setAttribute('aria-hidden', available ? 'false' : 'true');
  link.title = available ? '' : 'Раздел недоступен для вашей роли';
}

let state = normalizeQuickStartState();
let detectionScheduled = false;

function ensureAutomaticBadge(element) {
  let badge = element.querySelector('[data-quick-start-auto-badge]');
  if (badge) return badge;
  badge = document.createElement('span');
  badge.dataset.quickStartAutoBadge = '';
  badge.className = 'v4-quick-start-auto-badge';
  badge.textContent = 'Отмечено автоматически';
  const actions = element.querySelector('.v4-quick-start-actions');
  if (actions) actions.appendChild(badge);
  else element.appendChild(badge);
  return badge;
}

function render() {
  const host = document.getElementById('crmQuickStart');
  if (!host) return;
  ensureAccessLink(host);
  const progress = quickStartProgress(state);
  const body = document.getElementById('crmQuickStartBody');
  const progressText = document.getElementById('crmQuickStartProgressText');
  const progressBar = document.getElementById('crmQuickStartProgress');

  if (body) body.hidden = state.collapsed;
  if (progressText) progressText.textContent = `${progress.completed} из ${progress.total} шагов`;
  if (progressBar) {
    progressBar.max = progress.total;
    progressBar.value = progress.completed;
    progressBar.textContent = `${progress.completed} из ${progress.total}`;
  }

  host.querySelectorAll('[data-quick-start-step]').forEach((element) => {
    const stepId = element.dataset.quickStartStep || '';
    const done = state.completed.includes(stepId);
    const automatic = state.automatic.includes(stepId);
    element.classList.toggle('is-done', done);
    element.classList.toggle('is-auto', automatic);
    ensureAutomaticBadge(element).hidden = !automatic;
  });
  host.querySelectorAll('[data-quick-start-done]').forEach((checkbox) => {
    checkbox.checked = state.completed.includes(checkbox.dataset.quickStartDone || '');
  });
  host.querySelectorAll('[data-quick-start-hide]').forEach((button) => { button.hidden = state.collapsed; });
  host.querySelectorAll('[data-quick-start-show]').forEach((button) => { button.hidden = !state.collapsed; });

  document.querySelectorAll('[data-quick-start-tab]').forEach((button) => {
    const available = tabAvailable(button.dataset.quickStartTab);
    button.disabled = !available;
    button.title = available ? '' : 'Раздел недоступен для вашей роли';
  });
}

function applyAutomaticSteps(stepIds) {
  const pending = stepIds.filter((stepId) => (
    QUICK_START_STEP_IDS.includes(stepId) && !state.completed.includes(stepId)
  ));
  if (!pending.length) return;
  let next = state;
  for (const stepId of pending) next = completeQuickStartAutomatically(next, stepId);
  state = writeState(next);
  render();
}

function detectRenderedProgress() {
  applyAutomaticSteps(quickStartStepsForRenderedProof({
    offer: Boolean(document.querySelector('.v4-offer-card')),
    order: Boolean(document.querySelector('.v4-order-modal-card'))
  }));
}

function scheduleRenderedProgressDetection() {
  if (detectionScheduled) return;
  detectionScheduled = true;
  const schedule = typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame.bind(window)
    : (callback) => window.setTimeout(callback, 0);
  schedule(() => {
    detectionScheduled = false;
    detectRenderedProgress();
  });
}

function showGuide() {
  state = writeState({ ...state, collapsed: false });
  render();
  document.getElementById('crmQuickStart')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function bootQuickStart() {
  state = readState();
  render();

  document.addEventListener('click', (event) => {
    const tabButton = event.target.closest?.('[data-quick-start-tab]');
    if (tabButton) {
      const tab = tabButton.dataset.quickStartTab || '';
      if (!tabAvailable(tab) || typeof window.v4SetTab !== 'function') {
        document.dispatchEvent(new CustomEvent('leader-v4:tab-denied', { detail: { requested: tab, reason: 'quick_start_role_not_allowed' } }));
        return;
      }
      window.v4SetTab(tab);
      return;
    }

    if (event.target.closest?.('[data-quick-start-hide]')) {
      state = writeState({ ...state, collapsed: true });
      render();
      return;
    }
    if (event.target.closest?.('[data-quick-start-show]')) {
      showGuide();
      return;
    }
    if (event.target.closest?.('[data-quick-start-reset]')) {
      state = writeState({ completed: [], automatic: [], collapsed: false });
      render();
    }
  });

  document.addEventListener('change', (event) => {
    const checkbox = event.target.closest?.('[data-quick-start-done]');
    if (!checkbox) return;
    state = writeState(setQuickStartStep(state, checkbox.dataset.quickStartDone, checkbox.checked));
    render();
  });

  document.addEventListener('leader-v4:crm-ready', render);
  document.addEventListener('leader-v4:tab-opened', render);
  for (const eventName of ['leader-v4:lead-card-rendered', 'leader-v4:needs-loaded', 'leader-v4-order-updated']) {
    document.addEventListener(eventName, (event) => {
      applyAutomaticSteps(quickStartStepsForEvent(eventName, event.detail));
      scheduleRenderedProgressDetection();
    });
  }
  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(scheduleRenderedProgressDetection);
    observer.observe(document.body, { childList: true, subtree: true });
  }
  scheduleRenderedProgressDetection();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootQuickStart);
  else bootQuickStart();
}
