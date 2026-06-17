import { supabaseClient } from './supabase-client.js';
import { friendlyError } from './api.js';
import { v4State } from './state.js';
import { setStatus, toast } from './ui.js';

let booted = false;
let busy = false;
let currentJobId = '';
let currentBundle = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}
function dateTimeRu(value) {
  if (!value) return '—';
  try { return new Date(value).toLocaleString('ru-RU'); } catch (_) { return String(value); }
}
function datetimeLocal(value) {
  if (!value) return '';
  try {
    const date = new Date(value);
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  } catch (_) {
    return '';
  }
}
function money(value) {
  const n = Number(value || 0);
  return n ? `${Math.round(n).toLocaleString('ru-RU')} ₽` : '—';
}
function nowIso() { return new Date().toISOString(); }
function statusClass(status = '') {
  const text = String(status).toLowerCase();
  if (text.includes('выполн') || text.includes('принят') || text.includes('закры')) return 'is-good';
  if (text.includes('проблем') || text.includes('срыв') || text.includes('передел') || text.includes('отмен')) return 'is-danger';
  if (text.includes('работ') || text.includes('заплан') || text.includes('назнач')) return 'is-warn';
  return '';
}
function ensureStyles() {
  if (document.getElementById('installationJobCardV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'installationJobCardV1Styles';
  style.textContent = `
    .v4-install-modal{position:fixed;inset:0;z-index:730;background:rgba(15,23,42,.62);display:grid;place-items:center;padding:16px}.v4-install-card{width:min(1080px,100%);max-height:92vh;overflow:auto;background:#fff;border:1px solid #bfdbfe;border-radius:24px;box-shadow:0 28px 90px rgba(15,23,42,.36);padding:18px}.v4-install-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border-bottom:1px solid #e2e8f0;padding-bottom:12px;margin-bottom:14px}.v4-install-head h2{margin:0}.v4-install-head p{margin:6px 0 0;color:#64748b}.v4-install-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:12px 0}.v4-install-grid div{border:1px solid #bfdbfe;background:#eff6ff;border-radius:16px;padding:12px}.v4-install-grid span{display:block;font-size:12px;text-transform:uppercase;font-weight:900;color:#1d4ed8}.v4-install-grid b{display:block;margin-top:5px;color:#0f172a}.v4-install-columns{display:grid;grid-template-columns:1fr 1fr;gap:12px}.v4-install-section{border:1px solid #e2e8f0;background:#fff;border-radius:18px;padding:14px;margin-top:12px}.v4-install-section h3{margin:0 0 10px}.v4-install-row{border:1px solid #e2e8f0;background:#f8fafc;border-radius:14px;padding:10px;margin:8px 0}.v4-install-row-head{display:flex;justify-content:space-between;gap:10px}.v4-install-row-head b{overflow-wrap:anywhere}.v4-install-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.v4-install-actions button{background:#fff}.v4-install-actions .v4-primary{background:#2563eb;color:#fff;border-color:#2563eb}.v4-install-badge{display:inline-flex;border-radius:999px;background:#dbeafe;color:#1d4ed8;padding:4px 8px;font-size:12px;font-weight:900;white-space:nowrap}.v4-install-badge.is-warn{background:#fef3c7;color:#92400e}.v4-install-badge.is-danger{background:#fee2e2;color:#991b1b}.v4-install-badge.is-good{background:#dcfce7;color:#166534}.v4-install-empty{border:1px dashed #93c5fd;border-radius:14px;padding:12px;background:#eff6ff;color:#1d4ed8;font-weight:800}.v4-install-form{display:grid;gap:10px}.v4-install-form textarea{min-height:84px;resize:vertical}.v4-install-form .wide{grid-column:1/-1}.v4-install-link{display:inline-flex;font-weight:900;color:#1d4ed8;overflow-wrap:anywhere}.v4-install-print-note{border:1px solid #bbf7d0;background:#f0fdf4;color:#166534;border-radius:14px;padding:10px 12px;font-weight:800;margin:10px 0}
    @media(max-width:820px){.v4-install-card{padding:12px;border-radius:18px}.v4-install-head,.v4-install-columns{display:grid;grid-template-columns:1fr}.v4-install-actions{display:grid}.v4-install-actions button{width:100%}}
  `;
  document.head.appendChild(style);
}
function host() {
  let element = document.getElementById('installationJobCardV1');
  if (!element) {
    element = document.createElement('div');
    element.id = 'installationJobCardV1';
    document.body.appendChild(element);
  }
  return element;
}
function closeCard() {
  currentJobId = '';
  currentBundle = null;
  host().innerHTML = '';
  busy = false;
}
function loading() {
  host().innerHTML = `<div class="v4-install-modal"><div class="v4-install-card"><div class="v4-install-head"><div><h2>Монтажное задание</h2><p>Загружаю данные...</p></div><button type="button" data-installation-job-close>Закрыть</button></div><div class="v4-install-empty">Загрузка...</div></div></div>`;
}
function errorBox(text) {
  host().innerHTML = `<div class="v4-install-modal"><div class="v4-install-card"><div class="v4-install-head"><div><h2>Монтажное задание</h2><p>Ошибка загрузки</p></div><button type="button" data-installation-job-close>Закрыть</button></div><div class="v4-install-empty">${esc(text)}</div></div></div>`;
}
async function fetchBundle(jobId) {
  const jobResponse = await supabaseClient.from('leader_installation_jobs').select('*').eq('id', jobId).single();
  if (jobResponse.error || !jobResponse.data) throw jobResponse.error || new Error('Монтажное задание не найдено');
  const job = jobResponse.data;
  const [itemsResponse, orderResponse, productionResponse, eventsResponse, commentsResponse] = await Promise.all([
    supabaseClient.from('leader_installation_job_items').select('*').eq('job_id', jobId).order('created_at', { ascending: true }),
    job.order_id ? supabaseClient.from('leader_orders').select('id,order_number,project_name,status,deadline,layout_status,layout_link,production_status,installation_status,installation_address,installation_scheduled_at,installer_name,installer_phone,progress_percent,data,created_at').eq('id', job.order_id).single() : Promise.resolve({ data: null, error: null }),
    job.production_job_id ? supabaseClient.from('leader_production_jobs').select('id,title,production_status,layout_status,file_url,deadline').eq('id', job.production_job_id).single() : Promise.resolve({ data: null, error: null }),
    supabaseClient.from('leader_installation_events').select('*').eq('job_id', jobId).order('created_at', { ascending: false }).limit(40),
    supabaseClient.from('leader_installation_comments').select('*').eq('job_id', jobId).order('created_at', { ascending: false }).limit(30)
  ]);
  if (itemsResponse.error) throw itemsResponse.error;
  return {
    job,
    items: itemsResponse.data || [],
    order: orderResponse.error ? null : orderResponse.data,
    production: productionResponse.error ? null : productionResponse.data,
    events: eventsResponse.error ? [] : eventsResponse.data || [],
    comments: commentsResponse.error ? [] : commentsResponse.data || []
  };
}
function renderItems(items) {
  if (!items.length) return '<div class="v4-install-empty">Позиции монтажа не добавлены.</div>';
  return items.map((item) => `<div class="v4-install-row"><div class="v4-install-row-head"><b>${esc(item.name || 'Позиция')}</b><span>${Number(item.qty || 0).toLocaleString('ru-RU')} ${esc(item.unit || 'шт')}</span></div><p>Размер: ${item.width || item.height ? `${esc(item.width || '—')}×${esc(item.height || '—')}` : '—'} · Монтажник: ${money(Number(item.installer_price || 0) * Number(item.qty || 0))}</p>${item.comment ? `<small>${esc(item.comment)}</small>` : ''}</div>`).join('');
}
function renderEvents(events) {
  if (!events.length) return '<div class="v4-install-empty">Истории пока нет.</div>';
  return events.map((event) => `<div class="v4-install-row"><div class="v4-install-row-head"><b>${esc(event.event_type || 'Событие')}</b><span>${dateTimeRu(event.created_at)}</span></div><p>${event.old_status || event.new_status ? `${esc(event.old_status || '—')} → ${esc(event.new_status || '—')}` : esc(event.body || 'Без комментария')}</p></div>`).join('');
}
function renderComments(comments) {
  if (!comments.length) return '<div class="v4-install-empty">Комментариев пока нет.</div>';
  return comments.map((comment) => `<div class="v4-install-row"><div class="v4-install-row-head"><b>${esc(comment.comment_type || 'Комментарий')}</b><span>${dateTimeRu(comment.created_at)}</span></div><p>${esc(comment.body || '')}</p></div>`).join('');
}
function renderCard(bundle) {
  currentBundle = bundle;
  const { job, order, production, items, events, comments } = bundle;
  const data = order?.data && typeof order.data === 'object' ? order.data : {};
  host().innerHTML = `<div class="v4-install-modal"><div class="v4-install-card"><div class="v4-install-head"><div><p class="v4-kicker">Монтажное задание</p><h2>${esc(job.title || order?.project_name || 'Монтаж')}</h2><p>Заказ №${esc(order?.order_number || String(job.order_id || '').slice(0, 8))} · без данных клиента</p></div><button type="button" data-installation-job-close>Закрыть</button></div><div class="v4-install-grid"><div><span>Монтаж</span><b>${esc(job.install_status || 'Нужно назначить')}</b></div><div><span>Приоритет</span><b>${esc(job.priority || 'Обычный')}</b></div><div><span>Запланировано</span><b>${dateTimeRu(job.scheduled_at)}</b></div><div><span>Монтажник</span><b>${esc(job.installer_name || 'Не назначен')}</b></div><div><span>Позиции</span><b>${items.length}</b></div><div><span>Оплата монтажнику</span><b>${money(job.installer_cost)}</b></div></div><div class="v4-install-actions"><button type="button" class="v4-primary" data-print-installation-job="${esc(job.id)}">Печать листа</button>${order ? `<button type="button" data-open-order="${esc(order.id)}" data-installation-job-close>Открыть заказ</button>` : ''}<button type="button" data-installation-job-status="${esc(job.id)}" data-status="Запланирован">Запланирован</button><button type="button" data-installation-job-status="${esc(job.id)}" data-status="В работе">В работе</button><button type="button" data-installation-job-status="${esc(job.id)}" data-status="Выполнен">Выполнен</button></div><div class="v4-install-print-note">Печатный лист монтажа не содержит имя, телефон и контакты клиента. Для монтажника выводятся только адрес, место размещения, ТЗ, фото места и состав работ.</div><div class="v4-install-columns"><section class="v4-install-section"><h3>Редактирование монтажа</h3><div class="v4-install-form v4-form-grid"><label>Название<input id="installEditTitle" value="${esc(job.title || '')}"></label><label>Статус<select id="installEditStatus"><option ${job.install_status === 'Нужно назначить' ? 'selected' : ''}>Нужно назначить</option><option ${job.install_status === 'Запланирован' ? 'selected' : ''}>Запланирован</option><option ${job.install_status === 'В работе' ? 'selected' : ''}>В работе</option><option ${job.install_status === 'Выполнен' ? 'selected' : ''}>Выполнен</option><option ${job.install_status === 'Проблема' ? 'selected' : ''}>Проблема</option></select></label><label>Приоритет<select id="installEditPriority"><option ${job.priority === 'Обычный' ? 'selected' : ''}>Обычный</option><option ${job.priority === 'Высокий' ? 'selected' : ''}>Высокий</option><option ${job.priority === 'Срочно' ? 'selected' : ''}>Срочно</option></select></label><label>Дата и время монтажа<input id="installEditScheduled" type="datetime-local" value="${datetimeLocal(job.scheduled_at)}"></label><label>Монтажник<input id="installEditInstaller" value="${esc(job.installer_name || '')}"></label><label>Телефон монтажника<input id="installEditInstallerPhone" value="${esc(job.installer_phone || '')}"></label><label class="wide">Адрес / место монтажа<input id="installEditAddress" value="${esc(job.address || order?.installation_address || data.install_place || '')}"></label><label>Фото места / до<input id="installEditBeforePhoto" value="${esc(job.before_photo_url || data.place_photo_link || '')}" placeholder="https://..."></label><label>Фото результата / после<input id="installEditAfterPhoto" value="${esc(job.after_photo_url || '')}" placeholder="https://..."></label><label class="wide">Техническое задание<textarea id="installEditTask">${esc(job.technical_task || '')}</textarea></label><label class="wide">Необходимый инструмент<textarea id="installEditTools">${esc(job.tools_required || '')}</textarea></label><label class="wide">Комментарий монтажнику<textarea id="installEditInstallerComment">${esc(job.installer_comment || '')}</textarea></label><label class="wide">Внутренний комментарий<textarea id="installEditInternalComment">${esc(job.internal_comment || '')}</textarea></label></div><div class="v4-install-actions"><button type="button" class="v4-primary" data-save-installation-job="${esc(job.id)}">Сохранить монтаж</button></div></section><section class="v4-install-section"><h3>Данные для монтажа</h3><div class="v4-install-row"><b>Объект / заказ</b><p>${esc(order?.project_name || '—')}</p></div><div class="v4-install-row"><b>Адрес / место</b><p>${esc(job.address || order?.installation_address || data.install_place || '—')}</p></div><div class="v4-install-row"><b>Связанное производство</b><p>${production ? `${esc(production.title || 'Производство')} · ${esc(production.production_status || '—')}` : 'Не связано'}</p></div><div class="v4-install-row"><b>Макет / файл</b><p>${production?.file_url || order?.layout_link ? `<a class="v4-install-link" href="${esc(production?.file_url || order?.layout_link)}" target="_blank" rel="noopener">Открыть файл</a>` : 'Ссылка не указана'}</p></div><div class="v4-install-row"><b>Фото места</b><p>${job.before_photo_url || data.place_photo_link ? `<a class="v4-install-link" href="${esc(job.before_photo_url || data.place_photo_link)}" target="_blank" rel="noopener">Открыть фото места</a>` : 'Ссылка не указана'}</p></div><div class="v4-install-row"><b>Фото результата</b><p>${job.after_photo_url ? `<a class="v4-install-link" href="${esc(job.after_photo_url)}" target="_blank" rel="noopener">Открыть фото результата</a>` : 'Ссылка не указана'}</p></div></section></div><section class="v4-install-section"><h3>Состав монтажа</h3>${renderItems(items)}</section><div class="v4-install-columns"><section class="v4-install-section"><h3>Комментарии</h3>${renderComments(comments)}<div class="v4-install-form" style="margin-top:10px"><textarea id="installNewComment" placeholder="Добавить комментарий по монтажу"></textarea><button type="button" data-add-installation-comment="${esc(job.id)}">Добавить комментарий</button></div></section><section class="v4-install-section"><h3>История монтажа</h3>${renderEvents(events)}</section></div></div></div>`;
}
async function openInstallationCard(jobId) {
  if (!jobId || busy) return;
  currentJobId = jobId;
  busy = true;
  ensureStyles();
  loading();
  try {
    const bundle = await fetchBundle(jobId);
    renderCard(bundle);
  } catch (error) {
    errorBox(friendlyError(error));
  } finally {
    busy = false;
  }
}
function value(id) { return document.getElementById(id)?.value?.trim() || ''; }
async function saveInstallation(jobId) {
  if (busy) return;
  busy = true;
  try {
    const old = currentBundle?.job || (await fetchBundle(jobId)).job;
    const status = value('installEditStatus') || old.install_status || 'Нужно назначить';
    const scheduledRaw = value('installEditScheduled');
    const patch = {
      title: value('installEditTitle') || old.title,
      install_status: status,
      priority: value('installEditPriority') || old.priority,
      installer_name: value('installEditInstaller') || null,
      installer_phone: value('installEditInstallerPhone') || null,
      address: value('installEditAddress') || null,
      scheduled_at: scheduledRaw ? new Date(scheduledRaw).toISOString() : null,
      before_photo_url: value('installEditBeforePhoto') || null,
      after_photo_url: value('installEditAfterPhoto') || null,
      technical_task: value('installEditTask') || null,
      tools_required: value('installEditTools') || null,
      installer_comment: value('installEditInstallerComment') || null,
      internal_comment: value('installEditInternalComment') || null,
      updated_by: v4State.user?.id || null,
      updated_at: nowIso()
    };
    if (status === 'В работе') patch.started_at = old.started_at || nowIso();
    if (status === 'Выполнен') patch.completed_at = old.completed_at || nowIso();
    const response = await supabaseClient.from('leader_installation_jobs').update(patch).eq('id', jobId).select('*').single();
    if (response.error) throw response.error;
    await Promise.all([
      supabaseClient.from('leader_installation_events').insert({ job_id: jobId, order_id: old.order_id, event_type: 'Обновление монтажа', old_status: old.install_status, new_status: status, body: 'Монтажное задание обновлено из карточки монтажа', created_by: v4State.user?.id || null }),
      old.order_id ? supabaseClient.from('leader_orders').update({ installation_status: status, installation_address: patch.address, installation_scheduled_at: patch.scheduled_at, installer_name: patch.installer_name, installer_phone: patch.installer_phone, current_stage: `Монтаж: ${status}`, updated_at: nowIso(), stage_updated_at: nowIso() }).eq('id', old.order_id) : Promise.resolve()
    ]);
    toast('Монтажное задание сохранено');
    setStatus('Монтажное задание сохранено', 'good');
    await openInstallationCard(jobId);
  } catch (error) {
    toast(friendlyError(error));
    setStatus(`Ошибка монтажа: ${friendlyError(error)}`, 'error');
  } finally {
    busy = false;
  }
}
async function addComment(jobId) {
  const body = value('installNewComment');
  if (!body || busy) return;
  busy = true;
  try {
    const response = await supabaseClient.from('leader_installation_comments').insert({ job_id: jobId, comment_type: 'internal', body, created_by: v4State.user?.id || null }).select('*').single();
    if (response.error) throw response.error;
    toast('Комментарий добавлен');
    await openInstallationCard(jobId);
  } catch (error) {
    toast(friendlyError(error));
  } finally {
    busy = false;
  }
}
function printHtml(bundle) {
  const { job, order, production, items } = bundle;
  const data = order?.data && typeof order.data === 'object' ? order.data : {};
  const rows = items.length ? items.map((item, index) => `<tr><td>${index + 1}</td><td>${esc(item.name || '')}</td><td>${Number(item.qty || 0).toLocaleString('ru-RU')} ${esc(item.unit || '')}</td><td>${item.width || item.height ? `${esc(item.width || '—')}×${esc(item.height || '—')}` : '—'}</td><td>${esc(item.comment || '')}</td></tr>`).join('') : '<tr><td colspan="5">Позиции монтажа не добавлены</td></tr>';
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Монтажный лист</title><style>@page{size:A4;margin:12mm}body{font-family:Arial,sans-serif;color:#111827}h1{font-size:22px;margin:0 0 6px}h2{font-size:16px;margin:18px 0 8px}.muted{color:#64748b}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}.box{border:1px solid #cbd5e1;border-radius:10px;padding:9px}.box span{display:block;font-size:11px;color:#64748b;text-transform:uppercase;font-weight:700}.box b{display:block;margin-top:4px}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #cbd5e1;padding:7px;text-align:left;vertical-align:top}th{background:#f1f5f9}.notice{border:2px solid #86efac;background:#ecfdf5;color:#065f46;border-radius:10px;padding:10px;margin:12px 0;font-weight:700}.sign{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:30px}.line{border-top:1px solid #111827;padding-top:6px}</style></head><body><p class="muted">РА «Лидер» · Монтажный лист · ${new Date().toLocaleString('ru-RU')}</p><h1>${esc(job.title || order?.project_name || 'Монтажное задание')}</h1><div class="notice">Лист для монтажа. Не содержит имя, телефон и контакты клиента.</div><div class="grid"><div class="box"><span>Заказ</span><b>№${esc(order?.order_number || String(job.order_id || '').slice(0, 8))}</b></div><div class="box"><span>Статус</span><b>${esc(job.install_status || '—')}</b></div><div class="box"><span>Дата и время</span><b>${dateTimeRu(job.scheduled_at)}</b></div><div class="box"><span>Монтажник</span><b>${esc(job.installer_name || 'не назначен')}</b></div><div class="box"><span>Адрес / место</span><b>${esc(job.address || order?.installation_address || data.install_place || '—')}</b></div><div class="box"><span>Связанное производство</span><b>${esc(production?.title || '—')}</b></div></div><h2>Файлы и фото</h2><p><b>Макет:</b> ${esc(production?.file_url || order?.layout_link || 'не указан')}</p><p><b>Фото места:</b> ${esc(job.before_photo_url || data.place_photo_link || 'не указано')}</p><p><b>Фото результата:</b> ${esc(job.after_photo_url || 'не указано')}</p><h2>Техническое задание</h2><div class="box">${esc(job.technical_task || 'ТЗ не заполнено')}</div><h2>Инструмент</h2><div class="box">${esc(job.tools_required || 'Не указан')}</div><h2>Состав монтажа</h2><table><thead><tr><th>№</th><th>Позиция</th><th>Кол-во</th><th>Размер</th><th>Комментарий</th></tr></thead><tbody>${rows}</tbody></table><h2>Комментарии</h2><div class="box"><p><b>Монтажнику:</b> ${esc(job.installer_comment || '—')}</p><p><b>Внутреннее:</b> ${esc(job.internal_comment || '—')}</p></div><div class="sign"><div class="line">Передал</div><div class="line">Монтаж выполнен / принял</div></div><script>window.print();<\/script></body></html>`;
}
async function printInstallation(jobId) {
  try {
    const bundle = currentBundle?.job?.id === jobId ? currentBundle : await fetchBundle(jobId);
    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (!win) throw new Error('Браузер заблокировал окно печати');
    win.document.open();
    win.document.write(printHtml(bundle));
    win.document.close();
  } catch (error) {
    toast(friendlyError(error));
  }
}
function enhanceBoardButtons() {
  document.querySelectorAll('[data-board-install-status]').forEach((button) => {
    const actions = button.closest('.v4-production-card-actions');
    const id = button.dataset.boardInstallStatus;
    if (!actions || !id || actions.querySelector(`[data-open-installation-job-card="${CSS.escape(id)}"]`)) return;
    actions.insertAdjacentHTML('afterbegin', `<button type="button" data-open-installation-job-card="${esc(id)}">Карточка</button><button type="button" data-print-installation-job="${esc(id)}">Печать</button>`);
  });
}
function boot() {
  if (booted) return;
  booted = true;
  ensureStyles();
  document.addEventListener('click', (event) => {
    const open = event.target.closest?.('[data-open-installation-job-card]');
    if (open) { event.preventDefault(); event.stopPropagation(); openInstallationCard(open.dataset.openInstallationJobCard); return; }
    const close = event.target.closest?.('[data-installation-job-close]');
    if (close) closeCard();
    const save = event.target.closest?.('[data-save-installation-job]');
    if (save) { event.preventDefault(); event.stopPropagation(); saveInstallation(save.dataset.saveInstallationJob); return; }
    const comment = event.target.closest?.('[data-add-installation-comment]');
    if (comment) { event.preventDefault(); event.stopPropagation(); addComment(comment.dataset.addInstallationComment); return; }
    const print = event.target.closest?.('[data-print-installation-job]');
    if (print) { event.preventDefault(); event.stopPropagation(); printInstallation(print.dataset.printInstallationJob); }
  }, true);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeCard(); });
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-v4-tab-button="production"],[data-v4-list-refresh="production"],[data-production-board-kind],[data-board-install-status]')) setTimeout(enhanceBoardButtons, 900);
  });
  const observer = new MutationObserver(() => enhanceBoardButtons());
  observer.observe(document.body, { childList: true, subtree: true });
  enhanceBoardButtons();
}
boot();
