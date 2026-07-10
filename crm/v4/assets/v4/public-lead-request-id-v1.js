import { supabaseClient } from './supabase-client.js';
import { v4State } from './state.js';

const metaCache = new Map();
let listLoadPromise = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function selectorId(value) {
  const text = String(value || '');
  if (window.CSS?.escape) return window.CSS.escape(text);
  return text.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

async function readMeta(ids) {
  const uniqueIds = [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const missing = uniqueIds.filter((id) => !metaCache.has(id));
  if (!missing.length) return uniqueIds.map((id) => metaCache.get(id)).filter(Boolean);

  const response = await supabaseClient
    .from('leader_leads')
    .select('id,request_id,source_page_path,phone_normalized,submitted_at')
    .in('id', missing);

  if (response.error) throw response.error;
  (response.data || []).forEach((row) => metaCache.set(String(row.id), row));
  missing.forEach((id) => { if (!metaCache.has(id)) metaCache.set(id, { id }); });
  return uniqueIds.map((id) => metaCache.get(id)).filter(Boolean);
}

function ensureStyles() {
  if (document.getElementById('publicLeadRequestIdStylesV1')) return;
  const style = document.createElement('style');
  style.id = 'publicLeadRequestIdStylesV1';
  style.textContent = `.v4-public-request-id{display:inline-flex;align-items:center;gap:6px;border:1px solid #a5b4fc;background:#eef2ff;color:#3730a3;border-radius:999px;padding:5px 8px;font:800 12px/1.2 Arial,sans-serif}.v4-public-request-id code{font:800 11px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace}.v4-public-request-id button{border:0;background:transparent;color:inherit;font:900 11px/1 Arial,sans-serif;padding:0;cursor:pointer;text-decoration:underline}.v4-public-request-meta{border:1px solid #c7d2fe!important;background:#eef2ff!important}.v4-public-request-meta code{word-break:break-all}`;
  document.head.appendChild(style);
}

function renderListMeta(meta) {
  if (!meta?.id || !meta.request_id) return;
  const card = document.querySelector(`.v4-lead-card[data-id="${selectorId(meta.id)}"]`);
  if (!card || card.querySelector('[data-public-request-id-badge]')) return;
  let hints = card.querySelector('.v4-lead-inline-hints');
  if (!hints) {
    hints = document.createElement('div');
    hints.className = 'v4-lead-inline-hints';
    card.querySelector('.v4-lead-title-row')?.insertAdjacentElement('afterend', hints);
  }
  const badge = document.createElement('span');
  badge.className = 'v4-public-request-id';
  badge.dataset.publicRequestIdBadge = '1';
  badge.title = meta.source_page_path || 'Публичная заявка';
  badge.innerHTML = `ID: <code>${esc(meta.request_id)}</code> <button type="button" data-copy-public-request-id="${esc(meta.request_id)}">копировать</button>`;
  hints.appendChild(badge);
}

async function hydrateLeadList(leads) {
  ensureStyles();
  const ids = (leads || []).map((lead) => lead?.id).filter(Boolean);
  if (!ids.length) return;
  if (listLoadPromise) return listLoadPromise;
  listLoadPromise = readMeta(ids)
    .then((rows) => rows.forEach(renderListMeta))
    .catch((error) => console.warn('public_lead_request_id_list_failed', error))
    .finally(() => { listLoadPromise = null; });
  return listLoadPromise;
}

function appendDetail(grid, label, value, html = false) {
  if (!grid || !value) return;
  const box = document.createElement('div');
  box.className = 'v4-public-request-meta';
  box.innerHTML = `<dt>${esc(label)}</dt><dd>${html ? value : esc(value)}</dd>`;
  grid.appendChild(box);
}

async function hydrateLeadCard(lead) {
  ensureStyles();
  const id = lead?.id;
  if (!id) return;
  try {
    const meta = (await readMeta([id]))[0];
    if (!meta?.request_id) return;
    const view = document.querySelector('.v4-lead-card-view');
    const grid = view?.querySelector('.v4-detail-grid');
    if (!grid || grid.querySelector('[data-public-request-id-detail]')) return;

    const box = document.createElement('div');
    box.className = 'v4-public-request-meta';
    box.dataset.publicRequestIdDetail = '1';
    box.innerHTML = `<dt>Номер обращения</dt><dd><code>${esc(meta.request_id)}</code> <button type="button" data-copy-public-request-id="${esc(meta.request_id)}">Скопировать</button></dd>`;
    grid.appendChild(box);
    appendDetail(grid, 'Страница источника', meta.source_page_path || '—');
    appendDetail(grid, 'Телефон нормализован', meta.phone_normalized || '—');
    appendDetail(grid, 'Отправлено с сайта', meta.submitted_at ? new Date(meta.submitted_at).toLocaleString('ru-RU') : '—');
  } catch (error) {
    console.warn('public_lead_request_id_card_failed', error);
  }
}

async function copyRequestId(value, button) {
  const text = String(value || '').trim();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    const previous = button?.textContent || 'Скопировать';
    if (button) button.textContent = 'Скопировано';
    setTimeout(() => { if (button) button.textContent = previous; }, 1400);
  } catch (_) {
    window.prompt('Скопируйте номер обращения:', text);
  }
}

function boot() {
  ensureStyles();
  document.addEventListener('leader-v4:leads-loaded', (event) => hydrateLeadList(event.detail?.leads || []));
  document.addEventListener('leader-v4:lead-card-rendered', (event) => hydrateLeadCard(event.detail?.lead));
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-copy-public-request-id]');
    if (!button) return;
    event.preventDefault();
    copyRequestId(button.dataset.copyPublicRequestId, button);
  });

  setTimeout(() => {
    hydrateLeadList(v4State.leads || []);
    hydrateLeadCard(v4State.currentLead || null);
  }, 500);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
