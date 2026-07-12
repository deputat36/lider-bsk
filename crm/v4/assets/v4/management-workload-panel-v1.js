import { supabaseClient } from './supabase-client.js';
import { v4State } from './state.js';
import { canOpenV4Tab } from './role-tab-permissions-v1.js';
import { openLeadRoute } from './router.js';
import {
  buildManagementWorkloadSnapshot,
  managementWorkloadGroup,
  MANAGEMENT_WORKLOAD_UNASSIGNED_KEY
} from './management-workload-model-v1.js';

const PANEL_ID = 'managementWorkloadPanelV1';
const MODAL_HOST_ID = 'managementWorkloadModalHostV1';
const STYLE_ID = 'managementWorkloadPanelV1Styles';
const CACHE_MS = 60000;
const LEAD_FIELDS = 'id,status,assigned_to,next_contact_at,created_at,service,source';
const PROFILE_FIELDS = 'user_id,full_name,role,is_active';

let busy = false;
let loadedAt = 0;
let snapshot = null;
let errorText = '';
let activeGroupKey = '';
let contentObserver = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>\"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[char]));
}

function dateTimeRu(value) {
  if (!value) return '—';
  try { return new Date(value).toLocaleString('ru-RU'); } catch (_) { return String(value); }
}

function shortId(value) {
  return String(value || '').slice(0, 8) || '—';
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `.v4-workload-panel{margin:14px 0;border:1px solid #bfdbfe;background:#f8fbff;border-radius:18px;padding:14px;display:grid;gap:12px}.v4-workload-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.v4-workload-head h3{margin:0;color:#1e3a8a}.v4-workload-head p{margin:5px 0 0;color:#475569}.v4-workload-head button,.v4-workload-row button,.v4-workload-modal button{border:1px solid #bfdbfe;background:#fff;color:#1d4ed8;border-radius:11px;padding:8px 11px;font-weight:900;cursor:pointer}.v4-workload-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}.v4-workload-stat{border:1px solid #dbeafe;background:#fff;border-radius:14px;padding:10px}.v4-workload-stat span{display:block;color:#64748b;font-size:11px;font-weight:900;text-transform:uppercase}.v4-workload-stat b{display:block;margin-top:4px;font-size:22px;color:#1e3a8a}.v4-workload-stat.is-danger{border-color:#fecaca;background:#fff7f7}.v4-workload-stat.is-danger b{color:#991b1b}.v4-workload-list{display:grid;gap:8px}.v4-workload-row{display:grid;grid-template-columns:minmax(180px,1.4fr) repeat(5,minmax(70px,.55fr)) auto;gap:8px;align-items:center;border:1px solid #dbeafe;background:#fff;border-radius:14px;padding:10px}.v4-workload-row.is-danger{border-color:#fecaca;background:#fffafa}.v4-workload-person b,.v4-workload-person small{display:block}.v4-workload-person small{margin-top:3px;color:#64748b}.v4-workload-metric span{display:block;color:#64748b;font-size:10px;font-weight:900;text-transform:uppercase}.v4-workload-metric b{display:block;margin-top:3px;color:#0f172a}.v4-workload-note{border:1px dashed #93c5fd;background:#eff6ff;color:#1e3a8a;border-radius:12px;padding:9px;font-size:12px;font-weight:800}.v4-workload-error{border:1px solid #fecaca;background:#fff1f2;color:#991b1b;border-radius:12px;padding:10px;font-weight:800}.v4-workload-modal-backdrop{position:fixed;inset:0;z-index:805;background:rgba(15,23,42,.68);display:grid;place-items:center;padding:14px}.v4-workload-modal{width:min(920px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:22px;border:1px solid #bfdbfe;box-shadow:0 30px 90px rgba(15,23,42,.4);padding:16px}.v4-workload-modal-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border-bottom:1px solid #e2e8f0;padding-bottom:11px}.v4-workload-modal-head h3{margin:0;color:#1e3a8a}.v4-workload-modal-head p{margin:5px 0 0;color:#64748b}.v4-workload-modal-list{display:grid;gap:8px;margin-top:12px}.v4-workload-lead{display:flex;justify-content:space-between;gap:12px;align-items:center;border:1px solid #e2e8f0;background:#f8fafc;border-radius:14px;padding:10px}.v4-workload-lead b,.v4-workload-lead span,.v4-workload-lead small{display:block}.v4-workload-lead span,.v4-workload-lead small{margin-top:3px;color:#64748b}.v4-workload-empty{border:1px dashed #cbd5e1;border-radius:14px;padding:14px;color:#64748b;background:#f8fafc}@media(max-width:900px){.v4-workload-row{grid-template-columns:repeat(3,1fr)}.v4-workload-person{grid-column:1/-1}.v4-workload-row button{grid-column:1/-1;width:100%}}@media(max-width:640px){.v4-workload-head,.v4-workload-modal-head,.v4-workload-lead{display:grid}.v4-workload-row{grid-template-columns:1fr 1fr}.v4-workload-head button,.v4-workload-modal button,.v4-workload-lead button{width:100%}}`;
  document.head.appendChild(style);
}

