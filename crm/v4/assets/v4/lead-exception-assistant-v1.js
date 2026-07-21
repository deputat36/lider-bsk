import {
  LEAD_EXCEPTION_SCENARIOS,
  buildLeadExceptionPlan,
  leadExceptionContactDate
} from './lead-exception-scenarios-v1.js';
import './lead-exception-apply-v2.js';

const GLOBAL_FLAG = '__leaderLeadExceptionAssistantV1';
const STYLE_ID = 'leader-lead-exception-assistant-v1-style';
const HOST_ID = 'leadExceptionAssistant';
const SELECT_ID = 'leadExceptionScenarioSelect';
const PREVIEW_ID = 'leadExceptionPreview';
const RESULT_ID = 'leadExceptionPrepareResult';

let selectedKey = '';
let activeLeadId = '';
let applyState = { phase: 'idle', message: '', application: null };

function esc(value) {
  return String(value ?? '').replace(/[&<>\"]/g, (symbol) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[symbol]));
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .v4-lead-exception-assistant{border:1px dashed #f59e0b;background:#fffbeb;border-radius:16px;padding:0 16px}
    .v4-lead-exception-assistant>summary{cursor:pointer;padding:15px 0;font-weight:900;color:#92400e}
    .v4-lead-exception-assistant[open]>summary{border-bottom:1px solid #fde68a}
    .v4-lead-exception-body{padding:15px 0 17px;display:grid;gap:13px}
    .v4-lead-exception-body>p{margin:0;color:#6b7280}
    .v4-lead-exception-preview{display:grid;gap:9px;padding:13px;border:1px solid #fde68a;border-radius:13px;background:#fff}
    .v4-lead-exception-preview.is-empty{color:#6b7280}
    .v4-lead-exception-preview dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:0}
    .v4-lead-exception-preview dl div{padding:10px;border-radius:11px;background:#f8fafc}
    .v4-lead-exception-preview dt{font-size:12px;font-weight:900;text-transform:uppercase;color:#64748b}
    .v4-lead-exception-preview dd{margin:4px 0 0;font-weight:800;color:#111827}
    .v4-lead-exception-comment{margin:0;padding:11px;border-left:4px solid #f59e0b;background:#fff7ed;color:#374151}
    .v4-lead-exception-consequence{margin:0;color:#7c2d12}
    .v4-lead-exception-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    .v4-lead-exception-actions button{font-weight:900}
    .v4-lead-exception-result{font-weight:800;color:#92400e}
    .v4-lead-exception-result.is-good{color:#166534}
    .v4-lead-exception-result.is-error{color:#b91c1c}
    .v4-lead-exception-result.is-partial{color:#9a3412}
    .v4-chip-button.is-recommended{outline:4px solid rgba(245,158,11,.24);border-color:#f59e0b!important;background:#fffbeb!important;color:#92400e!important}
    @media(max-width:680px){.v4-lead-exception-preview dl{grid-template-columns:1fr}.v4-lead-exception-actions{display:grid}.v4-lead-exception-actions button{width:100%}}
  `;
  document.head.appendChild(style);
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function localInputValue(date) {
  if (!date) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDate(date) {
  if (!date) return 'Не назначается автоматически';
  try {
    return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (_) {
    return localInputValue(date).replace('T', ' ');
  }
}

function optionsMarkup() {
  return [
    '<option value="">Выберите ситуацию</option>',
    ...LEAD_EXCEPTION_SCENARIOS.map((item) => `<option value="${esc(item.key)}">${esc(item.label)}</option>`)
  ].join('');
}

function assistantMarkup() {
  return `
    <summary>Ситуация изменилась</summary>
    <div class="v4-lead-exception-body">
      <p>Проверьте предлагаемые изменения. CRM сохранит статус, следующий контакт и запись истории только после нажатия одной кнопки.</p>
      <label>Что произошло
        <select id="${SELECT_ID}">${optionsMarkup()}</select>
      </label>
      <div id="${PREVIEW_ID}" class="v4-lead-exception-preview is-empty">Выберите ситуацию, чтобы увидеть рекомендуемые действия и последствия.</div>
      <div class="v4-lead-exception-actions">
        <button type="button" class="v4-primary" data-lead-exception-apply disabled>Применить изменения</button>
        <button type="button" data-lead-exception-prepare disabled>Подготовить вручную</button>
        <button type="button" data-lead-exception-retry-history hidden>Повторить запись в истории</button>
        <span id="${RESULT_ID}" class="v4-lead-exception-result" aria-live="polite"></span>
      </div>
    </div>`;
}

function ensureHost() {
  const actionPanel = document.querySelector('#leadCardSection .v4-action-panel');
  if (!actionPanel) return null;
  let host = document.getElementById(HOST_ID);
  if (host) return host;
  host = document.createElement('details');
  host.id = HOST_ID;
  host.className = 'v4-lead-exception-assistant';
  host.innerHTML = assistantMarkup();
  const otherActions = document.getElementById('leadOtherActions');
  if (otherActions?.parentElement === actionPanel) otherActions.insertAdjacentElement('afterend', host);
  else actionPanel.appendChild(host);
  return host;
}

function selectedPlan() {
  return buildLeadExceptionPlan(selectedKey || document.getElementById(SELECT_ID)?.value || '');
}

function stateBusy() {
  return ['applying', 'retrying'].includes(applyState.phase);
}

function renderActionState(plan) {
  const applyButton = document.querySelector('[data-lead-exception-apply]');
  const manualButton = document.querySelector('[data-lead-exception-prepare]');
  const retryButton = document.querySelector('[data-lead-exception-retry-history]');
  const result = document.getElementById(RESULT_ID);
  const busy = stateBusy();

  if (applyButton) {
    applyButton.disabled = !plan || busy || ['success', 'partial'].includes(applyState.phase);
    applyButton.textContent = applyState.phase === 'applying'
      ? 'Сохраняю...'
      : applyState.phase === 'success'
        ? 'Изменения применены'
        : 'Применить изменения';
  }
  if (manualButton) manualButton.disabled = !plan || busy;
  if (retryButton) {
    retryButton.hidden = applyState.phase !== 'partial';
    retryButton.disabled = busy;
    retryButton.textContent = applyState.phase === 'retrying' ? 'Повторяю запись...' : 'Повторить запись в истории';
  }
  if (result) {
    result.textContent = applyState.message || '';
    result.className = `v4-lead-exception-result${applyState.phase === 'success' ? ' is-good' : applyState.phase === 'partial' ? ' is-partial' : applyState.phase === 'error' ? ' is-error' : ''}`;
  }
}

function renderPreview() {
  const host = ensureHost();
  const preview = document.getElementById(PREVIEW_ID);
  const select = document.getElementById(SELECT_ID);
  if (!host || !preview) return;
  if (select && select.value !== selectedKey) select.value = selectedKey;
  const plan = selectedPlan();
  if (!plan) {
    preview.className = 'v4-lead-exception-preview is-empty';
    preview.textContent = 'Выберите ситуацию, чтобы увидеть рекомендуемые действия и последствия.';
    renderActionState(null);
    return;
  }
  const contactDate = leadExceptionContactDate(plan.nextContact);
  preview.className = 'v4-lead-exception-preview';
  preview.innerHTML = `
    <dl>
      <div><dt>Новый статус</dt><dd>${esc(plan.status)}</dd></div>
      <div><dt>Следующий контакт</dt><dd>${esc(formatDate(contactDate))}</dd></div>
    </dl>
    <p class="v4-lead-exception-comment">${esc(plan.comment)}</p>
    <p class="v4-lead-exception-consequence"><b>Что важно:</b> ${esc(plan.consequence)}</p>
    <p class="v4-lead-exception-consequence">${esc(plan.saveNotice)}</p>`;
  renderActionState(plan);
}

function clearRecommendedStatus() {
  document.querySelectorAll('#leadCardSection [data-lead-status].is-recommended').forEach((button) => {
    button.classList.remove('is-recommended');
    button.removeAttribute('aria-label');
  });
}

function recommendStatus(plan) {
  clearRecommendedStatus();
  const statusButton = Array.from(document.querySelectorAll('#leadOtherActions [data-lead-status]'))
    .find((button) => button.dataset.leadStatus === plan.status);
  const details = document.getElementById('leadOtherActions');
  if (details) details.open = true;
  if (!statusButton) return;
  statusButton.classList.add('is-recommended');
  statusButton.setAttribute('aria-label', `Рекомендуемый статус: ${plan.status}. Нажмите, чтобы сохранить.`);
}

function prepareNextContact(plan) {
  const date = leadExceptionContactDate(plan.nextContact);
  const input = document.getElementById('leadNextContactInput');
  const details = document.getElementById('leadNextContactDetails');
  if (!date || !input) return;
  input.value = localInputValue(date);
  if (details) details.open = true;
}

function prepareTimeline(plan, attempt = 0) {
  const type = document.getElementById('leadTimelineType');
  const body = document.getElementById('leadTimelineBody');
  if ((!type || !body) && attempt < 4) {
    setTimeout(() => prepareTimeline(plan, attempt + 1), 80);
    return;
  }
  if (type) type.value = plan.eventType;
  if (body) {
    const current = String(body.value || '').trim();
    if (!current) body.value = plan.comment;
    else if (!current.includes(plan.comment)) body.value = `${current}\n${plan.comment}`;
  }
}

function prepareActions() {
  const plan = selectedPlan();
  if (!plan || stateBusy()) return;
  recommendStatus(plan);
  prepareNextContact(plan);
  prepareTimeline(plan);
  applyState = { phase: 'idle', message: 'Поля подготовлены. Сохраните статус, дату и комментарий обычными кнопками CRM.', application: null };
  document.dispatchEvent(new CustomEvent('leader-v4:lead-exception-prepared', { detail: { plan } }));
  renderPreview();
  document.getElementById('leadOtherActions')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function requestApply() {
  const plan = selectedPlan();
  if (!plan || stateBusy()) return;
  applyState = { phase: 'applying', message: 'Сохраняю статус, следующий контакт и историю...', application: null };
  renderPreview();
  document.dispatchEvent(new CustomEvent('leader-v4:lead-exception-apply-requested', { detail: { scenarioKey: plan.key } }));
}

function requestHistoryRetry() {
  if (stateBusy() || !applyState.application) return;
  applyState = { ...applyState, phase: 'retrying', message: 'Проверяю историю и повторяю только недостающую запись...' };
  renderPreview();
  document.dispatchEvent(new CustomEvent('leader-v4:lead-exception-history-retry-requested', { detail: { application: applyState.application } }));
}

function resetForLead(leadId) {
  const id = String(leadId || '');
  if (id === activeLeadId) return;
  activeLeadId = id;
  selectedKey = '';
  applyState = { phase: 'idle', message: '', application: null };
  clearRecommendedStatus();
}

function bindEvents() {
  document.addEventListener('change', (event) => {
    if (event.target?.id !== SELECT_ID) return;
    selectedKey = event.target.value || '';
    applyState = { phase: 'idle', message: '', application: null };
    clearRecommendedStatus();
    renderPreview();
  });
  document.addEventListener('click', (event) => {
    if (event.target?.closest('[data-lead-exception-apply]')) { requestApply(); return; }
    if (event.target?.closest('[data-lead-exception-prepare]')) { prepareActions(); return; }
    if (event.target?.closest('[data-lead-exception-retry-history]')) requestHistoryRetry();
  });
  document.addEventListener('leader-v4:lead-exception-apply-state', (event) => {
    const detail = event.detail || {};
    if (detail.scenarioKey && selectedKey && detail.scenarioKey !== selectedKey) return;
    applyState = {
      phase: detail.phase || 'idle',
      message: detail.message || '',
      application: detail.application || applyState.application || null
    };
    renderPreview();
  });
  document.addEventListener('leader-v4:lead-card-rendered', (event) => {
    resetForLead(event.detail?.lead?.id || event.detail?.leadId || '');
    ensureHost();
    renderPreview();
  });
  document.addEventListener('leader-v4:route-change', (event) => {
    if (!event.detail?.leadId) resetForLead('');
  });
}

function boot() {
  ensureStyles();
  bindEvents();
  ensureHost();
  renderPreview();
}

if (!window[GLOBAL_FLAG]) {
  window[GLOBAL_FLAG] = true;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}
