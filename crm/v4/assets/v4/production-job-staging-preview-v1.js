import { friendlyError } from './api.js';
import {
  CRM_V4_ACTIONS,
  canPerformV4Action,
  requireV4Action
} from './action-permissions-v1.js';
import { V4_CONFIG } from './config.js';
import { buildProductionJobStagingDraft } from './production-job-staging-draft-model-v1.js';
import {
  invokeStagingProductionJob,
  isStagingProductionEnvironment,
  productionStagingTransportAvailability
} from './production-job-staging-transport-v1.js';
import { supabaseClient } from './supabase-client.js';
import { toast } from './ui.js';

const MODAL_ID = 'productionJobStagingPreviewV1';
const STYLE_ID = 'productionJobStagingPreviewV1Styles';
const ORDER_FIELDS = 'id,order_number,project_name,status,priority,deadline,layout_status,layout_link,is_archived,updated_at';
const TASK_FIELDS = 'id,order_id,task_status,layout_status,layout_link,created_at';

let busy = false;
let createBusy = false;
let currentContext = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>\"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[char]));
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
  style.textContent = `.v4-production-staging-entry{border:1px solid #67e8f9;background:#ecfeff;color:#155e75;border-radius:11px;padding:8px 10px;font-weight:900;cursor:pointer}.v4-production-staging-entry:hover{background:#cffafe}.v4-production-staging-entry-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.v4-production-staging-modal{position:fixed;inset:0;z-index:850;background:rgba(15,23,42,.68);display:grid;place-items:center;padding:16px}.v4-production-staging-dialog{width:min(920px,100%);max-height:92vh;overflow:auto;background:#fff;border:1px solid #67e8f9;border-radius:22px;padding:17px;box-shadow:0 30px 100px rgba(15,23,42,.4)}.v4-production-staging-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border-bottom:1px solid #e2e8f0;padding-bottom:11px}.v4-production-staging-head h2{margin:0;color:#155e75}.v4-production-staging-head p{margin:5px 0 0;color:#64748b}.v4-production-staging-actions{display:flex;gap:8px;flex-wrap:wrap;margin:13px 0}.v4-production-staging-actions button{border:1px solid #67e8f9;background:#ecfeff;color:#155e75;border-radius:11px;padding:9px 12px;font-weight:900;cursor:pointer}.v4-production-staging-actions button[data-production-staging-create]{background:#0e7490;color:#fff}.v4-production-staging-actions button[disabled]{cursor:not-allowed;opacity:.62}.v4-production-staging-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:9px;margin:12px 0}.v4-production-staging-card{border:1px solid #a5f3fc;background:#ecfeff;border-radius:15px;padding:11px}.v4-production-staging-card span{display:block;color:#64748b;font-size:11px;font-weight:900;text-transform:uppercase}.v4-production-staging-card b{display:block;margin-top:4px;color:#164e63}.v4-production-staging-note{border:1px solid #67e8f9;background:#ecfeff;color:#155e75;border-radius:14px;padding:11px;font-weight:800;margin:11px 0}.v4-production-staging-note.is-warn{border-color:#fde68a;background:#fffbeb;color:#92400e}.v4-production-staging-note.is-danger{border-color:#fecaca;background:#fff1f2;color:#991b1b}.v4-production-staging-result{border:1px solid #86efac;background:#f0fdf4;color:#166534;border-radius:14px;padding:11px;font-weight:800;margin:11px 0}.v4-production-staging-result.is-error{border-color:#fecaca;background:#fff1f2;color:#991b1b}.v4-production-staging-code{white-space:pre-wrap;overflow-wrap:anywhere;background:#0f172a;color:#e2e8f0;border-radius:15px;padding:13px;font:12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace}.v4-production-staging-empty{border:1px dashed #67e8f9;background:#ecfeff;color:#155e75;border-radius:14px;padding:12px;font-weight:800}@media(max-width:700px){.v4-production-staging-head{display:grid}.v4-production-staging-actions button,.v4-production-staging-entry{width:100%}}`;
  document.head.appendChild(style);
}

function closeModal() {
  document.getElementById(MODAL_ID)?.remove();
  currentContext = null;
  createBusy = false;
}

function modalHost() {
  closeModal();
  const modal = document.createElement('div');
  modal.id = MODAL_ID;
  modal.className = 'v4-production-staging-modal';
  document.body.appendChild(modal);
  return modal;
}

