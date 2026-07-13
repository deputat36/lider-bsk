import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { toast, setStatus } from './ui.js';
import { CRM_V4_ACTIONS, canPerformV4Action, requireV4Action } from './action-permissions-v1.js';
import {
  companyLegalDetailsText,
  companyLegalName,
  loadCompanyLegalSettings
} from './company-legal-settings-v1.js';
import {
  ORDER_CONTRACT_PAYMENT_MODES,
  ORDER_CONTRACT_TEMPLATES,
  normalizeOrderContractDraft,
  orderContractDraftNumber,
  orderContractSections,
  orderContractTotal,
  orderContractWarnings,
  suggestedOrderContractTemplate
} from './order-contract-model-v1.js';

const HOST_ID = 'orderContractPreviewV1';
const STYLE_ID = 'orderContractPreviewV1Styles';
const ORDER_FIELDS = 'id,order_number,project_name,status,deadline,client_name,client_phone,client_total,client_id,created_at,public_comment';
const ITEM_FIELDS = 'id,order_id,name,unit,quantity,client_sum,created_at';
const CLIENT_FIELDS = 'id,name,phone,address';

let activeOrderId = '';
let busy = false;

const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]));
const num = (value) => {
  const parsed = Number(String(value ?? '').replace(',', '.').replace(/\s+/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = (value) => `${Math.round(num(value) * 100) / 100}`.replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽';

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

function closeEditor() {
  host().innerHTML = '';
  busy = false;
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `.v4-contract-modal{position:fixed;inset:0;z-index:785;background:rgba(15,23,42,.72);display:grid;place-items:center;padding:14px}.v4-contract-card{width:min(1180px,100%);max-height:95vh;overflow:auto;background:#fff;border:1px solid #bfdbfe;border-radius:24px;padding:18px;box-shadow:0 32px 100px rgba(15,23,42,.46)}.v4-contract-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;border-bottom:1px solid #e2e8f0;padding-bottom:12px}.v4-contract-head h2{margin:0}.v4-contract-head p{margin:6px 0 0;color:#64748b}.v4-contract-head button,.v4-contract-actions button{border:1px solid #93c5fd;background:#eff6ff;color:#1d4ed8;border-radius:12px;padding:10px 14px;font-weight:900;cursor:pointer}.v4-contract-warning{margin:12px 0;border:1px solid #fde68a;background:#fffbeb;color:#92400e;border-radius:14px;padding:11px}.v4-contract-warning ul{margin:7px 0 0;padding-left:20px}.v4-contract-section{margin-top:14px;border:1px solid #e2e8f0;border-radius:18px;padding:13px}.v4-contract-section h3{margin:0 0 10px}.v4-contract-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.v4-contract-grid .wide{grid-column:1/-1}.v4-contract-grid .span-2{grid-column:span 2}.v4-contract-grid label{display:grid;gap:5px;color:#334155;font-size:12px;font-weight:900}.v4-contract-grid input,.v4-contract-grid textarea,.v4-contract-grid select,.v4-contract-items input{width:100%;border:1px solid #cbd5e1;border-radius:11px;padding:9px;font:inherit;color:#0f172a;background:#fff}.v4-contract-grid textarea{min-height:78px;resize:vertical}.v4-contract-template-row{display:flex;gap:8px;align-items:end}.v4-contract-template-row label{flex:1}.v4-contract-table-wrap{overflow:auto}.v4-contract-items{width:100%;border-collapse:collapse;min-width:760px}.v4-contract-items th,.v4-contract-items td{border-bottom:1px solid #e2e8f0;padding:8px;text-align:left}.v4-contract-items th{background:#f8fafc;font-size:11px;text-transform:uppercase}.v4-contract-items .number{width:75px}.v4-contract-items .unit{width:90px}.v4-contract-items .amount{width:135px}.v4-contract-items button{border:1px solid #fecaca;background:#fff1f2;color:#991b1b;border-radius:10px;padding:8px;font-weight:900;cursor:pointer}.v4-contract-total{display:flex;justify-content:flex-end;align-items:center;gap:10px;margin-top:10px;font-size:16px}.v4-contract-total b{font-size:22px;color:#1d4ed8}.v4-contract-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.v4-contract-actions .primary{background:#2563eb;border-color:#2563eb;color:#fff}.v4-contract-readonly{margin-top:12px;border:1px dashed #94a3b8;background:#f8fafc;color:#475569;border-radius:12px;padding:10px;font-size:12px;font-weight:800}@media(max-width:860px){.v4-contract-card{padding:12px;border-radius:17px}.v4-contract-head,.v4-contract-grid{display:grid;grid-template-columns:1fr}.v4-contract-grid .wide,.v4-contract-grid .span-2{grid-column:auto}.v4-contract-template-row{display:grid}.v4-contract-actions button{width:100%}}`;
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

  const company = await loadCompanyLegalSettings();
  return {
    order,
    client,
    company,
    items: (itemsResponse.data || []).filter((item) => num(item.client_sum) > 0)
  };
}

function itemRow(item = {}) {
  const quantity = num(item.quantity) || 1;
  const sum = num(item.sum ?? item.client_sum);
  const price = num(item.price) || (quantity ? sum / quantity : sum);
  return `<tr data-contract-item-row><td><input data-contract-item-name value="${esc(item.name || 'Работы по заказу')}"></td><td class="number"><input data-contract-item-qty inputmode="decimal" value="${esc(quantity)}"></td><td class="unit"><input data-contract-item-unit value="${esc(item.unit || 'шт.')}"></td><td class="amount"><input data-contract-item-price inputmode="decimal" value="${esc(Math.round(price * 100) / 100)}"></td><td class="amount"><input data-contract-item-sum inputmode="decimal" value="${esc(Math.round(sum * 100) / 100)}"></td><td><button type="button" data-contract-remove-row aria-label="Удалить позицию">×</button></td></tr>`;
}

function customerDetails(bundle) {
  return [bundle.client?.address, bundle.client?.phone || bundle.order.client_phone].filter(Boolean).join('\n');
}

function templateOptions(selected) {
  return ORDER_CONTRACT_TEMPLATES.map((template) => `<option value="${template.id}"${template.id === selected ? ' selected' : ''}>${esc(template.label)}</option>`).join('');
}

function paymentOptions(selected) {
  return ORDER_CONTRACT_PAYMENT_MODES.map((mode) => `<option value="${mode.id}"${mode.id === selected ? ' selected' : ''}>${esc(mode.label)}</option>`).join('');
}

function initialDraft(bundle) {
  const { order, client, company, items } = bundle;
  const templateId = suggestedOrderContractTemplate(order.project_name);
  const sourceItems = items.length ? items : [{
    name: order.project_name || 'Работы по заказу',
    quantity: 1,
    unit: 'усл.',
    client_sum: order.client_total
  }];
  return normalizeOrderContractDraft({
    templateId,
    number: orderContractDraftNumber(order),
    date: dateInput(),
    city: 'Борисоглебск',
    executor: companyLegalName(company),
    executorDetails: companyLegalDetailsText(company),
    executorRepresentative: company.signatory_name,
    executorRole: company.signatory_role,
    customer: client?.name || order.client_name || '',
    customerDetails: customerDetails(bundle),
    taxMode: company.tax_mode,
    workAddress: client?.address || '',
    additionalTerms: order.public_comment || '',
    items: sourceItems
  });
}

function renderEditor(bundle) {
  ensureStyles();
  const draft = initialDraft(bundle);
  const warnings = orderContractWarnings(draft);
  host().innerHTML = `<div class="v4-contract-modal" role="dialog" aria-modal="true" aria-label="Черновик договора"><div class="v4-contract-card"><header class="v4-contract-head"><div><p class="v4-kicker">Документы заказа</p><h2>Черновик договора</h2><p>Заказ №${esc(bundle.order.order_number || String(bundle.order.id).slice(0, 8))} · ${esc(bundle.order.project_name || 'Без названия')}</p></div><button type="button" data-contract-close>Закрыть</button></header><div class="v4-contract-warning"><b>Проверьте перед печатью:</b><ul>${warnings.map((item) => `<li>${esc(item)}</li>`).join('')}</ul></div><form id="orderContractDraftForm"><section class="v4-contract-section"><h3>Шаблон и документ</h3><div class="v4-contract-template-row"><label>Тип договора<select id="contractDraftTemplate">${templateOptions(draft.templateId)}</select></label><button type="button" data-contract-apply-template>Применить шаблон</button></div><div class="v4-contract-grid" style="margin-top:10px"><label>Номер договора<input id="contractDraftNumber" value="${esc(draft.number)}"></label><label>Дата<input id="contractDraftDate" type="date" value="${esc(draft.date)}"></label><label>Город<input id="contractDraftCity" value="${esc(draft.city)}"></label><label class="wide">Предмет договора<textarea id="contractDraftSubject">${esc(draft.subject)}</textarea></label></div></section><section class="v4-contract-section"><h3>Стороны</h3><div class="v4-contract-grid"><label>Исполнитель<input id="contractDraftExecutor" value="${esc(draft.executor)}"></label><label>Подписант исполнителя<input id="contractDraftExecutorRepresentative" value="${esc(draft.executorRepresentative)}" placeholder="ФИО"></label><label>Статус / должность<input id="contractDraftExecutorRole" value="${esc(draft.executorRole)}"></label><label class="wide">Реквизиты исполнителя<textarea id="contractDraftExecutorDetails" placeholder="ИНН, адрес, телефон, банк и расчётный счёт">${esc(draft.executorDetails)}</textarea></label><label>Заказчик<input id="contractDraftCustomer" value="${esc(draft.customer)}"></label><label>Представитель заказчика<input id="contractDraftCustomerRepresentative" placeholder="ФИО"></label><label>Действует на основании<input id="contractDraftCustomerAuthority" value="${esc(draft.customerAuthority)}"></label><label class="wide">Реквизиты заказчика<textarea id="contractDraftCustomerDetails" placeholder="ИНН, адрес, телефон, банк и расчётный счёт">${esc(draft.customerDetails)}</textarea></label></div></section><section class="v4-contract-section"><h3>Условия</h3><div class="v4-contract-grid"><label>Порядок оплаты<select id="contractDraftPaymentMode">${paymentOptions(draft.paymentMode)}</select></label><label>Срок оплаты, раб. дней<input id="contractDraftPaymentDays" type="number" min="1" max="365" value="${esc(draft.paymentDays)}"></label><label>Налогообложение<input id="contractDraftTaxMode" value="${esc(draft.taxMode)}"></label><label>Срок выполнения, раб. дней<input id="contractDraftDeadlineDays" type="number" min="1" max="730" value="${esc(draft.deadlineDays)}"></label><label>Приёмка, раб. дней<input id="contractDraftAcceptanceDays" type="number" min="1" max="60" value="${esc(draft.acceptanceDays)}"></label><label>Гарантия, месяцев<input id="contractDraftWarrantyMonths" type="number" min="0" max="120" value="${esc(draft.warrantyMonths)}"></label><label>Пеня в день, %<input id="contractDraftPenaltyPercent" inputmode="decimal" value="${esc(draft.penaltyPercent)}"></label><label class="span-2">Адрес выполнения / монтажа<input id="contractDraftWorkAddress" value="${esc(draft.workAddress)}"></label><label class="wide">Начало отсчёта срока<textarea id="contractDraftDeadlineBasis">${esc(draft.deadlineBasis)}</textarea></label></div></section><section class="v4-contract-section"><h3>Спецификация — Приложение № 1</h3><div class="v4-contract-table-wrap"><table class="v4-contract-items"><thead><tr><th>Наименование</th><th>Кол-во</th><th>Ед.</th><th>Цена</th><th>Сумма</th><th></th></tr></thead><tbody id="contractDraftItems">${draft.items.map(itemRow).join('')}</tbody></table></div><div class="v4-contract-actions"><button type="button" data-contract-add-row>Добавить позицию</button></div><div class="v4-contract-total"><span>Итого:</span><b id="contractDraftTotal">0 ₽</b></div></section><section class="v4-contract-section"><h3>Дополнительные условия</h3><div class="v4-contract-grid"><label class="wide">Условия, которые нужно добавить в договор<textarea id="contractDraftAdditionalTerms" placeholder="Оставьте пустым, если дополнительных условий нет">${esc(draft.additionalTerms)}</textarea></label></div></section><div class="v4-contract-readonly">Это несохранённый черновик. Номер не является окончательным и не проверяется на уникальность. Генерация и печать не создают документ в базе и не меняют заказ.</div><div class="v4-contract-actions"><button type="submit" class="primary">Предпросмотр / печать PDF</button><button type="button" data-contract-close>Отмена</button></div></form></div></div>`;
  recalculateDraft();
}

function draftRows() {
  return [...document.querySelectorAll('[data-contract-item-row]')].map((row) => {
    const quantity = num(row.querySelector('[data-contract-item-qty]')?.value);
    const price = num(row.querySelector('[data-contract-item-price]')?.value);
    const rawSum = String(row.querySelector('[data-contract-item-sum]')?.value ?? '').trim();
    return {
      name: row.querySelector('[data-contract-item-name]')?.value?.trim() || 'Работы по заказу',
      quantity,
      unit: row.querySelector('[data-contract-item-unit]')?.value?.trim() || 'шт.',
      price,
      sum: rawSum === '' ? quantity * price : num(rawSum)
    };
  }).filter((item) => item.name);
}

const value = (id) => document.getElementById(id)?.value?.trim() || '';

function readDraft() {
  return normalizeOrderContractDraft({
    templateId: value('contractDraftTemplate'),
    number: value('contractDraftNumber'),
    date: value('contractDraftDate'),
    city: value('contractDraftCity'),
    executor: value('contractDraftExecutor'),
    executorDetails: value('contractDraftExecutorDetails'),
    executorRepresentative: value('contractDraftExecutorRepresentative'),
    executorRole: value('contractDraftExecutorRole'),
    customer: value('contractDraftCustomer'),
    customerDetails: value('contractDraftCustomerDetails'),
    customerRepresentative: value('contractDraftCustomerRepresentative'),
    customerAuthority: value('contractDraftCustomerAuthority'),
    subject: value('contractDraftSubject'),
    workAddress: value('contractDraftWorkAddress'),
    paymentMode: value('contractDraftPaymentMode'),
    paymentDays: value('contractDraftPaymentDays'),
    deadlineDays: value('contractDraftDeadlineDays'),
    deadlineBasis: value('contractDraftDeadlineBasis'),
    acceptanceDays: value('contractDraftAcceptanceDays'),
    warrantyMonths: value('contractDraftWarrantyMonths'),
    penaltyPercent: value('contractDraftPenaltyPercent'),
    taxMode: value('contractDraftTaxMode'),
    additionalTerms: value('contractDraftAdditionalTerms'),
    items: draftRows()
  });
}

function recalculateDraft() {
  const output = document.getElementById('contractDraftTotal');
  if (output) output.textContent = money(orderContractTotal({ items: draftRows() }));
}

function applySelectedTemplate() {
  const template = ORDER_CONTRACT_TEMPLATES.find((item) => item.id === value('contractDraftTemplate')) || ORDER_CONTRACT_TEMPLATES[0];
  const set = (id, next) => {
    const element = document.getElementById(id);
    if (element) element.value = next;
  };
  set('contractDraftSubject', template.subject);
  set('contractDraftPaymentMode', template.paymentMode);
  set('contractDraftDeadlineDays', template.deadlineDays);
  set('contractDraftAcceptanceDays', template.acceptanceDays);
  set('contractDraftWarrantyMonths', template.warrantyMonths);
  set('contractDraftPenaltyPercent', template.penaltyPercent);
  toast(`Применён шаблон «${template.label}». Проверьте формулировки.`);
}

function printCss() {
  return `*{box-sizing:border-box}body{margin:0;background:#e5e7eb;color:#111827;font-family:"Times New Roman",serif}.page{width:210mm;min-height:297mm;margin:0 auto;background:#fff;padding:16mm 18mm;position:relative}.doc-head{text-align:center;border-bottom:2px solid #1d4ed8;padding-bottom:7mm}.doc-head h1{margin:0;font-size:19px;text-transform:uppercase}.draft{margin:4px 0 0;color:#b91c1c;font:900 11px Arial,sans-serif}.meta{display:flex;justify-content:space-between;margin-top:7mm;font-size:12px}.intro{margin:8mm 0;font-size:12px;line-height:1.55;text-align:justify}.section{margin-top:6mm;break-inside:auto}.section h2{margin:0 0 2mm;font-size:13px;text-transform:uppercase}.section p{margin:0 0 2.5mm;font-size:12px;line-height:1.45;text-align:justify}.parties{display:grid;grid-template-columns:1fr 1fr;gap:9mm;margin-top:9mm}.party{border:1px solid #9ca3af;padding:8px;font-size:11px;white-space:pre-wrap}.party b{display:block;margin-bottom:4px;font-size:12px}.signature{margin-top:12mm;border-top:1px solid #111827;padding-top:4px}.appendix{break-before:page}.items{width:100%;border-collapse:collapse;margin-top:7mm;font-size:11px}.items th{background:#1e3a8a;color:#fff;padding:7px;text-align:left}.items td{border:1px solid #cbd5e1;padding:7px;vertical-align:top}.items .num{text-align:right;white-space:nowrap}.items .total td{font-weight:900;background:#eff6ff}.details{margin-top:7mm;font-size:12px;line-height:1.45}.footer-note{margin-top:10mm;border-top:1px solid #cbd5e1;padding-top:4px;color:#6b7280;font:9px Arial,sans-serif}.print-actions{position:fixed;right:16px;top:16px;display:flex;gap:8px;z-index:4}.print-actions button{border:0;border-radius:999px;background:#2563eb;color:#fff;padding:10px 14px;font-weight:900;cursor:pointer}.print-actions .secondary{background:#111827}@page{size:A4;margin:0}thead{display:table-header-group}tr{break-inside:avoid}@media print{body{background:#fff}.page{margin:0}.print-actions{display:none}}`;
}

function printHtml(draft) {
  const sections = orderContractSections(draft).map((section) => `<section class="section"><h2>${esc(section.title)}</h2>${section.paragraphs.map((paragraph) => `<p>${esc(paragraph)}</p>`).join('')}</section>`).join('');
  const rows = draft.items.map((item, index) => `<tr><td class="num">${index + 1}</td><td>${esc(item.name)}</td><td class="num">${esc(item.quantity)} ${esc(item.unit)}</td><td class="num">${money(item.price)}</td><td class="num"><b>${money(item.sum)}</b></td></tr>`).join('');
  const total = orderContractTotal(draft);
  const executorLabel = [draft.executorRole, draft.executorRepresentative].filter(Boolean).join(' — ');
  const customerRepresentative = draft.customerRepresentative ? `в лице ${draft.customerRepresentative}, действующего на основании ${draft.customerAuthority}` : 'в лице уполномоченного представителя';
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(`dogovor-${draft.number}`)}</title><style>${printCss()}</style></head><body><div class="print-actions"><button onclick="window.print()">Печать / PDF</button><button class="secondary" onclick="window.close()">Закрыть</button></div><main class="page"><header class="doc-head"><h1>Договор оказания услуг и выполнения работ</h1><p class="draft">Предварительный несохранённый черновик</p><div class="meta"><b>№ ${esc(draft.number)}</b><span>г. ${esc(draft.city)}</span><span>${esc(dateRu(draft.date))}</span></div></header><p class="intro">${esc(draft.customer || 'Заказчик')}, именуемый в дальнейшем «Заказчик», ${esc(customerRepresentative)}, с одной стороны, и ${esc(draft.executor || 'Исполнитель')}, именуемый в дальнейшем «Исполнитель», с другой стороны, совместно именуемые «Стороны», заключили настоящий Договор о нижеследующем.</p>${sections}<section class="parties"><div class="party"><b>Исполнитель</b>${esc(draft.executor)}\n${esc(draft.executorDetails || 'Реквизиты не указаны')}<div class="signature">${esc(executorLabel || 'Исполнитель')} / __________________</div></div><div class="party"><b>Заказчик</b>${esc(draft.customer)}\n${esc(draft.customerDetails || 'Реквизиты не указаны')}<div class="signature">${esc(draft.customerRepresentative || 'Заказчик')} / __________________</div></div></section><p class="footer-note">РА «Лидер» · черновик сформирован в CRM и не сохранён</p></main><main class="page appendix"><header class="doc-head"><h1>Приложение № 1. Спецификация</h1><div class="meta"><span>к договору № ${esc(draft.number)}</span><span>от ${esc(dateRu(draft.date))}</span></div></header>${draft.workAddress ? `<p class="details"><b>Адрес выполнения работ:</b> ${esc(draft.workAddress)}</p>` : ''}<table class="items"><thead><tr><th>№</th><th>Наименование</th><th>Количество</th><th>Цена</th><th>Сумма</th></tr></thead><tbody>${rows}<tr class="total"><td colspan="4">Итого</td><td class="num">${money(total)}</td></tr></tbody></table><p class="details"><b>Срок:</b> ${esc(draft.deadlineDays)} рабочих дней ${esc(draft.deadlineBasis)}.</p><p class="details"><b>Оплата:</b> ${esc(ORDER_CONTRACT_PAYMENT_MODES.find((mode) => mode.id === draft.paymentMode)?.label || draft.paymentMode)}. ${esc(draft.taxMode)}.</p><section class="parties"><div class="party"><b>Исполнитель</b>${esc(draft.executor)}<div class="signature">${esc(executorLabel || 'Исполнитель')} / __________________</div></div><div class="party"><b>Заказчик</b>${esc(draft.customer)}<div class="signature">${esc(draft.customerRepresentative || 'Заказчик')} / __________________</div></div></section><p class="footer-note">Спецификация является неотъемлемой частью договора. Предварительный несохранённый черновик.</p></main></body></html>`;
}

function openPrintPreview() {
  if (!requireV4Action(CRM_V4_ACTIONS.DOCUMENTS_GENERATE)) {
    toast('Недостаточно прав для генерации документа');
    return;
  }
  const draft = readDraft();
  const blocking = orderContractWarnings(draft).filter((warning) => !warning.startsWith('Это несохранённый'));
  if (!draft.items.length || orderContractTotal(draft) <= 0) {
    toast('Добавьте хотя бы одну позицию с клиентской стоимостью');
    return;
  }
  if (!draft.executor || !draft.customer || !draft.number || !draft.date) {
    toast(blocking[0] || 'Заполните основные данные договора');
    return;
  }
  const popup = window.open('', '_blank');
  if (!popup) {
    toast('Браузер заблокировал окно предпросмотра');
    return;
  }
  try { popup.opener = null; } catch (_) {}
  popup.document.open();
  popup.document.write(printHtml(draft));
  popup.document.close();
  setStatus('Черновик договора открыт для печати или сохранения в PDF', 'good');
}

async function openEditor(orderId) {
  if (!orderId || busy) return;
  if (!requireV4Action(CRM_V4_ACTIONS.DOCUMENTS_GENERATE)) {
    toast('Недостаточно прав для генерации договора');
    return;
  }
  busy = true;
  ensureStyles();
  host().innerHTML = '<div class="v4-contract-modal"><div class="v4-contract-card"><header class="v4-contract-head"><div><h2>Черновик договора</h2><p>Загружаю данные заказа...</p></div><button type="button" data-contract-close>Закрыть</button></header></div></div>';
  try {
    renderEditor(await fetchBundle(orderId));
  } catch (error) {
    host().innerHTML = `<div class="v4-contract-modal"><div class="v4-contract-card"><header class="v4-contract-head"><div><h2>Черновик договора</h2><p>Не удалось загрузить данные</p></div><button type="button" data-contract-close>Закрыть</button></header><div class="v4-contract-warning">${esc(friendlyError(error))}</div></div></div>`;
  } finally {
    busy = false;
  }
}

function injectOrderCardButton() {
  const actions = document.querySelector('#orderCardV1 .v4-order-modal-actions');
  if (!actions) return;
  const existing = actions.querySelector('[data-order-contract-preview]');
  if (!activeOrderId || !canPerformV4Action(CRM_V4_ACTIONS.DOCUMENTS_GENERATE)) {
    existing?.remove();
    return;
  }
  if (existing) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'v4-secondary';
  button.dataset.orderContractPreview = activeOrderId;
  button.textContent = 'Создать договор';
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
    const contractButton = event.target.closest?.('[data-order-contract-preview]');
    if (contractButton) {
      event.preventDefault();
      openEditor(contractButton.dataset.orderContractPreview || activeOrderId);
      return;
    }
    if (event.target.closest?.('[data-contract-close]')) {
      event.preventDefault();
      closeEditor();
      return;
    }
    if (event.target.closest?.('[data-contract-apply-template]')) {
      event.preventDefault();
      applySelectedTemplate();
      return;
    }
    if (event.target.closest?.('[data-contract-add-row]')) {
      event.preventDefault();
      document.getElementById('contractDraftItems')?.insertAdjacentHTML('beforeend', itemRow({ quantity: 1, unit: 'шт.', sum: 0 }));
      recalculateDraft();
      return;
    }
    const remove = event.target.closest?.('[data-contract-remove-row]');
    if (remove) {
      event.preventDefault();
      remove.closest('[data-contract-item-row]')?.remove();
      recalculateDraft();
    }
  }, true);

  document.addEventListener('input', (event) => {
    if (event.target.closest?.('#orderContractDraftForm')) recalculateDraft();
  });
  document.addEventListener('submit', (event) => {
    if (event.target?.id !== 'orderContractDraftForm') return;
    event.preventDefault();
    openPrintPreview();
  });
  new MutationObserver(injectOrderCardButton).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('leader-v4:crm-ready', injectOrderCardButton);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
else bind();
