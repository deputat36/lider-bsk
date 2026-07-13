import { friendlyError } from './api.js';
import {
  CRM_V4_ACTIONS,
  canPerformV4Action,
  requireV4Action
} from './action-permissions-v1.js';
import { buildDesignTaskDraftPreview } from './design-task-draft-model-v1.js';
import { supabaseClient } from './supabase-client.js';
import { toast } from './ui.js';

const MODAL_ID = 'designTaskDraftPreviewV1';
const STYLE_ID = 'designTaskDraftPreviewV1Styles';
const ORDER_FIELDS = 'id,order_number,lead_id,project_name,status,priority,deadline,layout_status,layout_link,is_archived';
const NEED_FIELDS = 'id,lead_id,need_type,title,need_design,design_reason,deadline_date,status,completeness_score';
const TASK_FIELDS = 'id,order_id,task_status,layout_status,designer_name,deadline,layout_link,created_at';

let busy = false;

function esc(value) {
  return String(value ?? '').replace(/[&<>\"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[char]));
}

function moneylessJson(value) {
  return JSON.stringify(value, null, 2);
}

function dateRu(value) {
  if (!value) return 'не указан';
  try { return new Date(value).toLocaleString('ru-RU'); }
  catch (_) { return String(value); }
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `.v4-design-draft-modal{position:fixed;inset:0;z-index:840;background:rgba(15,23,42,.68);display:grid;place-items:center;padding:16px}.v4-design-draft-dialog{width:min(980px,100%);max-height:92vh;overflow:auto;background:#fff;border:1px solid #c4b5fd;border-radius:22px;padding:17px;box-shadow:0 30px 100px rgba(15,23,42,.4)}.v4-design-draft-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border-bottom:1px solid #e2e8f0;padding-bottom:11px}.v4-design-draft-head h2{margin:0;color:#4c1d95}.v4-design-draft-head p{margin:5px 0 0;color:#64748b}.v4-design-draft-actions{display:flex;gap:8px;flex-wrap:wrap;margin:13px 0}.v4-design-draft-actions button{border:1px solid #c4b5fd;background:#f5f3ff;color:#5b21b6;border-radius:11px;padding:9px 12px;font-weight:900;cursor:pointer}.v4-design-draft-actions button[disabled]{cursor:not-allowed;opacity:.62}.v4-design-draft-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:9px;margin:12px 0}.v4-design-draft-card{border:1px solid #ddd6fe;background:#faf5ff;border-radius:15px;padding:11px}.v4-design-draft-card span{display:block;color:#6b7280;font-size:11px;font-weight:900;text-transform:uppercase}.v4-design-draft-card b{display:block;margin-top:4px;color:#312e81}.v4-design-draft-note{border:1px solid #c4b5fd;background:#f5f3ff;color:#4c1d95;border-radius:14px;padding:11px;font-weight:800;margin:11px 0}.v4-design-draft-note.is-warn{border-color:#fde68a;background:#fffbeb;color:#92400e}.v4-design-draft-note.is-danger{border-color:#fecaca;background:#fff1f2;color:#991b1b}.v4-design-draft-section{border:1px solid #e2e8f0;border-radius:17px;padding:13px;margin-top:12px}.v4-design-draft-section h3{margin:0 0 9px}.v4-design-draft-list{display:grid;gap:8px}.v4-design-draft-row{border:1px solid #e2e8f0;background:#f8fafc;border-radius:13px;padding:10px}.v4-design-draft-row b,.v4-design-draft-row small{display:block}.v4-design-draft-row small{color:#64748b;margin-top:3px}.v4-design-draft-code{white-space:pre-wrap;overflow-wrap:anywhere;background:#0f172a;color:#e2e8f0;border-radius:15px;padding:13px;font:12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace}.v4-design-draft-empty{border:1px dashed #c4b5fd;background:#faf5ff;color:#5b21b6;border-radius:14px;padding:12px;font-weight:800}@media(max-width:700px){.v4-design-draft-head{display:grid}.v4-design-draft-actions button{width:100%}}`;
  document.head.appendChild(style);
}

function closeModal() {
  document.getElementById(MODAL_ID)?.remove();
}

function host() {
  closeModal();
  const modal = document.createElement('div');
  modal.id = MODAL_ID;
  modal.className = 'v4-design-draft-modal';
  document.body.appendChild(modal);
  return modal;
}

function loadingHtml() {
  return `<div class="v4-design-draft-dialog" role="dialog" aria-modal="true" aria-labelledby="designTaskDraftTitle"><div class="v4-design-draft-head"><div><h2 id="designTaskDraftTitle">Черновик дизайн-задачи</h2><p>Загружаю минимальные данные заказа и потребности…</p></div><button type="button" data-design-task-draft-close>Закрыть</button></div><div class="v4-design-draft-empty">Подготовка локального preview…</div></div>`;
}

function stateClass(state) {
  if (['access_denied', 'order_missing', 'order_unavailable'].includes(state)) return 'is-danger';
  if (['draft_incomplete', 'existing_active_task', 'design_not_proven'].includes(state)) return 'is-warn';
  return '';
}

function stateLabel(state) {
  return ({
    access_denied: 'Нет доступа',
    order_missing: 'Заказ не найден',
    order_unavailable: 'Заказ недоступен',
    existing_active_task: 'Задача уже существует',
    design_not_proven: 'Дизайн не подтверждён',
    draft_incomplete: 'Черновик требует уточнений',
    draft_ready: 'Черновик подготовлен'
  })[state] || state;
}

function orderSummary(result) {
  if (!result.order) return '';
  return `<div class="v4-design-draft-grid"><div class="v4-design-draft-card"><span>Заказ</span><b>№${esc(result.order.orderNumber || String(result.order.id).slice(0, 8))}</b></div><div class="v4-design-draft-card"><span>Статус</span><b>${esc(result.order.statusLabel)}</b></div><div class="v4-design-draft-card"><span>Приоритет</span><b>${esc(result.order.priority || 'Обычный')}</b></div><div class="v4-design-draft-card"><span>Срок заказа</span><b>${esc(dateRu(result.order.deadline))}</b></div><div class="v4-design-draft-card"><span>Макет</span><b>${esc(result.order.layoutStatus || 'не указан')}</b></div><div class="v4-design-draft-card"><span>Права</span><b>${result.canWrite ? 'design.read + design.write' : 'только design.read'}</b></div></div>`;
}

function needsHtml(result) {
  const rows = result.needs?.length
    ? result.needs.map((need) => `<article class="v4-design-draft-row"><b>${esc(need.title || need.type || 'Потребность')}</b><small>Тип: ${esc(need.type || 'не указан')} · полнота: ${need.completenessScore ?? '—'}%</small><small>Причина дизайна: ${esc(need.designReason || 'не заполнена')}</small><small>Срок: ${esc(dateRu(need.deadline))} · статус: ${esc(need.status || 'не указан')}</small></article>`).join('')
    : '<div class="v4-design-draft-empty">Активные потребности с need_design=true не найдены.</div>';
  return `<section class="v4-design-draft-section"><h3>Основание из потребности</h3><div class="v4-design-draft-list">${rows}</div></section>`;
}

function existingTasksHtml(result) {
  if (!result.existingTasks?.length) return '';
  const rows = result.existingTasks.map((task) => `<article class="v4-design-draft-row"><b>${esc(task.label)}</b><small>Raw-статус: ${esc(task.raw)}${task.known ? '' : ' · неизвестный, сохранён без замены'}</small><small>Дизайнер: ${esc(task.designerName || 'не назначен')} · дедлайн: ${esc(dateRu(task.deadline))}</small><small>Макет: ${esc(task.layoutStatus || 'не указан')} · ссылка: ${task.layoutLinkPresent ? 'есть' : 'нет'}</small></article>`).join('');
  return `<section class="v4-design-draft-section"><h3>Существующие дизайн-задачи</h3><div class="v4-design-draft-list">${rows}</div></section>`;
}

function warningsHtml(result) {
  if (!result.warnings?.length) return '';
  return `<div class="v4-design-draft-note is-warn">${result.warnings.map(esc).join('<br>')}</div>`;
}

function flowHtml(result) {
  const allowed = result.statusFlow?.allowedFromInitial?.map((item) => item.label).join(' или ') || 'нет переходов';
  return `<section class="v4-design-draft-section"><h3>Canonical status flow</h3><div class="v4-design-draft-row"><b>${esc(result.statusFlow?.initial?.label || 'Новая')}</b><small>Первый разрешённый переход: ${esc(allowed)}</small><small>Неизвестные raw-статусы существующих задач не перезаписываются автоматически.</small></div></section>`;
}

function payloadHtml(result) {
  if (!result.draft) return '';
  return `<section class="v4-design-draft-section"><h3>Безопасный command envelope</h3><p>Payload не содержит имени клиента, телефона, оплаты, себестоимости, прибыли и внутренних комментариев.</p><pre class="v4-design-draft-code">${esc(moneylessJson(result.draft))}</pre></section>`;
}

function renderResult(modal, result) {
  const payloadButton = result.draft
    ? '<button type="button" data-design-task-draft-copy>Скопировать JSON</button>'
    : '';
  const openOrder = result.order?.id
    ? `<button type="button" data-open-order="${esc(result.order.id)}" data-design-task-draft-close-after-open>Открыть заказ</button>`
    : '';
  modal.innerHTML = `<div class="v4-design-draft-dialog" role="dialog" aria-modal="true" aria-labelledby="designTaskDraftTitle"><div class="v4-design-draft-head"><div><h2 id="designTaskDraftTitle">Черновик дизайн-задачи</h2><p>Локальный source-only preview. Production-запись отключена.</p></div><button type="button" data-design-task-draft-close>Закрыть</button></div><div class="v4-design-draft-note ${stateClass(result.state)}"><b>${esc(stateLabel(result.state))}</b><br>${esc(result.message)}</div>${orderSummary(result)}${warningsHtml(result)}<div class="v4-design-draft-actions">${openOrder}${payloadButton}<button type="button" disabled title="Требуется approved server action design_task.create_from_order">Создать задачу в CRM — отключено</button></div>${needsHtml(result)}${existingTasksHtml(result)}${flowHtml(result)}${payloadHtml(result)}</div>`;
  modal.dataset.payload = result.draft ? moneylessJson(result.draft) : '';
}

function renderError(modal, error) {
  modal.innerHTML = `<div class="v4-design-draft-dialog" role="dialog" aria-modal="true" aria-labelledby="designTaskDraftTitle"><div class="v4-design-draft-head"><div><h2 id="designTaskDraftTitle">Черновик дизайн-задачи</h2><p>Не удалось подготовить preview</p></div><button type="button" data-design-task-draft-close>Закрыть</button></div><div class="v4-design-draft-note is-danger">${esc(friendlyError(error))}</div></div>`;
}

async function fetchOrder(orderId) {
  const response = await supabaseClient
    .from('leader_orders')
    .select(ORDER_FIELDS)
    .eq('id', orderId)
    .single();
  if (response.error || !response.data) throw response.error || new Error('Заказ не найден');
  return response.data;
}

async function fetchNeeds(leadId) {
  if (!leadId) return [];
  const response = await supabaseClient
    .from('leader_lead_needs')
    .select(NEED_FIELDS)
    .eq('lead_id', leadId)
    .eq('need_design', true)
    .order('created_at', { ascending: true });
  if (response.error) throw response.error;
  return response.data || [];
}

async function fetchTasks(orderId) {
  const response = await supabaseClient
    .from('leader_design_tasks')
    .select(TASK_FIELDS)
    .eq('order_id', orderId)
    .order('created_at', { ascending: false });
  if (response.error) throw response.error;
  return response.data || [];
}

async function openPreview(orderId) {
  if (!orderId || busy) return;
  if (!requireV4Action(CRM_V4_ACTIONS.DESIGN_READ)) return;
  busy = true;
  ensureStyles();
  const modal = host();
  modal.innerHTML = loadingHtml();
  try {
    const order = await fetchOrder(orderId);
    const [needs, designTasks] = await Promise.all([
      fetchNeeds(order.lead_id),
      fetchTasks(order.id)
    ]);
    const result = buildDesignTaskDraftPreview({
      order,
      needs,
      designTasks,
      canRead: canPerformV4Action(CRM_V4_ACTIONS.DESIGN_READ),
      canWrite: canPerformV4Action(CRM_V4_ACTIONS.DESIGN_WRITE)
    });
    renderResult(modal, result);
  } catch (error) {
    renderError(modal, error);
  } finally {
    busy = false;
  }
}

async function copyPayload() {
  const value = document.getElementById(MODAL_ID)?.dataset.payload || '';
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    toast('Черновик design task скопирован');
  } catch (_) {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
    toast('Черновик design task скопирован');
  }
}

function boot() {
  ensureStyles();
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest?.('[data-design-task-draft-order]');
    if (trigger) {
      event.preventDefault();
      openPreview(trigger.dataset.designTaskDraftOrder);
      return;
    }
    if (event.target.closest?.('[data-design-task-draft-close]') || event.target === document.getElementById(MODAL_ID)) {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.target.closest?.('[data-design-task-draft-copy]')) {
      event.preventDefault();
      copyPayload();
      return;
    }
    if (event.target.closest?.('[data-design-task-draft-close-after-open]')) setTimeout(closeModal, 0);
  }, true);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });
}

if (!window.LeaderV4DesignTaskDraftPreviewV1Booted) {
  window.LeaderV4DesignTaskDraftPreviewV1Booted = true;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
