import { invokeLeaderFunction } from './functions-client.js';
import { V4_CONFIG } from './config.js';
import { v4State } from './state.js';
import { canPerformV4Action, CRM_V4_ACTIONS } from './action-permissions-v1.js';
import { fetchAllOrderFinance } from './finance-record-model-v1.js';
import { financeWriteAvailable } from './finance-record-transport-v1.js';
import { financeVoidButton, mountFinanceWriter } from './finance-record-ui-v1.js';
import { supabaseClient } from './supabase-client.js';
import { friendlyError } from './api.js';
import { toast } from './ui.js';
import { openLeadRoute } from './router.js';
import { orderStatusUiModel } from './order-status-ui-model-v1.js';
import {
  ORDER_EXCEPTION_SCENARIOS,
  buildOrderExceptionPlan,
  buildOrderPrimaryAction
} from './order-workflow-guidance-model-v1.js';
import {
  actualProfitStateLabel,
  buildOrderFinanceSnapshot,
  confirmedExpenseEffect,
  confirmedPaymentEffect
} from './finance-plan-actual-model-v1.js';

const ORDER_FIELDS = 'id,order_number,project_name,status,deadline,client_name,client_phone,client_total,contractor_cost,profit,balance,payment_status,layout_status,production_status,lead_id,client_id,created_at,updated_at,data';
const ITEM_FIELDS = 'id,order_id,name,unit,quantity,contractor_price,contractor_sum,client_sum,comment,category,item_type,data,created_at';
const PAYMENT_FIELDS = 'id,order_id,amount,method,payment_date,comment,payment_status,payment_type,finance_category,counterparty_name,is_confirmed,created_at,updated_at';
const EXPENSE_FIELDS = 'id,order_id,amount,method,expense_date,category,status,comment,created_at,updated_at';

