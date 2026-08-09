import { supabaseClient } from './supabase-client.js';
import { v4State } from './state.js';
import { canOpenV4Tab } from './role-tab-permissions-v1.js';
import { orderStatusUiModel } from './order-status-ui-model-v1.js';
import {
  actualProfitStateLabel,
  buildFinancePortfolioSnapshot
} from './finance-plan-actual-model-v1.js';

const PANEL_ID = 'financePlanActualPanelV1';
const STYLE_ID = 'financePlanActualPanelV1Styles';
const CACHE_MS = 60000;
const ORDER_FIELDS = 'id,order_number,project_name,status,client_total,contractor_cost,profit,is_archived,created_at';
const PAYMENT_FIELDS = 'id,order_id,amount,payment_status,payment_type,is_confirmed,payment_date';
const EXPENSE_FIELDS = 'id,order_id,amount,status,category,expense_date';

let busy = false;
let loadedAt = 0;
let snapshot = null;
let errorText = '';

function esc(value) {
  return String(value ?? '').replace(/[&<>\"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[char]));
}

function money(value, empty = '—') {
  if (value === null || value === undefined) return empty;
  const number = Number(value);
  if (!Number.isFinite(number)) return empty;
  return `${Math.round(number).toLocaleString('ru-RU')} ₽`;
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `.v4-plan-actual{margin:16px 0;border:1px solid #c7d2fe;background:linear-gradient(180deg,#f8faff 0%,#fff 100%);border-radius:20px;padding:15px;display:grid;gap:13px}.v4-plan-actual-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.v4-plan-actual-head h3{margin:0;color:#312e81}.v4-plan-actual-head p{margin:5px 0 0;color:#64748b}.v4-plan-actual button{border:1px solid #c7d2fe;background:#fff;color:#3730a3;border-radius:11px;padding:8px 11px;font-weight:900;cursor:pointer}.v4-plan-actual-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:8px}.v4-plan-actual-stat{border:1px solid #e0e7ff;background:#fff;border-radius:14px;padding:10px}.v4-plan-actual-stat span{display:block;color:#64748b;font-size:11px;font-weight:900;text-transform:uppercase}.v4-plan-actual-stat b{display:block;margin-top:4px;font-size:20px;color:#1e1b4b}.v4-plan-actual-stat.is-danger{border-color:#fecaca;background:#fff7f7}.v4-plan-actual-stat.is-danger b{color:#991b1b}.v4-plan-actual-stat.is-warn{border-color:#fde68a;background:#fffdf3}.v4-plan-actual-stat.is-good{border-color:#bbf7d0;background:#f0fdf4}.v4-plan-actual-note{border:1px dashed #a5b4fc;background:#eef2ff;color:#3730a3;border-radius:13px;padding:10px;font-weight:800}.v4-plan-actual-note.is-danger{border-color:#fca5a5;background:#fff1f2;color:#991b1b}.v4-plan-actual-list{display:grid;gap:8px}.v4-plan-actual-row{border:1px solid #e0e7ff;background:#fff;border-radius:15px;padding:11px;display:grid;grid-template-columns:minmax(190px,1.2fr) repeat(4,minmax(95px,.65fr)) auto;gap:9px;align-items:center}.v4-plan-actual-row.is-danger{border-color:#fecaca;background:#fffafa}.v4-plan-actual-title b,.v4-plan-actual-title small{display:block}.v4-plan-actual-title small{margin-top:3px;color:#64748b}.v4-plan-actual-metric span{display:block;color:#64748b;font-size:10px;font-weight:900;text-transform:uppercase}.v4-plan-actual-metric b{display:block;margin-top:3px;color:#0f172a}.v4-plan-actual-empty,.v4-plan-actual-error{border:1px dashed #cbd5e1;background:#f8fafc;border-radius:14px;padding:13px;color:#64748b}.v4-plan-actual-error{border-color:#fecaca;background:#fff1f2;color:#991b1b;font-weight:800}@media(max-width:980px){.v4-plan-actual-row{grid-template-columns:repeat(2,1fr)}.v4-plan-actual-title,.v4-plan-actual-row button{grid-column:1/-1}.v4-plan-actual-row button{width:100%}}@media(max-width:640px){.v4-plan-actual-head{display:grid}.v4-plan-actual-head button{width:100%}.v4-plan-actual-row{grid-template-columns:1fr}}`;
  document.head.appendChild(style);
}

function financeSection() {
  return document.getElementById('financeControlSection');
}

function ensurePanel() {
  ensureStyles();
  const section = financeSection();
  if (!section) return null;
  let panel = document.getElementById(PANEL_ID);
  if (panel && panel.closest('#financeControlSection') === section) return panel;
  if (panel) panel.remove();
  panel = document.createElement('section');
  panel.id = PANEL_ID;
  panel.className = 'v4-plan-actual';
  panel.setAttribute('aria-label', 'Плановые и подтверждённые фактические финансы');
  const content = document.getElementById('financeControlContent');
  if (content) content.insertAdjacentElement('afterend', panel);
  else section.appendChild(panel);
  return panel;
}

function stat(label, value, type = '') {
  return `<div class="v4-plan-actual-stat ${type}"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
}

function orderTitle(order) {
  const number = order.orderNumber || String(order.orderId || '').slice(0, 8) || '—';
  return `№${number} — ${order.projectName}`;
}

function orderStateText(order) {
  if (order.actualProfitState === 'unknown') return 'Факт. прибыль не рассчитана';
  if (order.actualProfitState === 'partial') return `Предварительно ${money(order.actualProfit)}`;
  return `Предварительно ${money(order.actualProfit)}`;
}

function orderRow(order) {
  const danger = order.actualProfitState === 'unknown' || order.debt > 0;
  const reason = order.actualProfitState === 'unknown'
    ? 'Нет подтверждённых расходов при наличии плановой себестоимости.'
    : order.terminal
      ? 'Заказ закрыт, но полнота расходов не имеет отдельного системного подтверждения.'
      : 'Заказ не закрыт: результат будет меняться.';
  return `<article class="v4-plan-actual-row${danger ? ' is-danger' : ''}"><div class="v4-plan-actual-title"><b>${esc(orderTitle(order))}</b><small>${esc(order.status)} · ${esc(reason)}</small></div><div class="v4-plan-actual-metric"><span>План прибыль</span><b>${esc(money(order.plannedProfit))}</b></div><div class="v4-plan-actual-metric"><span>Подтверждено оплат</span><b>${esc(money(order.confirmedNetReceipts))}</b></div><div class="v4-plan-actual-metric"><span>Подтв. расходы</span><b>${esc(money(order.confirmedExpenses))}</b></div><div class="v4-plan-actual-metric"><span>Результат</span><b>${esc(orderStateText(order))}</b></div><button type="button" data-open-order="${esc(order.orderId)}">Открыть заказ</button></article>`;
}

function render() {
  if (!canOpenV4Tab('finance_control')) return;
  const panel = ensurePanel();
  if (!panel) return;
  if (busy) {
    panel.innerHTML = '<div class="v4-plan-actual-note">Загружаю плановые суммы и подтверждённые движения...</div>';
    return;
  }
  if (errorText) {
    panel.innerHTML = `<div class="v4-plan-actual-head"><div><h3>План и подтверждённый факт</h3><p>Read-only расчёт без клиентских контактов и комментариев.</p></div><button type="button" data-plan-actual-refresh>Повторить</button></div><div class="v4-plan-actual-error">${esc(errorText)}</div>`;
    return;
  }
  if (!snapshot) {
    panel.innerHTML = '<div class="v4-plan-actual-empty">Сводка появится после открытия раздела «Финансы».</div>';
    return;
  }

  const actualValue = snapshot.actualProfit === null ? 'Не рассчитана' : money(snapshot.actualProfit);
  const actualType = snapshot.actualProfit === null ? 'is-danger' : 'is-warn';
  const warnings = [];
  if (snapshot.actualProfit === null) warnings.push(`Фактическая прибыль не рассчитана по ${snapshot.unknownActualProfitOrders} заказам: отсутствуют подтверждённые расходы.`);
  if (snapshot.confirmedUnattributedPayments) warnings.push(`Есть подтверждённые платежи без активного заказа: ${money(snapshot.confirmedUnattributedPayments)}.`);
  if (snapshot.confirmedUnattributedExpenses) warnings.push(`Есть подтверждённые расходы без активного заказа: ${money(snapshot.confirmedUnattributedExpenses)}.`);
  if (snapshot.ignoredPaymentRows) warnings.push(`Не учтено неподтверждённых или отменённых платежей: ${snapshot.ignoredPaymentRows}.`);
  if (snapshot.ignoredExpenseRows) warnings.push(`Не учтено неподтверждённых, неизвестных или отменённых расходов: ${snapshot.ignoredExpenseRows}.`);

  panel.innerHTML = `<div class="v4-plan-actual-head"><div><h3>План и подтверждённый факт</h3><p>План берётся из заказов. Факт учитывает только подтверждённые движения и не подменяет отсутствие расходов нулевой себестоимостью.</p></div><button type="button" data-plan-actual-refresh>Обновить факт</button></div><div class="v4-plan-actual-grid">${stat('План выручка', money(snapshot.plannedRevenue))}${stat('План себестоимость', money(snapshot.plannedCost))}${stat('План прибыль', money(snapshot.plannedProfit), snapshot.plannedProfit >= 0 ? 'is-good' : 'is-danger')}${stat('Подтверждено оплат', money(snapshot.confirmedNetReceipts), snapshot.confirmedNetReceipts ? 'is-good' : 'is-warn')}${stat('Подтв. расходы', money(snapshot.confirmedExpenses), snapshot.confirmedExpenses ? '' : 'is-warn')}${stat('Денежный результат', money(snapshot.cashResult), snapshot.cashResult >= 0 ? 'is-good' : 'is-danger')}${stat(actualProfitStateLabel(snapshot.actualProfitState), actualValue, actualType)}${stat('Долг клиентов', money(snapshot.debt), snapshot.debt ? 'is-danger' : 'is-good')}${stat('Покрытие оплат', `${snapshot.paymentCoveragePercent}%`)}${stat('Покрытие расходов', `${snapshot.expenseCoveragePercent}%`, snapshot.expenseCoveragePercent < 100 ? 'is-danger' : 'is-good')}</div>${warnings.length ? `<div class="v4-plan-actual-note is-danger">${warnings.map(esc).join(' ')}</div>` : '<div class="v4-plan-actual-note">Финансовый результат остаётся предварительным до подтверждения полноты всех расходов.</div>'}<div class="v4-plan-actual-list">${snapshot.orders.map(orderRow).join('') || '<div class="v4-plan-actual-empty">Заказы для финансовой сводки не найдены.</div>'}</div>`;
}

async function readRows(table, fields) {
  const response = await supabaseClient.from(table).select(fields).limit(1000);
  if (response.error) throw response.error;
  return response.data || [];
}

async function load(force = false) {
  if (!v4State.crmReady || !canOpenV4Tab('finance_control') || busy) return;
  if (!force && snapshot && Date.now() - loadedAt < CACHE_MS) {
    render();
    return;
  }
  busy = true;
  errorText = '';
  render();
  try {
    const [orders, payments, expenses] = await Promise.all([
      readRows('leader_orders', ORDER_FIELDS),
      readRows('leader_payments', PAYMENT_FIELDS),
      readRows('leader_expenses', EXPENSE_FIELDS)
    ]);
    snapshot = buildFinancePortfolioSnapshot(orders, payments, expenses, { statusResolver: orderStatusUiModel });
    loadedAt = Date.now();
  } catch (error) {
    console.warn('CRM finance plan/actual read warning:', error);
    errorText = 'Не удалось загрузить read-only финансовую сводку. Данные CRM не изменялись.';
  } finally {
    busy = false;
    render();
  }
}

function mount() {
  if (window.LeaderV4FinancePlanActualPanelV1Mounted) return;
  window.LeaderV4FinancePlanActualPanelV1Mounted = true;
  ensurePanel();
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-plan-actual-refresh]')) {
      event.preventDefault();
      load(true);
    }
    if (event.target.closest?.('[data-finance-control-refresh]')) setTimeout(() => load(true), 0);
  });
  const observer = new MutationObserver(() => {
    if (!document.getElementById(PANEL_ID) && financeSection()) {
      ensurePanel();
      if (snapshot) render();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

export { mount, load };
export function refresh() { return load(true); }
