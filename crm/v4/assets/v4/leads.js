import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State, setState, setLeadFilters } from './state.js';
import { byId, setStatus, toast } from './ui.js';
import { openLeadRoute } from './router.js';
import { leadAnalyticsSearchText } from './lead-analytics-normalization.js';
import { describeLeadFilters, loadLeadListPreferences, resetLeadListPreferences, saveLeadListPreferences, sortLeadRows } from './lead-list-preferences-v1.js';
import { buildLeadSelfAssignment, leadResponsibilityState, leadTakeButtonModel } from './lead-assignment-model-v1.js';

const LEAD_LIST_FIELDS = 'id,created_at,name,phone,source,service,message,status,next_contact_at,page_url,source_page_path,request_id,utm_source,utm_medium,utm_campaign,budget,estimated_amount,city,assigned_to,converted_order_id,converted_client_id';
const CLOSED_STATUSES = ['Спам', 'Создан заказ', 'Отказ', 'Не отвечает', 'Дорого', 'Передумал'];
const ACTIVE_HIDDEN_STATUSES = new Set(CLOSED_STATUSES);
const ARCHIVE_STATUSES = new Set(CLOSED_STATUSES);
const STATUSES = ['Все', 'Новая', 'В работе', 'Уточнение деталей', 'Расчёт подготовлен', 'КП отправлено', 'Ждём ответ', 'Нужно пересчитать', 'Согласовано', 'Создан заказ', 'Отказ', 'Не отвечает', 'Дорого', 'Передумал', 'Спам'];
const QUICK_FILTERS = [
  ['active', 'Активные в работе'],
  ['unassigned', 'Без ответственного'],
  ['no_phone', 'Без телефона'],
  ['no_next_contact', 'Без следующего контакта'],
  ['site', 'Заявки с сайта'],
  ['archive', 'Архив / завершённые']
];

let leadsLoadPromise = null;
const leadAssignmentBusy = new Set();

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function formatDate(value) {
  if (!value) return '—';
  try { return new Date(value).toLocaleString('ru-RU'); } catch (_) { return String(value); }
}

function money(value) {
  const number = Number(value || 0);
  return number ? `${Math.round(number).toLocaleString('ru-RU')} ₽` : '—';
}

function phoneHref(phone) {
  const cleaned = String(phone || '').replace(/[^\d+]/g, '');
  return cleaned ? `tel:${cleaned}` : '';
}

function assignmentContext() {
  return {
    currentUserId: v4State.user?.id || '',
    currentUserRole: v4State.profile?.role || '',
    actorLabel: v4State.profile?.full_name || v4State.user?.email || ''
  };
}

function isSiteLead(lead) {
  const source = String(lead?.source || '').toLowerCase();
  const pageUrl = String(lead?.page_url || '').toLowerCase();
  return source.includes('сайт') || source.includes('site') || pageUrl.includes('lider-bsk');
}

function isActiveLead(lead) {
  return !ACTIVE_HIDDEN_STATUSES.has(lead.status || 'Новая');
}

function leadHaystack(lead) {
  return [lead.name, lead.phone, lead.source, lead.service, lead.message, lead.city, lead.status, leadAnalyticsSearchText(lead)].join(' ').toLowerCase();
}

function uniqueSources(leads) {
  const sources = new Set(['Все']);
  leads.forEach((lead) => sources.add(lead.source || 'Не указан'));
  return [...sources];
}

function filteredLeads() {
  const { status, source, search, sort } = v4State.leadFilters;
  const query = String(search || '').toLowerCase().trim();
  const filtered = (v4State.leads || []).filter((lead) => {
    const leadStatus = lead.status || 'Новая';
    if (status === 'active' && !isActiveLead(lead)) return false;
    if (status === 'archive' && !ARCHIVE_STATUSES.has(leadStatus)) return false;
    if (status === 'unassigned' && (lead.assigned_to || !isActiveLead(lead))) return false;
    if (status === 'no_phone' && (String(lead.phone || '').trim() || !isActiveLead(lead))) return false;
    if (status === 'no_next_contact' && (lead.next_contact_at || !isActiveLead(lead))) return false;
    if (status === 'site' && !isSiteLead(lead)) return false;
    if (!['active', 'archive', 'unassigned', 'no_phone', 'no_next_contact', 'site', 'Все'].includes(status) && leadStatus !== status) return false;
    if (source !== 'Все' && (lead.source || 'Не указан') !== source) return false;
    if (query && !leadHaystack(lead).includes(query)) return false;
    return true;
  });
  return sortLeadRows(filtered, sort);
}

