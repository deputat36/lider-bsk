import { supabaseClient } from './supabase-client.js';
import { friendlyError } from './api.js';
import { v4State } from './state.js';
import { setStatus, toast } from './ui.js';

const JOB_FIELDS = 'id,order_id,production_job_id,title,install_status,priority,installer_name,installer_phone,address,scheduled_at,started_at,completed_at,installer_cost,technical_task,tools_required,installer_comment,internal_comment,before_photo_url,after_photo_url,created_at,updated_at';
const ORDER_FIELDS = 'id,order_number,project_name,status,layout_link,installation_address,data';
const PRODUCTION_FIELDS = 'id,title,production_status,file_url';
const ITEM_FIELDS = 'id,job_id,name,unit,qty,width,height,installer_price,comment,created_at';
const EVENT_FIELDS = 'id,event_type,old_status,new_status,body,created_at';
const COMMENT_FIELDS = 'id,comment_type,body,created_at';

let busy = false;
let currentBundle = null;

function esc(value) { return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])); }
function nowIso() { return new Date().toISOString(); }
function money(value) { const n = Number(value || 0); return n ? `${Math.round(n).toLocaleString('ru-RU')} ₽` : '—'; }
function dateRu(value) { if (!value) return '—'; try { return new Date(value).toLocaleString('ru-RU'); } catch (_) { return String(value); } }
function localDateTime(value) { if (!value) return ''; const d = new Date(value); if (!Number.isFinite(d.getTime())) return ''; return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function dataObject(value) { if (!value) return {}; if (typeof value === 'object') return value; try { return JSON.parse(value); } catch (_) { return {}; } }

function ensureStyles() {
  if (document.getElementById('installationJobCardV2Styles')) return;
  const style = document.createElement('style');
  style.id = 'installationJobCardV2Styles';
  style.textContent = `.v4-install-modal{position:fixed;inset:0;z-index:750;background:rgba(15,23,42,.62);display:grid;place-items:center;padding:16px}.v4-install-card{width:min(1040px,100%);max-height:92vh;overflow:auto;background:#fff;border:1px solid #bfdbfe;border-radius:20px;box-shadow:0 28px 90px rgba(15,23,42,.36);padding:18px}.v4-install-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border-bottom:1px solid #e2e8f0;padding-bottom:12px;margin-bottom:14px}.v4-install-head h2{margin:0}.v4-install-head p{margin:6px 0 0;color:#64748b}.v4-install-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:12px 0}.v4-install-grid div{border:1px solid #bfdbfe;background:#eff6ff;border-radius:14px;padding:12px}.v4-install-grid span{display:block;font-size:12px;text-transform:uppercase;font-weight:900;color:#1d4ed8}.v4-install-grid b{display:block;margin-top:5px}.v4-install-columns{display:grid;grid-template-columns:1fr 1fr;gap:12px}.v4-install-section{border:1px solid #e2e8f0;border-radius:16px;padding:14px;margin-top:12px}.v4-install-row{border:1px solid #e2e8f0;background:#f8fafc;border-radius:12px;padding:10px;margin:8px 0}.v4-install-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.v4-install-actions button{border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;border-radius:12px;padding:9px 12px;font-weight:900}.v4-install-actions .v4-primary{background:#2563eb;border-color:#2563eb;color:#fff}.v4-install-empty{border:1px dashed #93c5fd;background:#eff6ff;color:#1d4ed8;border-radius:14px;padding:12px;font-weight:800}.v4-install-form textarea{min-height:84px;resize:vertical}.v4-install-form .wide{grid-column:1/-1}@media(max-width:820px){.v4-install-card{padding:12px;border-radius:16px}.v4-install-head,.v4-install-columns{display:grid;grid-template-columns:1fr}.v4-install-actions button{width:100%}}`;
  document.head.appendChild(style);
}

function host() {
  let element = document.getElementById('installationJobCardV2');
  if (!element) {
    element = document.createElement('div');
    element.id = 'installationJobCardV2';
    document.body.appendChild(element);
  }
  return element;
}
function closeCard() { currentBundle = null; host().innerHTML = ''; busy = false; }
function loading() { host().innerHTML = '<div class="v4-install-modal"><div class="v4-install-card"><div class="v4-install-head"><div><h2>Монтажное задание</h2><p>Загрузка...</p></div><button type="button" data-installation-job-close>Закрыть</button></div><div class="v4-install-empty">Загружаю данные...</div></div></div>'; }
function errorBox(text) { host().innerHTML = `<div class="v4-install-modal"><div class="v4-install-card"><div class="v4-install-head"><div><h2>Монтажное задание</h2><p>Ошибка</p></div><button type="button" data-installation-job-close>Закрыть</button></div><div class="v4-install-empty">${esc(text)}</div></div></div>`; }

async function fetchBundle(jobId) {
  const jobResponse = await supabaseClient.from('leader_installation_jobs').select(JOB_FIELDS).eq('id', jobId).single();
  if (jobResponse.error || !jobResponse.data) throw jobResponse.error || new Error('Монтажное задание не найдено');
  const job = jobResponse.data;
  const [orderResponse, productionResponse, itemsResponse, eventsResponse, commentsResponse] = await Promise.all([
    job.order_id ? supabaseClient.from('leader_orders').select(ORDER_FIELDS).eq('id', job.order_id).single() : Promise.resolve({ data: null, error: null }),
    job.production_job_id ? supabaseClient.from('leader_production_jobs').select(PRODUCTION_FIELDS).eq('id', job.production_job_id).single() : Promise.resolve({ data: null, error: null }),
    supabaseClient.from('leader_installation_job_items').select(ITEM_FIELDS).eq('job_id', jobId).order('created_at', { ascending: true }).limit(120),
    supabaseClient.from('leader_installation_events').select(EVENT_FIELDS).eq('job_id', jobId).order('created_at', { ascending: false }).limit(30),
    supabaseClient.from('leader_installation_comments').select(COMMENT_FIELDS).eq('job_id', jobId).order('created_at', { ascending: false }).limit(20)
  ]);
  if (itemsResponse.error) throw itemsResponse.error;
  return { job, order: orderResponse.error ? null : orderResponse.data, production: productionResponse.error ? null : productionResponse.data, items: itemsResponse.data || [], events: eventsResponse.error ? [] : eventsResponse.data || [], comments: commentsResponse.error ? [] : commentsResponse.data || [] };
}

function renderItems(items) {
  if (!items.length) return '<div class="v4-install-empty">Позиции монтажа не добавлены.</div>';
  return items.map((item) => `<div class="v4-install-row"><b>${esc(item.name || 'Позиция')}</b><p>${Number(item.qty || 0).toLocaleString('ru-RU')} ${esc(item.unit || 'шт')} · ${item.width || item.height ? `${esc(item.width || '—')}×${esc(item.height || '—')}` : 'размер не указан'} · ${money(Number(item.installer_price || 0) * Number(item.qty || 0))}</p>${item.comment ? `<small>${esc(item.comment)}</small>` : ''}</div>`).join('');
}
function renderHistory(rows, empty) {
  if (!rows.length) return `<div class="v4-install-empty">${empty}</div>`;
  return rows.map((row) => `<div class="v4-install-row"><b>${esc(row.event_type || row.comment_type || 'Событие')}</b><p>${esc(row.body || `${row.old_status || '—'} → ${row.new_status || '—'}`)}</p><small>${dateRu(row.created_at)}</small></div>`).join('');
}

function renderCard(bundle) {
  currentBundle = bundle;
  const { job, order, production, items, events, comments } = bundle;
  const data = dataObject(order?.data);
  host().innerHTML = `<div class="v4-install-modal"><div class="v4-install-card"><div class="v4-install-head"><div><p class="v4-kicker">Монтажное задание</p><h2>${esc(job.title || order?.project_name || 'Монтаж')}</h2><p>Заказ №${esc(order?.order_number || String(job.order_id || '').slice(0, 8))}. Клиентские контакты не показываются.</p></div><button type="button" data-installation-job-close>Закрыть</button></div><div class="v4-install-grid"><div><span>Статус</span><b>${esc(job.install_status || 'Нужно назначить')}</b></div><div><span>Дата</span><b>${dateRu(job.scheduled_at)}</b></div><div><span>Монтажник</span><b>${esc(job.installer_name || 'Не назначен')}</b></div><div><span>Адрес</span><b>${esc(job.address || order?.installation_address || data.install_place || '—')}</b></div><div><span>Позиции</span><b>${items.length}</b></div><div><span>Оплата</span><b>${money(job.installer_cost)}</b></div></div><div class="v4-install-actions"><button type="button" class="v4-primary" data-save-installation-job="${esc(job.id)}">Сохранить</button><button type="button" data-print-installation-job="${esc(job.id)}">Печать листа</button>${order ? `<button type="button" data-open-order="${esc(order.id)}">Открыть заказ</button>` : ''}<button type="button" data-installation-job-close>Закрыть</button></div><div class="v4-install-columns"><section class="v4-install-section"><h3>Редактирование</h3><div class="v4-install-form v4-form-grid"><label>Название<input id="installJobTitle" value="${esc(job.title || '')}"></label><label>Статус<select id="installJobStatus"><option ${job.install_status === 'Нужно назначить' ? 'selected' : ''}>Нужно назначить</option><option ${job.install_status === 'Запланирован' ? 'selected' : ''}>Запланирован</option><option ${job.install_status === 'В работе' ? 'selected' : ''}>В работе</option><option ${job.install_status === 'Выполнен' ? 'selected' : ''}>Выполнен</option><option ${job.install_status === 'Проблема' ? 'selected' : ''}>Проблема</option></select></label><label>Дата<input id="installJobScheduled" type="datetime-local" value="${localDateTime(job.scheduled_at)}"></label><label>Монтажник<input id="installJobInstaller" value="${esc(job.installer_name || '')}"></label><label>Телефон монтажника<input id="installJobInstallerPhone" value="${esc(job.installer_phone || '')}"></label><label class="wide">Адрес<input id="installJobAddress" value="${esc(job.address || order?.installation_address || data.install_place || '')}"></label><label>Фото места<input id="installJobBefore" value="${esc(job.before_photo_url || data.place_photo_link || '')}"></label><label>Фото результата<input id="installJobAfter" value="${esc(job.after_photo_url || '')}"></label><label class="wide">ТЗ<textarea id="installJobTask">${esc(job.technical_task || '')}</textarea></label><label class="wide">Инструмент<textarea id="installJobTools">${esc(job.tools_required || '')}</textarea></label><label class="wide">Комментарий монтажнику<textarea id="installJobComment">${esc(job.installer_comment || '')}</textarea></label></div></section><section class="v4-install-section"><h3>Данные для монтажа</h3><div class="v4-install-row"><b>Производство</b><p>${production ? `${esc(production.title || 'Производство')} · ${esc(production.production_status || '—')}` : 'Не связано'}</p></div><div class="v4-install-row"><b>Макет</b><p>${esc(production?.file_url || order?.layout_link || 'Ссылка не указана')}</p></div><div class="v4-install-row"><b>Фото места</b><p>${esc(job.before_photo_url || data.place_photo_link || 'Ссылка не указана')}</p></div></section></div><section class="v4-install-section"><h3>Состав монтажа</h3>${renderItems(items)}</section><div class="v4-install-columns"><section class="v4-install-section"><h3>Комментарии</h3>${renderHistory(comments, 'Комментариев пока нет.')}<div class="v4-install-form"><textarea id="installJobNewComment" placeholder="Добавить комментарий"></textarea><button type="button" data-add-installation-comment="${esc(job.id)}">Добавить комментарий</button></div></section><section class="v4-install-section"><h3>История</h3>${renderHistory(events, 'Истории пока нет.')}</section></div></div></div>`;
}

async function openCard(jobId) {
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
    const status = field('installJobStatus') || old.install_status || 'Нужно назначить';
    const scheduledRaw = field('installJobScheduled');
    const patch = {
      title: field('installJobTitle') || old.title,
      install_status: status,
      installer_name: field('installJobInstaller') || null,
      installer_phone: field('installJobInstallerPhone') || null,
      address: field('installJobAddress') || null,
      scheduled_at: scheduledRaw ? new Date(scheduledRaw).toISOString() : null,
      before_photo_url: field('installJobBefore') || null,
      after_photo_url: field('installJobAfter') || null,
      technical_task: field('installJobTask') || null,
      tools_required: field('installJobTools') || null,
      installer_comment: field('installJobComment') || null,
      updated_by: v4State.user?.id || null,
      updated_at: nowIso()
    };
    if (status === 'В работе') patch.started_at = old.started_at || nowIso();
    if (status === 'Выполнен') patch.completed_at = old.completed_at || nowIso();
    const response = await supabaseClient.from('leader_installation_jobs').update(patch).eq('id', jobId);
    if (response.error) throw response.error;
    if (old.order_id) {
      const orderResponse = await supabaseClient.from('leader_orders').update({ installation_status: status, installation_address: patch.address, installation_scheduled_at: patch.scheduled_at, installer_name: patch.installer_name, installer_phone: patch.installer_phone, current_stage: `Монтаж: ${status}`, updated_at: nowIso(), stage_updated_at: nowIso() }).eq('id', old.order_id);
      if (orderResponse.error) throw orderResponse.error;
    }
    await supabaseClient.from('leader_installation_events').insert({ job_id: jobId, order_id: old.order_id, event_type: 'Обновление монтажа', old_status: old.install_status, new_status: status, body: 'Монтажное задание обновлено из CRM v4', created_by: v4State.user?.id || null });
    toast('Монтажное задание сохранено');
    setStatus('Монтажное задание сохранено', 'good');
    document.dispatchEvent(new CustomEvent('leader-v4-order-updated', { detail: { order: { id: old.order_id, installation_status: status } } }));
    renderCard(await fetchBundle(jobId));
  } catch (error) {
    toast(friendlyError(error));
    setStatus(`Ошибка монтажа: ${friendlyError(error)}`, 'error');
  } finally { busy = false; }
}

