import { v4State, subscribeState } from './state.js';
import { setLeadFilters } from './state.js';
import { renderLeads } from './leads.js';
import { deriveLeadAnalytics } from './lead-analytics-normalization.js';

const SUMMARY_ID = 'leadAnalyticsSummaryV1';
const STYLE_ID = 'leadAnalyticsSummaryV1Styles';

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function countBy(items, getKey) {
  const map = new Map();
  items.forEach((item) => {
    const key = getKey(item) || 'Не указано';
    map.set(key, (map.get(key) || 0) + 1);
  });
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'));
}

function renderPills(rows, activeSearch) {
  if (!rows.length) return '<span class="lead-analytics-summary-empty">Нет данных</span>';
  const normalizedActive = String(activeSearch || '').trim().toLowerCase();
  return rows
    .slice(0, 8)
    .map(([label, count]) => {
      const isActive = String(label).toLowerCase() === normalizedActive;
      return `<button type="button" class="lead-analytics-summary-pill${isActive ? ' is-active' : ''}" data-lead-analytics-search="${esc(label)}" aria-pressed="${isActive ? 'true' : 'false'}"><b>${esc(count)}</b> ${esc(label)}</button>`;
    })
    .join('');
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `.lead-analytics-summary{margin:12px 0 14px;border:1px solid #dbeafe;background:#f8fafc;border-radius:16px;padding:12px;display:grid;gap:10px}.lead-analytics-summary-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.lead-analytics-summary h3{margin:0;color:#0f172a;font-size:15px}.lead-analytics-summary small{color:#64748b;font-weight:800}.lead-analytics-summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.lead-analytics-summary-box{border:1px solid #e2e8f0;background:#fff;border-radius:14px;padding:10px}.lead-analytics-summary-box strong{display:block;margin-bottom:8px;color:#1d4ed8}.lead-analytics-summary-pills{display:flex;flex-wrap:wrap;gap:6px}.lead-analytics-summary-pill,.lead-analytics-summary-clear{appearance:none;display:inline-flex;gap:5px;align-items:center;border-radius:999px;background:#eef2ff;border:1px solid #c7d2fe;color:#3730a3;padding:5px 8px;font-size:12px;font-weight:900;cursor:pointer}.lead-analytics-summary-pill:hover,.lead-analytics-summary-pill:focus,.lead-analytics-summary-clear:hover,.lead-analytics-summary-clear:focus{background:#dbeafe;border-color:#93c5fd;outline:none}.lead-analytics-summary-pill.is-active{background:#1d4ed8;border-color:#1d4ed8;color:#fff}.lead-analytics-summary-clear{background:#fff;color:#475569;border-color:#cbd5e1;white-space:nowrap}.lead-analytics-summary-empty{color:#64748b;font-weight:800}@media(max-width:720px){.lead-analytics-summary-grid{grid-template-columns:1fr}.lead-analytics-summary-head{align-items:stretch;flex-direction:column}.lead-analytics-summary-clear{align-self:flex-start}}`;
  document.head.appendChild(style);
}

function ensureSummaryContainer() {
  const stats = document.querySelector('.v4-lead-stats');
  if (!stats) return null;
  let container = document.getElementById(SUMMARY_ID);
  if (container) return container;
  container = document.createElement('section');
  container.id = SUMMARY_ID;
  container.className = 'lead-analytics-summary';
  container.setAttribute('aria-label', 'Сводка по категориям заявок');
  stats.insertAdjacentElement('afterend', container);
  return container;
}

function applySummarySearch(value) {
  const requested = String(value || '').trim();
  if (!requested) return;
  const current = String(v4State.leadFilters?.search || '').trim();
  const query = current.toLowerCase() === requested.toLowerCase() ? '' : requested;
  const input = document.getElementById('leadSearch');
  if (input) input.value = query;
  setLeadFilters({ search: query });
  renderLeads();
}

function clearSummarySearch() {
  const input = document.getElementById('leadSearch');
  if (input) input.value = '';
  setLeadFilters({ search: '' });
  renderLeads();
}

function bindSummaryActions(container) {
  if (!container || container.dataset.summaryActionsBound === '1') return;
  container.dataset.summaryActionsBound = '1';
  container.addEventListener('click', (event) => {
    const clearButton = event.target.closest?.('[data-lead-analytics-clear]');
    if (clearButton) {
      clearSummarySearch();
      return;
    }
    const button = event.target.closest?.('[data-lead-analytics-search]');
    if (!button) return;
    applySummarySearch(button.dataset.leadAnalyticsSearch);
  });
}

function renderSummary() {
  ensureStyles();
  const container = ensureSummaryContainer();
  if (!container) return;
  bindSummaryActions(container);
  const leads = v4State.leads || [];
  const activeSearch = String(v4State.leadFilters?.search || '').trim();
  const analyticsRows = leads.map((lead) => ({ lead, analytics: deriveLeadAnalytics(lead) }));
  const services = countBy(analyticsRows, (row) => row.analytics.serviceCategory);
  const sources = countBy(analyticsRows, (row) => row.analytics.sourceCategory);
  container.innerHTML = `
    <div class="lead-analytics-summary-head">
      <div>
        <h3>Сводка по заявкам</h3>
        <small>Derived-категории только для аналитики. Нажмите на категорию, чтобы применить или снять поиск. Raw service/source в базе не меняются.</small>
      </div>
      ${activeSearch ? '<button type="button" class="lead-analytics-summary-clear" data-lead-analytics-clear>Сбросить поиск</button>' : ''}
    </div>
    <div class="lead-analytics-summary-grid">
      <div class="lead-analytics-summary-box">
        <strong>Услуги</strong>
        <div class="lead-analytics-summary-pills">${renderPills(services, activeSearch)}</div>
      </div>
      <div class="lead-analytics-summary-box">
        <strong>Источники</strong>
        <div class="lead-analytics-summary-pills">${renderPills(sources, activeSearch)}</div>
      </div>
    </div>`;
}

function boot() {
  renderSummary();
  subscribeState(renderSummary);
  document.addEventListener('leader-v4:leads-loaded', renderSummary);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
