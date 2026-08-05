import { supabaseClient } from './supabase-client.js';
import { friendlyError } from './api.js';
import { setStatus } from './ui.js';
import { openLeadRoute } from './router.js';
import { isActiveOrderStatus, orderStatusUiModel } from './order-status-ui-model-v1.js';
import { describeOrderListState, loadOrderListPreferences, paymentNeedsAttention, resetOrderListPreferences, saveOrderListPreferences, selectOrderRows } from './order-list-preferences-v1.js';

const ORDER_FIELDS = 'id,order_number,project_name,status,deadline,client_name,client_phone,client_total,payment_status,created_at,layout_status,lead_id';
let busy = false;
let loaded = false;
let rows = [];
let warning = '';
let preferences = { ...loadOrderListPreferences(), search: '' };

function esc(value) {
  return String(value ?? '').replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function money(value) {
  const number = Number(value || 0);
  return number ? `${Math.round(number).toLocaleString('ru-RU')} ₽` : '—';
}

function dateRu(value) {
  if (!value) return '—';
  try { return new Date(value).toLocaleDateString('ru-RU'); } catch (_) { return String(value); }
}

function layoutStatus(order) {
  return order.layout_status || 'Макета нет';
}

function designClass(order) {
  const text = String(layoutStatus(order)).toLowerCase();
  if (text.includes('соглас') || text.includes('утверж') || text.includes('готов')) return 'is-good';
  if (text.includes('нет') || text.includes('не треб')) return 'is-muted';
  if (text.includes('правк') || text.includes('работ') || text.includes('дизайн') || text.includes('согласован')) return 'is-warn';
  return 'is-warn';
}

function designNeedsCheck(order) {
  const text = String(layoutStatus(order)).toLowerCase();
  if (!isActiveOrderStatus(order.status)) return false;
  if (text.includes('не треб')) return false;
  return designClass(order) !== 'is-good';
}

function designHint(order) {
  const cls = designClass(order);
  if (cls === 'is-good') return 'макет можно передавать дальше';
  if (cls === 'is-muted') return 'проверьте, нужен ли дизайн';
  return 'проверьте до производства';
}

function renderDesignBadge(order) {
  return `<span class="v4-orders-fast-design ${designClass(order)}" data-orders-fast-design><b>Дизайн / макет:</b> ${esc(layoutStatus(order))}<small>${esc(designHint(order))}</small></span>`;
}

function workspace() {
  return document.getElementById('crmWorkspace') || document.querySelector('main') || document.body;
}

function ensureStyles() {
  if (document.getElementById('ordersFastLoaderV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'ordersFastLoaderV1Styles';
  style.textContent = `
    .v4-orders-fast-warning{border:1px solid #fde68a;background:#fffdf3;color:#92400e;border-radius:14px;padding:10px;margin:12px 0;font-weight:800}
    .v4-orders-fast-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin:0 0 12px}.v4-orders-fast-summary div{border:1px solid #dbeafe;background:#eff6ff;border-radius:16px;padding:12px}.v4-orders-fast-summary div.is-warn{border-color:#fde68a;background:#fff7ed}.v4-orders-fast-summary span{display:block;color:#1d4ed8;font-size:12px;font-weight:900;text-transform:uppercase}.v4-orders-fast-summary div.is-warn span{color:#9a3412}.v4-orders-fast-summary b{display:block;margin-top:5px;font-size:22px;color:#0f172a}
    .v4-orders-fast-list{display:grid;gap:10px}.v4-orders-fast-card{border:1px solid #e2e8f0;background:#fff;border-radius:16px;padding:12px;display:grid;gap:8px;box-shadow:0 8px 22px rgba(15,23,42,.05)}.v4-orders-fast-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.v4-orders-fast-head h3{margin:0;font-size:16px}.v4-orders-fast-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:6px;color:#64748b}.v4-orders-fast-actions{display:flex;gap:8px;flex-wrap:wrap}.v4-orders-fast-actions button{border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;border-radius:12px;padding:8px 10px;font-weight:900}.v4-orders-fast-actions .v4-primary{background:#1d4ed8;color:#fff;border-color:#1d4ed8}
    .v4-orders-fast-design{border:1px solid #fed7aa!important;background:#fff7ed!important;color:#9a3412!important;border-radius:14px!important;padding:8px 10px!important;display:grid!important;gap:3px!important}.v4-orders-fast-design small{display:block;color:#9a3412;font-size:11px;font-weight:800}.v4-orders-fast-design.is-good{border-color:#bbf7d0!important;background:#f0fdf4!important;color:#166534!important}.v4-orders-fast-design.is-good small{color:#166534}.v4-orders-fast-design.is-muted{border-color:#e2e8f0!important;background:#f8fafc!important;color:#475569!important}.v4-orders-fast-design.is-muted small{color:#64748b}
    .v4-orders-fast-filters{display:grid;grid-template-columns:minmax(220px,1fr) 210px 210px auto;gap:10px;align-items:end;margin:0 0 10px}.v4-orders-fast-filters label{font-weight:900;color:#30343a}.v4-orders-fast-filters input,.v4-orders-fast-filters select{display:block;width:100%;margin-top:6px;border:1px solid #cbd5e1;border-radius:12px;padding:10px;background:#fff;font:inherit}.v4-orders-fast-filters button{border:1px solid #cbd5e1;border-radius:12px;padding:10px;background:#fff;font-weight:900}.v4-orders-fast-filter-state{margin:0 0 12px;color:#64748b;font-weight:800}.v4-orders-fast-filters :focus-visible{outline:3px solid rgba(37,99,235,.2);border-color:#2563eb}@media(max-width:850px){.v4-orders-fast-filters{grid-template-columns:1fr}.v4-orders-fast-filters button{width:100%}}
  `;
  document.head.appendChild(style);
}

function ensureNav() {
  const nav = document.getElementById('v4LayoutTabs');
  if (!nav || nav.querySelector('[data-v4-tab-button="orders"]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.v4TabButton = 'orders';
  button.textContent = 'Заказы';
  const leadsButton = nav.querySelector('[data-v4-tab-button="leads"]');
  if (leadsButton) leadsButton.insertAdjacentElement('afterend', button);
  else nav.appendChild(button);
}

function ensureSection() {
  let section = document.getElementById('ordersListSection');
  if (!section) {
    section = document.createElement('section');
    section.id = 'ordersListSection';
    section.className = 'v4-card v4-managed-section';
    section.dataset.v4ManagedSection = 'orders';
    section.hidden = document.body.dataset.v4Tab !== 'orders';
    section.innerHTML = `<div class="v4-section-head"><div><h2>Заказы</h2><p>Быстрый список заказов: статус, срок, клиент, сумма, оплата и дизайн / макет.</p></div><button type="button" class="v4-primary" data-orders-fast-refresh>Обновить</button></div><div class="v4-orders-fast-filters"><label>Поиск<input type="search" data-orders-fast-search placeholder="Номер, проект, клиент, телефон"></label><label>Фильтр<select data-orders-fast-filter><option value="active">Активные</option><option value="all">Все заказы</option><option value="overdue">Просроченные</option><option value="payment">Оплата под контролем</option><option value="design">Проверить дизайн</option></select></label><label>Сортировка<select data-orders-fast-sort><option value="created_desc">Сначала новые</option><option value="deadline_asc">Ближайший срок</option><option value="amount_desc">По сумме</option><option value="status_asc">По статусу</option></select></label><button type="button" data-orders-fast-reset>Сбросить</button></div><div class="v4-orders-fast-filter-state" data-orders-fast-filter-state aria-live="polite"></div><div id="ordersListSectionContent" class="v4-crm-list"><div class="v4-empty">Раздел загрузится при открытии.</div></div>`;
    const leads = document.getElementById('leadsSection');
    if (leads) leads.insertAdjacentElement('afterend', section);
    else workspace().appendChild(section);
  }
  section.dataset.v4ManagedSection = 'orders';
  return section;
}

function host() {
  ensureSection();
  return document.getElementById('ordersListSectionContent');
}

function showOrdersTab() {
  ensureNav();
  ensureSection();
  document.body.dataset.v4Tab = 'orders';
  document.querySelectorAll('[data-v4-tab-button]').forEach((button) => button.classList.toggle('is-active', button.dataset.v4TabButton === 'orders'));
  document.querySelectorAll('[data-v4-managed-section]').forEach((section) => { section.hidden = section.dataset.v4ManagedSection !== 'orders'; });
  const leads = document.getElementById('leadsSection');
  const card = document.getElementById('leadCardSection');
  const next = document.querySelector('.v4-next-card');
  if (leads) leads.style.display = 'none';
  if (card) card.style.display = 'none';
  if (next) next.style.display = 'none';
  document.dispatchEvent(new CustomEvent('leader-v4:tab-opened', { detail: { tab: 'orders' } }));
}

function renderOrderFastCard(order) {
  const statusModel = orderStatusUiModel(order.status);
  const warning = statusModel.known ? '' : `<div class="v4-orders-fast-warning" data-unknown-order-status="${esc(statusModel.raw)}">${esc(statusModel.warning)}</div>`;
  return `<article class="v4-orders-fast-card"><div class="v4-orders-fast-head"><h3>№${esc(order.order_number || String(order.id || '').slice(0, 8))} — ${esc(order.project_name || 'Заказ')}</h3><span class="v4-crm-badge ${esc(statusModel.cssClass)}" title="${esc(statusModel.known ? `Registry: ${statusModel.key}` : statusModel.warning)}">${esc(statusModel.label)}</span></div>${warning}<div class="v4-orders-fast-meta"><span><b>Клиент:</b> ${esc(order.client_name || '—')}</span><span><b>Телефон:</b> ${esc(order.client_phone || '—')}</span><span><b>Срок:</b> ${dateRu(order.deadline)}</span><span><b>Оплата:</b> ${esc(order.payment_status || 'Не указана')}</span><span><b>Сумма:</b> ${money(order.client_total)}</span>${renderDesignBadge(order)}</div><div class="v4-orders-fast-actions"><button type="button" class="v4-primary" data-open-order="${esc(order.id)}">Карточка заказа</button>${order.lead_id ? `<button type="button" data-order-open-lead="${esc(order.lead_id)}">Открыть заявку</button>` : ''}</div></article>`;
}

function render() {
  ensureStyles();
  ensureNav();
  const box = host();
  if (!box) return;
  const visibleRows = selectOrderRows(rows, preferences, { isActive: isActiveOrderStatus, designNeedsCheck });
  const descriptions = describeOrderListState(preferences);
  const section = ensureSection();
  const search = section.querySelector('[data-orders-fast-search]');
  const filter = section.querySelector('[data-orders-fast-filter]');
  const sort = section.querySelector('[data-orders-fast-sort]');
  const filterState = section.querySelector('[data-orders-fast-filter-state]');
  if (search && search.value !== preferences.search) search.value = preferences.search || '';
  if (filter) filter.value = preferences.filter;
  if (sort) sort.value = preferences.sort;
  if (filterState) filterState.textContent = descriptions.length ? `Активно: ${descriptions.join('; ')}. Показано ${visibleRows.length} из ${rows.length}.` : `Активные заказы, сначала новые. Показано ${visibleRows.length} из ${rows.length}.`;
  const active = rows.filter((row) => isActiveOrderStatus(row.status)).length;
  const total = rows.reduce((sum, row) => sum + Number(row.client_total || 0), 0);
  const unpaid = rows.filter(paymentNeedsAttention).length;
  const designCheck = rows.filter(designNeedsCheck).length;
  const warningHtml = warning ? `<div class="v4-orders-fast-warning">${esc(warning)}. Можно повторить загрузку или открыть карточку заявки.</div>` : '';
  const empty = warning ? '' : rows.length ? `<div class="v4-empty">По выбранным условиям заказов нет.<div class="v4-orders-fast-filter-state">${esc(descriptions.join('; ') || 'Активные заказы')}</div><button type="button" class="v4-primary" data-orders-fast-reset>Сбросить фильтры</button></div>` : '<div class="v4-empty">В базе пока нет заказов.</div>';
  box.innerHTML = `${warningHtml}<div class="v4-orders-fast-summary"><div><span>Заказов</span><b>${rows.length}</b></div><div><span>Активные</span><b>${active}</b></div><div><span>Сумма</span><b>${money(total)}</b></div><div><span>Оплата под контролем</span><b>${unpaid}</b></div><div class="${designCheck ? 'is-warn' : ''}" data-orders-fast-design-summary><span>Дизайн проверить</span><b>${designCheck}</b></div></div><div class="v4-orders-fast-list">${visibleRows.length ? visibleRows.map(renderOrderFastCard).join('') : empty}</div>`;
}

async function loadOrdersFast(force = false) {
  ensureSection();
  ensureStyles();
  ensureNav();
  if (busy) return;
  if (loaded && !force) { render(); return; }
  busy = true;
  warning = '';
  const box = host();
  if (box) box.innerHTML = '<div class="v4-empty">Загружаю быстрый список заказов...</div>';
  try {
    setStatus('Загружаю список заказов...', 'warn');
    const response = await supabaseClient
      .from('leader_orders')
      .select(ORDER_FIELDS)
      .order('created_at', { ascending: false })
      .limit(40);
    if (response.error) throw response.error;
    rows = response.data || [];
    setStatus('Список заказов загружен', 'good');
  } catch (error) {
    rows = [];
    warning = `Заказы не загрузились: ${friendlyError(error)}`;
    setStatus('Список заказов не загрузился', 'warn');
  } finally {
    loaded = true;
    busy = false;
    render();
  }
}

function boot() {
  ensureSection();
  ensureNav();
  document.addEventListener('leader-v4:crm-ready', () => setTimeout(ensureNav, 300));
  document.addEventListener('leader-v4:tab-opened', () => setTimeout(ensureNav, 200));
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-orders-fast-reset]')) {
      event.preventDefault();
      preferences = { ...resetOrderListPreferences(), search: '' };
      render();
      ensureSection().querySelector('[data-orders-fast-search]')?.focus();
      return;
    }
    const tab = event.target.closest?.('[data-v4-tab-button="orders"]');
    if (tab) {
      event.preventDefault();
      event.stopPropagation();
      showOrdersTab();
      loadOrdersFast(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (event.target.closest?.('[data-orders-fast-refresh],[data-v4-list-refresh="orders"]')) {
      event.preventDefault();
      loaded = false;
      loadOrdersFast(true);
      return;
    }
    const openLead = event.target.closest?.('[data-order-open-lead]');
    if (openLead) {
      event.preventDefault();
      openLeadRoute(openLead.dataset.orderOpenLead);
    }
  }, true);
  document.addEventListener('input', (event) => {
    if (!event.target.matches?.('[data-orders-fast-search]')) return;
    preferences = { ...preferences, search: event.target.value || '' };
    render();
  });
  document.addEventListener('change', (event) => {
    if (event.target.matches?.('[data-orders-fast-filter]')) preferences = { ...preferences, filter: event.target.value };
    else if (event.target.matches?.('[data-orders-fast-sort]')) preferences = { ...preferences, sort: event.target.value };
    else return;
    saveOrderListPreferences(preferences);
    render();
  });
}

if (!window.LeaderV4OrdersFastLoaderV1Booted) {
  window.LeaderV4OrdersFastLoaderV1Booted = true;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
}

export function load() { return loadOrdersFast(false); }
export function refresh() { return loadOrdersFast(true); }
export { loadOrdersFast };
