import { supabaseClient } from './supabase-client.js';
import { v4State, subscribeState } from './state.js';
import { CRM_V4_ACTIONS, canPerformV4Action } from './action-permissions-v1.js';
import { byId } from './ui.js';
import {
  buildLeadWorkflowIndex,
  emptyLeadWorkflowIndex,
  leadMatchesWorkQuickFilter,
  leadWorkQuickFilterModels
} from './lead-work-quick-filters-v1.js';

const ADVANCED_FILTERS = new Set(['needs_calculation', 'offer_waiting']);
const STYLE_LINK_ID = 'leadWorkQuickFiltersV1Styles';

let advancedFilter = '';
let workflowIndex = emptyLeadWorkflowIndex();
let workflowReady = false;
let workflowBusy = false;
let workflowError = '';
let internalStatusChange = false;
let scheduled = false;

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function ensureStyles() {
  if (document.getElementById(STYLE_LINK_ID)) return;
  const link = document.createElement('link');
  link.id = STYLE_LINK_ID;
  link.rel = 'stylesheet';
  link.href = new URL('./lead-work-quick-filters-v1.css?v=20260723-1', import.meta.url).href;
  document.head.appendChild(link);
}

function scheduleRender() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    renderQuickFilters();
  });
}

function filterHost() {
  let host = byId('leadWorkQuickFilters');
  if (host) return host;
  const filters = document.querySelector('#leadsSection .v4-filters');
  if (!filters) return null;
  host = document.createElement('section');
  host.id = 'leadWorkQuickFilters';
  host.className = 'v4-lead-work-filters';
  host.setAttribute('aria-label', 'Быстрые рабочие фильтры заявок');
  filters.insertAdjacentElement('beforebegin', host);
  bindHost(host);
  return host;
}

function clearAdvancedEmpty() {
  byId('leadWorkQuickFiltersEmpty')?.remove();
}

function applyAdvancedFilterToDom() {
  clearAdvancedEmpty();
  const list = byId('leadsList');
  if (!list) return;
  const cards = [...list.querySelectorAll('.v4-lead-card[data-id]')];

  if (!advancedFilter) {
    cards.forEach((card) => { card.hidden = false; });
    return;
  }

  const leadsById = new Map((v4State.leads || []).map((lead) => [String(lead.id), lead]));
  let visible = 0;
  for (const card of cards) {
    const lead = leadsById.get(String(card.dataset.id || ''));
    const matches = lead && leadMatchesWorkQuickFilter(lead, advancedFilter, workflowIndex);
    card.hidden = !matches;
    if (matches) visible += 1;
  }

  const model = leadWorkQuickFilterModels({
    leads: v4State.leads || [],
    workflowIndex,
    activeFilter: advancedFilter,
    workflowReady
  }).find((item) => item.key === advancedFilter);
  const counter = byId('leadsCounter');
  if (counter && v4State.leadsLoaded) {
    counter.textContent = `Показано: ${visible} · очередь «${model?.label || advancedFilter}»`;
  }
  const summary = byId('leadActiveFilters');
  if (summary && model) {
    const base = summary.textContent || '';
    if (!base.includes(`очередь: ${model.label}`)) summary.textContent = `${base} · очередь: ${model.label}`;
    summary.dataset.hasCustomFilters = '1';
  }

  if (cards.length && visible === 0) {
    const empty = document.createElement('div');
    empty.id = 'leadWorkQuickFiltersEmpty';
    empty.className = 'v4-empty v4-lead-work-filter-empty';
    empty.innerHTML = `<b>В этой очереди заявок нет.</b><span>Другие выбранные условия — источник или поиск — тоже учитываются.</span><button type="button" data-lead-work-filter-reset>Показать активные заявки</button>`;
    list.appendChild(empty);
  }
}

function setBaseStatusFilter(value) {
  const select = byId('leadStatusFilter');
  if (!select) return;
  internalStatusChange = true;
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  internalStatusChange = false;
}

function activateFilter(key) {
  if (ADVANCED_FILTERS.has(key)) {
    if (!workflowReady) return;
    if (advancedFilter === key) {
      advancedFilter = '';
      setBaseStatusFilter('active');
    } else {
      advancedFilter = key;
      setBaseStatusFilter('active');
    }
    renderQuickFilters();
    return;
  }

  const active = !advancedFilter && String(v4State.leadFilters?.status || 'active') === key;
  advancedFilter = '';
  setBaseStatusFilter(active ? 'active' : key);
  renderQuickFilters();
}

