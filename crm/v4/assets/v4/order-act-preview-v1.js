import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { toast, setStatus } from './ui.js';
import { CRM_V4_ACTIONS, canPerformV4Action, requireV4Action } from './action-permissions-v1.js';

const HOST_ID = 'orderActPreviewV1';
const STYLE_ID = 'orderActPreviewV1Styles';
const ORDER_FIELDS = 'id,order_number,project_name,status,deadline,client_name,client_phone,client_total,payment_status,layout_status,production_status,installation_status,client_id,created_at,completed_at,issued_at,public_comment';
const ITEM_FIELDS = 'id,order_id,name,unit,quantity,client_sum,created_at';
const CLIENT_FIELDS = 'id,name,phone,address';
const DONE_STATUSES = ['готов', 'заверш', 'выполн', 'выдан', 'закрыт', 'подписан'];

let activeOrderId = '';
let busy = false;

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function num(value) {
  const number = Number(String(value ?? '').replace(',', '.').replace(/\s+/g, ''));
  return Number.isFinite(number) ? number : 0;
}

function money(value) {
  return `${Math.round(num(value)).toLocaleString('ru-RU')} ₽`;
}

function dateInput(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateRu(value) {
  if (!value) return '—';
  try { return new Date(value).toLocaleDateString('ru-RU'); } catch (_) { return String(value); }
}

function statusDone(value) {
  const status = String(value || '').trim().toLowerCase();
  return status ? DONE_STATUSES.some((marker) => status.includes(marker)) : false;
}

function host() {
  let element = document.getElementById(HOST_ID);
  if (!element) {
    element = document.createElement('div');
    element.id = HOST_ID;
    document.body.appendChild(element);
  }
  return element;
}

function closeEditor() {
  host().innerHTML = '';
  busy = false;
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .v4-act-modal{position:fixed;inset:0;z-index:780;background:rgba(15,23,42,.68);display:grid;place-items:center;padding:14px}
    .v4-act-card{width:min(1120px,100%);max-height:94vh;overflow:auto;background:#fff;border-radius:24px;border:1px solid #fed7aa;box-shadow:0 32px 100px rgba(15,23,42,.42);padding:18px}
    .v4-act-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;border-bottom:1px solid #e2e8f0;padding-bottom:12px}.v4-act-head h2{margin:0}.v4-act-head p{margin:6px 0 0;color:#64748b}
    .v4-act-warning{margin:12px 0;border:1px solid #fdba74;background:#fff7ed;color:#9a3412;border-radius:14px;padding:10px;font-weight:800}.v4-act-warning ul{margin:7px 0 0;padding-left:20px}
    .v4-act-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.v4-act-grid .wide{grid-column:1/-1}.v4-act-grid label,.v4-act-items label{display:grid;gap:5px;color:#334155;font-size:12px;font-weight:900}.v4-act-grid input,.v4-act-grid textarea,.v4-act-grid select,.v4-act-items input{width:100%;border:1px solid #cbd5e1;border-radius:12px;padding:10px;font:inherit;color:#0f172a;background:#fff}.v4-act-grid textarea{min-height:76px;resize:vertical}
    .v4-act-section{margin-top:14px;border:1px solid #e2e8f0;border-radius:18px;padding:13px}.v4-act-section h3{margin:0 0 10px}.v4-act-table-wrap{overflow:auto}.v4-act-items{width:100%;border-collapse:collapse;min-width:760px}.v4-act-items th,.v4-act-items td{border-bottom:1px solid #e2e8f0;padding:8px;text-align:left}.v4-act-items th{background:#f8fafc;font-size:11px;text-transform:uppercase}.v4-act-items .number{width:55px}.v4-act-items .unit{width:95px}.v4-act-items .amount{width:135px}.v4-act-items button{border:1px solid #fecaca;background:#fff1f2;color:#991b1b;border-radius:10px;padding:8px;font-weight:900;cursor:pointer}
    .v4-act-total{display:flex;justify-content:flex-end;align-items:center;gap:10px;margin-top:10px;font-size:16px}.v4-act-total b{font-size:22px;color:#c2410c}
    .v4-act-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.v4-act-actions button{border:1px solid #fdba74;background:#fff7ed;color:#9a3412;border-radius:12px;padding:10px 14px;font-weight:900;cursor:pointer}.v4-act-actions .primary{background:#ea580c;border-color:#ea580c;color:#fff}.v4-act-readonly-note{margin-top:10px;border:1px dashed #94a3b8;background:#f8fafc;color:#475569;border-radius:12px;padding:10px;font-size:12px;font-weight:800}
    @media(max-width:760px){.v4-act-card{padding:12px;border-radius:17px}.v4-act-head,.v4-act-grid{display:grid;grid-template-columns:1fr}.v4-act-grid .wide{grid-column:auto}.v4-act-actions button{width:100%}}
  `;
  document.head.appendChild(style);
}

async function fetchBundle(orderId) {
  const orderResponse = await timeout(
    supabaseClient.from('leader_orders').select(ORDER_FIELDS).eq('id', orderId).single(),
    12000,
    'Заказ не загрузился за 12 секунд'
  );
  if (orderResponse.error || !orderResponse.data) throw orderResponse.error || new Error('Заказ не найден');
  const order = orderResponse.data;

  const itemsResponse = await timeout(
    supabaseClient.from('leader_order_items').select(ITEM_FIELDS).eq('order_id', orderId).order('created_at', { ascending: true }).limit(160),
    12000,
    'Позиции заказа не загрузились за 12 секунд'
  );
  if (itemsResponse.error) throw itemsResponse.error;

  let client = null;
  if (order.client_id) {
    const clientResponse = await timeout(
      supabaseClient.from('leader_clients').select(CLIENT_FIELDS).eq('id', order.client_id).maybeSingle(),
      12000,
      'Карточка клиента не загрузилась за 12 секунд'
    );
    if (clientResponse.error) throw clientResponse.error;
    client = clientResponse.data || null;
  }

  return {
    order,
    client,
    items: (itemsResponse.data || []).filter((item) => num(item.client_sum) > 0)
  };
}

function draftNumber(order) {
  const year = new Date().getFullYear();
  const orderPart = String(order.order_number || order.id || '').slice(0, 12) || 'БЕЗ-НОМЕРА';
  return `АВР-${year}-ЧЕРНОВИК-${orderPart}`;
}

function warnings(bundle) {
  const { order, items, client } = bundle;
  const result = [];
  if (!items.length) result.push('В заказе нет позиций с клиентской стоимостью.');
  if (!order.client_name && !client?.name) result.push('Не указано имя или организация заказчика.');
  if (!statusDone(order.status)) result.push(`Статус заказа «${order.status || 'не указан'}» не выглядит завершённым.`);
  if (order.production_status && !statusDone(order.production_status)) result.push(`Производство: «${order.production_status}».`);
  if (order.installation_status && !statusDone(order.installation_status)) result.push(`Монтаж: «${order.installation_status}».`);
  const itemsTotal = items.reduce((sum, item) => sum + num(item.client_sum), 0);
  if (Math.abs(itemsTotal - num(order.client_total)) > 1) {
    result.push(`Сумма позиций ${money(itemsTotal)} не совпадает с итогом заказа ${money(order.client_total)}.`);
  }
  return result;
}

function customerDetails(bundle) {
  const parts = [bundle.client?.address, bundle.client?.phone || bundle.order.client_phone].filter(Boolean);
  return parts.join(', ');
}

function rowHtml(item = {}) {
  const quantity = num(item.quantity) || 1;
  const sum = num(item.client_sum);
  const price = quantity ? sum / quantity : sum;
  return `<tr data-act-item-row>
    <td><input data-act-item-name value="${esc(item.name || 'Работы по заказу')}"></td>
    <td class="number"><input data-act-item-qty inputmode="decimal" value="${esc(quantity)}"></td>
    <td class="unit"><input data-act-item-unit value="${esc(item.unit || 'шт')}"></td>
    <td class="amount"><input data-act-item-price inputmode="decimal" value="${esc(Math.round(price * 100) / 100)}"></td>
    <td class="amount"><input data-act-item-sum inputmode="decimal" value="${esc(Math.round(sum * 100) / 100)}"></td>
    <td><button type="button" data-act-remove-row aria-label="Удалить позицию">×</button></td>
  </tr>`;
}

function renderEditor(bundle) {
  ensureStyles();
  const { order, client, items } = bundle;
  const alerts = warnings(bundle);
  const customerName = client?.name || order.client_name || '';
  const defaultItems = items.length ? items : [{ name: order.project_name || 'Работы по заказу', quantity: 1, unit: 'усл.', client_sum: order.client_total }];

  host().innerHTML = `<div class="v4-act-modal" role="dialog" aria-modal="true" aria-label="Черновик акта выполненных работ">
    <div class="v4-act-card">
      <div class="v4-act-head">
        <div><p class="v4-kicker">Документы заказа</p><h2>Черновик акта выполненных работ</h2><p>Заказ №${esc(order.order_number || String(order.id).slice(0, 8))} · ${esc(order.project_name || 'Без названия')}</p></div>
        <button type="button" data-act-close>Закрыть</button>
      </div>
      ${alerts.length ? `<div class="v4-act-warning"><b>Проверьте перед печатью:</b><ul>${alerts.map((item) => `<li>${esc(item)}</li>`).join('')}</ul></div>` : '<div class="v4-act-warning" style="border-color:#bbf7d0;background:#f0fdf4;color:#166534">Основные данные заказа заполнены. Всё равно проверьте реквизиты и состав работ.</div>'}
      <form id="orderActDraftForm">
        <section class="v4-act-section">
          <h3>Документ и стороны</h3>
          <div class="v4-act-grid">
            <label>Номер акта<input id="actDraftNumber" value="${esc(draftNumber(order))}"></label>
            <label>Дата акта<input id="actDraftDate" type="date" value="${esc(dateInput())}"></label>
            <label class="wide">Основание<input id="actDraftBasis" value="${esc(`Заказ №${order.order_number || String(order.id).slice(0, 8)} от ${dateRu(order.created_at)}`)}"></label>
            <label>Исполнитель<input id="actDraftExecutor" value="Рекламное агентство «Лидер»"></label>
            <label>Подписант исполнителя<input id="actDraftSignatory" placeholder="ФИО"></label>
            <label class="wide">Реквизиты исполнителя<textarea id="actDraftExecutorDetails" placeholder="Организационно-правовая форма, ИНН, адрес, телефон. Реквизиты пока не настроены в CRM."></textarea></label>
            <label>Заказчик<input id="actDraftCustomer" value="${esc(customerName)}"></label>
            <label>Режим налогообложения<select id="actDraftTax"><option>Без НДС</option><option>НДС не облагается</option><option>НДС 5%</option><option>НДС 20%</option></select></label>
            <label class="wide">Реквизиты заказчика<textarea id="actDraftCustomerDetails" placeholder="Адрес, телефон или реквизиты организации">${esc(customerDetails(bundle))}</textarea></label>
            <label>Должность подписанта<input id="actDraftSignatoryRole" value="Представитель исполнителя"></label>
            <label>Дата выполнения<input id="actDraftCompletionDate" type="date" value="${esc(dateInput(order.completed_at || order.issued_at || new Date()))}"></label>
          </div>
        </section>
        <section class="v4-act-section">
          <h3>Выполненные работы</h3>
          <div class="v4-act-table-wrap"><table class="v4-act-items"><thead><tr><th>Наименование</th><th>Кол-во</th><th>Ед.</th><th>Цена</th><th>Сумма</th><th></th></tr></thead><tbody id="actDraftItems">${defaultItems.map(rowHtml).join('')}</tbody></table></div>
          <div class="v4-act-actions"><button type="button" data-act-add-row>Добавить позицию</button></div>
          <div class="v4-act-total"><span>Итого:</span><b id="actDraftTotal">0 ₽</b></div>
        </section>
        <section class="v4-act-section">
          <h3>Формулировки</h3>
          <div class="v4-act-grid">
            <label class="wide">О выполнении работ<textarea id="actDraftCompletionText">Работы выполнены в полном объёме и в согласованный срок.</textarea></label>
            <label class="wide">О претензиях<textarea id="actDraftClaimsText">Заказчик претензий к объёму, качеству и срокам выполнения работ не имеет.</textarea></label>
            <label class="wide">Примечание<textarea id="actDraftNote">${esc(order.public_comment || '')}</textarea></label>
          </div>
        </section>
        <div class="v4-act-readonly-note">Это несохранённый черновик. Номер не является окончательным и не проверяется на уникальность. Печать/PDF не меняет заказ, оплату, производство или монтаж.</div>
        <div class="v4-act-actions"><button type="submit" class="primary">Предпросмотр / печать PDF</button><button type="button" data-act-close>Отмена</button></div>
      </form>
    </div>
  </div>`;
  recalculateDraft();
}

function draftRows() {
  return [...document.querySelectorAll('[data-act-item-row]')].map((row) => {
    const quantity = num(row.querySelector('[data-act-item-qty]')?.value) || 0;
    const price = num(row.querySelector('[data-act-item-price]')?.value) || 0;
    const enteredSum = num(row.querySelector('[data-act-item-sum]')?.value);
    return {
      name: row.querySelector('[data-act-item-name]')?.value?.trim() || 'Работы по заказу',
      quantity,
      unit: row.querySelector('[data-act-item-unit]')?.value?.trim() || 'шт',
      price,
      sum: enteredSum || quantity * price
    };
  }).filter((item) => item.name && item.sum >= 0);
}

function recalculateDraft() {
  const total = draftRows().reduce((sum, item) => sum + item.sum, 0);
  const output = document.getElementById('actDraftTotal');
  if (output) output.textContent = money(total);
}

function value(id) {
  return document.getElementById(id)?.value?.trim() || '';
}

function printCss() {
  return `
    *{box-sizing:border-box}body{margin:0;background:#e5e7eb;color:#111827;font-family:Arial,Helvetica,sans-serif}.page{width:210mm;min-height:297mm;margin:0 auto;background:#fff;padding:15mm 16mm;position:relative}.brand{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #ea580c;padding-bottom:8mm}.brand h1{margin:0;font-size:25px;text-transform:uppercase}.brand b{color:#ea580c}.meta{text-align:right;font-size:12px}.meta strong{display:block;font-size:16px}.parties{display:grid;grid-template-columns:1fr 1fr;gap:8mm;margin:9mm 0}.party{border:1px solid #d1d5db;border-radius:10px;padding:10px}.party span{display:block;color:#6b7280;text-transform:uppercase;font-size:10px;font-weight:900}.party b{display:block;margin-top:5px}.party p{margin:5px 0 0;font-size:12px;white-space:pre-wrap}.basis{margin:0 0 7mm;font-size:12px}.items{width:100%;border-collapse:collapse;font-size:11px}.items th{background:#111827;color:#fff;padding:8px;text-align:left}.items td{border-bottom:1px solid #d1d5db;padding:8px;vertical-align:top}.items .num{text-align:right;white-space:nowrap}.items .total td{font-weight:900;background:#fff7ed}.items .total td:last-child{color:#c2410c;font-size:14px}.statement{margin-top:8mm;font-size:12px;line-height:1.55}.statement p{margin:0 0 5px}.tax{font-weight:900}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:18mm;margin-top:20mm}.signature{border-top:1px solid #111827;padding-top:5px;font-size:11px}.footer{position:absolute;left:16mm;right:16mm;bottom:8mm;border-top:1px solid #d1d5db;padding-top:4px;font-size:9px;color:#6b7280;display:flex;justify-content:space-between}.draft{color:#b91c1c;font-weight:900}.print-actions{position:fixed;right:16px;top:16px;display:flex;gap:8px;z-index:4}.print-actions button{border:0;border-radius:999px;background:#ea580c;color:#fff;padding:10px 14px;font-weight:900;cursor:pointer}.print-actions .secondary{background:#111827}@page{size:A4;margin:0}thead{display:table-header-group}tr{break-inside:avoid}@media print{body{background:#fff}.page{margin:0}.print-actions{display:none}}`;
}

function printHtml(data) {
  const rows = data.items.map((item, index) => `<tr><td class="num">${index + 1}</td><td>${esc(item.name)}</td><td class="num">${esc(item.quantity)} ${esc(item.unit)}</td><td class="num">${money(item.price)}</td><td class="num"><b>${money(item.sum)}</b></td></tr>`).join('');
  const total = data.items.reduce((sum, item) => sum + item.sum, 0);
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(`akt-vypolnennyh-rabot-${data.number}`)}</title><style>${printCss()}</style></head><body><div class="print-actions"><button onclick="window.print()">Печать / PDF</button><button class="secondary" onclick="window.close()">Закрыть</button></div><main class="page"><header class="brand"><div><h1>Акт выполненных работ</h1><p class="draft">Предварительный несохранённый черновик</p></div><div class="meta"><strong>№ ${esc(data.number)}</strong><div>от ${esc(dateRu(data.date))}</div><div>Работы выполнены: ${esc(dateRu(data.completionDate))}</div></div></header><section class="parties"><div class="party"><span>Исполнитель</span><b>${esc(data.executor)}</b><p>${esc(data.executorDetails || 'Реквизиты не указаны')}</p></div><div class="party"><span>Заказчик</span><b>${esc(data.customer)}</b><p>${esc(data.customerDetails || 'Реквизиты не указаны')}</p></div></section><p class="basis"><b>Основание:</b> ${esc(data.basis)}</p><table class="items"><thead><tr><th>№</th><th>Наименование работ</th><th>Количество</th><th>Цена</th><th>Сумма</th></tr></thead><tbody>${rows}<tr class="total"><td colspan="4">Итого</td><td class="num">${money(total)}</td></tr></tbody></table><section class="statement"><p><b>Всего выполнено работ на сумму:</b> ${money(total)}.</p><p class="tax">${esc(data.tax)}</p><p>${esc(data.completionText)}</p><p>${esc(data.claimsText)}</p>${data.note ? `<p><b>Примечание:</b> ${esc(data.note)}</p>` : ''}</section><section class="signatures"><div class="signature">${esc(data.signatoryRole)} / ${esc(data.signatory || '________________')}</div><div class="signature">Заказчик / ________________________</div></section><footer class="footer"><span>РА «Лидер» · документ сформирован в CRM</span><span>Черновик не сохранён</span></footer></main></body></html>`;
}

function openPrintPreview() {
  if (!requireV4Action(CRM_V4_ACTIONS.DOCUMENTS_GENERATE)) {
    toast('Недостаточно прав для генерации документа');
    return;
  }
  const items = draftRows();
  if (!items.length) {
    toast('Добавьте хотя бы одну позицию');
    return;
  }
  const data = {
    number: value('actDraftNumber') || 'БЕЗ НОМЕРА',
    date: value('actDraftDate'),
    basis: value('actDraftBasis'),
    executor: value('actDraftExecutor'),
    executorDetails: value('actDraftExecutorDetails'),
    customer: value('actDraftCustomer'),
    customerDetails: value('actDraftCustomerDetails'),
    tax: value('actDraftTax'),
    signatory: value('actDraftSignatory'),
    signatoryRole: value('actDraftSignatoryRole'),
    completionDate: value('actDraftCompletionDate'),
    completionText: value('actDraftCompletionText'),
    claimsText: value('actDraftClaimsText'),
    note: value('actDraftNote'),
    items
  };
  const popup = window.open('', '_blank', 'noopener,noreferrer');
  if (!popup) {
    toast('Браузер заблокировал окно предпросмотра');
    return;
  }
  popup.document.open();
  popup.document.write(printHtml(data));
  popup.document.close();
  setStatus('Черновик акта открыт для печати или сохранения в PDF', 'good');
}

async function openEditor(orderId) {
  if (!orderId || busy) return;
  if (!requireV4Action(CRM_V4_ACTIONS.DOCUMENTS_GENERATE)) {
    toast('Недостаточно прав для генерации акта');
    return;
  }
  busy = true;
  ensureStyles();
  host().innerHTML = '<div class="v4-act-modal"><div class="v4-act-card"><div class="v4-act-head"><div><h2>Черновик акта</h2><p>Загружаю данные заказа...</p></div><button type="button" data-act-close>Закрыть</button></div></div></div>';
  try {
    const bundle = await fetchBundle(orderId);
    renderEditor(bundle);
  } catch (error) {
    const message = friendlyError(error);
    host().innerHTML = `<div class="v4-act-modal"><div class="v4-act-card"><div class="v4-act-head"><div><h2>Черновик акта</h2><p>Не удалось загрузить данные</p></div><button type="button" data-act-close>Закрыть</button></div><div class="v4-act-warning">${esc(message)}</div></div></div>`;
  } finally {
    busy = false;
  }
}

function injectOrderCardButton() {
  const actions = document.querySelector('#orderCardV1 .v4-order-modal-actions');
  if (!actions) return;
  const existing = actions.querySelector('[data-order-act-preview]');
  if (!canPerformV4Action(CRM_V4_ACTIONS.DOCUMENTS_GENERATE) || !activeOrderId) {
    existing?.remove();
    return;
  }
  if (existing) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'v4-primary';
  button.dataset.orderActPreview = activeOrderId;
  button.textContent = 'Создать акт';
  actions.appendChild(button);
}

function bind() {
  ensureStyles();
  document.addEventListener('click', (event) => {
    const orderOpen = event.target.closest?.('[data-open-order]');
    if (orderOpen?.dataset.openOrder) {
      activeOrderId = orderOpen.dataset.openOrder;
      setTimeout(injectOrderCardButton, 0);
    }

    const actButton = event.target.closest?.('[data-order-act-preview]');
    if (actButton) {
      event.preventDefault();
      openEditor(actButton.dataset.orderActPreview || activeOrderId);
      return;
    }

    if (event.target.closest?.('[data-act-close]')) {
      event.preventDefault();
      closeEditor();
      return;
    }

    if (event.target.closest?.('[data-act-add-row]')) {
      event.preventDefault();
      document.getElementById('actDraftItems')?.insertAdjacentHTML('beforeend', rowHtml({ quantity: 1, unit: 'шт', client_sum: 0 }));
      recalculateDraft();
      return;
    }

    const remove = event.target.closest?.('[data-act-remove-row]');
    if (remove) {
      event.preventDefault();
      remove.closest('[data-act-item-row]')?.remove();
      recalculateDraft();
    }
  }, true);

  document.addEventListener('input', (event) => {
    if (event.target.closest?.('#orderActDraftForm')) recalculateDraft();
  });

  document.addEventListener('submit', (event) => {
    if (event.target?.id !== 'orderActDraftForm') return;
    event.preventDefault();
    openPrintPreview();
  });

  const observer = new MutationObserver(injectOrderCardButton);
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('leader-v4:crm-ready', injectOrderCardButton);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
else bind();
