import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { toast, setStatus } from './ui.js';
import { CRM_V4_ACTIONS, canPerformV4Action, requireV4Action } from './action-permissions-v1.js';
import { v4State, subscribeState } from './state.js';
import { documentActorContext, canPrepareDocument, clearActorDocumentDrafts, mountDocumentDraft, registerDocumentPreview, updateDocumentLine, validateDocumentLines, validateDocumentText } from './document-draft-session-v1.js';
import './order-act-company-settings-v1.js';
import './order-contract-preview-v1.js';

const HOST_ID = 'orderActPreviewV1';
const STYLE_ID = 'orderActPreviewV1Styles';
const ORDER_FIELDS = 'id,order_number,project_name,status,deadline,client_name,client_phone,client_total,payment_status,layout_status,production_status,installation_status,client_id,created_at,completed_at,issued_at,public_comment,updated_at';
const ITEM_FIELDS = 'id,order_id,name,unit,quantity,client_sum,created_at';
const CLIENT_FIELDS = 'id,name,phone,address';
const DONE_MARKERS = ['готов', 'заверш', 'выполн', 'выдан', 'закрыт', 'подписан'];

let activeOrderId = '';
let busy = false;
let sequence = 0, draftSession = null, opener = null, actorContext = documentActorContext(), actorId = v4State.user?.id;