function contentRoot() {
  return document.getElementById('managementDashboardContent');
}

function ensurePanel() {
  ensureStyles();
  const content = contentRoot();
  if (!content) return null;
  let panel = document.getElementById(PANEL_ID);
  if (panel && panel.closest('#managementDashboardContent') === content) return panel;
  if (panel) panel.remove();
  panel = document.createElement('section');
  panel.id = PANEL_ID;
  panel.className = 'v4-workload-panel';
  panel.setAttribute('aria-label', 'Нагрузка и SLA по ответственным');
  const grid = content.querySelector('.v4-mgmt-grid');
  if (grid) grid.insertAdjacentElement('afterend', panel);
  else content.prepend(panel);
  return panel;
}

function observeDashboardContent() {
  const root = contentRoot();
  if (!root || contentObserver) return;
  contentObserver = new MutationObserver(() => {
    if (document.body.dataset.v4Tab !== 'management_dashboard') return;
    if (document.getElementById(PANEL_ID)) return;
    setTimeout(() => render(), 0);
  });
  contentObserver.observe(root, { childList: true });
}

function modalHost() {
  let host = document.getElementById(MODAL_HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = MODAL_HOST_ID;
    document.body.appendChild(host);
  }
  return host;
}

function summaryStat(label, value, danger = false) {
  return `<div class="v4-workload-stat${danger ? ' is-danger' : ''}"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
}

function groupRow(group) {
  const role = group.role ? `Роль: ${group.role}` : group.key === MANAGEMENT_WORKLOAD_UNASSIGNED_KEY ? 'Нужно назначить ответственного' : 'Профиль не найден в доступном списке';
  const danger = group.slaBreaches > 0 || group.key === MANAGEMENT_WORKLOAD_UNASSIGNED_KEY && group.active > 0;
  return `<article class="v4-workload-row${danger ? ' is-danger' : ''}"><div class="v4-workload-person"><b>${esc(group.label)}</b><small>${esc(role)}${group.oldestLeadAgeDays === null ? '' : ` · старейшая активная заявка: ${group.oldestLeadAgeDays} дн.`}</small></div><div class="v4-workload-metric"><span>Активных</span><b>${esc(group.active)}</b></div><div class="v4-workload-metric"><span>Без контакта</span><b>${esc(group.withoutNextContact)}</b></div><div class="v4-workload-metric"><span>Просрочено</span><b>${esc(group.overdue)}</b></div><div class="v4-workload-metric"><span>Сегодня</span><b>${esc(group.dueToday)}</b></div><div class="v4-workload-metric"><span>SLA</span><b>${esc(`${group.slaCoveragePercent}%`)}</b></div><button type="button" data-workload-open="${esc(group.key)}"${group.active ? '' : ' disabled'}>Открыть очередь</button></article>`;
}

function render() {
  if (!canOpenV4Tab('management_dashboard')) return;
  const panel = ensurePanel();
  if (!panel) return;
  if (busy) {
    panel.innerHTML = '<div class="v4-workload-note">Загружаю read-only нагрузку и SLA...</div>';
    return;
  }
  if (errorText) {
    panel.innerHTML = `<div class="v4-workload-head"><div><h3>Нагрузка и SLA по ответственным</h3><p>Минимальный read-only срез без телефонов, email, сообщений и финансов.</p></div><button type="button" data-workload-refresh>Повторить</button></div><div class="v4-workload-error">${esc(errorText)}</div>`;
    return;
  }
  if (!snapshot) {
    panel.innerHTML = '<div class="v4-workload-note">Срез появится после открытия или обновления управленческого дашборда.</div>';
    return;
  }
  const rows = [snapshot.unassigned, ...snapshot.managers].map(groupRow).join('');
  panel.innerHTML = `<div class="v4-workload-head"><div><h3>Нагрузка и SLA по ответственным</h3><p>Активные заявки, отсутствие следующего контакта и просрочка. Очереди только открывают карточки и не меняют данные.</p></div><button type="button" data-workload-refresh>Обновить SLA</button></div><div class="v4-workload-summary">${summaryStat('Активные заявки', snapshot.activeCount)}${summaryStat('Без ответственного', snapshot.unassignedCount, snapshot.unassignedCount > 0)}${summaryStat('Нарушения SLA', snapshot.slaBreaches, snapshot.slaBreaches > 0)}${summaryStat('Покрытие SLA', `${snapshot.slaCoveragePercent}%`, snapshot.slaBreaches > 0)}${summaryStat('Контакты сегодня', snapshot.dueToday)}</div><div class="v4-workload-list">${rows || '<div class="v4-workload-empty">Ответственные и активные заявки не найдены.</div>'}</div><div class="v4-workload-note">SLA считается выполненным, когда у активной заявки назначен непросроченный следующий контакт. Терминальные статусы исключаются canonical registry.</div>`;
}

function leadRow(lead) {
  const next = lead.next_contact_at ? `Следующий контакт: ${dateTimeRu(lead.next_contact_at)}` : 'Следующий контакт не назначен';
  return `<article class="v4-workload-lead"><div><b>${esc(lead.service || 'Услуга не указана')}</b><span>${esc(lead.source || 'Источник не указан')} · ${esc(lead.status || 'Новая')}</span><small>Заявка ${esc(shortId(lead.id))} · создана ${esc(dateTimeRu(lead.created_at))} · ${esc(next)}</small></div><button type="button" data-workload-open-lead="${esc(lead.id)}">Открыть заявку</button></article>`;
}

function closeModal() {
  activeGroupKey = '';
  modalHost().innerHTML = '';
}

function openGroup(key) {
  const group = managementWorkloadGroup(snapshot, key);
  if (!group) return;
  activeGroupKey = group.key;
  modalHost().innerHTML = `<div class="v4-workload-modal-backdrop" role="dialog" aria-modal="true" aria-label="Очередь ${esc(group.label)}"><section class="v4-workload-modal"><div class="v4-workload-modal-head"><div><h3>${esc(group.label)}</h3><p>Активных: ${esc(group.active)} · без следующего контакта: ${esc(group.withoutNextContact)} · просрочено: ${esc(group.overdue)} · SLA: ${esc(`${group.slaCoveragePercent}%`)}</p></div><button type="button" data-workload-close>Закрыть</button></div><div class="v4-workload-modal-list">${group.leads.map(leadRow).join('') || '<div class="v4-workload-empty">Очередь пуста.</div>'}</div><div class="v4-workload-note">В очереди намеренно не отображаются имя клиента, телефон, email, сообщение, внутренние комментарии и финансовые суммы.</div></section></div>`;
}

async function readRows(table, fields) {
  const response = await supabaseClient.from(table).select(fields).limit(1000);
  if (response.error) throw response.error;
  return response.data || [];
}

async function load(force = false) {
  if (!v4State.crmReady || !canOpenV4Tab('management_dashboard') || busy) return;
  if (!force && snapshot && Date.now() - loadedAt < CACHE_MS) {
    render();
    return;
  }
  busy = true;
  errorText = '';
  render();
  try {
    const [leads, profiles] = await Promise.all([
      readRows('leader_leads', LEAD_FIELDS),
      readRows('leader_user_profiles', PROFILE_FIELDS)
    ]);
    snapshot = buildManagementWorkloadSnapshot(leads, profiles);
    loadedAt = Date.now();
    if (activeGroupKey) openGroup(activeGroupKey);
  } catch (error) {
    console.warn('CRM management workload read warning:', error);
    errorText = 'Не удалось загрузить read-only нагрузку. Рабочие данные CRM не изменялись.';
    closeModal();
  } finally {
    busy = false;
    render();
  }
}

function openLead(leadId) {
  if (!leadId) return;
  closeModal();
  openLeadRoute(leadId);
  if (typeof window.v4SetTab === 'function') window.v4SetTab('card');
}

function boot() {
  observeDashboardContent();
  document.addEventListener('leader-v4:crm-ready', () => {
    if (document.body.dataset.v4Tab === 'management_dashboard') setTimeout(() => load(false), 0);
  });
  document.addEventListener('leader-v4:tab-opened', (event) => {
    if (event.detail?.tab === 'management_dashboard') setTimeout(() => load(false), 0);
  });
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-management-dashboard-refresh]')) {
      setTimeout(() => load(true), 0);
      return;
    }
    if (event.target.closest?.('[data-workload-refresh]')) {
      event.preventDefault();
      load(true);
      return;
    }
    const groupButton = event.target.closest?.('[data-workload-open]');
    if (groupButton) {
      event.preventDefault();
      openGroup(groupButton.dataset.workloadOpen);
      return;
    }
    const leadButton = event.target.closest?.('[data-workload-open-lead]');
    if (leadButton) {
      event.preventDefault();
      openLead(leadButton.dataset.workloadOpenLead);
      return;
    }
    if (event.target.closest?.('[data-workload-close]') || event.target.classList?.contains('v4-workload-modal-backdrop')) {
      event.preventDefault();
      closeModal();
    }
  }, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && activeGroupKey) closeModal();
  });
}

if (!window.LeaderV4ManagementWorkloadPanelV1Booted) {
  window.LeaderV4ManagementWorkloadPanelV1Booted = true;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
