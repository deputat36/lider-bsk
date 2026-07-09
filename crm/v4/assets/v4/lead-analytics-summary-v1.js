import { v4State, subscribeState } from './state.js';
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

function renderPills(rows) {
  if (!rows.length) return '<span class="lead-analytics-summary-empty">Нет данных</span>';
  return rows
    .slice(0, 8)
    .map(([label, count]) => `<span class="lead-analytics-summary-pill"><b>${esc(count)}</b> ${esc(label)}</span>`)
    .join('');
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `.lead-analytics-summary{margin:12px 0 14px;border:1px solid #dbeafe;background:#f8fafc;border-radius:16px;padding:12px;display:grid;gap:10px}.lead-analytics-summary h3{margin:0;color:#0f172a;font-size:15px}.lead-analytics-summary small{color:#64748b;font-weight:800}.lead-analytics-summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.lead-analytics-summary-box{border:1px solid #e2e8f0;background:#fff;border-radius:14px;padding:10px}.lead-analytics-summary-box strong{display:block;margin-bottom:8px;color:#1d4ed8}.lead-analytics-summary-pills{display:flex;flex-wrap:wrap;gap:6px}.lead-analytics-summary-pill{display:inline-flex;gap:5px;align-items:center;border-radius:999px;background:#eef2ff;border:1px solid #c7d2fe;color:#3730a3;padding:5px 8px;font-size:12px;font-weight:900}.lead-analytics-summary-empty{color:#64748b;font-weight:800}@media(max-width:720px){.lead-analytics-summary-grid{grid-template-columns:1fr}}`;
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

function renderSummary() {
  ensureStyles();
  const container = ensureSummaryContainer();
  if (!container) return;
  const leads = v4State.leads || [];
  const analyticsRows = leads.map((lead) => ({ lead, analytics: deriveLeadAnalytics(lead) }));
  const services = countBy(analyticsRows, (row) => row.analytics.serviceCategory);
  const sources = countBy(analyticsRows, (row) => row.analytics.sourceCategory);
  container.innerHTML = `
    <div>
      <h3>Сводка по заявкам</h3>
      <small>Derived-категории только для аналитики. Raw service/source в базе не меняются.</small>
    </div>
    <div class="lead-analytics-summary-grid">
      <div class="lead-analytics-summary-box">
        <strong>Услуги</strong>
        <div class="lead-analytics-summary-pills">${renderPills(services)}</div>
      </div>
      <div class="lead-analytics-summary-box">
        <strong>Источники</strong>
        <div class="lead-analytics-summary-pills">${renderPills(sources)}</div>
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