async function addComment(jobId) {
  const body = field('installJobNewComment');
  if (!body || busy) return;
  busy = true;
  try {
    const response = await supabaseClient.from('leader_installation_comments').insert({ job_id: jobId, comment_type: 'internal', body, created_by: v4State.user?.id || null });
    if (response.error) throw response.error;
    toast('Комментарий добавлен');
    renderCard(await fetchBundle(jobId));
  } catch (error) { toast(friendlyError(error)); }
  finally { busy = false; }
}

async function printJob(jobId) {
  try {
    const bundle = currentBundle?.job?.id === jobId ? currentBundle : await fetchBundle(jobId);
    const { job, order, production, items } = bundle;
    const rows = items.length ? items.map((item, index) => `<tr><td>${index + 1}</td><td>${esc(item.name || '')}</td><td>${Number(item.qty || 0).toLocaleString('ru-RU')} ${esc(item.unit || '')}</td><td>${item.width || item.height ? `${esc(item.width || '—')}×${esc(item.height || '—')}` : '—'}</td><td>${esc(item.comment || '')}</td></tr>`).join('') : '<tr><td colspan="5">Позиции монтажа не добавлены</td></tr>';
    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (!win) throw new Error('Браузер заблокировал окно печати');
    win.document.open();
    win.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Монтажный лист</title><style>@page{size:A4;margin:12mm}body{font-family:Arial,sans-serif;color:#111827}h1{font-size:22px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #cbd5e1;padding:7px;text-align:left}.notice{border:2px solid #86efac;background:#ecfdf5;color:#065f46;border-radius:10px;padding:10px;margin:12px 0;font-weight:700}</style></head><body><p>РА «Лидер» · ${new Date().toLocaleString('ru-RU')}</p><h1>${esc(job.title || order?.project_name || 'Монтажное задание')}</h1><div class="notice">Лист для монтажа. Не содержит имя, телефон и контакты клиента.</div><p><b>Заказ:</b> №${esc(order?.order_number || String(job.order_id || '').slice(0, 8))}</p><p><b>Статус:</b> ${esc(job.install_status || '—')} · <b>Дата:</b> ${dateRu(job.scheduled_at)}</p><p><b>Адрес:</b> ${esc(job.address || order?.installation_address || '—')}</p><p><b>Макет:</b> ${esc(production?.file_url || order?.layout_link || 'не указан')}</p><p><b>ТЗ:</b> ${esc(job.technical_task || 'не заполнено')}</p><table><thead><tr><th>№</th><th>Позиция</th><th>Кол-во</th><th>Размер</th><th>Комментарий</th></tr></thead><tbody>${rows}</tbody></table><script>window.print();<\/script></body></html>`);
    win.document.close();
  } catch (error) { toast(friendlyError(error)); }
}

function boot() {
  ensureStyles();
  document.addEventListener('click', (event) => {
    const open = event.target.closest?.('[data-open-installation-job-card]');
    if (open) { event.preventDefault(); event.stopPropagation(); openCard(open.dataset.openInstallationJobCard); return; }
    if (event.target.closest?.('[data-installation-job-close]')) { event.preventDefault(); closeCard(); return; }
    const save = event.target.closest?.('[data-save-installation-job]');
    if (save) { event.preventDefault(); event.stopPropagation(); saveJob(save.dataset.saveInstallationJob); return; }
    const comment = event.target.closest?.('[data-add-installation-comment]');
    if (comment) { event.preventDefault(); event.stopPropagation(); addComment(comment.dataset.addInstallationComment); return; }
    const print = event.target.closest?.('[data-print-installation-job]');
    if (print) { event.preventDefault(); event.stopPropagation(); printJob(print.dataset.printInstallationJob); }
  }, true);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeCard(); });
}

if (!window.LeaderV4InstallationJobCardV2Booted) {
  window.LeaderV4InstallationJobCardV2Booted = true;
  boot();
}
