import { LEAD_EXCEPTION_SCENARIOS, buildLeadExceptionPlan } from './lead-exception-scenarios-v1.js';

const GLOBAL_FLAG = '__leaderLeadExceptionAssistantV1';
const STYLE_ID = 'leader-lead-exception-assistant-v1-style';
const HOST_ID = 'leadExceptionAssistant';
const SELECT_ID = 'leadExceptionScenarioSelect';
const PREVIEW_ID = 'leadExceptionPreview';
const RESULT_ID = 'leadExceptionPrepareResult';

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
    .v4-lead-exception-result{font-weight:800;color:#92400e}
    .v4-chip-button.is-recommended{outline:4px solid rgba(245,158,11,.24);border-color:#f59e0b!important;background:#fffbeb!important;color:#92400e!important}
    @media(max-width:680px){.v4-lead-exception-preview dl{grid-template-columns:1fr}.v4-lead-exception-actions .v4-primary{width:100%}}
  `;
  document.head.appendChild(style);
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function nextContactDate(rule, now = new Date()) {
  if (!rule) return null;
  const date = new Date(now.getTime());
  date.setDate(date.getDate() + Number(rule.days || 0));
  date.setHours(Number(rule.hour || 10), Number(rule.minute || 0), 0, 0);
  return date;
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
      <p>Помощник подготовит существующие поля карточки, но ничего не сохранит без вашего решения.</p>
      <label>Что произошло
        <select id="${SELECT_ID}">${optionsMarkup()}</select>
      </label>
      <div id="${PREVIEW_ID}" class="v4-lead-exception-preview is-empty">Выберите ситуацию, чтобы увидеть рекомендуемые действия и последствия.</div>
      <div class="v4-lead-exception-actions">
        <button type="button" class="v4-primary" data-lead-exception-prepare disabled>Подготовить действия</button>
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
  return buildLeadExceptionPlan(document.getElementById(SELECT_ID)?.value || '');
}

function renderPreview() {
  const preview = document.getElementById(PREVIEW_ID);
  const button = document.querySelector('[data-lead-exception-prepare]');
  const result = document.getElementById(RESULT_ID);
  if (!preview || !button) return;
  if (result) result.textContent = '';
  const plan = selectedPlan();
  button.disabled = !plan;
  if (!plan) {
    preview.className = 'v4-lead-exception-preview is-empty';
    preview.textContent = 'Выберите ситуацию, чтобы увидеть рекомендуемые действия и последствия.';
    return;
  }
  const contactDate = nextContactDate(plan.nextContact);
  preview.className = 'v4-lead-exception-preview';
  preview.innerHTML = `
    <dl>
      <div><dt>Рекомендуемый статус</dt><dd>${esc(plan.status)}</dd></div>
      <div><dt>Следующий контакт</dt><dd>${esc(formatDate(contactDate))}</dd></div>
    </dl>
    <p class="v4-lead-exception-comment">${esc(plan.comment)}</p>
    <p class="v4-lead-exception-consequence"><b>Что важно:</b> ${esc(plan.consequence)}</p>`;
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
  const date = nextContactDate(plan.nextContact);
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
  if (!plan) return;
  recommendStatus(plan);
  prepareNextContact(plan);
  prepareTimeline(plan);
  const result = document.getElementById(RESULT_ID);
  if (result) result.textContent = `${plan.saveNotice} Сохраните статус, дату контакта и запись в истории.`;
  document.dispatchEvent(new CustomEvent('leader-v4:lead-exception-prepared', { detail: { plan } }));
  document.getElementById('leadOtherActions')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function bindEvents() {
  document.addEventListener('change', (event) => {
    if (event.target?.id === SELECT_ID) renderPreview();
  });
  document.addEventListener('click', (event) => {
    if (event.target?.closest('[data-lead-exception-prepare]')) prepareActions();
  });
  document.addEventListener('leader-v4:lead-card-rendered', () => {
    ensureHost();
    renderPreview();
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