const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const num = (value) => {
  const parsed = Number(String(value ?? '').replace(',', '.').replace(/\s+/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = (value) => `${Math.round(num(value) * 100) / 100}`.replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽';
const done = (value) => {
  const status = String(value || '').trim().toLowerCase();
  return status ? DONE_MARKERS.some((marker) => status.includes(marker)) : false;
};

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

function host() {
  let element = document.getElementById(HOST_ID);
  if (!element) {
    element = document.createElement('div');
    element.id = HOST_ID;
    document.body.appendChild(element);
  }
  return element;
}

function closeEditor(purge = false) {
  if (draftSession && !draftSession.close({purge})) return;
  draftSession = null;
  sequence++;
  host().innerHTML = '';
  busy = false;
  if (!purge && opener?.isConnected) opener.focus();
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `.v4-act-modal{position:fixed;inset:0;z-index:780;background:rgba(15,23,42,.68);display:grid;place-items:center;padding:14px}.v4-act-card{width:min(1120px,100%);max-height:94vh;overflow:auto;background:#fff;border-radius:24px;border:1px solid #fed7aa;box-shadow:0 32px 100px rgba(15,23,42,.42);padding:18px}.v4-act-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;border-bottom:1px solid #e2e8f0;padding-bottom:12px}.v4-act-head h2{margin:0}.v4-act-head p{margin:6px 0 0;color:#64748b}.v4-act-warning{margin:12px 0;border:1px solid #fdba74;background:#fff7ed;color:#9a3412;border-radius:14px;padding:10px;font-weight:800}.v4-act-warning ul{margin:7px 0 0;padding-left:20px}.v4-act-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.v4-act-grid .wide{grid-column:1/-1}.v4-act-grid label{display:grid;gap:5px;color:#334155;font-size:12px;font-weight:900}.v4-act-grid input,.v4-act-grid textarea,.v4-act-grid select,.v4-act-items input{width:100%;border:1px solid #cbd5e1;border-radius:12px;padding:10px;font:inherit;color:#0f172a;background:#fff}.v4-act-grid textarea{min-height:76px;resize:vertical}.v4-act-section{margin-top:14px;border:1px solid #e2e8f0;border-radius:18px;padding:13px}.v4-act-section h3{margin:0 0 10px}.v4-act-table-wrap{overflow:auto}.v4-act-items{width:100%;border-collapse:collapse;min-width:760px}.v4-act-items th,.v4-act-items td{border-bottom:1px solid #e2e8f0;padding:8px;text-align:left}.v4-act-items th{background:#f8fafc;font-size:11px;text-transform:uppercase}.v4-act-items .number{width:75px}.v4-act-items .unit{width:90px}.v4-act-items .amount{width:135px}.v4-act-items button{border:1px solid #fecaca;background:#fff1f2;color:#991b1b;border-radius:10px;padding:8px;font-weight:900;cursor:pointer}.v4-act-total{display:flex;justify-content:flex-end;align-items:center;gap:10px;margin-top:10px;font-size:16px}.v4-act-total b{font-size:22px;color:#c2410c}.v4-act-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.v4-act-actions button,.v4-act-head button{border:1px solid #fdba74;background:#fff7ed;color:#9a3412;border-radius:12px;padding:10px 14px;font-weight:900;cursor:pointer}.v4-act-actions .primary{background:#ea580c;border-color:#ea580c;color:#fff}.v4-act-readonly-note{margin-top:10px;border:1px dashed #94a3b8;background:#f8fafc;color:#475569;border-radius:12px;padding:10px;font-size:12px;font-weight:800}@media(max-width:760px){.v4-act-card{padding:12px;border-radius:17px}.v4-act-head,.v4-act-grid{display:grid;grid-template-columns:1fr}.v4-act-grid .wide{grid-column:auto}.v4-act-actions button{width:100%}}`;
  style.textContent += '.v4-act-card{box-sizing:border-box;min-width:0}.v4-act-grid input,.v4-act-grid textarea,.v4-act-grid select,.v4-act-items input{box-sizing:border-box;min-width:0}.document-draft-controls{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:12px 0}.document-draft-notice{flex:1;min-width:200px;color:#475569;font-size:13px;line-height:1.5}.document-draft-controls button{min-height:44px;border:1px solid #cbd5e1;background:#fff;border-radius:10px;padding:10px;color:#172033}@media(max-width:760px){.v4-act-items{min-width:0}.v4-act-items thead{display:none}.v4-act-items tr{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);border:1px solid #cbd5e1;border-radius:12px;margin-bottom:12px;padding:8px}.v4-act-items td{display:block;width:auto!important;border:0;min-width:0;padding:5px}.v4-act-items td:first-child{grid-column:1/-1}.v4-act-items td::before{content:attr(data-label);display:block;font-size:12px;color:#475569;margin-bottom:4px}.v4-act-items td:last-child{grid-column:1/-1}.v4-act-items td:last-child button{min-height:44px;width:100%}.v4-act-items input{min-height:44px}}';
  style.textContent += '.v4-act-actions .primary,.v4-contract-actions .primary{background:#ff7900;border-color:#ff7900;color:#172033}';
  document.head.appendChild(style);
}

async function fetchBundle(orderId, current) {
  const orderResponse = await timeout(
    supabaseClient.from('leader_orders').select(ORDER_FIELDS).eq('id', orderId).single(),
    12000,
    'Заказ не загрузился за 12 секунд'
  );
  if (!current()) throw new Error('document_context_changed');
  if (orderResponse.error || !orderResponse.data) throw orderResponse.error || new Error('Заказ не найден');

  const order = orderResponse.data;
  const itemsResponse = await timeout(
    supabaseClient.from('leader_order_items').select(ITEM_FIELDS).eq('order_id', orderId).order('created_at', { ascending: true }).limit(161),
    12000,
    'Позиции заказа не загрузились за 12 секунд'
  );
  if (!current()) throw new Error('document_context_changed');
  if (itemsResponse.error) throw itemsResponse.error;
  if (itemsResponse.data?.length > 160) throw new Error('В заказе больше 160 позиций. Печатная форма не будет обрезана: подготовьте отдельные документы.');

  let client = null;
  if (order.client_id) {
    const clientResponse = await timeout(
      supabaseClient.from('leader_clients').select(CLIENT_FIELDS).eq('id', order.client_id).maybeSingle(),
      12000,
      'Карточка клиента не загрузилась за 12 секунд'
    );
    if (!current()) throw new Error('document_context_changed');
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
  const orderPart = String(order.order_number || order.id || '').slice(0, 12) || 'БЕЗ-НОМЕРА';
  return `АВР-${new Date().getFullYear()}-ЧЕРНОВИК-${orderPart}`;
}

function warningList({ order, client, items }) {
  const result = [];
  if (!items.length) result.push('В заказе нет позиций с клиентской стоимостью.');
  if (!order.client_name && !client?.name) result.push('Не указано имя или организация заказчика.');
  if (!done(order.status)) result.push(`Статус заказа «${order.status || 'не указан'}» не выглядит завершённым.`);
  if (order.production_status && !done(order.production_status)) result.push(`Производство: «${order.production_status}».`);
  if (order.installation_status && !done(order.installation_status)) result.push(`Монтаж: «${order.installation_status}».`);
  const itemTotal = items.reduce((sum, item) => sum + num(item.client_sum), 0);
  if (Math.abs(itemTotal - num(order.client_total)) > 1) result.push(`Сумма позиций ${money(itemTotal)} не совпадает с итогом заказа ${money(order.client_total)}.`);
  return result;
}

function itemRow(item = {}) {
  const quantity = num(item.quantity) || 1;
  const sum = num(item.client_sum);
  const price = quantity ? sum / quantity : sum;
  return `<tr data-act-item-row><td data-label="Наименование"><input aria-label="Наименование позиции" maxlength="700" data-act-item-name value="${esc(item.name || 'Работы по заказу')}"></td><td data-label="Количество" class="number"><input aria-label="Количество" data-act-item-qty inputmode="decimal" value="${esc(quantity)}"></td><td data-label="Единица" class="unit"><input aria-label="Единица измерения" maxlength="50" data-act-item-unit value="${esc(item.unit || 'шт')}"></td><td data-label="Цена" class="amount"><input aria-label="Цена за единицу" data-act-item-price inputmode="decimal" value="${esc(Math.round(price * 100) / 100)}"></td><td data-label="Сумма" class="amount"><input aria-label="Сумма позиции" data-act-item-sum inputmode="decimal" value="${esc(Math.round(sum * 100) / 100)}"></td><td><button type="button" data-act-remove-row aria-label="Удалить позицию">×</button></td></tr>`;
}

function customerDetails(bundle) {
  return [bundle.client?.address, bundle.client?.phone || bundle.order.client_phone].filter(Boolean).join(', ');
}

function renderEditor(bundle) {
  ensureStyles();
  const { order, client, items } = bundle;
  const warnings = warningList(bundle);
  const rows = items.length ? items : [{ name: order.project_name || 'Работы по заказу', quantity: 1, unit: 'усл.', client_sum: order.client_total }];
  const customer = client?.name || order.client_name || '';

  host().innerHTML = `<div class="v4-act-modal" role="dialog" aria-modal="true" aria-label="Черновик акта выполненных работ"><div class="v4-act-card"><div class="v4-act-head"><div><p class="v4-kicker">Документы заказа</p><h2>Черновик акта выполненных работ</h2><p>Заказ №${esc(order.order_number || String(order.id).slice(0, 8))} · ${esc(order.project_name || 'Без названия')}</p></div><button type="button" data-act-close>Закрыть</button></div>${warnings.length ? `<div class="v4-act-warning"><b>Проверьте перед печатью:</b><ul>${warnings.map((item) => `<li>${esc(item)}</li>`).join('')}</ul></div>` : '<div class="v4-act-warning" style="border-color:#bbf7d0;background:#f0fdf4;color:#166534">Основные данные заполнены. Проверьте реквизиты и состав работ.</div>'}<form id="orderActDraftForm"><section class="v4-act-section"><h3>Документ и стороны</h3><div class="v4-act-grid"><label>Номер акта<input id="actDraftNumber" required maxlength="500" value="${esc(draftNumber(order))}"></label><label>Дата акта<input id="actDraftDate" required maxlength="500" type="date" value="${esc(dateInput())}"></label><label class="wide">Основание<input id="actDraftBasis" value="${esc(`Заказ №${order.order_number || String(order.id).slice(0, 8)} от ${dateRu(order.created_at)}`)}"></label><label>Исполнитель<input id="actDraftExecutor" required maxlength="500" value="Рекламное агентство «Лидер»"></label><label>Подписант исполнителя<input id="actDraftSignatory" placeholder="ФИО"></label><label class="wide">Реквизиты исполнителя<textarea id="actDraftExecutorDetails" placeholder="Организационно-правовая форма, ИНН, адрес, телефон. Реквизиты пока не настроены в CRM." maxlength="16000"></textarea></label><label>Заказчик<input id="actDraftCustomer" required maxlength="500" value="${esc(customer)}"></label><label>Режим налогообложения<input id="actDraftTax" required maxlength="80" placeholder="Укажите формулировку по вашим реквизитам"></label><label class="wide">Реквизиты заказчика<textarea id="actDraftCustomerDetails" placeholder="Адрес, телефон или реквизиты организации" maxlength="16000">${esc(customerDetails(bundle))}</textarea></label><label>Должность подписанта<input id="actDraftSignatoryRole" value="Представитель исполнителя"></label><label>Дата выполнения<input id="actDraftCompletionDate" type="date" value="${esc(dateInput(order.completed_at || order.issued_at || new Date()))}"></label></div></section><section class="v4-act-section"><h3>Выполненные работы</h3><div class="v4-act-table-wrap"><table class="v4-act-items"><thead><tr><th>Наименование</th><th>Кол-во</th><th>Ед.</th><th>Цена</th><th>Сумма</th><th></th></tr></thead><tbody id="actDraftItems">${rows.map(itemRow).join('')}</tbody></table></div><div class="v4-act-actions"><button type="button" data-act-add-row>Добавить позицию</button></div><div class="v4-act-total"><span>Итого:</span><b id="actDraftTotal">0 ₽</b></div></section><section class="v4-act-section"><h3>Формулировки</h3><div class="v4-act-grid"><label class="wide">О выполнении работ<textarea id="actDraftCompletionText" maxlength="16000">Работы выполнены в полном объёме и в согласованный срок.</textarea></label><label class="wide">О претензиях<textarea id="actDraftClaimsText" maxlength="16000">Заказчик претензий к объёму, качеству и срокам выполнения работ не имеет.</textarea></label><label class="wide">Примечание<textarea id="actDraftNote" maxlength="16000">${esc(order.public_comment || '')}</textarea></label></div></section><div class="v4-act-readonly-note">Это несохранённый черновик. Номер не является окончательным и не проверяется на уникальность. Печать/PDF не меняет заказ, оплату, производство или монтаж.</div><div class="v4-act-actions"><button type="submit" class="primary">Предпросмотр / печать PDF</button><button type="button" data-act-close>Отмена</button></div></form></div></div>`;
  recalculateDraft();
  const form = document.getElementById('orderActDraftForm');
  draftSession = mountDocumentDraft({form,kind:'act',order,itemRow,onRestore:recalculateDraft,onReset:()=>openEditor(order.id),onClose:()=>closeEditor()});
}

function draftRows() {
  return [...document.querySelectorAll('[data-act-item-row]')].map((row) => {
    const quantity = num(row.querySelector('[data-act-item-qty]')?.value);
    const price = num(row.querySelector('[data-act-item-price]')?.value);
    const rawSum = String(row.querySelector('[data-act-item-sum]')?.value ?? '').trim();
    return {
      name: row.querySelector('[data-act-item-name]')?.value?.trim() || 'Работы по заказу',
      quantity,
      unit: row.querySelector('[data-act-item-unit]')?.value?.trim() || 'шт',
      price,
      sum: rawSum === '' ? quantity * price : num(rawSum)
    };
  }).filter((item) => item.name);
}

function recalculateDraft() {
  const total = draftRows().reduce((sum, item) => sum + item.sum, 0);
  const output = document.getElementById('actDraftTotal');
  const form = document.getElementById('orderActDraftForm');
  if (output) output.textContent = form && !validateDocumentLines(form,'act',false) ? 'Проверьте позиции' : money(total);
}

const value = (id) => document.getElementById(id)?.value?.trim() || '';

function printCss() {
  return `*{box-sizing:border-box}.page,.page td,.party{overflow-wrap:anywhere}body{margin:0;background:#e5e7eb;color:#111827;font-family:Arial,Helvetica,sans-serif}.page{width:210mm;min-height:297mm;margin:0 auto;background:#fff;padding:15mm 16mm;position:relative}.brand{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #ea580c;padding-bottom:8mm}.brand h1{margin:0;font-size:25px;text-transform:uppercase}.meta{text-align:right;font-size:12px}.meta strong{display:block;font-size:16px}.parties{display:grid;grid-template-columns:1fr 1fr;gap:8mm;margin:9mm 0}.party{border:1px solid #d1d5db;border-radius:10px;padding:10px}.party span{display:block;color:#6b7280;text-transform:uppercase;font-size:10px;font-weight:900}.party b{display:block;margin-top:5px}.party p{margin:5px 0 0;font-size:12px;white-space:pre-wrap}.basis{margin:0 0 7mm;font-size:12px}.items{width:100%;border-collapse:collapse;font-size:11px}.items th{background:#111827;color:#fff;padding:8px;text-align:left}.items td{border-bottom:1px solid #d1d5db;padding:8px;vertical-align:top}.items .num{text-align:right;white-space:nowrap}.items .total td{font-weight:900;background:#fff7ed}.items .total td:last-child{color:#c2410c;font-size:14px}.statement{margin-top:8mm;font-size:12px;line-height:1.55}.statement p{margin:0 0 5px}.tax{font-weight:900}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:18mm;margin-top:20mm}.signature{border-top:1px solid #111827;padding-top:5px;font-size:11px}.footer{position:static;margin-top:12mm;border-top:1px solid #d1d5db;padding-top:4px;font-size:9px;color:#6b7280;display:flex;justify-content:space-between}.draft{color:#b91c1c;font-weight:900}.print-actions{position:fixed;right:16px;top:16px;display:flex;gap:8px;z-index:4}.print-actions button{border:0;border-radius:999px;background:#ea580c;color:#fff;padding:10px 14px;font-weight:900;cursor:pointer}.print-actions .secondary{background:#111827}@page{size:A4;margin:16mm 18mm}thead{display:table-header-group}tr{break-inside:avoid}@media print{body{background:#fff}.page{width:auto;min-height:0;margin:0;padding:0}.print-actions{display:none}}`;
}

function printHtml(data) {
  const rows = data.items.map((item, index) => `<tr><td class="num">${index + 1}</td><td>${esc(item.name)}</td><td class="num">${esc(item.quantity)} ${esc(item.unit)}</td><td class="num">${Number(item.price).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:6})} ₽</td><td class="num"><b>${money(item.sum)}</b></td></tr>`).join('');
  const total = data.items.reduce((sum, item) => sum + item.sum, 0);
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(`akt-vypolnennyh-rabot-${data.number}`)}</title><style>${printCss()}</style></head><body><div class="print-actions"><button onclick="window.print()">Печать / PDF</button><button class="secondary" onclick="window.close()">Закрыть</button></div><main class="page"><header class="brand"><div><h1>Акт выполненных работ</h1><p class="draft">Предварительный несохранённый черновик</p></div><div class="meta"><strong>№ ${esc(data.number)}</strong><div>от ${esc(dateRu(data.date))}</div><div>Работы выполнены: ${esc(dateRu(data.completionDate))}</div></div></header><section class="parties"><div class="party"><span>Исполнитель</span><b>${esc(data.executor)}</b><p>${esc(data.executorDetails || 'Реквизиты не указаны')}</p></div><div class="party"><span>Заказчик</span><b>${esc(data.customer)}</b><p>${esc(data.customerDetails || 'Реквизиты не указаны')}</p></div></section><p class="basis"><b>Основание:</b> ${esc(data.basis)}</p><table class="items"><thead><tr><th>№</th><th>Наименование работ</th><th>Количество</th><th>Цена</th><th>Сумма</th></tr></thead><tbody>${rows}<tr class="total"><td colspan="4">Итого</td><td class="num">${money(total)}</td></tr></tbody></table><section class="statement"><p><b>Всего выполнено работ на сумму:</b> ${money(total)}.</p><p class="tax">${esc(data.tax)}</p><p>${esc(data.completionText)}</p><p>${esc(data.claimsText)}</p>${data.note ? `<p><b>Примечание:</b> ${esc(data.note)}</p>` : ''}</section><section class="signatures"><div class="signature">${esc(data.signatoryRole)} / ${esc(data.signatory || '________________')}</div><div class="signature">Заказчик / ________________________</div></section><footer class="footer"><span>РА «Лидер» · документ сформирован в CRM</span><span>Черновик не сохранён</span></footer></main></body></html>`;
}

function openPrintPreview() {
  const form = document.getElementById('orderActDraftForm');
  if (!canPrepareDocument() || !form || !validateDocumentLines(form,'act') || !validateDocumentText(form) || !form.reportValidity()) return;
  if (!requireV4Action(CRM_V4_ACTIONS.DOCUMENTS_GENERATE)) {
    toast('Недостаточно прав для генерации документа');
    return;
  }
  const items = draftRows();
  if (!items.length) {
    toast('Добавьте хотя бы одну позицию');
    return;
  }

  const popup = window.open('', '_blank');
  if (!popup) {
    toast('Браузер заблокировал окно предпросмотра');
    return;
  }
  draftSession?.save();registerDocumentPreview(popup);
  try { popup.opener = null; } catch (_) {}

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
  popup.document.open();
  popup.document.write(printHtml(data));
  popup.document.close();
  setStatus('Черновик акта открыт для печати или сохранения в PDF', 'good');
}

async function openEditor(orderId) {
  if (!orderId || busy) return;
  if (!canPrepareDocument()) return;
  if (!requireV4Action(CRM_V4_ACTIONS.DOCUMENTS_GENERATE)) {
    toast('Недостаточно прав для генерации акта');
    return;
  }
  if(draftSession&&!draftSession.close())return;
  draftSession=null;busy = true;
  const ticket=++sequence, context=documentActorContext();opener=document.activeElement;
  const current=()=>ticket===sequence && context===documentActorContext() && canPrepareDocument();
  ensureStyles();
  host().innerHTML = '<div class="v4-act-modal"><div class="v4-act-card"><div class="v4-act-head"><div><h2>Черновик акта</h2><p>Загружаю данные заказа...</p></div><button type="button" data-act-close>Закрыть</button></div></div></div>';
  try {
    const bundle=await fetchBundle(orderId,current);
    if (current()) renderEditor(bundle);
  } catch (error) {
    if (!current()) return;
    host().innerHTML = `<div class="v4-act-modal"><div class="v4-act-card"><div class="v4-act-head"><div><h2>Черновик акта</h2><p>Не удалось загрузить данные</p></div><button type="button" data-act-close>Закрыть</button></div><div class="v4-act-warning">${esc(friendlyError(error))}</div></div></div>`;
  } finally {
    if (ticket===sequence) busy = false;
  }
}

function injectOrderCardButton() {
  const actions = document.querySelector('#orderCardV1 .v4-order-modal-actions');
  if (!actions) return;
  const existing = actions.querySelector('[data-order-act-preview]');
  if (!activeOrderId || !canPrepareDocument()) {
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
      activeOrderId = '';
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
      document.getElementById('actDraftItems')?.insertAdjacentHTML('beforeend', itemRow({ quantity: 1, unit: 'шт', client_sum: 0 }));
      recalculateDraft();
      draftSession?.save();
      return;
    }
    const remove = event.target.closest?.('[data-act-remove-row]');
    if (remove) {
      event.preventDefault();
      remove.closest('[data-act-item-row]')?.remove();
      recalculateDraft();
      draftSession?.save();
    }
  }, true);

  document.addEventListener('input', (event) => {
    if (event.target.closest?.('#orderActDraftForm')) {updateDocumentLine(event.target,'act');recalculateDraft();}
  });
  document.addEventListener('submit', (event) => {
    if (event.target?.id !== 'orderActDraftForm') return;
    event.preventDefault();
    openPrintPreview();
  });

  new MutationObserver(injectOrderCardButton).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('leader-v4:order-card-rendered',event=>{activeOrderId=event.detail?.orderId||'';injectOrderCardButton();});
  document.addEventListener('leader-v4:crm-ready', injectOrderCardButton);
  document.addEventListener('leader-v4:document-draft-changed',()=>draftSession?.save());
  subscribeState(()=>{const next=documentActorContext();if(next!==actorContext){clearActorDocumentDrafts(actorId);closeEditor(true);activeOrderId='';actorContext=next;actorId=v4State.user?.id;injectOrderCardButton();}});
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
else bind();