function bindHost(host) {
  if (host.dataset.bound === '1') return;
  host.dataset.bound = '1';
  host.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-lead-work-filter]');
    if (!button || button.disabled) return;
    activateFilter(button.dataset.leadWorkFilter || '');
  });
}

function renderQuickFilters() {
  const host = filterHost();
  if (!host) return;
  const activeFilter = advancedFilter || String(v4State.leadFilters?.status || 'active');
  const models = leadWorkQuickFilterModels({
    leads: v4State.leads || [],
    workflowIndex,
    activeFilter,
    workflowReady
  });
  const note = workflowBusy
    ? 'Проверяю связанные расчёты и КП…'
    : workflowError
      ? 'Основные фильтры работают. Очереди расчётов и КП временно недоступны.'
      : 'Один клик — показать заявки, которые требуют действия сейчас.';

  host.innerHTML = `<div class="v4-lead-work-filters-head"><div><b>Что требует внимания</b><span>${esc(note)}</span></div><button type="button" data-lead-work-filter-reset>Сбросить</button></div><div class="v4-lead-work-filter-buttons">${models.map((model) => `<button type="button" data-lead-work-filter="${esc(model.key)}" class="${model.active ? 'is-active' : ''}" ${model.disabled ? 'disabled' : ''} aria-pressed="${model.active ? 'true' : 'false'}" title="${model.disabled ? 'Связанные расчёты и КП ещё не загружены' : esc(model.label)}"><span>${esc(model.label)}</span><b>${model.disabled ? '—' : model.count}</b></button>`).join('')}</div>`;
  bindHost(host);
  applyAdvancedFilterToDom();
}

async function loadWorkflowIndex(leads = v4State.leads || []) {
  if (workflowBusy) return;
  const ids = [...new Set((leads || []).map((lead) => String(lead.id || '').trim()).filter(Boolean))];
  workflowBusy = true;
  workflowReady = false;
  workflowError = '';
  renderQuickFilters();

  try {
    if (!ids.length) {
      workflowIndex = emptyLeadWorkflowIndex();
      workflowReady = true;
      return;
    }
    if (!canPerformV4Action(CRM_V4_ACTIONS.CALCULATIONS_READ) || !canPerformV4Action(CRM_V4_ACTIONS.OFFERS_READ)) {
      throw new Error('workflow_read_forbidden');
    }

    const [calculations, offers] = await Promise.all([
      supabaseClient
        .from('leader_lead_calculations')
        .select('lead_id,status,is_current_revision')
        .in('lead_id', ids)
        .limit(500),
      supabaseClient
        .from('leader_commercial_offers')
        .select('lead_id,status')
        .in('lead_id', ids)
        .limit(500)
    ]);
    if (calculations.error) throw calculations.error;
    if (offers.error) throw offers.error;

    workflowIndex = buildLeadWorkflowIndex({
      calculations: calculations.data || [],
      offers: offers.data || []
    });
    workflowReady = true;
  } catch (error) {
    console.warn('Lead work quick filters read warning:', error);
    workflowIndex = emptyLeadWorkflowIndex();
    workflowError = 'workflow_read_failed';
    if (ADVANCED_FILTERS.has(advancedFilter)) {
      advancedFilter = '';
      setBaseStatusFilter('active');
    }
  } finally {
    workflowBusy = false;
    renderQuickFilters();
  }
}

function bindGlobalEvents() {
  byId('leadStatusFilter')?.addEventListener('change', () => {
    if (internalStatusChange) return;
    advancedFilter = '';
    scheduleRender();
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest?.('[data-lead-work-filter-reset]')) return;
    advancedFilter = '';
    setBaseStatusFilter('active');
    renderQuickFilters();
  });

  document.addEventListener('leader-v4:leads-loaded', (event) => {
    loadWorkflowIndex(event.detail?.leads || v4State.leads || []);
  });

  subscribeState(scheduleRender);
}

export function bootLeadWorkQuickFilters() {
  if (window.LeaderV4LeadWorkQuickFiltersBooted) return;
  window.LeaderV4LeadWorkQuickFiltersBooted = true;
  ensureStyles();
  filterHost();
  bindGlobalEvents();
  renderQuickFilters();
  if (v4State.leadsLoaded) loadWorkflowIndex(v4State.leads || []);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootLeadWorkQuickFilters);
else bootLeadWorkQuickFilters();
