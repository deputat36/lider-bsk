import { V4_CONFIG } from './config.js';
import { supabaseClient } from './supabase-client.js';
import {
  installationStatusSelectOptions,
  installationStatusUiModel,
  validateInstallationStatusTransition
} from './installation-status-ui-model-v1.js';
import {
  createInstallationJobIdempotencyKey,
  installationJobPersistenceRoute
} from './installation-job-save-route-v1.js';
import {
  invokeStagingInstallationJob,
  invokeStagingInstallationJobRead
} from './installation-job-staging-transport-v1.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const route = installationJobPersistenceRoute(V4_CONFIG.supabaseUrl);

let currentBundle = null;
let busy = false;
let pendingSave = null;

function text(value) { return String(value ?? '').trim(); }
function esc(value) { return String(value ?? '').replace(/[&<>\"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[m])); }
function dateRu(value) { if (!value) return '—'; const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleString('ru-RU') : String(value); }
function localDateTime(value) { if (!value) return ''; const date = new Date(value); if (!Number.isFinite(date.getTime())) return ''; return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function field(id) { return document.getElementById(id)?.value?.trim() || ''; }
function validJobId(value) { return UUID_PATTERN.test(text(value)); }

function notify(message, kind = 'info') {
  const status = document.getElementById('stagingInstallationCardStatus');
  if (status) {
    status.textContent = message;
    status.dataset.kind = kind;
  }
  document.dispatchEvent(new CustomEvent('leader-v4:staging-installation-status', {
    detail: { message, kind }
  }));
}

function host() {
  let element = document.getElementById('stagingInstallationCardHost');
  if (!element) {
    element = document.createElement('div');
    element.id = 'stagingInstallationCardHost';
    document.body.appendChild(element);
  }
  return element;
}

function closeCard() {
  currentBundle = null;
  pendingSave = null;
  busy = false;
  host().innerHTML = '';
}

function loading() {
  host().innerHTML = '<section class="staging-install-card"><div class="staging-install-head"><div><span class="staging-badge">STAGING</span><h2>Монтажное задание</h2><p>Загрузка через защищённый Edge…</p></div><button type="button" data-staging-install-close>Закрыть</button></div></section>';
}

function errorBox(message) {
  host().innerHTML = `<section class="staging-install-card"><div class="staging-install-head"><div><span class="staging-badge">STAGING</span><h2>Монтажное задание</h2><p>Не удалось открыть карточку</p></div><button type="button" data-staging-install-close>Закрыть</button></div><div class="staging-install-alert is-error">${esc(message)}</div></section>`;
}

function renderStatusOptions(value) {
  return installationStatusSelectOptions(value)
    .map((item) => `<option value="${esc(item.value)}"${item.current ? ' selected' : ''}>${esc(item.label)}</option>`)
    .join('');
}

function renderStatusNotice(value) {
  const model = installationStatusUiModel(value);
  if (!model.known) return `<div class="staging-install-alert is-warn">${esc(model.warning)}</div>`;
  if (model.original === null) return '<div class="staging-install-alert">Исходный статус в базе — NULL. Выберите допустимый новый статус.</div>';
  if (model.legacy) return `<div class="staging-install-alert">Legacy-статус «${esc(model.raw)}» будет сохранён без изменения, пока не выбран canonical статус.</div>`;
  if (model.terminal) return '<div class="staging-install-alert">Статус завершён. Новые переходы серверным registry не предусмотрены.</div>';
  return '';
}

function renderItems(items) {
  if (!items.length) return '<div class="staging-install-empty">Позиции монтажа не добавлены.</div>';
  return items.map((item) => `<article class="staging-install-row"><b>${esc(item.name || 'Позиция')}</b><p>${Number(item.qty || 0).toLocaleString('ru-RU')} ${esc(item.unit || 'шт')} · ${item.width || item.height ? `${esc(item.width || '—')}×${esc(item.height || '—')}` : 'размер не указан'}</p>${item.comment ? `<small>${esc(item.comment)}</small>` : ''}</article>`).join('');
}

function renderHistory(rows, emptyText) {
  if (!rows.length) return `<div class="staging-install-empty">${esc(emptyText)}</div>`;
  return rows.map((row) => `<article class="staging-install-row"><b>${esc(row.event_type || row.comment_type || 'Событие')}</b><p>${esc(row.body || `${row.old_status || '—'} → ${row.new_status || '—'}`)}</p><small>${dateRu(row.created_at)}</small></article>`).join('');
}

function bundleFromRead(data) {
  return Object.freeze({
    job: data.entity || {},
    order: data.order || null,
    production: data.production || null,
    items: Array.isArray(data.items) ? data.items : [],
    events: Array.isArray(data.events) ? data.events : [],
    comments: Array.isArray(data.comments) ? data.comments : [],
    capabilities: data.capabilities || { can_read: false, can_write: false }
  });
}

function renderCard(bundle) {
  currentBundle = bundle;
  const { job, order, production, items, events, comments, capabilities } = bundle;
  const statusModel = installationStatusUiModel(job.install_status);
  const statusDisplay = statusModel.original === null ? 'Не назначен (raw: NULL)' : (statusModel.known && statusModel.legacy ? `${statusModel.raw} (legacy: ${statusModel.label})` : statusModel.raw);
  const canWrite = capabilities?.can_write === true;
  const saveButton = canWrite
    ? `<button type="button" class="staging-primary" data-staging-install-save="${esc(job.id)}">Сохранить в staging</button>`
    : '<button type="button" disabled>Только просмотр</button>';

  host().innerHTML = `<section class="staging-install-card"><div class="staging-install-head"><div><span class="staging-badge">STAGING · EDGE</span><h2>${esc(job.title || order?.project_name || 'Монтаж')}</h2><p>Заказ №${esc(order?.order_number || String(job.order_id || '').slice(0, 8))}. Клиентские контакты, финансы и внутренние комментарии исключены сервером.</p></div><button type="button" data-staging-install-close>Закрыть</button></div><div id="stagingInstallationCardStatus" class="staging-install-alert" data-kind="info">${esc(route.description)}</div><div class="staging-install-grid"><div><span>Статус</span><b>${esc(statusDisplay)}</b></div><div><span>Дата</span><b>${dateRu(job.scheduled_at)}</b></div><div><span>Монтажник</span><b>${esc(job.installer_name || 'Не назначен')}</b></div><div><span>Адрес</span><b>${esc(job.address || order?.installation_address || '—')}</b></div><div><span>Позиции</span><b>${items.length}</b></div><div><span>Право записи</span><b>${canWrite ? 'Разрешено сервером' : 'Нет'}</b></div></div><div class="staging-install-actions">${saveButton}<button type="button" data-staging-install-print="${esc(job.id)}">Печать листа</button><button type="button" data-staging-install-reload="${esc(job.id)}">Перечитать</button><button type="button" data-staging-install-close>Закрыть</button></div><div class="staging-install-columns"><section class="staging-install-section"><h3>Редактирование</h3><div class="staging-install-form"><label>Название<input id="stagingInstallTitle" value="${esc(job.title || '')}"${canWrite ? '' : ' disabled'}></label><label>Статус<select id="stagingInstallStatus"${canWrite ? '' : ' disabled'}>${renderStatusOptions(job.install_status)}</select>${renderStatusNotice(job.install_status)}</label><label>Дата<input id="stagingInstallScheduled" type="datetime-local" value="${localDateTime(job.scheduled_at)}"${canWrite ? '' : ' disabled'}></label><label>Монтажник<input id="stagingInstallInstaller" value="${esc(job.installer_name || '')}"${canWrite ? '' : ' disabled'}></label><label>Телефон монтажника<input id="stagingInstallInstallerPhone" value="${esc(job.installer_phone || '')}"${canWrite ? '' : ' disabled'}></label><label class="wide">Адрес<input id="stagingInstallAddress" value="${esc(job.address || order?.installation_address || '')}"${canWrite ? '' : ' disabled'}></label><label>Фото места<input id="stagingInstallBefore" value="${esc(job.before_photo_url || '')}"${canWrite ? '' : ' disabled'}></label><label>Фото результата<input id="stagingInstallAfter" value="${esc(job.after_photo_url || '')}"${canWrite ? '' : ' disabled'}></label><label class="wide">ТЗ<textarea id="stagingInstallTask"${canWrite ? '' : ' disabled'}>${esc(job.technical_task || '')}</textarea></label><label class="wide">Инструмент<textarea id="stagingInstallTools"${canWrite ? '' : ' disabled'}>${esc(job.tools_required || '')}</textarea></label><label class="wide">Комментарий монтажнику<textarea id="stagingInstallComment"${canWrite ? '' : ' disabled'}>${esc(job.installer_comment || '')}</textarea></label></div></section><section class="staging-install-section"><h3>Данные для монтажа</h3><article class="staging-install-row"><b>Производство</b><p>${production ? `${esc(production.title || 'Производство')} · ${esc(production.production_status || '—')}` : 'Не связано'}</p></article><article class="staging-install-row"><b>Макет</b><p>${esc(production?.file_url || order?.layout_link || 'Ссылка не указана')}</p></article><article class="staging-install-row"><b>Фото места</b><p>${esc(job.before_photo_url || 'Ссылка не указана')}</p></article></section></div><section class="staging-install-section"><h3>Состав монтажа</h3>${renderItems(items)}</section><div class="staging-install-columns"><section class="staging-install-section"><h3>Безопасные комментарии</h3>${renderHistory(comments, 'Доступных комментариев пока нет.')}<div class="staging-install-alert">Внутренние комментарии не читаются и не создаются этой страницей.</div></section><section class="staging-install-section"><h3>История</h3>${renderHistory(events, 'Истории пока нет.')}</section></div></section>`;
}

async function readBundle(jobId) {
  const result = await invokeStagingInstallationJobRead({
    client: supabaseClient,
    supabaseUrl: V4_CONFIG.supabaseUrl,
    jobId
  });
  if (!result.ok) {
    const error = new Error(result.message);
    error.code = result.code;
    throw error;
  }
  return bundleFromRead(result.data);
}

export async function openStagingInstallationJobCard(jobId) {
  if (route.mode !== 'staging_edge') throw new Error('staging_installation_page_required');
  if (!validJobId(jobId)) throw new Error('job_id_invalid');
  if (busy) return;
  busy = true;
  loading();
  try {
    renderCard(await readBundle(jobId));
    notify('Карточка загружена через защищённый staging Edge.', 'good');
  } catch (error) {
    errorBox(error?.message || 'Не удалось загрузить монтажное задание');
    notify(error?.message || 'Ошибка чтения', 'error');
  } finally {
    busy = false;
  }
}

function formPatch(old) {
  const selectedStatus = field('stagingInstallStatus') || (old.install_status || 'Не назначен');
  const transition = validateInstallationStatusTransition(old.install_status, selectedStatus);
  if (!transition.ok) throw new Error('Выбран недопустимый переход статуса');
  const scheduledRaw = field('stagingInstallScheduled');
  return Object.freeze({
    title: field('stagingInstallTitle') || old.title,
    install_status: transition.storedValue,
    installer_name: field('stagingInstallInstaller') || null,
    installer_phone: field('stagingInstallInstallerPhone') || null,
    address: field('stagingInstallAddress') || null,
    scheduled_at: scheduledRaw ? new Date(scheduledRaw).toISOString() : null,
    before_photo_url: field('stagingInstallBefore') || null,
    after_photo_url: field('stagingInstallAfter') || null,
    technical_task: field('stagingInstallTask') || null,
    tools_required: field('stagingInstallTools') || null,
    installer_comment: field('stagingInstallComment') || null
  });
}

function saveKey(job, patch) {
  const signature = JSON.stringify([job.id, job.updated_at, patch]);
  if (pendingSave?.signature === signature) return pendingSave.key;
  const key = createInstallationJobIdempotencyKey(job.id);
  pendingSave = { signature, key };
  return key;
}

async function saveJob(jobId) {
  if (busy || currentBundle?.job?.id !== jobId) return;
  if (currentBundle.capabilities?.can_write !== true) {
    notify('Сервер не разрешил изменение этого монтажного задания.', 'error');
    return;
  }
  busy = true;
  try {
    const old = currentBundle.job;
    const patch = formPatch(old);
    notify('Сохраняю одной атомарной командой…', 'info');
    const result = await invokeStagingInstallationJob({
      client: supabaseClient,
      supabaseUrl: V4_CONFIG.supabaseUrl,
      canWrite: true,
      job: old,
      patch,
      expectedUpdatedAt: old.updated_at,
      idempotencyKey: saveKey(old, patch),
      readAfterSuccess: async () => await readBundle(jobId)
    });
    if (!result.ok) {
      if (!['network_error', 'persistence_failed'].includes(result.kind)) pendingSave = null;
      throw new Error(result.message);
    }
    pendingSave = null;
    renderCard(result.refreshed || await readBundle(jobId));
    notify(result.message, 'good');
    document.dispatchEvent(new CustomEvent('leader-v4-order-updated', {
      detail: { order: result.data?.order || null, source: 'staging_installation_edge' }
    }));
  } catch (error) {
    notify(error?.message || 'Ошибка сохранения', 'error');
  } finally {
    busy = false;
  }
}

async function printJob(jobId) {
  try {
    const bundle = currentBundle?.job?.id === jobId ? currentBundle : await readBundle(jobId);
    const { job, order, production, items } = bundle;
    const rows = items.length ? items.map((item, index) => `<tr><td>${index + 1}</td><td>${esc(item.name || '')}</td><td>${Number(item.qty || 0).toLocaleString('ru-RU')} ${esc(item.unit || '')}</td><td>${item.width || item.height ? `${esc(item.width || '—')}×${esc(item.height || '—')}` : '—'}</td><td>${esc(item.comment || '')}</td></tr>`).join('') : '<tr><td colspan="5">Позиции монтажа не добавлены</td></tr>';
    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (!win) throw new Error('Браузер заблокировал окно печати');
    win.document.open();
    win.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Монтажный лист STAGING</title><style>@page{size:A4;margin:12mm}body{font-family:Arial,sans-serif;color:#111827}h1{font-size:22px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #cbd5e1;padding:7px;text-align:left}.notice{border:2px solid #f59e0b;background:#fffbeb;color:#92400e;border-radius:10px;padding:10px;margin:12px 0;font-weight:700}</style></head><body><p>РА «Лидер» · STAGING · ${new Date().toLocaleString('ru-RU')}</p><h1>${esc(job.title || order?.project_name || 'Монтажное задание')}</h1><div class="notice">Тестовый монтажный лист. Клиентские контакты и финансы исключены.</div><p><b>Заказ:</b> №${esc(order?.order_number || String(job.order_id || '').slice(0, 8))}</p><p><b>Статус:</b> ${esc(job.install_status || '—')} · <b>Дата:</b> ${dateRu(job.scheduled_at)}</p><p><b>Адрес:</b> ${esc(job.address || order?.installation_address || '—')}</p><p><b>Макет:</b> ${esc(production?.file_url || order?.layout_link || 'не указан')}</p><p><b>ТЗ:</b> ${esc(job.technical_task || 'не заполнено')}</p><table><thead><tr><th>№</th><th>Позиция</th><th>Кол-во</th><th>Размер</th><th>Комментарий</th></tr></thead><tbody>${rows}</tbody></table><script>window.print();<\/script></body></html>`);
    win.document.close();
  } catch (error) {
    notify(error?.message || 'Не удалось подготовить печать', 'error');
  }
}

function boot() {
  document.addEventListener('click', (event) => {
    const close = event.target.closest?.('[data-staging-install-close]');
    if (close) { event.preventDefault(); closeCard(); return; }
    const save = event.target.closest?.('[data-staging-install-save]');
    if (save) { event.preventDefault(); saveJob(save.dataset.stagingInstallSave); return; }
    const reload = event.target.closest?.('[data-staging-install-reload]');
    if (reload) { event.preventDefault(); openStagingInstallationJobCard(reload.dataset.stagingInstallReload); return; }
    const print = event.target.closest?.('[data-staging-install-print]');
    if (print) { event.preventDefault(); printJob(print.dataset.stagingInstallPrint); }
  }, true);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeCard(); });
}

if (!window.LeaderV4StagingInstallationCardBooted) {
  window.LeaderV4StagingInstallationCardBooted = true;
  boot();
}
