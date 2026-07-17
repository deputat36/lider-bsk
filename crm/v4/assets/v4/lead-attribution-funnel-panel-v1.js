import { supabaseClient } from './supabase-client.js';
import { friendlyError } from './api.js';
import { v4State, setLeadFilters } from './state.js';
import { renderLeads } from './leads.js';
import { buildLeadAttributionFunnel } from './lead-attribution-funnel-model-v1.js';

const PANEL_ID = 'leadAttributionFunnelV1';
const STYLE_ID = 'leadAttributionFunnelV1Styles';
const CACHE_MS = 60000;
const CALCULATION_FIELDS = 'id,lead_id';
const OFFER_FIELDS = 'id,lead_id';
const ORDER_FIELDS = 'id,lead_id,client_total';

let busy = false;
let loadedAt = 0;
let snapshot = null;
let errorText = '';

function esc(value) {
  return String(value ?? '').replace(/[&<>\"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[char]));
}

function money(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${Math.round(parsed).toLocaleString('ru-RU')} ₽` : '—';
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `.lead-attribution-funnel{margin:14px 0;border:1px solid #bfdbfe;background:linear-gradient(180deg,#eff6ff 0%,#fff 100%);border-radius:18px;padding:14px;display:grid;gap:12px}.lead-attribution-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.lead-attribution-head h3{margin:0;color:#1e3a8a}.lead-attribution-head p{margin:5px 0 0;color:#475569}.lead-attribution-head button,.lead-attribution-filter{border:1px solid #bfdbfe;background:#fff;color:#1d4ed8;border-radius:11px;padding:8px 10px;font-weight:900;cursor:pointer}.lead-attribution-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px}.lead-attribution-stat{border:1px solid #dbeafe;background:#fff;border-radius:13px;padding:10px}.lead-attribution-stat span{display:block;color:#64748b;font-size:11px;font-weight:900;text-transform:uppercase}.lead-attribution-stat b{display:block;margin-top:4px;color:#172554;font-size:20px}.lead-attribution-coverage{border:1px dashed #93c5fd;background:#f8fbff;color:#1e3a8a;border-radius:13px;padding:10px;font-weight:800}.lead-attribution-table-wrap{overflow:auto;border:1px solid #dbeafe;border-radius:14px;background:#fff}.lead-attribution-table{width:100%;border-collapse:collapse;min-width:730px}.lead-attribution-table th,.lead-attribution-table td{padding:9px 10px;border-bottom:1px solid #e2e8f0;text-align:right;white-space:nowrap}.lead-attribution-table th{background:#eff6ff;color:#1e3a8a;font-size:11px;text-transform:uppercase}.lead-attribution-table th:first-child,.lead-attribution-table td:first-child{text-align:left;white-space:normal}.lead-attribution-table tbody tr:last-child td{border-bottom:0}.lead-attribution-filter{max-width:300px;text-align:left}.lead-attribution-note{color:#64748b;font-size:12px;font-weight:800}.lead-attribution-error{border:1px solid #fecaca;background:#fff1f2;color:#991b1b;border-radius:13px;padding:11px;font-weight:800}@media(max-width:640px){.lead-attribution-head{display:grid}.lead-attribution-head button{width:100%}.lead-attribution-stat b{font-size:18px}}`;
  document.head.appendChild(style);
}

function ensurePanel() {
  ensureStyles();
  const leadSection = document.getElementById('leadsSection');
  if (!leadSection) return null;
  let panel = document.getElementById(PANEL_ID);
  if (panel) return panel;
  panel = document.createElement('section');
  panel.id = PANEL_ID;
  panel.className = 'lead-attribution-funnel';
  panel.setAttribute('aria-label', 'Воронка заявок по источникам и страницам');
  const summary = document.getElementById('leadAnalyticsSummaryV1');
  if (summary) summary.insertAdjacentElement('afterend', panel);
  else leadSection.querySelector('.v4-lead-stats')?.insertAdjacentElement('afterend', panel);
  return panel;
}

function stat(label, value) {
  return `<div class="lead-attribution-stat"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
}

function funnelTable(title, rows, kind) {
  const visible = rows.slice(0, 12);
  if (!visible.length) return `<section><h4>${esc(title)}</h4><div class="v4-empty">Данных пока нет.</div></section>`;
  return `<section><h4>${esc(title)}</h4><div class="lead-attribution-table-wrap"><table class="lead-attribution-table"><thead><tr><th>${kind === 'source' ? 'Источник' : 'Страница / точка входа'}</th><th>Заявки</th><th>Расчёты</th><th>КП</th><th>Заказы</th><th>Конверсия</th><th>План. выручка</th></tr></thead><tbody>${visible.map((row) => `<tr><td><button type="button" class="lead-attribution-filter" data-lead-attribution-filter="${esc(row.label)}">${esc(row.label)}</button></td><td>${row.leads}</td><td>${row.calculations}</td><td>${row.offers}</td><td><b>${row.orders}</b></td><td>${row.orderConversionPercent}%</td><td>${esc(money(row.plannedRevenue))}</td></tr>`).join('')}</tbody></table></div></section>`;
}

function render() {
  const panel = ensurePanel();
  if (!panel) return;
  if (busy) {
    panel.innerHTML = '<div class="lead-attribution-coverage">Собираю связь заявок с расчётами, КП и заказами…</div>';
    return;
  }
  if (errorText) {
    panel.innerHTML = `<div class="lead-attribution-head"><div><h3>Что приносит заказы</h3><p>Read-only отчёт без изменения заявок и источников.</p></div><button type="button" data-lead-attribution-refresh>Повторить</button></div><div class="lead-attribution-error">${esc(errorText)}</div>`;
    return;
  }
  if (!snapshot) {
    panel.innerHTML = '<div class="lead-attribution-coverage">Отчёт появится после загрузки заявок.</div>';
    return;
  }

  const sampleWarning = snapshot.totalLeads < 30
    ? 'Выборка пока небольшая: используйте отчёт для контроля атрибуции, но не делайте окончательных выводов о каналах.'
    : 'Сравнивайте источники прежде всего по заказам и выручке, а не только по числу заявок.';
  panel.innerHTML = `
    <div class="lead-attribution-head"><div><h3>Что приносит заказы</h3><p>Заявка → расчёт → КП → заказ. Raw-источники в базе не переписываются.</p></div><button type="button" data-lead-attribution-refresh>Обновить</button></div>
    <div class="lead-attribution-stats">${stat('Заявки', snapshot.totalLeads)}${stat('С расчётом', snapshot.calculationLeads)}${stat('С КП', snapshot.offerLeads)}${stat('Дошли до заказа', snapshot.orderLeads)}${stat('Конверсия в заказ', `${snapshot.orderConversionPercent}%`)}${stat('План. выручка', money(snapshot.plannedRevenue))}</div>
    <div class="lead-attribution-coverage">Полнота новых данных: request_id — ${snapshot.coverage.requestId} из ${snapshot.totalLeads}; страница / точка входа — ${snapshot.coverage.pageReference} из ${snapshot.totalLeads}; UTM source — ${snapshot.coverage.utmSource} из ${snapshot.totalLeads}.</div>
    ${funnelTable('По нормализованным источникам', snapshot.bySource, 'source')}
    ${funnelTable('По страницам и точкам входа', snapshot.byPage, 'page')}
    <div class="lead-attribution-note">${esc(sampleWarning)} Показатель выручки плановый: фактическую прибыль нельзя считать достоверной, пока расходы по заказам не заполнены.</div>`;
}

async function readRows(table, fields) {
  const response = await supabaseClient.from(table).select(fields).limit(1000);
  if (response.error) throw response.error;
  return response.data || [];
}

async function load(force = false) {
  if (!v4State.crmReady || !v4State.leadsLoaded || busy) return;
  if (!force && snapshot && Date.now() - loadedAt < CACHE_MS) {
    render();
    return;
  }
  busy = true;
  errorText = '';
  render();
  try {
    const [calculations, offers, orders] = await Promise.all([
      readRows('leader_lead_calculations', CALCULATION_FIELDS),
      readRows('leader_commercial_offers', OFFER_FIELDS),
      readRows('leader_orders', ORDER_FIELDS),
    ]);
    snapshot = buildLeadAttributionFunnel(v4State.leads || [], calculations, offers, orders);
    loadedAt = Date.now();
  } catch (error) {
    errorText = friendlyError(error) || 'Не удалось загрузить этапы воронки. Проверьте доступ и повторите.';
  } finally {
    busy = false;
    render();
  }
}

function applyFilter(value) {
  const query = String(value || '').trim();
  if (!query) return;
  const input = document.getElementById('leadSearch');
  if (input) input.value = query;
  setLeadFilters({ search: query });
  renderLeads();
}

function boot() {
  ensurePanel();
  render();
  document.addEventListener('leader-v4:leads-loaded', () => load(true));
  document.addEventListener('leader-v4:crm-ready', () => { if (v4State.leadsLoaded) load(false); });
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-lead-attribution-refresh]')) {
      event.preventDefault();
      load(true);
      return;
    }
    const filter = event.target.closest?.('[data-lead-attribution-filter]');
    if (filter) {
      event.preventDefault();
      applyFilter(filter.dataset.leadAttributionFilter);
    }
  });
  if (v4State.crmReady && v4State.leadsLoaded) load(false);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
