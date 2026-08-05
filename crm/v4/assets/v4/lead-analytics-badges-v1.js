import './lead-analytics-summary-v1.js';
import './lead-status-ui-registry-v1.js?v=20260721-followup-1';
import './lead-assignee-transition-guard-v1.js?v=20260723-1';
import './lead-followup-transition-guard-v1.js?v=20260723-1';
import { v4State } from './state.js';
import { deriveLeadAnalytics } from './lead-analytics-normalization.js';

const BADGE_CLASS = 'v4-lead-analytics-badge';
const STYLE_ID = 'leadAnalyticsBadgesV1Styles';
const QUICK_FILTER_TRIGGER_ID = 'leadWorkQuickFiltersLazyTrigger';

let quickFiltersPromise = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `.${BADGE_CLASS}{display:inline-flex;border-radius:999px;padding:5px 8px;font-size:12px;font-weight:900;border:1px solid #c7d2fe;background:#eef2ff;color:#3730a3}`;
  document.head.appendChild(style);
}

function leadById(id) {
  return (v4State.leads || []).find((lead) => String(lead.id) === String(id));
}

function ensureHintsContainer(card) {
  let hints = card.querySelector('.v4-lead-inline-hints');
  if (hints) return hints;
  const titleRow = card.querySelector('.v4-lead-title-row');
  if (!titleRow) return null;
  hints = document.createElement('div');
  hints.className = 'v4-lead-inline-hints';
  titleRow.insertAdjacentElement('afterend', hints);
  return hints;
}

function decorateCard(card) {
  if (!card || card.dataset.analyticsBadges === '1') return;
  const lead = leadById(card.dataset.id);
  if (!lead) return;
  const hints = ensureHintsContainer(card);
  if (!hints) return;
  const analytics = deriveLeadAnalytics(lead);
  hints.insertAdjacentHTML(
    'beforeend',
    `<span class="${BADGE_CLASS}">Услуга: ${esc(analytics.serviceCategory)}</span><span class="${BADGE_CLASS}">Источник: ${esc(analytics.sourceCategory)}</span>`
  );
  card.dataset.analyticsBadges = '1';
}

function decorateCards() {
  ensureStyles();
  document.querySelectorAll('.v4-lead-card[data-id]').forEach(decorateCard);
}

function ensureQuickFilterTrigger() {
  if (document.getElementById('leadWorkQuickFilters') || document.getElementById(QUICK_FILTER_TRIGGER_ID)) return;
  const filters = document.querySelector('#leadsSection .v4-filters');
  if (!filters) return;
  const button = document.createElement('button');
  button.id = QUICK_FILTER_TRIGGER_ID;
  button.type = 'button';
  button.textContent = 'Показать рабочие очереди';
  button.addEventListener('click', async () => {
    if (quickFiltersPromise) return;
    button.disabled = true;
    button.textContent = 'Загружаю рабочие очереди…';
    quickFiltersPromise = import('./lead-work-quick-filters-ui-v1.js?v=20260723-1')
      .then(() => button.remove())
      .catch((error) => {
        console.warn('Lead work quick filters lazy load warning:', error);
        quickFiltersPromise = null;
        button.disabled = false;
        button.textContent = 'Повторить загрузку рабочих очередей';
      });
    await quickFiltersPromise;
  });
  filters.insertAdjacentElement('beforebegin', button);
}

function boot() {
  decorateCards();
  ensureQuickFilterTrigger();
  document.addEventListener('leader-v4:leads-loaded', () => {
    decorateCards();
    ensureQuickFilterTrigger();
  });
  const list = document.getElementById('leadsList');
  if (!list) return;
  const observer = new MutationObserver(() => decorateCards());
  observer.observe(list, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