function persistLeadListPreferences() {
  saveLeadListPreferences(v4State.leadFilters);
}

function syncFilterControls() {
  const search = byId('leadSearch');
  const sort = byId('leadSort');
  if (search && search.value !== String(v4State.leadFilters.search || '')) search.value = v4State.leadFilters.search || '';
  if (sort) sort.value = v4State.leadFilters.sort || 'created_desc';
  const descriptions = describeLeadFilters(v4State.leadFilters);
  const summary = byId('leadActiveFilters');
  if (summary) {
    summary.textContent = descriptions.length ? `Активно: ${descriptions.join('; ')}` : 'Активны стандартные фильтры: заявки в работе, сначала новые.';
    summary.dataset.hasCustomFilters = descriptions.length ? '1' : '0';
  }
  const reset = byId('resetLeadFiltersBtn');
  if (reset) reset.disabled = !descriptions.length;
}

function renderStats() {
  const leads = v4State.leads || [];
  const active = leads.filter(isActiveLead);
  const setText = (id, value) => { const element = byId(id); if (element) element.textContent = value; };
  setText('v4StatAllLeads', leads.length);
  setText('v4StatNewLeads', leads.filter((lead) => (lead.status || 'Новая') === 'Новая').length);
  setText('v4StatWorkLeads', leads.filter((lead) => (lead.status || '') === 'В работе').length);
  setText('v4StatWaitingLeads', leads.filter((lead) => ['Ждём ответ', 'КП отправлено', 'Уточнение деталей'].includes(lead.status || '')).length);
  setText('v4StatUnassignedLeads', active.filter((lead) => !lead.assigned_to).length);
  setText('v4StatNoPhoneLeads', active.filter((lead) => !String(lead.phone || '').trim()).length);
  setText('v4StatNoNextContactLeads', active.filter((lead) => !lead.next_contact_at).length);
}

function renderSourceOptions() {
  const select = byId('leadSourceFilter');
  if (!select) return;
  const current = v4State.leadFilters.source || 'Все';
  const sources = uniqueSources(v4State.leads || []);
  select.innerHTML = sources.map((source) => `<option ${source === current ? 'selected' : ''}>${esc(source)}</option>`).join('');
  if (v4State.leadsLoaded && !sources.includes(current)) {
    select.value = 'Все';
    setLeadFilters({ source: 'Все' });
    saveLeadListPreferences(v4State.leadFilters);
  }
}

function renderStatusOptions() {
  const select = byId('leadStatusFilter');
  if (!select) return;
  const current = select.value || v4State.leadFilters.status || 'active';
  const options = [...QUICK_FILTERS, ...STATUSES.map((status) => [status, status])];
  select.innerHTML = options.map(([value, label]) => `<option value="${esc(value)}" ${value === current ? 'selected' : ''}>${esc(label)}</option>`).join('');
  select.value = current;
}

function statusClass(status) {
  if (['Создан заказ', 'Согласовано'].includes(status)) return 'is-good';
  if (['Ждём ответ', 'КП отправлено', 'Уточнение деталей', 'Нужно пересчитать'].includes(status)) return 'is-warn';
  if (['Отказ', 'Дорого', 'Передумал', 'Не отвечает', 'Спам'].includes(status)) return 'is-error';
  return '';
}

function ensureLeadStatsExtras() {
  const stats = document.querySelector('.v4-lead-stats');
  if (!stats || document.getElementById('v4StatUnassignedLeads')) return;
  stats.insertAdjacentHTML('beforeend', '<div><span>Без ответственного</span><b id="v4StatUnassignedLeads">0</b></div><div><span>Без телефона</span><b id="v4StatNoPhoneLeads">0</b></div><div><span>Без контакта</span><b id="v4StatNoNextContactLeads">0</b></div>');
}

