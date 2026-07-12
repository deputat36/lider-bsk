import { friendlyError } from './api.js';
import { canOpenV4Tab } from './role-tab-permissions-v1.js';
import { supabaseClient } from './supabase-client.js';
import { orderOperationalQualityQueues } from './order-operational-quality-model-v1.js';

const PANEL_ID = 'orderOperationalQualityV1';
const MODAL_ID = 'orderOperationalQualityModalV1';
const STYLE_ID = 'orderOperationalQualityV1Styles';
const REFRESH_TTL_MS = 15000;

const QUEUES = Object.freeze({
  withoutExpenses: Object.freeze({ label: 'Без учтённых расходов', note: 'Проверьте, нужно ли зафиксировать фактические затраты по заказу.' }),
  designWithoutTask: Object.freeze({ label: 'Нужен дизайн, задачи нет', note: 'Потребность требует дизайн, но связанная design task отсутствует.' }),
  withoutAssignee: Object.freeze({ label: 'Без ответственного', note: 'У активного заказа не назначен ответственный.' }),
  overdue: Object.freeze({ label: 'Просроченные заказы', note: 'Срок заказа прошёл, а статус остаётся активным.' }),
  unknownStatuses: Object.freeze({ label: 'Неизвестные статусы', note: 'Статус не сопоставлен с canonical registry и оставлен в активном контроле.' })
});

let loading = false;
let lastLoadedAt = 0;
let snapshot = null;
let warnings = [];
let watchedContent = null;
let contentObserver = null;
let renderScheduled = false;