function stateClass(state) {
  if (['access_denied', 'order_missing', 'order_unavailable'].includes(state)) return 'is-danger';
  if (['layout_not_approved', 'active_job_exists', 'read_only'].includes(state)) return 'is-warn';
  return '';
}

function stateLabel(state) {
  return ({
    access_denied: 'Нет доступа',
    order_missing: 'Заказ не найден',
    order_unavailable: 'Заказ недоступен',
    layout_not_approved: 'Макет не согласован',
    active_job_exists: 'Задание уже существует',
    read_only: 'Только просмотр',
    draft_ready: 'Черновик готов'
  })[state] || state;
}

function feedbackHtml(feedback) {
  if (!feedback) return '';
  const verified = feedback.ok && feedback.refreshed?.id
    ? `<br><small>Read-after-success подтверждён безопасным idempotent replay: ${esc(feedback.refreshed.id)}</small>`
    : feedback.ok && feedback.refreshFailed
      ? '<br><small>Задание создано, но контрольное перечитывание не завершилось.</small>'
      : '';
  return `<div class="v4-production-staging-result ${feedback.ok ? '' : 'is-error'}"><b>${feedback.ok ? 'Staging' : 'Staging: действие не выполнено'}</b><br>${esc(feedback.message)}${verified}</div>`;
}

function renderResult(modal, result, feedback = null) {
  const availability = productionStagingTransportAvailability({
    supabaseUrl: V4_CONFIG.supabaseUrl,
    canWrite: result.canWrite,
    draft: result.draft,
    expectedUpdatedAt: result.order?.updatedAt
  });
  const action = availability.enabled
    ? `<button type="button" data-production-staging-create ${createBusy ? 'disabled' : ''}>${createBusy ? 'Создаю и проверяю…' : 'Создать тестовое задание в staging'}</button>`
    : '<button type="button" disabled>Создание в staging недоступно</button>';
  const order = result.order
    ? `<div class="v4-production-staging-grid"><div class="v4-production-staging-card"><span>Заказ</span><b>№${esc(result.order.number || String(result.order.id).slice(0, 8))}</b></div><div class="v4-production-staging-card"><span>Статус</span><b>${esc(result.order.statusLabel)}</b></div><div class="v4-production-staging-card"><span>Макет</span><b>${esc(result.order.layoutStatus || 'не указан')}</b></div><div class="v4-production-staging-card"><span>Срок</span><b>${esc(dateRu(result.order.deadline))}</b></div><div class="v4-production-staging-card"><span>Права</span><b>${result.canWrite ? 'production.read + production.write' : 'только production.read'}</b></div></div>`
    : '';
  const warnings = result.warnings?.length
    ? `<div class="v4-production-staging-note is-warn">${result.warnings.map(esc).join('<br>')}</div>`
    : '';
  const payload = result.draft
    ? `<p>Envelope не содержит клиента, телефона, оплаты, прибыли, actor/status и других server-owned полей.</p><pre class="v4-production-staging-code">${esc(JSON.stringify(result.draft, null, 2))}</pre>`
    : '';
  modal.innerHTML = `<div class="v4-production-staging-dialog" role="dialog" aria-modal="true" aria-labelledby="productionStagingTitle"><div class="v4-production-staging-head"><div><h2 id="productionStagingTitle">Заказ → производство</h2><p>Активно только для exact staging project ref. Production не получает кнопку или сетевой вызов.</p></div><button type="button" data-production-staging-close>Закрыть</button></div><div class="v4-production-staging-note ${stateClass(result.state)}"><b>${esc(stateLabel(result.state))}</b><br>${esc(result.message)}</div>${feedbackHtml(feedback)}${order}${warnings}<div class="v4-production-staging-actions">${action}</div>${payload}</div>`;
}