function ensureInlineStyles() {
  if (document.getElementById('leadsV4InlineHintsStyles')) return;
  const style = document.createElement('style');
  style.id = 'leadsV4InlineHintsStyles';
  style.textContent = `.v4-lead-inline-hints{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 0}.v4-lead-inline-hint{display:inline-flex;border-radius:999px;padding:5px 8px;font-size:12px;font-weight:900;border:1px solid #cbd5e1;background:#f8fafc;color:#334155}.v4-lead-inline-hint.is-site{background:#dbeafe;border-color:#93c5fd;color:#1d4ed8}.v4-lead-inline-hint.is-danger{background:#fee2e2;border-color:#fecaca;color:#991b1b}.v4-lead-inline-hint.is-warn{background:#fef3c7;border-color:#fcd34d;color:#92400e}.v4-lead-inline-hint.is-good{background:#dcfce7;border-color:#86efac;color:#166534}.v4-lead-warning-note{margin-top:8px;border:1px solid #fecaca;background:#fff1f2;color:#991b1b;border-radius:12px;padding:8px;font-weight:800}`;
  document.head.appendChild(style);
}

function renderLeadCard(lead) {
  const phone = phoneHref(lead.phone);
  const noPhone = !String(lead.phone || '').trim();
  const noNextContact = !lead.next_contact_at && isActiveLead(lead);
  const siteLead = isSiteLead(lead);
  const responsibility = leadResponsibilityState(lead, assignmentContext());
  const takeButton = leadTakeButtonModel(lead, assignmentContext());
  const responsibilityClass = responsibility.key === 'mine' ? 'is-good' : responsibility.key === 'unassigned' ? 'is-warn' : '';
  const hints = [
    siteLead ? '<span class="v4-lead-inline-hint is-site">Сайт</span>' : '',
    `<span class="v4-lead-inline-hint ${responsibilityClass}">${esc(responsibility.label)}</span>`,
    noPhone ? '<span class="v4-lead-inline-hint is-danger">Нет телефона</span>' : '',
    noNextContact ? '<span class="v4-lead-inline-hint is-warn">Нет следующего контакта</span>' : ''
  ].filter(Boolean).join('');
  return `
    <article class="v4-lead-card" data-id="${esc(lead.id)}">
      <div class="v4-lead-main">
        <div class="v4-lead-title-row"><h3>${esc(lead.name || 'Без имени')}</h3><span class="v4-lead-status ${statusClass(lead.status || 'Новая')}">${esc(lead.status || 'Новая')}</span></div>
        ${hints ? `<div class="v4-lead-inline-hints">${hints}</div>` : ''}
        <div class="v4-lead-meta"><span>${formatDate(lead.created_at)}</span><span>${esc(lead.source || 'Источник не указан')}</span><span>${esc(lead.service || 'Услуга не указана')}</span></div>
        <div class="v4-lead-details"><span><b>Телефон:</b> ${esc(lead.phone || '—')}</span><span><b>Город:</b> ${esc(lead.city || '—')}</span><span><b>Бюджет:</b> ${money(lead.budget || lead.estimated_amount)}</span></div>
        ${noPhone ? '<div class="v4-lead-warning-note">Нужно дозаполнить контакт: проверьте сообщение, страницу заявки или другой способ связи.</div>' : ''}
        ${lead.message ? `<p class="v4-lead-message">${esc(lead.message)}</p>` : ''}
      </div>
      <div class="v4-lead-actions">
        ${phone ? `<a href="${esc(phone)}">Позвонить</a>` : ''}
        <button type="button" data-action="open">Открыть</button>
        ${takeButton.visible ? `<button type="button" class="v4-primary" data-action="${esc(takeButton.action)}">${esc(takeButton.label)}</button>` : ''}
      </div>
    </article>`;
}

