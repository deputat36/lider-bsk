import { v4State, subscribeState } from './state.js';
import {
  calculationReadinessContext,
  offerReadinessContext
} from './need-readiness-model-v1.js';

const CALC_BOX_ID = 'needReadinessCalculationV1';
const OFFER_BOX_ID = 'needReadinessOfferV1';
const STYLE_ID = 'needReadinessPanelV1Styles';
let renderScheduled = false;
let observer = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>\"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[char]));
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `.v4-need-readiness{margin:10px 0 14px;border:1px solid #cbd5e1;background:#f8fafc;border-radius:15px;padding:11px 12px;display:grid;gap:8px}.v4-need-readiness.is-ready{border-color:#86efac;background:#f0fdf4}.v4-need-readiness.is-warning{border-color:#fcd34d;background:#fffbeb}.v4-need-readiness.is-critical{border-color:#fca5a5;background:#fff7f7}.v4-need-readiness.is-neutral{border-color:#bfdbfe;background:#eff6ff}.v4-need-readiness-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.v4-need-readiness h5{margin:0;font-size:14px;color:#0f172a}.v4-need-readiness p{margin:4px 0 0;color:#475569;line-height:1.45}.v4-need-readiness-score{border-radius:999px;padding:5px 9px;background:#fff;font-size:12px;font-weight:900;white-space:nowrap}.v4-need-readiness-missing{display:flex;gap:6px;flex-wrap:wrap}.v4-need-readiness-missing span{border:1px solid #fed7aa;background:#fff7ed;color:#9a3412;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:900}.v4-need-readiness-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.v4-need-readiness-actions button{border:1px solid #94a3b8;background:#fff;color:#0f172a;border-radius:10px;padding:7px 10px;font-weight:900;cursor:pointer}.v4-need-readiness-note{font-size:11px;color:#64748b;font-weight:800}.v4-need-card.is-readiness-target,.v4-needs-section.is-readiness-target,.v4-calculations-host.is-readiness-target{outline:3px solid #f59e0b;outline-offset:4px}@media(max-width:640px){.v4-need-readiness-head{display:grid}.v4-need-readiness-score{justify-self:start}.v4-need-readiness-actions button{width:100%}}`;
  document.head.appendChild(style);
}

function actionLabel(action) {
  if (action === 'focus_need_select') return 'Выбрать потребность';
  if (action === 'focus_calculation_select') return 'Выбрать расчёт';
  if (action === 'open_calculations') return 'Открыть расчёты';
  if (action === 'open_need_form') return 'Открыть потребности';
  if (action === 'open_need') return 'Проверить потребность';
  return '';
}

function boxMarkup(model) {
  const missing = Array.isArray(model.missingFields) ? model.missingFields : [];
  const label = actionLabel(model.action);
  const score = model.needId || model.score > 0 ? `${Number(model.score || 0)}%` : 'Проверка';
  const advisory = model.ready
    ? 'Перед КП выполните финальную проверку.'
    : 'Предупреждение advisory: сохранение расчёта и формирование КП автоматически не блокируются.';
  return `<div class="v4-need-readiness-head"><div><h5>${esc(model.title)}</h5><p>${esc(model.message)}</p></div><span class="v4-need-readiness-score">${esc(score)}</span></div>${missing.length ? `<div class="v4-need-readiness-missing">${missing.map((field) => `<span>${esc(field)}</span>`).join('')}</div>` : ''}<div class="v4-need-readiness-actions">${label ? `<button type="button" data-need-readiness-action="${esc(model.action)}" data-need-readiness-need-id="${esc(model.needId || '')}">${esc(label)}</button>` : ''}<span class="v4-need-readiness-note">${esc(advisory)}</span></div>`;
}