function renderError(modal, error) {
  modal.innerHTML = `<div class="v4-production-staging-dialog" role="dialog" aria-modal="true" aria-labelledby="productionStagingTitle"><div class="v4-production-staging-head"><div><h2 id="productionStagingTitle">Заказ → производство</h2><p>Не удалось подготовить staging preview</p></div><button type="button" data-production-staging-close>Закрыть</button></div><div class="v4-production-staging-note is-danger">${esc(friendlyError(error))}</div></div>`;
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

async function fetchDesignTasks(orderId) {
  if (!canPerformV4Action(CRM_V4_ACTIONS.DESIGN_READ)) return [];
  const response = await supabaseClient
    .from('leader_design_tasks')
    .select(TASK_FIELDS)
    .eq('order_id', orderId)
    .order('created_at', { ascending: false });
  if (response.error) throw response.error;
  return response.data || [];
}

async function openPreview(orderId) {
  if (!orderId || busy || !requireV4Action(CRM_V4_ACTIONS.PRODUCTION_READ)) return;
  busy = true;
  const modal = modalHost();
  modal.innerHTML = '<div class="v4-production-staging-dialog"><div class="v4-production-staging-empty">Читаю безопасную проекцию заказа из staging…</div></div>';
  try {
    const order = await fetchOrder(orderId);
    const designTasks = await fetchDesignTasks(order.id);
    const result = buildProductionJobStagingDraft({
      order,
      items: [],
      designTasks,
      productionJobs: [],
      canRead: canPerformV4Action(CRM_V4_ACTIONS.PRODUCTION_READ),
      canWrite: canPerformV4Action(CRM_V4_ACTIONS.PRODUCTION_WRITE)
    });
    currentContext = { order, designTasks, result };
    renderResult(modal, result);
  } catch (error) {
    currentContext = null;
    renderError(modal, error);
  } finally {
    busy = false;
  }
}

async function verifyByReplay(context) {
  const verification = await invokeStagingProductionJob({
    client: supabaseClient,
    supabaseUrl: V4_CONFIG.supabaseUrl,
    canWrite: canPerformV4Action(CRM_V4_ACTIONS.PRODUCTION_WRITE),
    draft: context.result.draft,
    expectedUpdatedAt: context.result.order.updatedAt
  });
  if (!verification.ok || !verification.replay || !verification.data?.job?.id) throw new Error('production_replay_verification_failed');
  return verification.data.job;
}

async function createStagingJob() {
  if (createBusy || !currentContext?.result?.draft || !requireV4Action(CRM_V4_ACTIONS.PRODUCTION_WRITE)) return;
  const modal = document.getElementById(MODAL_ID);
  if (!modal) return;
  createBusy = true;
  renderResult(modal, currentContext.result);
  const response = await invokeStagingProductionJob({
    client: supabaseClient,
    supabaseUrl: V4_CONFIG.supabaseUrl,
    canWrite: canPerformV4Action(CRM_V4_ACTIONS.PRODUCTION_WRITE),
    draft: currentContext.result.draft,
    expectedUpdatedAt: currentContext.result.order.updatedAt,
    readAfterSuccess: () => verifyByReplay(currentContext)
  });
  createBusy = false;
  renderResult(modal, currentContext.result, response);
  toast(response.message);
}

function decorateOrderCard(orderId) {
  const section = document.querySelector('#orderCardV1 [data-order-design-section]');
  if (!section || !orderId || section.querySelector('[data-production-staging-entrypoint]')) return;
  const actions = document.createElement('div');
  actions.className = 'v4-production-staging-entry-actions';
  actions.dataset.productionStagingEntrypoint = '1';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'v4-production-staging-entry';
  button.dataset.productionStagingOrder = orderId;
  button.textContent = 'Передать в производство (staging)';
  actions.appendChild(button);
  section.appendChild(actions);
}

function boot() {
  ensureStyles();
  document.addEventListener('leader-v4:order-card-rendered', (event) => {
    const orderId = String(event.detail?.orderId || '').trim();
    if (canPerformV4Action(CRM_V4_ACTIONS.PRODUCTION_READ)) decorateOrderCard(orderId);
  });
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest?.('[data-production-staging-order]');
    if (trigger) {
      event.preventDefault();
      openPreview(trigger.dataset.productionStagingOrder);
      return;
    }
    if (event.target.closest?.('[data-production-staging-create]')) {
      event.preventDefault();
      createStagingJob();
      return;
    }
    if (event.target.closest?.('[data-production-staging-close]') || event.target === document.getElementById(MODAL_ID)) {
      event.preventDefault();
      closeModal();
    }
  }, true);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });
}

if (isStagingProductionEnvironment(V4_CONFIG.supabaseUrl) && !window.LeaderV4ProductionJobStagingPreviewV1Booted) {
  window.LeaderV4ProductionJobStagingPreviewV1Booted = true;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
