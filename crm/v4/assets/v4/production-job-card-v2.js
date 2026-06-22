import { supabaseClient } from './supabase-client.js';
import { friendlyError } from './api.js';
import { v4State } from './state.js';
import { setStatus, toast } from './ui.js';

const JOB_FIELDS = 'id,order_id,title,production_status,layout_status,priority,deadline,sent_to_contractor_at,ready_at,contractor_cost,file_url,technical_task,contractor_comment,internal_comment,created_at,updated_at';
const ORDER_FIELDS = 'id,order_number,project_name,status,layout_status,layout_link,production_status,installation_address,data';
const ITEM_FIELDS = 'id,job_id,name,unit,qty,width,height,contractor_price,comment,created_at';
const EVENT_FIELDS = 'id,event_type,old_status,new_status,body,created_by_email,created_at';

let busy = false;
let currentBundle = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}
function nowIso() { return new Date().toISOString(); }
function money(value) { const n = Number(value || 0); return n ? `${Math.round(n).toLocaleString('ru-RU')} ₽` : '—'; }
function dateRu(value) { if (!value) return '—'; try { return new Date(value).toLocaleString('ru-RU'); } catch (_) { return String(value); } }
function localDateTime(value) { if (!value) return ''; const d = new Date(value); if (!Number.isFinite(d.getTime())) return ''; return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function dataObject(value) { if (!value) return {}; if (typeof value === 'object') return value; try { return JSON.parse(value); } catch (_) { return {}; } }

function ensureStyles() {
  if (document.getElementById('productionJobCardV2Styles')) return;
  const style = document.createElement('style');
  style.id = 'productionJobCardV2Styles';
  style.textContent = `.v4-job-modal{position:fixed;inset:0;z-index:740;background:rgba(15,23,42,.62);display:grid;place-items:center;padding:16px}.v4-job-card{width:min(1040px,100%);max-height:92vh;overflow:auto;background:#fff;border:1px solid #bbf7d0;border-radius:20px;box-shadow:0 28px 90px rgba(15,23,42,.36);padding:18px}.v4-job-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border-bottom:1px solid #e2e8f0;padding-bottom:12px;margin-bottom:14px}.v4-job-head h2{margin:0}.v4-job-head p{margin:6px 0 0;color:#64748b}.v4-job-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:12px 0}.v4-job-grid div{border:1px solid #d1fae5;background:#f0fdf4;border-radius:14px;padding:12px}.v4-job-grid span{display:block;font-size:12px;text-transform:uppercase;font-weight:900;color:#166534}.v4-job-grid b{display:block;margin-top:5px}.v4-job-columns{display:grid;grid-template-columns:1fr 1fr;gap:12px}.v4-job-section{border:1px solid #e2e8f0;border-radius:16px;padding:14px;margin-top:12px}.v4-job-row{border:1px solid #e2e8f0;background:#f8fafc;border-radius:12px;padding:10px;margin:8px 0}.v4-job-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.v4-job-actions button{border:1px solid #bbf7d0;background:#f0fdf4;color:#166534;border-radius:12px;padding:9px 12px;font-weight:900}.v4-job-actions .v4-primary{background:#16a34a;border-color:#16a34a;color:#fff}.v4-job-empty{border:1px dashed #86efac;background:#f0fdf4;color:#166534;border-radius:14px;padding:12px;font-weight:800}.v4-job-form textarea{min-height:84px;resize:vertical}.v4-job-form .wide{grid-column:1/-1}@media(max-width:820px){.v4-job-card{padding:12px;border-radius:16px}.v4-job-head,.v4-job-columns{display:grid;grid-template-columns:1fr}.v4-job-actions button{width:100%}}`;
  document.head.appendChild(style);
}

function host() {
  let element = document.getElementById('productionJobCardV2');
  if (!element) {
    element = document.createElement('div');
    element.id = 'productionJobCardV2';
    document.body.appendChild(element);
  }
  return element;
}
function closeCard() { currentBundle = null; host().innerHTML = ''; busy = false; }
function loading() { host().innerHTML = '<div class="v4-job-modal"><div class="v4-job-card"><div class="v4-job-head"><div><h2>Производственное задание</h2><p>Загрузка...</p></div><button type="button" data-production-job-close>Закрыть</button></div><div class="v4-job-empty">Загружаю данные...</div></div></div>'; }
function errorBox(text) { host().innerHTML = `<div class="v4-job-modal"><div class="v4-job-card"><div class="v4-job-head"><div><h2>Производственное задание</h2><p>Ошибка</p></div><button type="button" data-production-job-close>Закрыть</button></div><div class="v4-job-empty">${esc(text)}</div></div></div>`; }

async function fetchBundle(jobId) {
  const jobResponse = await supabaseClient.from('leader_production_jobs').select(JOB_FIELDS).eq('id', jobId).single();
  if (jobResponse.error || !jobResponse.data) throw jobResponse.error || new Error('Производственное задание не найдено');
  const job = jobResponse.data;
  const [orderResponse, itemsResponse, eventsResponse] = await Promise.all([
    job.order_id ? supabaseClient.from('leader_orders').select(ORDER_FIELDS).eq('id', job.order_id).single() : Promise.resolve({ data: null, error: null }),
    supabaseClient.from('leader_production_job_items').select(ITEM_FIELDS).eq('job_id', jobId).order('created_at', { ascending: true }).limit(120),
    supabaseClient.from('leader_production_events').select(EVENT_FIELDS).eq('job_id', jobId).order('created_at', { ascending: false }).limit(30)
  ]);
  if (itemsResponse.error) throw itemsResponse.error;
  return { job, order: orderResponse.error ? null : orderResponse.data, items: itemsResponse.data || [], events: eventsResponse.error ? [] : eventsResponse.data || [] };
}

function renderItems(items) {
  if (!items.length) return '<div class="v4-job-empty">Позиции не добавлены.</div>';
  return items.map((item) => `<div class="v4-job-row"><b>${esc(item.name || 'Позиция')}</b><p>${Number(item.qty || 0).toLocaleString('ru-RU')} ${esc(item.unit || 'шт')} · ${item.width || item.height ? `${esc(item.width || '—')}×${esc(item.height || '—')}` : 'размер не указан'} · себестоимость ${money(Number(item.contractor_price || 0) * Number(item.qty || 0))}</p>${item.comment ? `<small>${esc(item.comment)}</small>` : ''}</div>`).join('');
}
function renderEvents(events) {
  if (!events.length) return '<div class="v4-job-empty">Истории пока нет.</div>';
  return events.map((event) => `<div class="v4-job-row"><b>${esc(event.event_type || 'Событие')}</b><p>${event.old_status || event.new_status ? `${esc(event.old_status || '—')} → ${esc(event.new_status || '—')}` : esc(event.body || 'Без комментария')}</p><small>${dateRu(event.created_at)}${event.created_by_email ? ` · ${esc(event.created_by_email)}` : ''}</small></div>`).join('');
}

function renderCard(bundle) {
  currentBundle = bundle;
  const { job, order, items, events } = bundle;
  const data = dataObject(order?.data);
  host().innerHTML = `<div class="v4-job-modal"><div class="v4-job-card"><div class="v4-job-head"><div><p class="v4-kicker">Производственное задание</p><h2>${esc(job.title || order?.project_name || 'Задание')}</h2><p>Заказ №${esc(order?.order_number || String(job.order_id || '').slice(0, 8))}. Клиентские контакты не показываются.</p></div><button type="button" data-production-job-close>Закрыть</button></div><div class="v4-job-grid"><div><span>Статус</span><b>${esc(job.production_status || 'Не передано')}</b></div><div><span>Макет</span><b>${esc(job.layout_status || order?.layout_status || '—')}</b></div><div><span>Приоритет</span><b>${esc(job.priority || 'Обычная')}</b></div><div><span>Срок</span><b>${dateRu(job.deadline)}</b></div><div><span>Позиции</span><b>${items.length}</b></div><div><span>Себестоимость</span><b>${money(job.contractor_cost)}</b></div></div><div class="v4-job-actions"><button type="button" class="v4-primary" data-save-production-job="${esc(job.id)}">Сохранить</button><button type="button" data-print-production-job="${esc(job.id)}">Печать листа</button>${order ? `<button type="button" data-open-order="${esc(order.id)}">Открыть заказ</button>` : ''}<button type="button" data-production-job-close>Закрыть</button></div><div class="v4-job-columns"><section class="v4-job-section"><h3>Редактирование</h3><div class="v4-job-form v4-form-grid"><label>Название<input id="prodJobTitle" value="${esc(job.title || '')}"></label><label>Статус<select id="prodJobStatus"><option ${job.production_status === 'Не передано' ? 'selected' : ''}>Не передано</option><option ${job.production_status === 'Передано в производство' ? 'selected' : ''}>Передано в производство</option><option ${job.production_status === 'В работе' ? 'selected' : ''}>В работе</option><option ${job.production_status === 'Готово' ? 'selected' : ''}>Готово</option><option ${job.production_status === 'Проблема' ? 'selected' : ''}>Проблема</option></select></label><label>Макет<select id="prodJobLayout"><option ${job.layout_status === 'Макет не проверен' ? 'selected' : ''}>Макет не проверен</option><option ${job.layout_status === 'На согласовании' ? 'selected' : ''}>На согласовании</option><option ${job.layout_status === 'Макет согласован' ? 'selected' : ''}>Макет согласован</option><option ${job.layout_status === 'Нужны правки' ? 'selected' : ''}>Нужны правки</option></select></label><label>Приоритет<select id="prodJobPriority"><option ${job.priority === 'Обычная' ? 'selected' : ''}>Обычная</option><option ${job.priority === 'Высокая' ? 'selected' : ''}>Высокая</option><option ${job.priority === 'Срочно' ? 'selected' : ''}>Срочно</option></select></label><label>Срок<input id="prodJobDeadline" type="datetime-local" value="${localDateTime(job.deadline)}"></label><label>Файл / макет<input id="prodJobFile" value="${esc(job.file_url || order?.layout_link || '')}"></label><label class="wide">Техническое задание<textarea id="prodJobTask">${esc(job.technical_task || '')}</textarea></label><label class="wide">Комментарий производству<textarea id="prodJobContractorComment">${esc(job.contractor_comment || '')}</textarea></label><label class="wide">Внутренний комментарий<textarea id="prodJobInternalComment">${esc(job.internal_comment || '')}</textarea></label></div></section><section class="v4-job-section"><h3>Данные для производства</h3><div class="v4-job-row"><b>Объект</b><p>${esc(order?.project_name || '—')}</p></div><div class="v4-job-row"><b>Место размещения</b><p>${esc(data.install_place || data.installPlace || order?.installation_address || '—')}</p></div><div class="v4-job-row"><b>Макет</b><p>${esc(job.file_url || order?.layout_link || 'Ссылка не указана')}</p></div></section></div><section class="v4-job-section"><h3>Состав задания</h3>${renderItems(items)}</section><section class="v4-job-section"><h3>История</h3>${renderEvents(events)}</section></div></div>`;
}

async function openJobCard(jobId) {
  if (!jobId || busy) return;
  busy = true;
  ensureStyles();
  loading();
  try { renderCard(await fetchBundle(jobId)); }
  catch (error) { errorBox(friendlyError(error)); }
  finally { busy = false; }
}

function field(id) { return document.getElementById(id)?.value?.trim() || ''; }
async function saveJob(jobId) {
  if (busy) return;
  busy = true;
  try {
    const old = currentBundle?.job || (await fetchBundle(jobId)).job;
    const status = field('prodJobStatus') || old.production_status || 'Не передано';
    const deadlineRaw = field('prodJobDeadline');
    const patch = {
      title: field('prodJobTitle') || old.title,
      production_status: status,
      layout_status: field('prodJobLayout') || old.layout_status,
      priority: field('prodJobPriority') || old.priority,
      deadline: deadlineRaw ? new Date(deadlineRaw).toISOString() : null,
      file_url: field('prodJobFile') || null,
      technical_task: field('prodJobTask') || null,
      contractor_comment: field('prodJobContractorComment') || null,
      internal_comment: field('prodJobInternalComment') || null,
      updated_at: nowIso()
    };
    if (status === 'Передано в производство') patch.sent_to_contractor_at = old.sent_to_contractor_at || nowIso();
    if (status === 'Готово') patch.ready_at = old.ready_at || nowIso();
    const response = await supabaseClient.from('leader_production_jobs').update(patch).eq('id', jobId);
    if (response.error) throw response.error;
    if (old.order_id) {
      const orderResponse = await supabaseClient.from('leader_orders').update({ production_status: status, layout_status: patch.layout_status, layout_link: patch.file_url, current_stage: `Производство: ${status}`, updated_at: nowIso(), stage_updated_at: nowIso() }).eq('id', old.order_id);
      if (orderResponse.error) throw orderResponse.error;
    }
    await supabaseClient.from('leader_production_events').insert({ job_id: jobId, order_id: old.order_id, event_type: 'Обновление задания', old_status: old.production_status, new_status: status, body: 'Производственное задание обновлено из CRM v4', created_by: v4State.user?.id || null, created_by_email: v4State.user?.email || null });
    toast('Производственное задание сохранено');
    setStatus('Производственное задание сохранено', 'good');
    document.dispatchEvent(new CustomEvent('leader-v4-order-updated', { detail: { order: { id: old.order_id, production_status: status } } }));
    renderCard(await fetchBundle(jobId));
  } catch (error) {
    toast(friendlyError(error));
    setStatus(`Ошибка задания: ${friendlyError(error)}`, 'error');
  } finally { busy = false; }
}

async function printJob(jobId) {
  try {
    const bundle = currentBundle?.job?.id === jobId ? currentBundle : await fetchBundle(jobId);
    const { job, order, items } = bundle;
    const rows = items.length ? items.map((item, index) => `<tr><td>${index + 1}</td><td>${esc(item.name || '')}</td><td>${Number(item.qty || 0).toLocaleString('ru-RU')} ${esc(item.unit || '')}</td><td>${item.width || item.height ? `${esc(item.width || '—')}×${esc(item.height || '—')}` : '—'}</td><td>${esc(item.comment || '')}</td></tr>`).join('') : '<tr><td colspan="5">Позиции не добавлены</td></tr>';
    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (!win) throw new Error('Браузер заблокировал окно печати');
    win.document.open();
    win.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Производственный лист</title><style>@page{size:A4;margin:12mm}body{font-family:Arial,sans-serif;color:#111827}h1{font-size:22px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #cbd5e1;padding:7px;text-align:left}.notice{border:2px solid #86efac;background:#ecfdf5;color:#065f46;border-radius:10px;padding:10px;margin:12px 0;font-weight:700}</style></head><body><p>РА «Лидер» · ${new Date().toLocaleString('ru-RU')}</p><h1>${esc(job.title || order?.project_name || 'Производственное задание')}</h1><div class="notice">Лист для производства. Не содержит имя, телефон и контакты клиента.</div><p><b>Заказ:</b> №${esc(order?.order_number || String(job.order_id || '').slice(0, 8))}</p><p><b>Статус:</b> ${esc(job.production_status || '—')} · <b>Срок:</b> ${dateRu(job.deadline)}</p><p><b>Макет:</b> ${esc(job.file_url || order?.layout_link || 'не указан')}</p><p><b>ТЗ:</b> ${esc(job.technical_task || 'не заполнено')}</p><table><thead><tr><th>№</th><th>Позиция</th><th>Кол-во</th><th>Размер</th><th>Комментарий</th></tr></thead><tbody>${rows}</tbody></table><script>window.print();<\/script></body></html>`);
    win.document.close();
  } catch (error) { toast(friendlyError(error)); }
}

function boot() {
  ensureStyles();
  document.addEventListener('click', (event) => {
    const open = event.target.closest?.('[data-open-production-job-card]');
    if (open) { event.preventDefault(); event.stopPropagation(); openJobCard(open.dataset.openProductionJobCard); return; }
    if (event.target.closest?.('[data-production-job-close]')) { event.preventDefault(); closeCard(); return; }
    const save = event.target.closest?.('[data-save-production-job]');
    if (save) { event.preventDefault(); event.stopPropagation(); saveJob(save.dataset.saveProductionJob); return; }
    const print = event.target.closest?.('[data-print-production-job]');
    if (print) { event.preventDefault(); event.stopPropagation(); printJob(print.dataset.printProductionJob); }
  }, true);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeCard(); });
}

if (!window.LeaderV4ProductionJobCardV2Booted) {
  window.LeaderV4ProductionJobCardV2Booted = true;
  boot();
}
