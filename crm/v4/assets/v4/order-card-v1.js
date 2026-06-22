import { supabaseClient } from './supabase-client.js';
import { friendlyError } from './api.js';
import { toast } from './ui.js';
import { openLeadRoute } from './router.js';

const ORDER_FIELDS = 'id,order_number,project_name,status,deadline,client_name,client_phone,client_total,contractor_cost,profit,balance,payment_status,layout_status,production_status,lead_id,client_id,created_at,updated_at,data';
const ITEM_FIELDS = 'id,order_id,name,unit,quantity,contractor_price,contractor_sum,client_sum,comment,category,item_type,data,created_at';

let busy = false;
let booted = false;

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}
function money(value) {
  const number = Number(value || 0);
  return number ? `${Math.round(number).toLocaleString('ru-RU')} ₽` : '—';
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
    @media(max-width:760px){.v4-order-modal-card{padding:12px;border-radius:18px}.v4-order-modal-head{display:grid}.v4-order-modal-actions button{width:100%}.v4-order-modal-item-head{display:grid}}
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
  host().innerHTML = '';
  busy = false;
}

function loading() {
  host().innerHTML = `<div class="v4-order-modal"><div class="v4-order-modal-card"><div class="v4-order-modal-head"><div><h2>Карточка заказа</h2><p>Загружаю заказ...</p></div><button type="button" data-order-card-close>Закрыть</button></div><div class="v4-order-modal-empty">Загрузка...</div></div></div>`;
}

function errorBox(text) {
  host().innerHTML = `<div class="v4-order-modal"><div class="v4-order-modal-card"><div class="v4-order-modal-head"><div><h2>Карточка заказа</h2><p>Не удалось загрузить данные</p></div><button type="button" data-order-card-close>Закрыть</button></div><div class="v4-order-modal-empty">${esc(text)}</div></div></div>`;
}

async function fetchOrder(orderId) {
  const response = await supabaseClient.from('leader_orders').select(ORDER_FIELDS).eq('id', orderId).single();
  if (response.error || !response.data) throw response.error || new Error('Заказ не найден');
  return response.data;
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

function itemQty(item) {
  return Number(item.quantity || item.qty || 0);
}

function renderItems(items) {
  if (!items.length) return '<div class="v4-order-modal-empty">Позиции заказа не найдены.</div>';
  return items.map((item) => `<article class="v4-order-modal-item"><div class="v4-order-modal-item-head"><b>${esc(item.name || 'Позиция')}</b><span>${money(item.client_sum)}</span></div><small>${esc(item.category || item.item_type || '—')} · ${itemQty(item).toLocaleString('ru-RU')} ${esc(item.unit || 'шт')} · себестоимость ${money(item.contractor_sum)}</small>${item.comment ? `<small>${esc(item.comment)}</small>` : ''}</article>`).join('');
}

function renderCard(order, items) {
  const orderType = order.data?.order_type || order.data?.orderType || '—';
  host().innerHTML = `<div class="v4-order-modal"><div class="v4-order-modal-card"><div class="v4-order-modal-head"><div><p class="v4-kicker">Карточка заказа</p><h2>№${esc(order.order_number || shortId(order.id))} — ${esc(order.project_name || 'Заказ')}</h2><p>${esc(order.client_name || 'Клиент не указан')} · ${esc(order.client_phone || 'телефон не указан')} · создано ${dateRu(order.created_at)}</p></div><button type="button" data-order-card-close>Закрыть</button></div><div class="v4-order-modal-grid"><div><span>Статус</span><b>${esc(order.status || 'Новый')}</b></div><div><span>Оплата</span><b>${esc(order.payment_status || 'Не оплачено')}</b></div><div><span>Срок</span><b>${dateRu(order.deadline)}</b></div><div><span>Макет</span><b>${esc(order.layout_status || '—')}</b></div><div><span>Производство</span><b>${esc(order.production_status || '—')}</b></div><div><span>Тип</span><b>${esc(orderType)}</b></div><div><span>Клиенту</span><b>${money(order.client_total)}</b></div><div><span>Себестоимость</span><b>${money(order.contractor_cost)}</b></div><div><span>Прибыль</span><b>${money(order.profit)}</b></div><div><span>Баланс</span><b>${money(order.balance)}</b></div></div><div class="v4-order-modal-actions">${order.lead_id ? `<button type="button" class="v4-primary" data-order-card-open-lead="${esc(order.lead_id)}">Открыть заявку</button>` : ''}<button type="button" data-order-card-close>Закрыть</button></div><section class="v4-order-modal-section"><h3>Позиции заказа</h3><div class="v4-order-modal-items">${renderItems(items)}</div></section></div></div>`;
}

async function openOrderCard(orderId) {
  if (!orderId || busy) return;
  busy = true;
  ensureStyles();
  loading();
  try {
    const order = await fetchOrder(orderId);
    const items = await fetchItems(order.id);
    renderCard(order, items);
  } catch (error) {
    errorBox(friendlyError(error));
  } finally {
    busy = false;
  }
}

function boot() {
  if (booted) return;
  booted = true;
  ensureStyles();
  document.addEventListener('click', (event) => {
    const close = event.target.closest?.('[data-order-card-close]');
    if (close) { event.preventDefault(); closeCard(); return; }
    const open = event.target.closest?.('[data-open-order]');
    if (open) { event.preventDefault(); openOrderCard(open.dataset.openOrder); return; }
    const openLead = event.target.closest?.('[data-order-card-open-lead]');
    if (openLead) { event.preventDefault(); closeCard(); openLeadRoute(openLead.dataset.orderCardOpenLead); }
  }, true);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