export function renderLeads() {
  ensureLeadStatsExtras();
  ensureInlineStyles();
  renderStats();
  renderStatusOptions();
  renderSourceOptions();
  syncFilterControls();
  const list = byId('leadsList');
  const counter = byId('leadsCounter');
  if (!list) return;
  const leads = filteredLeads();
  if (counter) counter.textContent = v4State.leadsLoaded ? `Показано: ${leads.length} из ${(v4State.leads || []).length}` : 'Заявки ещё не загружены';
  if (v4State.leadsBusy) {
    list.innerHTML = '<div class="v4-empty">Загружаю заявки...</div>';
    return;
  }
  if (v4State.leadsError) {
    list.innerHTML = `<div class="v4-empty">${esc(v4State.leadsError)}<div class="v4-form-actions" style="margin-top:12px"><button type="button" class="v4-primary" data-retry-leads>Повторить загрузку заявок</button></div></div>`;
    return;
  }
  if (!v4State.leadsLoaded) {
    list.innerHTML = '<div class="v4-empty">Заявки загрузятся автоматически после входа. Также можно нажать «Обновить заявки».</div>';
    return;
  }
  if (!(v4State.leads || []).length) {
    list.innerHTML = '<div class="v4-empty">В базе пока нет заявок.</div>';
    return;
  }
  if (!leads.length) {
    const descriptions = describeLeadFilters(v4State.leadFilters);
    list.innerHTML = `<div class="v4-empty">По выбранным условиям заявок нет.${descriptions.length ? `<div class="v4-empty-detail">Проверьте: ${esc(descriptions.join('; '))}.</div>` : ''}<div class="v4-form-actions"><button type="button" class="v4-primary" data-reset-lead-filters>Сбросить фильтры</button></div></div>`;
    return;
  }
  list.innerHTML = leads.map(renderLeadCard).join('');
}

async function doLoadLeads({ silent = false } = {}) {
  setState({ leadsBusy: true, leadsError: null });
  renderLeads();
  try {
    if (!silent) setStatus('Загружаю заявки...', 'warn');
    const response = await timeout(
      supabaseClient
        .from('leader_leads')
        .select(LEAD_LIST_FIELDS)
        .order('created_at', { ascending: false })
        .limit(50),
      16000,
      'Заявки не загрузились за 16 секунд'
    );
    if (response.error) throw response.error;
    setState({ leads: response.data || [], leadsLoaded: true, leadsBusy: false, leadsError: null });
    renderLeads();
    setStatus(`CRM готова. Заявок: ${(response.data || []).length}`, 'good');
    document.dispatchEvent(new CustomEvent('leader-v4:leads-loaded', { detail: { leads: response.data || [] } }));
    return response.data || [];
  } catch (error) {
    const message = friendlyError(error);
    setState({ leadsBusy: false, leadsError: `Заявки не загрузились: ${message}`, leadsLoaded: false });
    renderLeads();
    setStatus(`Ошибка загрузки заявок: ${message}`, 'error');
    return [];
  } finally {
    leadsLoadPromise = null;
  }
}

export async function loadLeads({ silent = false, force = false } = {}) {
  if (!v4State.crmReady) {
    renderLeads();
    return [];
  }
  if (leadsLoadPromise && !force) return leadsLoadPromise;
  leadsLoadPromise = doLoadLeads({ silent });
  return leadsLoadPromise;
}

async function updateLead(id, patch, options = {}) {
  let query = supabaseClient
    .from('leader_leads')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (options.requireUnassigned === true) query = query.is('assigned_to', null);
  const response = await timeout(
    query.select(LEAD_LIST_FIELDS).maybeSingle(),
    16000,
    'Заявка не обновилась за 16 секунд'
  );
  if (response.error) throw response.error;
  if (!response.data) throw new Error('Заявку уже взял другой сотрудник. Обновите список.');
  const updated = response.data;
  setState({
    leads: (v4State.leads || []).map((lead) => (lead.id === id ? { ...lead, ...updated } : lead)),
    currentLead: v4State.currentLead?.id === id ? { ...v4State.currentLead, ...updated } : v4State.currentLead
  });
  renderLeads();
  return updated;
}

async function addAssignmentHistory(assignment) {
  const addEvent = window.leaderAddLeadEvent;
  if (typeof addEvent !== 'function') throw new Error('История заявки ещё загружается');
  return addEvent({
    leadId: assignment.leadId,
    eventType: assignment.event.eventType,
    oldStatus: assignment.event.oldStatus,
    newStatus: assignment.event.newStatus,
    body: assignment.event.body
  });
}