function ensureBox(root, id) {
  if (!root) return null;
  let box = root.querySelector(`#${id}`);
  if (box) return box;
  box = document.createElement('aside');
  box.id = id;
  box.className = 'v4-need-readiness is-neutral';
  box.setAttribute('role', 'status');
  box.setAttribute('aria-live', 'polite');
  const grid = root.querySelector('.v4-form-grid');
  if (grid) grid.insertAdjacentElement('afterend', box);
  else root.prepend(box);
  return box;
}

function applyModel(box, model) {
  if (!box) return;
  const signature = JSON.stringify({
    state: model.state,
    level: model.level,
    score: model.score,
    needId: model.needId,
    calculationId: model.calculationId || '',
    missingFields: model.missingFields,
    title: model.title,
    message: model.message
  });
  if (box.dataset.readinessSignature === signature) return;
  box.dataset.readinessSignature = signature;
  box.className = `v4-need-readiness is-${model.level || 'neutral'}`;
  box.dataset.readinessState = model.state || '';
  box.innerHTML = boxMarkup(model);
}

function renderCalculationReadiness() {
  const root = document.querySelector('.v4-calc-form');
  if (!root) return;
  const model = calculationReadinessContext({
    needs: v4State.leadNeeds,
    selectedNeedId: document.getElementById('calcNeedId')?.value || ''
  });
  applyModel(ensureBox(root, CALC_BOX_ID), model);
}

function renderOfferReadiness() {
  const root = document.querySelector('.v4-offer-form');
  if (!root) return;
  const model = offerReadinessContext({
    needs: v4State.leadNeeds,
    calculations: v4State.calculations,
    selectedCalculationId: document.getElementById('offerCalculationId')?.value || ''
  });
  applyModel(ensureBox(root, OFFER_BOX_ID), model);
}

function renderAll() {
  ensureStyles();
  renderCalculationReadiness();
  renderOfferReadiness();
}

function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    renderAll();
  });
}

function highlight(target) {
  if (!target) return;
  target.classList.add('is-readiness-target');
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => target.classList.remove('is-readiness-target'), 2400);
}

function needCard(needId) {
  return [...document.querySelectorAll('.v4-need-card')].find((card) => card.dataset.id === needId) || null;
}

function runAction(button) {
  const action = button.dataset.needReadinessAction || '';
  const needId = button.dataset.needReadinessNeedId || '';
  if (action === 'focus_need_select') {
    const select = document.getElementById('calcNeedId');
    select?.focus();
    highlight(select?.closest('label') || select);
    return;
  }
  if (action === 'focus_calculation_select') {
    const select = document.getElementById('offerCalculationId');
    select?.focus();
    highlight(select?.closest('label') || select);
    return;
  }
  if (action === 'open_calculations') {
    highlight(document.getElementById('calculationsBox'));
    return;
  }
  const target = needId ? needCard(needId) : null;
  const fallback = document.querySelector('.v4-needs-section');
  highlight(target || fallback);
  if (!target && action === 'open_need_form') document.getElementById('needTitle')?.focus();
}

function observeLeadCard() {
  const host = document.getElementById('leadCardContent');
  if (!host || observer) return;
  observer = new MutationObserver(() => scheduleRender());
  observer.observe(host, { childList: true, subtree: true });
}

function boot() {
  ensureStyles();
  observeLeadCard();
  subscribeState(() => scheduleRender());
  document.addEventListener('leader-v4:lead-card-rendered', scheduleRender);
  document.addEventListener('leader-v4:needs-loaded', scheduleRender);
  document.addEventListener('leader-v4:route-change', scheduleRender);
  document.addEventListener('change', (event) => {
    if (event.target?.matches?.('#calcNeedId, #offerCalculationId')) scheduleRender();
  }, true);
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-need-readiness-action]');
    if (!button) return;
    event.preventDefault();
    runAction(button);
  }, true);
  scheduleRender();
}

if (!window.LeaderV4NeedReadinessV1Booted) {
  window.LeaderV4NeedReadinessV1Booted = true;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