function esc(value) {
  return String(value ?? '').replace(/[&<>\"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function dateRu(value) {
  if (!value) return 'не указан';
  try { return new Date(value).toLocaleDateString('ru-RU'); }
  catch (_) { return String(value); }
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `.v4-order-quality{border:1px solid #bfdbfe;background:#eff6ff;border-radius:18px;padding:14px;margin:14px 0}.v4-order-quality-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.v4-order-quality-head h3{margin:0}.v4-order-quality-head p{margin:5px 0 0;color:#475569}.v4-order-quality-head button,.v4-order-quality-stat{border:1px solid #93c5fd;background:#fff;color:#1d4ed8;border-radius:12px;padding:9px 11px;font-weight:900}.v4-order-quality-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:9px;margin-top:12px}.v4-order-quality-stat{text-align:left}.v4-order-quality-stat span{display:block;font-size:12px;color:#475569}.v4-order-quality-stat b{display:block;font-size:24px;margin-top:3px}.v4-order-quality-warning{border:1px solid #fde68a;background:#fffbeb;color:#92400e;border-radius:12px;padding:9px 11px;margin-top:10px;font-weight:800}.v4-order-quality-note{color:#475569;font-size:12px;margin:10px 0 0}.v4-order-quality-modal{position:fixed;inset:0;z-index:790;background:rgba(15,23,42,.64);display:grid;place-items:center;padding:16px}.v4-order-quality-dialog{width:min(860px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:20px;padding:16px;box-shadow:0 28px 90px rgba(15,23,42,.35)}.v4-order-quality-dialog-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border-bottom:1px solid #e2e8f0;padding-bottom:10px}.v4-order-quality-dialog-head h3{margin:0}.v4-order-quality-dialog-head p{margin:5px 0 0;color:#64748b}.v4-order-quality-dialog button{border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;border-radius:11px;padding:8px 10px;font-weight:900}.v4-order-quality-list{display:grid;gap:9px;margin-top:12px}.v4-order-quality-row{border:1px solid #e2e8f0;background:#f8fafc;border-radius:14px;padding:11px;display:grid;gap:5px}.v4-order-quality-row h4{margin:0}.v4-order-quality-row small{color:#64748b}.v4-order-quality-row .is-warn{color:#92400e;font-weight:900}.v4-order-quality-empty{border:1px dashed #93c5fd;background:#eff6ff;color:#1d4ed8;border-radius:14px;padding:12px;font-weight:800}@media(max-width:640px){.v4-order-quality-head,.v4-order-quality-dialog-head{display:grid}.v4-order-quality-head button,.v4-order-quality-dialog button{width:100%}}`;
  document.head.appendChild(style);
}

async function safeRows(label, promise) {
  try {
    const response = await promise;
    if (response.error) throw response.error;
    return response.data || [];
  } catch (error) {
    warnings.push(`${label}: ${friendlyError(error)}`);
    return [];
  }
}

async function loadSnapshot(force = false) {
  if (!canOpenV4Tab('order_control')) return;
  if (loading) return;
  if (!force && snapshot && Date.now() - lastLoadedAt < REFRESH_TTL_MS) {
    scheduleRender();
    return;
  }

  loading = true;
  warnings = [];
  scheduleRender();
  try {
    const [orders, expenses, needs, designTasks] = await Promise.all([
      safeRows('Заказы', supabaseClient.from('leader_orders').select('id,order_number,project_name,status,deadline,lead_id,assigned_to,is_archived,created_at').order('created_at', { ascending: false }).limit(100)),
      safeRows('Расходы', supabaseClient.from('leader_expenses').select('order_id').not('order_id', 'is', null).limit(500)),
      safeRows('Потребности', supabaseClient.from('leader_lead_needs').select('lead_id,need_design').eq('need_design', true).not('lead_id', 'is', null).limit(500)),
      safeRows('Дизайн-задачи', supabaseClient.from('leader_design_tasks').select('order_id,task_status').not('order_id', 'is', null).limit(500))
    ]);
    snapshot = orderOperationalQualityQueues(orders, expenses, needs, designTasks);
    lastLoadedAt = Date.now();
  } finally {
    loading = false;
    scheduleRender();
  }
}

function panelRenderKey() {
  if (!snapshot) return `loading:${loading}:${warnings.join('|')}`;
  return JSON.stringify({
    loading,
    warnings,
    lastLoadedAt,
    counts: Object.fromEntries(Object.keys(QUEUES).map((key) => [key, snapshot[key]?.length || 0]))
  });
}

function panelHtml() {
  const stats = Object.entries(QUEUES).map(([key, config]) => {
    const count = snapshot?.[key]?.length || 0;
    return `<button type="button" class="v4-order-quality-stat" data-order-quality-queue="${esc(key)}"><span>${esc(config.label)}</span><b>${count}</b></button>`;
  }).join('');
  const warning = warnings.length
    ? `<div class="v4-order-quality-warning">Часть данных недоступна: ${warnings.map(esc).join('; ')}. Очереди показаны в частичном режиме.</div>`
    : '';
  const loadingText = loading ? '<div class="v4-order-quality-warning">Обновляю операционные очереди…</div>' : '';
  return `<div class="v4-order-quality-head"><div><h3>Операционное качество заказов</h3><p>Read-only контроль расходов, дизайна, ответственных и сроков без клиентских контактов и денежных сумм.</p></div><button type="button" data-order-quality-refresh>Обновить очереди</button></div>${warning}${loadingText}<div class="v4-order-quality-grid">${stats}</div><p class="v4-order-quality-note">Очереди ничего не исправляют автоматически. Откройте заказ и примите решение в стандартном рабочем процессе.</p>`;
}

function renderPanel() {
  if (!canOpenV4Tab('order_control')) return;
  const content = document.getElementById('orderControlContent');
  if (!content) return;
  ensureStyles();
  let panel = document.getElementById(PANEL_ID);
  if (!panel) {
    panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.className = 'v4-order-quality';
    const grid = content.querySelector('.v4-order-control-grid');
    if (grid) grid.insertAdjacentElement('afterend', panel);
    else content.prepend(panel);
  }
  const key = panelRenderKey();
  if (panel.dataset.renderKey === key) return;
  panel.dataset.renderKey = key;
  panel.innerHTML = panelHtml();
}

function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  queueMicrotask(() => {
    renderScheduled = false;
    watchOrderControlContent();
    renderPanel();
  });
}

function watchOrderControlContent() {
  const content = document.getElementById('orderControlContent');
  if (!content || content === watchedContent) return;
  contentObserver?.disconnect();
  watchedContent = content;
  contentObserver = new MutationObserver(() => scheduleRender());
  contentObserver.observe(content, { childList: true, subtree: true });
}

function queueRows(key) {
  return Array.isArray(snapshot?.[key]) ? snapshot[key] : [];
}

function closeModal() {
  document.getElementById(MODAL_ID)?.remove();
}

function openQueue(key) {
  const config = QUEUES[key];
  if (!config) return;
  closeModal();
  const rows = queueRows(key);
  const modal = document.createElement('div');
  modal.id = MODAL_ID;
  modal.className = 'v4-order-quality-modal';
  const list = rows.length ? rows.map((order) => {
    const unknown = order.statusKnown ? '' : `<small class="is-warn">${esc(order.statusWarning)}</small>`;
    return `<article class="v4-order-quality-row"><h4>№${esc(order.orderNumber || String(order.id).slice(0, 8))} — ${esc(order.projectName)}</h4><small>Статус: ${esc(order.statusLabel)}</small>${unknown}<small>Срок: ${esc(dateRu(order.deadline))}</small><button type="button" data-open-order="${esc(order.id)}" data-order-quality-close-after-open>Открыть заказ</button></article>`;
  }).join('') : '<div class="v4-order-quality-empty">В этой очереди нет заказов.</div>';
  modal.innerHTML = `<div class="v4-order-quality-dialog" role="dialog" aria-modal="true" aria-labelledby="orderQualityDialogTitle"><div class="v4-order-quality-dialog-head"><div><h3 id="orderQualityDialogTitle">${esc(config.label)}</h3><p>${esc(config.note)}</p></div><button type="button" data-order-quality-close>Закрыть</button></div><div class="v4-order-quality-list">${list}</div></div>`;
  document.body.appendChild(modal);
}

function boot() {
  ensureStyles();
  const workspace = document.getElementById('crmWorkspace') || document.body;
  const workspaceObserver = new MutationObserver(() => {
    watchOrderControlContent();
    scheduleRender();
  });
  workspaceObserver.observe(workspace, { childList: true, subtree: true });
  watchOrderControlContent();

  document.addEventListener('leader-v4:crm-ready', () => {
    if (document.body.dataset.v4Tab === 'order_control') setTimeout(() => loadSnapshot(false), 500);
  });
  document.addEventListener('leader-v4:tab-opened', (event) => {
    if (event.detail?.tab === 'order_control' || document.body.dataset.v4Tab === 'order_control') setTimeout(() => loadSnapshot(false), 500);
  });
  document.addEventListener('leader-v4-order-updated', () => {
    if (document.body.dataset.v4Tab === 'order_control') setTimeout(() => loadSnapshot(true), 500);
  });
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-v4-tab-button="order_control"]')) {
      setTimeout(() => loadSnapshot(false), 700);
      return;
    }
    if (event.target.closest?.('[data-order-control-refresh]')) {
      setTimeout(() => loadSnapshot(true), 700);
      return;
    }
    if (event.target.closest?.('[data-order-quality-refresh]')) {
      event.preventDefault();
      loadSnapshot(true);
      return;
    }
    const queue = event.target.closest?.('[data-order-quality-queue]');
    if (queue) {
      event.preventDefault();
      openQueue(queue.dataset.orderQualityQueue);
      return;
    }
    if (event.target.closest?.('[data-order-quality-close]') || event.target === document.getElementById(MODAL_ID)) {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.target.closest?.('[data-order-quality-close-after-open]')) setTimeout(closeModal, 0);
  }, true);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });
}

if (!window.LeaderV4OrderOperationalQualityV1Booted) {
  window.LeaderV4OrderOperationalQualityV1Booted = true;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