function bindLeadFilters() {
  byId('leadStatusFilter')?.addEventListener('change', (event) => {
    setLeadFilters({ status: event.target.value || 'active' });
    persistLeadListPreferences();
    renderLeads();
  });
  byId('leadSourceFilter')?.addEventListener('change', (event) => {
    setLeadFilters({ source: event.target.value || 'Все' });
    persistLeadListPreferences();
    renderLeads();
  });
  byId('leadSearch')?.addEventListener('input', (event) => {
    setLeadFilters({ search: event.target.value || '' });
    renderLeads();
  });
  byId('leadSort')?.addEventListener('change', (event) => {
    setLeadFilters({ sort: event.target.value || 'created_desc' });
    persistLeadListPreferences();
    renderLeads();
  });
  const reset = () => {
    const defaults = resetLeadListPreferences();
    setLeadFilters({ ...defaults, search: '' });
    renderLeads();
    byId('leadSearch')?.focus();
  };
  byId('resetLeadFiltersBtn')?.addEventListener('click', reset);
  byId('leadsList')?.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-reset-lead-filters]')) reset();
  });
}

function bindLeadActions() {
  byId('reloadLeadsBtn')?.addEventListener('click', () => loadLeads({ force: true }));
  byId('leadsList')?.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const card = button.closest('.v4-lead-card');
    const id = card?.dataset.id;
    if (!id) return;
    const action = button.dataset.action;
    if (action === 'open') {
      openLeadRoute(id);
      if (typeof window.v4SetTab === 'function') window.v4SetTab('card');
      return;
    }

    const lead = (v4State.leads || []).find((item) => item.id === id);
    if (!lead) return;
    if (leadAssignmentBusy.has(id)) return;

    if (action === 'take') {
      const assignment = buildLeadSelfAssignment(lead, assignmentContext());
      if (!assignment) {
        toast('Заявка уже назначена или ваша роль не позволяет взять её на себя');
        renderLeads();
        return;
      }
      leadAssignmentBusy.add(id);
      button.disabled = true;
      setStatus('Назначаю вас ответственным...', 'warn');
      try {
        await updateLead(id, assignment.patch, { requireUnassigned: true });
        try {
          await addAssignmentHistory(assignment);
          toast('Заявка назначена вам');
          setStatus('Вы назначены ответственным', 'good');
        } catch (historyError) {
          toast('Ответственный сохранён, но запись истории требует проверки');
          setStatus(`Ответственный сохранён. История: ${friendlyError(historyError)}`, 'warn');
        }
        openLeadRoute(id);
        if (typeof window.v4SetTab === 'function') window.v4SetTab('card');
      } catch (error) {
        toast(friendlyError(error));
        setStatus(`Ошибка назначения: ${friendlyError(error)}`, 'error');
      } finally {
        leadAssignmentBusy.delete(id);
        if (button.isConnected) button.disabled = false;
      }
      return;
    }

    if (action === 'work') {
      const responsibility = leadResponsibilityState(lead, assignmentContext());
      if (responsibility.key !== 'mine') {
        toast('Сначала назначьте себя ответственным');
        renderLeads();
        return;
      }
      leadAssignmentBusy.add(id);
      button.disabled = true;
      try {
        await updateLead(id, { status: 'В работе' });
        toast('Заявка переведена в работу');
        setStatus('Заявка переведена в работу', 'good');
        openLeadRoute(id);
        if (typeof window.v4SetTab === 'function') window.v4SetTab('card');
      } catch (error) {
        toast(friendlyError(error));
        setStatus(`Ошибка статуса: ${friendlyError(error)}`, 'error');
      } finally {
        leadAssignmentBusy.delete(id);
        if (button.isConnected) button.disabled = false;
      }
    }
  });
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-retry-leads]')) loadLeads({ force: true });
  });
}

export function bootLeads() {
  if (window.LeaderV4LeadsBooted) return;
  window.LeaderV4LeadsBooted = true;
  setLeadFilters({ ...loadLeadListPreferences(), search: '' });
  bindLeadFilters();
  bindLeadActions();
  renderLeads();
  document.addEventListener('leader-v4:crm-ready', () => loadLeads({ silent: true, force: true }));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootLeads);
else bootLeads();