let busy = false;
let booted = false;
let currentBundle = null;
let financeWriter = null;
let opener = null;
let cardRequest = 0;
const canReadFinance = () => canPerformV4Action(CRM_V4_ACTIONS.FINANCE_READ);
const canWriteFinance = () => canPerformV4Action(CRM_V4_ACTIONS.FINANCE_WRITE);
const canReadCosts = () => canPerformV4Action(CRM_V4_ACTIONS.COSTS_READ);
const writeEnabled = () => financeWriteAvailable(V4_CONFIG.supabaseUrl, canWriteFinance());

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}
function money(value) { return moneyExact(value); }
function moneyExact(value) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽` : '—';
}
function dateRu(value) {
  if (!value) return '—';
  try { return new Date(value).toLocaleString('ru-RU'); } catch (_) { return String(value); }
}
function shortId(id) { return String(id || '').slice(0, 8); }

function ensureStyles() {
  if (document.getElementById('orderCardV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'orderCardV1Styles';
  style.textContent = `
    .v4-order-modal{position:fixed;inset:0;z-index:720;background:rgba(15,23,42,.58);display:grid;place-items:center;padding:16px}
    .v4-order-modal-card{width:min(1080px,100%);max-height:92vh;overflow:auto;background:#fff;border:1px solid #bfdbfe;border-radius:24px;box-shadow:0 28px 90px rgba(15,23,42,.35);padding:18px}
    .v4-order-modal-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border-bottom:1px solid #e2e8f0;padding-bottom:12px;margin-bottom:14px}.v4-order-modal-head h2{margin:0}.v4-order-modal-head p{margin:6px 0 0;color:#64748b}
    .v4-order-modal-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:12px 0}.v4-order-modal-grid div{border:1px solid #e2e8f0;border-radius:16px;background:#f8fafc;padding:12px}.v4-order-modal-grid span{display:block;color:#64748b;font-size:12px;font-weight:900;text-transform:uppercase}.v4-order-modal-grid b{display:block;margin-top:5px;color:#0f172a}
    .v4-order-modal-actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.v4-order-modal-actions button{border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;border-radius:12px;padding:9px 12px;font-weight:900}.v4-order-modal-actions .v4-primary{background:#1d4ed8;color:#fff;border-color:#1d4ed8}
    .v4-order-modal-section{border:1px solid #e2e8f0;border-radius:18px;padding:14px;background:#fff;margin-top:12px}.v4-order-modal-section h3{margin:0 0 10px}
    .v4-order-modal-items{display:grid;gap:8px}.v4-order-modal-item{border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc;padding:10px}.v4-order-modal-item-head{display:flex;justify-content:space-between;gap:10px}.v4-order-modal-item-head b{overflow-wrap:anywhere}.v4-order-modal-item small{display:block;color:#64748b;margin-top:4px}
    .v4-order-modal-empty{border:1px dashed #cbd5e1;border-radius:14px;padding:12px;color:#64748b;background:#f8fafc}
    .v4-order-finance-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:10px}.v4-order-finance-list h4{margin:0 0 8px}.v4-order-finance-row{border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc;padding:10px}.v4-order-finance-row b{display:block}.v4-order-finance-row small{display:block;color:#64748b;margin-top:4px}.v4-order-finance-diff.is-good b{color:#166534}.v4-order-finance-diff.is-danger b{color:#991b1b}.v4-order-finance-note{border:1px dashed #f59e0b;background:#fffbeb;color:#92400e;border-radius:14px;padding:10px;font-weight:800;margin:10px 0}
    .v4-order-design-section{border-color:#fed7aa;background:linear-gradient(180deg,#fff7ed 0%,#fff 100%)}.v4-order-design-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:8px 0 10px}.v4-order-design-summary div{border:1px solid #fed7aa;border-radius:14px;background:#fff;padding:10px}.v4-order-design-summary span{display:block;color:#9a3412;font-size:12px;font-weight:900;text-transform:uppercase}.v4-order-design-summary b{display:block;margin-top:4px;color:#7c2d12}.v4-order-design-note{border:1px dashed #fdba74;border-radius:14px;background:#fff7ed;color:#9a3412;padding:10px;font-weight:800}.v4-order-design-note small{display:block;color:#9a3412;font-weight:700;margin-top:4px}
    .v4-order-guidance{border:1px solid #bfdbfe;background:#eff6ff;border-radius:18px;padding:14px;margin:12px 0}.v4-order-guidance.is-danger{border-color:#fecaca;background:#fff7f7}.v4-order-guidance.is-warn{border-color:#fde68a;background:#fffdf3}.v4-order-guidance.is-good{border-color:#bbf7d0;background:#f0fdf4}.v4-order-guidance-main{display:flex;justify-content:space-between;gap:14px;align-items:center}.v4-order-guidance-main h3{margin:0 0 5px}.v4-order-guidance-main p{margin:0;color:#475569;max-width:700px}.v4-order-guidance-main button{min-width:220px;border:1px solid #1d4ed8;background:#1d4ed8;color:#fff;border-radius:13px;padding:11px 15px;font-weight:900}.v4-order-guidance-complete{display:inline-flex;align-items:center;justify-content:center;min-width:220px;border-radius:13px;padding:11px 15px;background:#dcfce7;color:#166534;font-weight:900}
    .v4-order-exception{border:1px dashed #f59e0b;background:#fffbeb;border-radius:18px;margin:12px 0;padding:0 14px}.v4-order-exception>summary{cursor:pointer;padding:14px 0;font-weight:900;color:#92400e}.v4-order-exception[open]>summary{border-bottom:1px solid #fde68a}.v4-order-exception-body{display:grid;gap:12px;padding:14px 0}.v4-order-exception-body>p{margin:0;color:#6b7280}.v4-order-exception-preview{border:1px solid #fde68a;background:#fff;border-radius:14px;padding:12px;display:grid;gap:9px}.v4-order-exception-preview.is-empty{color:#6b7280}.v4-order-exception-preview h4{margin:0}.v4-order-exception-preview p{margin:0}.v4-order-exception-preview ul{margin:0;padding-left:20px}.v4-order-exception-impact{border-left:4px solid #f59e0b;padding:8px 10px;background:#fff7ed;color:#7c2d12}.v4-order-exception-actions{display:flex;gap:8px;flex-wrap:wrap}.v4-order-exception-actions button{border:1px solid #cbd5e1;background:#fff;border-radius:12px;padding:9px 12px;font-weight:900}.v4-order-exception-actions .v4-primary{background:#1d4ed8;border-color:#1d4ed8;color:#fff}.v4-order-exception-result{font-weight:800;color:#92400e}
    .v4-finance-fields{border:0;padding:0;margin:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.v4-finance-fields label{display:grid;gap:5px;font-weight:600}.v4-finance-fields input,.v4-finance-fields select,.v4-finance-fields textarea{width:100%;min-width:0;box-sizing:border-box;font:inherit;min-height:44px;padding:10px;border:1px solid var(--border,#cbd5e1);border-radius:8px;background:#fff;color:#182334}.v4-finance-wide{grid-column:1/-1}.v4-finance-fields .v4-finance-confirm{display:flex;align-items:center;gap:10px}.v4-finance-confirm input{width:20px;min-height:20px;flex-shrink:0}.v4-order-finance-row{overflow-wrap:anywhere}.v4-order-finance-row button{min-height:44px;margin-top:8px;padding:8px 12px;border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:8px}.v4-order-finance-totals{grid-template-columns:repeat(3,minmax(0,1fr))}.v4-finance-fields label>span{font-weight:400;color:#475569}.v4-order-finance-row+.v4-order-finance-row{margin-top:8px}[data-finance-editor]{scroll-margin-top:20px}[data-finance-form]{border-top:1px solid #dce2e9;padding-top:12px;margin:14px 0}[data-finance-message][data-error="true"]{color:#9f2525}[data-finance-form] button:disabled{opacity:.65;cursor:wait}.v4-order-modal-card :focus-visible{outline:3px solid #145abb;outline-offset:3px}.v4-order-modal-card button{min-height:44px}.v4-order-modal-card h2{overflow-wrap:anywhere}.v4-order-modal-card{max-height:92dvh}.v4-order-finance-summary{margin:10px 0}.v4-order-finance-summary summary{cursor:pointer;min-height:44px;display:flex;align-items:center;font-weight:600}
    @media(max-width:520px){.v4-finance-fields{grid-template-columns:minmax(0,1fr)}.v4-order-modal{padding:8px}.v4-order-modal-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.v4-order-modal-grid div{padding:9px}.v4-order-modal-head p{overflow-wrap:anywhere}}
    @media(max-width:760px){.v4-order-modal-card{padding:12px;border-radius:18px}.v4-order-modal-head,.v4-order-guidance-main{display:grid}.v4-order-modal-actions button,.v4-order-guidance-main button,.v4-order-guidance-complete,.v4-order-exception-actions button{width:100%;min-width:0}.v4-order-modal-item-head{display:grid}}
  `;
  document.head.appendChild(style);
}

function host() {
  let element = document.getElementById('orderCardV1');
  if (!element) {
    element = document.createElement('div');
    element.id = 'orderCardV1';
    document.body.appendChild(element);
  }
  return element;
}

function closeCard() {
  if (financeWriter?.isBusy()) return;
  cardRequest += 1;
  financeWriter = null;
  host().innerHTML = '';
  const returnTarget = opener?.isConnected ? opener : (currentBundle?.order.id ? document.querySelector(`[data-open-order="${CSS.escape(currentBundle.order.id)}"]`) : null);
  returnTarget?.focus();
  opener = null;
  currentBundle = null;
  busy = false;
}

function loading() {
  currentBundle = null;
  delete host().dataset.errorCode;
  host().innerHTML = `<div class="v4-order-modal"><div class="v4-order-modal-card"><div class="v4-order-modal-head"><div><h2>Карточка заказа</h2><p>Загружаю заказ...</p></div><button type="button" data-order-card-close>Закрыть</button></div><div class="v4-order-modal-empty">Загрузка...</div></div></div>`;
}

function errorBox(text, code = 'order_read_failed') {
  host().dataset.errorCode = String(code).replace(/[^a-z0-9_]/gi, '').slice(0, 64);
  currentBundle = null;
  host().innerHTML = `<div class="v4-order-modal"><div class="v4-order-modal-card"><div class="v4-order-modal-head"><div><h2>Карточка заказа</h2><p>Не удалось загрузить данные</p></div><button type="button" data-order-card-close>Закрыть</button></div><div class="v4-order-modal-empty">${esc(text)}</div></div></div>`;
}

async function fetchOrderBundle(orderId) {
  if (new URL(V4_CONFIG.supabaseUrl).hostname === 'otulfnouybahfnsycxqn.supabase.co') {
    const result = await invokeLeaderFunction('leader-crm-orders', { action: 'get', order_id: orderId });
    if (!result.order || !Array.isArray(result.items)) throw new Error('Ответ сервера не содержит заказ и его позиции.');
    return result;
  }
  const response = await supabaseClient.from('leader_orders').select(ORDER_FIELDS).eq('id', orderId).single();
  if (response.error || !response.data) throw response.error || new Error('Заказ не найден');
  return { order: response.data, items: await fetchItems(orderId) };
}

async function fetchOrderRevision(orderId) {
  const response = await supabaseClient.from('leader_orders').select('id,updated_at').eq('id', orderId).single();
  if (response.error || !response.data) throw response.error || new Error('Заказ не найден');
  return response.data.updated_at;
}

async function fetchItems(orderId) {
  const response = await supabaseClient
    .from('leader_order_items')
    .select(ITEM_FIELDS)
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })
    .limit(160);
  if (response.error) throw response.error;
  return response.data || [];
}

async function fetchFinance(orderId) {
  if (!canReadFinance()) return { payments: [], expenses: [], financeError: '' };
  try {
    const [payments, expenses] = await Promise.all([
      fetchAllOrderFinance(supabaseClient, 'leader_payments', PAYMENT_FIELDS, orderId),
      fetchAllOrderFinance(supabaseClient, 'leader_expenses', EXPENSE_FIELDS, orderId)
    ]);
    const recent = (a, b) => String(b.payment_date || b.expense_date || '').localeCompare(String(a.payment_date || a.expense_date || '')) || String(b.created_at).localeCompare(String(a.created_at));
    return { payments: payments.sort(recent), expenses: expenses.sort(recent), financeError: '' };
  } catch (error) {
    host().dataset.errorCode = String(error?.code || 'finance_read_failed').replace(/[^a-z0-9_]/gi, '').slice(0, 64);
    return { payments: [], expenses: [], financeError: 'Не удалось загрузить оплаты и расходы. Финансовые итоги временно недоступны.' };
  }
}

function itemQty(item) {
  return Number(item.quantity || item.qty || 0);
}

function renderItems(items) {
  if (!items.length) return '<div class="v4-order-modal-empty">Позиции заказа не найдены.</div>';
  return items.map((item) => `<article class="v4-order-modal-item"><div class="v4-order-modal-item-head"><b>${esc(item.name || 'Позиция')}</b><span>${money(item.client_sum)}</span></div><small>${esc(item.category || item.item_type || '—')} · ${itemQty(item).toLocaleString('ru-RU')} ${esc(item.unit || 'шт')}${canReadCosts() ? ` · себестоимость ${money(item.contractor_sum)}` : ''}</small>${item.comment ? `<small>${esc(item.comment)}</small>` : ''}</article>`).join('');
}

function effectText(effect) {
  if (effect.included) return 'Учтено в подтверждённом факте';
  if (effect.reason === 'not_confirmed') return 'Не учтено: не подтверждено';
  if (effect.reason === 'cancelled') return 'Не учтено: отменено';
  if (effect.reason === 'unknown_status') return 'Не учтено: неизвестный статус';
  return 'Не учтено';
}

function renderPaymentRows(payments) {
  if (!payments.length) return '<div class="v4-order-modal-empty">Оплаты по заказу пока не внесены.</div>';
  return payments.map((payment) => {
    const effect = confirmedPaymentEffect(payment);
    return `<article class="v4-order-finance-row"><b>${money(payment.amount)} · ${esc(payment.method || 'способ не указан')}</b><small>${esc(payment.payment_type || 'Приход')} · ${esc(payment.payment_status || 'Проведён')} · ${dateRu(payment.payment_date)}</small><small>${esc(effectText(effect))}</small>${payment.finance_category || payment.counterparty_name ? `<small>${esc(payment.finance_category || '—')} · ${esc(payment.counterparty_name || '—')}</small>` : ''}${payment.comment ? `<small>${esc(payment.comment)}</small>` : ''}${financeVoidButton('payment', payment, writeEnabled())}</article>`;
  }).join('');
}

function renderExpenseRows(expenses) {
  if (!expenses.length) return '<div class="v4-order-modal-empty">Расходы по заказу пока не внесены. Фактическая прибыль не рассчитывается.</div>';
  return expenses.map((expense) => {
    const effect = confirmedExpenseEffect(expense);
    return `<article class="v4-order-finance-row"><b>${money(expense.amount)} · ${esc(expense.category || 'Расход')}</b><small>${esc(expense.status || 'Проведён')} · ${esc(expense.method || 'способ не указан')} · ${dateRu(expense.expense_date)}</small><small>${esc(effectText(effect))}</small>${expense.comment ? `<small>${esc(expense.comment)}</small>` : ''}${financeVoidButton('expense', expense, writeEnabled())}</article>`;
  }).join('');
}

function renderFinance(order, payments, expenses, financeError) {
  if (!canReadFinance()) return '';
  if (financeError) return `<section class="v4-order-modal-section" data-order-finance><h3 id="orderFinanceTitle" tabindex="-1">Финансы заказа</h3><p role="status">${esc(financeError)}</p><button type="button" data-order-finance-reload>Повторить загрузку</button></section>`;
  const statusModel = orderStatusUiModel(order.status);
  const total = buildOrderFinanceSnapshot(order, payments, expenses, {
    terminal: statusModel.terminal,
    statusKnown: statusModel.known
  });
  const actualValue = total.actualProfit === null ? 'Не рассчитана' : moneyExact(total.actualProfit);
  const diffClass = total.planFactDiff === null ? '' : total.planFactDiff >= 0 ? 'is-good' : 'is-danger';
  const diffValue = total.planFactDiff === null ? '—' : moneyExact(total.planFactDiff);
  const notes = total.warnings.length
    ? `<div class="v4-order-finance-note">${total.warnings.map(esc).join(' ')}</div>`
    : '<div class="v4-order-finance-note">Результат предварительный: отдельного признака полноты всех расходов в текущей схеме нет.</div>';
  const controls = writeEnabled() ? '<div class="v4-order-modal-actions"><button type="button" data-finance-new="payment">Внести оплату</button><button type="button" data-finance-new="expense">Внести расход</button></div><div data-finance-editor></div>' : (canWriteFinance() ? '<p>Ввод оплат и расходов пока не включён в рабочем контуре.</p>' : '');
  const history = (rows, render) => render(rows.slice(0, 10)) + (rows.length > 10 ? `<details class="v4-order-finance-summary"><summary>Ещё ${rows.length - 10} записей</summary>${render(rows.slice(10))}</details>` : '');
  return `<section class="v4-order-modal-section" data-order-finance><h3 id="orderFinanceTitle" tabindex="-1">План и подтверждённый факт</h3><p data-finance-saved role="status" aria-live="polite"></p><div class="v4-order-modal-grid v4-order-finance-totals"><div><span>План клиенту</span><b>${moneyExact(total.plannedRevenue)}</b></div><div><span>Чистые поступления</span><b data-finance-total="receipts">${moneyExact(total.confirmedNetReceipts)}</b></div><div><span>Долг клиента</span><b data-finance-total="debt">${moneyExact(total.debt)}</b></div><div><span>Подтв. расходы</span><b data-finance-total="expenses">${moneyExact(total.confirmedExpenses)}</b></div><div><span>Денежный результат</span><b data-finance-total="cash">${moneyExact(total.cashResult)}</b></div><div><span>${esc(total.actualProfitState === 'unknown' ? 'Фактическая прибыль' : actualProfitStateLabel(total.actualProfitState))}</span><b>${esc(actualValue)}</b></div></div>${controls}<details class="v4-order-finance-summary"><summary>План / факт и движение денег</summary><div class="v4-order-modal-grid"><div><span>План себестоимость</span><b>${moneyExact(total.plannedCost)}</b></div><div><span>План прибыль</span><b>${moneyExact(total.plannedProfit)}</b></div><div><span>Подтверждено приходов</span><b>${moneyExact(total.confirmedIncoming)}</b></div><div><span>Возвраты / исходящие</span><b>${moneyExact(total.confirmedPaymentOutflow)}</b></div><div class="v4-order-finance-diff ${diffClass}"><span>План / факт</span><b>${esc(diffValue)}</b></div></div></details>${notes}<div class="v4-order-finance-list"><div><h4>Оплаты · ${payments.length}</h4>${history(payments, renderPaymentRows)}</div><div><h4>Расходы · ${expenses.length}</h4>${history(expenses, renderExpenseRows)}</div></div></section>`;
}

function designValue(order, key) {
  return order.data?.design?.[key] || order.data?.layout?.[key] || order.data?.[key] || '';
}

function renderDesign(order) {
  const layoutStatus = order.layout_status || designValue(order, 'layout_status') || 'Не указан';
  const responsible = designValue(order, 'designer') || designValue(order, 'design_responsible') || 'Не назначен';
  const designDeadline = designValue(order, 'design_deadline') || designValue(order, 'layout_deadline') || '';
  const designLink = designValue(order, 'design_link') || designValue(order, 'layout_link') || designValue(order, 'figma_url') || '';
  const designComment = designValue(order, 'design_comment') || designValue(order, 'layout_comment') || '';
  const safeLink = designLink ? esc(designLink) : '';
  return `<section class="v4-order-modal-section v4-order-design-section" data-order-design-section><h3>Дизайн в заказе</h3><div class="v4-order-design-summary"><div><span>Статус дизайна</span><b>${esc(layoutStatus)}</b></div><div><span>Ответственный</span><b>${esc(responsible)}</b></div><div><span>Дедлайн дизайна</span><b>${dateRu(designDeadline)}</b></div><div><span>Ссылка на макет</span><b>${safeLink ? `<a href="${safeLink}" target="_blank" rel="noopener">Открыть макет</a>` : '—'}</b></div></div><div class="v4-order-design-note">Перед запуском в производство проверьте, утверждён ли макет.<small>${designComment ? esc(designComment) : 'Если дизайн по заказу не требуется, оставьте текущий статус макета как служебную отметку.'}</small></div></section>`;
}

function renderPrimaryGuidance(order, statusModel, expenses) {
  const action = buildOrderPrimaryAction({ order, statusModel, expenses });
  const control = action.target === 'none'
    ? `<span class="v4-order-guidance-complete">${esc(action.label)}</span>`
    : `<button type="button" class="v4-primary" data-order-primary-target="${esc(action.target)}">${esc(action.label)}</button>`;
  return `<section class="v4-order-guidance is-${esc(action.tone || 'warn')}" data-order-primary-action="${esc(action.key)}"><div class="v4-order-guidance-main"><div><h3>Что сделать сейчас</h3><p>${esc(action.hint)}</p></div>${control}</div></section>`;
}

function exceptionOptions() {
  return ['<option value="">Выберите ситуацию</option>', ...ORDER_EXCEPTION_SCENARIOS.map((scenario) => `<option value="${esc(scenario.key)}">${esc(scenario.label)}</option>`)].join('');
}

function renderExceptionAssistant() {
  return `<details class="v4-order-exception" data-order-exception-assistant><summary>Ситуация изменилась</summary><div class="v4-order-exception-body"><p>Помощник покажет безопасную последовательность действий. Он не меняет цену, срок, статус, оплату или расходы автоматически.</p><label>Что произошло<select data-order-exception-select>${exceptionOptions()}</select></label><div class="v4-order-exception-preview is-empty" data-order-exception-preview>Выберите ситуацию, чтобы увидеть влияние и дальнейшие шаги.</div><div class="v4-order-exception-actions"><button type="button" class="v4-primary" data-order-exception-open disabled>Открыть нужный раздел</button><button type="button" data-order-exception-copy disabled>Скопировать служебную заметку</button></div><div class="v4-order-exception-result" data-order-exception-result aria-live="polite"></div></div></details>`;
}

function selectedExceptionPlan() {
  const key = host().querySelector('[data-order-exception-select]')?.value || '';
  return buildOrderExceptionPlan(key, currentBundle?.order || {});
}

function renderExceptionPreview() {
  const preview = host().querySelector('[data-order-exception-preview]');
  const openButton = host().querySelector('[data-order-exception-open]');
  const copyButton = host().querySelector('[data-order-exception-copy]');
  const result = host().querySelector('[data-order-exception-result]');
  if (!preview || !openButton || !copyButton) return;
  if (result) result.textContent = '';
  const plan = selectedExceptionPlan();
  openButton.disabled = !plan;
  copyButton.disabled = !plan;
  if (!plan) {
    delete openButton.dataset.orderExceptionTarget;
    preview.className = 'v4-order-exception-preview is-empty';
    preview.textContent = 'Выберите ситуацию, чтобы увидеть влияние и дальнейшие шаги.';
    return;
  }
  openButton.dataset.orderExceptionTarget = plan.target;
  openButton.textContent = plan.actionLabel;
  preview.className = 'v4-order-exception-preview';
  preview.innerHTML = `<h4>${esc(plan.label)}</h4><p class="v4-order-exception-impact"><b>Влияние:</b> ${esc(plan.impact)}</p><p><b>Важно:</b> ${esc(plan.consequence)}</p><ul>${plan.steps.map((step) => `<li>${esc(step)}</li>`).join('')}</ul><p><b>Ничего ещё не сохранено.</b> Проверьте данные в открывшемся разделе и выполните штатные действия CRM.</p>`;
}

async function writeClipboard(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const fallback = document.createElement('textarea');
  fallback.value = value;
  fallback.setAttribute('readonly', '');
  fallback.style.position = 'fixed';
  fallback.style.opacity = '0';
  document.body.appendChild(fallback);
  fallback.select();
  const copied = document.execCommand('copy');
  fallback.remove();
  if (!copied) throw new Error('copy_failed');
}

function openTarget(target) {
  const value = String(target || '').trim();
  const order = currentBundle?.order;
  if (!value || value === 'none') return;
  if (value === 'lead') {
    if (!order?.lead_id) {
      toast('У заказа нет связанной заявки. Откройте контроль заказов.');
      return;
    }
    const leadId = order.lead_id;
    closeCard();
    openLeadRoute(leadId);
    return;
  }
  const button = document.querySelector(`[data-v4-tab-button="${value}"]`);
  const setTab = window.v4SetTab;
  if (!button && typeof setTab !== 'function') {
    toast('Нужный раздел сейчас недоступен для вашей роли.');
    return;
  }
  closeCard();
  if (button) button.click();
  else setTab(value);
}

async function copyExceptionNote(button) {
  const plan = selectedExceptionPlan();
  const result = host().querySelector('[data-order-exception-result]');
  if (!plan) return;
  if (button) button.disabled = true;
  try {
    await writeClipboard(plan.note);
    if (result) result.textContent = 'Служебная заметка скопирована. Данные CRM не изменены.';
    toast('Служебная заметка скопирована');
  } catch (_) {
    if (result) result.textContent = 'Не удалось скопировать автоматически. Используйте текст из списка действий.';
  } finally {
    if (button) button.disabled = false;
  }
}

function renderCard(order, items, payments, expenses, financeError = '') {
  const orderType = order.data?.order_type || order.data?.orderType || '—';
  const statusModel = orderStatusUiModel(order.status);
  const statusWarning = statusModel.known ? '' : `<div class="v4-order-modal-empty" data-unknown-order-status="${esc(statusModel.raw)}">${esc(statusModel.warning)}</div>`;
  currentBundle = { order, items, payments, expenses, statusModel, financeError };
  host().innerHTML = `<div class="v4-order-modal"><div class="v4-order-modal-card" role="dialog" aria-modal="true" aria-labelledby="orderCardTitle"><div class="v4-order-modal-head"><div><p class="v4-kicker">Карточка заказа</p><h2 id="orderCardTitle" tabindex="-1">№${esc(order.order_number || shortId(order.id))} — ${esc(order.project_name || 'Заказ')}</h2><p>${esc(order.client_name || 'Клиент не указан')} · ${esc(order.client_phone || 'телефон не указан')} · создано ${dateRu(order.created_at)}</p></div><button type="button" data-order-card-close>Закрыть</button></div><div class="v4-order-modal-grid"><div><span>Статус</span><b title="${esc(statusModel.known ? `Registry: ${statusModel.key}` : statusModel.warning)}">${esc(statusModel.label)}</b></div><div><span>Оплата</span><b>${esc(order.payment_status || 'Не оплачено')}</b></div><div><span>Срок</span><b>${dateRu(order.deadline)}</b></div><div><span>Дизайн / макет</span><b>${esc(order.layout_status || '—')}</b></div><div><span>Производство</span><b>${esc(order.production_status || '—')}</b></div><div><span>Тип</span><b>${esc(orderType)}</b></div><div><span>План клиенту</span><b>${money(order.client_total)}</b></div></div>${statusWarning}${renderPrimaryGuidance(order, statusModel, expenses)}${renderExceptionAssistant()}<div class="v4-order-modal-actions">${order.lead_id ? `<button type="button" data-order-card-open-lead="${esc(order.lead_id)}">Открыть связанную заявку</button>` : ''}<button type="button" data-order-card-close>Закрыть</button></div>${renderDesign(order)}${renderFinance(order, payments, expenses, financeError)}<section class="v4-order-modal-section"><h3>Позиции заказа</h3><div class="v4-order-modal-items">${renderItems(items)}</div></section></div></div>`;
  financeWriter = mountFinanceWriter(host().querySelector('[data-order-finance]'), { order, payments, expenses, client: supabaseClient, url: V4_CONFIG.supabaseUrl, actorId: v4State.profile?.user_id, canWrite: canWriteFinance, refresh: message => openOrderCard(order.id, message || '', true) });
  document.dispatchEvent(new CustomEvent('leader-v4:order-card-rendered', {
    detail: { orderId: String(order.id || '') }
  }));
}

async function openOrderCard(orderId, message = '', refresh = false, trigger = null) {
  if (!orderId || busy || financeWriter?.isBusy()) return;
  if (!refresh) opener = trigger || document.activeElement;
  const request = ++cardRequest;
  busy = true;
  financeWriter = null;
  ensureStyles();
  loading();
  try {
    let { order, items } = await fetchOrderBundle(orderId);
    let finance = await fetchFinance(order.id);
    if (canReadFinance() && !finance.financeError) {
      try {
      const currentRevision = await fetchOrderRevision(order.id);
      if (currentRevision !== order.updated_at) {
        ({ order, items } = await fetchOrderBundle(orderId));
        finance = await fetchFinance(order.id);
        const verified = await fetchOrderRevision(order.id);
        if (verified !== order.updated_at) finance.financeError = 'Финансы заказа изменились во время загрузки. Обновите итоги.';
      }
      } catch (_) { finance.financeError = 'Не удалось проверить актуальность финансовых итогов. Повторите загрузку.'; }
    }
    if (request !== cardRequest) return;
    renderCard(order, items, finance.payments, finance.expenses, finance.financeError);
    const target = host().querySelector(refresh ? '#orderFinanceTitle' : '#orderCardTitle');
    target?.focus();
    if (message && !finance.financeError) {
      const saved = host().querySelector('[data-finance-saved]');
      if (saved) saved.textContent = message;
    }
  } catch (error) {
    if (request === cardRequest) errorBox(friendlyError(error), error?.code);
  } finally {
    if (request === cardRequest) busy = false;
  }
}

function boot() {
  if (booted) return;
  booted = true;
  ensureStyles();
  document.addEventListener('keydown', event => {
    const dialog = host().querySelector('[role="dialog"]');
    if (!dialog) return;
    if (event.key === 'Escape') { event.preventDefault(); closeCard(); }
    if (event.key === 'Tab') {
      const nodes = [...dialog.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')].filter(node => node.getClientRects().length);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.querySelector('#orderCardTitle'))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  document.addEventListener('change', (event) => {
    if (event.target.closest?.('[data-order-exception-select]')) renderExceptionPreview();
  }, true);
  document.addEventListener('click', (event) => {
    const reload = event.target.closest?.('[data-order-finance-reload]');
    if (reload) { event.preventDefault(); openOrderCard(currentBundle?.order.id, '', true); return; }
    const close = event.target.closest?.('[data-order-card-close]');
    if (close) { event.preventDefault(); closeCard(); return; }
    const open = event.target.closest?.('[data-open-order]');
    if (open) { event.preventDefault(); openOrderCard(open.dataset.openOrder, '', false, open); return; }
    const openLead = event.target.closest?.('[data-order-card-open-lead]');
    if (openLead) { event.preventDefault(); closeCard(); openLeadRoute(openLead.dataset.orderCardOpenLead); return; }
    const primary = event.target.closest?.('[data-order-primary-target]');
    if (primary) { event.preventDefault(); openTarget(primary.dataset.orderPrimaryTarget); return; }
    const exceptionOpen = event.target.closest?.('[data-order-exception-open]');
    if (exceptionOpen) { event.preventDefault(); openTarget(exceptionOpen.dataset.orderExceptionTarget); return; }
    const exceptionCopy = event.target.closest?.('[data-order-exception-copy]');
    if (exceptionCopy) { event.preventDefault(); copyExceptionNote(exceptionCopy); }
  }, true);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
