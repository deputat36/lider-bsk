import { supabaseClient } from './supabase-client.js';
import { v4State, subscribeState } from './state.js';
import { canOpenV4Tab } from './role-tab-permissions-v1.js';
import { statusDefinition } from './status-transitions-v1.js';
import { openLeadRoute } from './router.js';

const PANEL_ID = 'leadOperationalQualityV1';
const QUEUE_HOST_ID = 'leadOperationalQueueV1';
const STYLE_ID = 'leadOperationalQualityV1Styles';
const CACHE_MS = 60000;
const LEAD_FIELDS = 'id,status,assigned_to,next_contact_at,created_at,service,source';
const NEED_FIELDS = 'id,lead_id,completeness_score,status,created_at,updated_at';

const QUEUE_META = Object.freeze({
  unassigned: Object.freeze({ title: 'Активные заявки без ответственного', hint: 'Назначьте менеджера и зафиксируйте следующий шаг.' }),
  no_next_contact: Object.freeze({ title: 'Активные заявки без следующего контакта', hint: 'Укажите дату следующего действия по заявке.' }),
  overdue_contact: Object.freeze({ title: 'Просроченные следующие контакты', hint: 'Свяжитесь с клиентом или перенесите следующий контакт.' }),
  needs_below_80: Object.freeze({ title: 'Потребности заполнены менее чем на 80%', hint: 'Дозаполните бриф до расчёта и коммерческого предложения.' })
});

let busy = false;
let loadedAt = 0;
let snapshot = null;
let errorText = '';
let activeQueue = '';

function esc(value) {
  return String(value ?? '').replace(/[&<>\"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[m]));
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
  style.textContent = `.v4-quality-panel{margin:12px 0 14px;border:1px solid #fed7aa;background:#fffaf5;border-radius:16px;padding:12px;display:grid;gap:10px}.v4-quality-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.v4-quality-head h3{margin:0;color:#9a3412;font-size:15px}.v4-quality-head p{margin:5px 0 0;color:#7c2d12;font-size:12px;font-weight:800}.v4-quality-head button{border:1px solid #fdba74;background:#fff;color:#9a3412;border-radius:999px;padding:6px 10px;font-weight:900;cursor:pointer}.v4-quality-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px}.v4-quality-card{width:100%;border:1px solid #fed7aa;background:#fff;border-radius:14px;padding:10px;text-align:left;font:inherit;color:inherit}.v4-quality-card[data-quality-queue]{cursor:pointer}.v4-quality-card[data-quality-queue]:hover{border-color:#fb923c;box-shadow:0 7px 20px rgba(154,52,18,.1)}.v4-quality-card:disabled{cursor:default;opacity:.8}.v4-quality-card span{display:block;color:#9a3412;font-size:11px;font-weight:900;text-transform:uppercase}.v4-quality-card b{display:block;margin-top:4px;font-size:22px;color:#431407}.v4-quality-card small{display:block;margin-top:4px;color:#78716c}.v4-quality-card.is-good{border-color:#bbf7d0;background:#f0fdf4}.v4-quality-card.is-good span,.v4-quality-card.is-good b{color:#166534}.v4-quality-note{border:1px dashed #fdba74;border-radius:12px;padding:9px;color:#7c2d12;font-size:12px;font-weight:800}.v4-quality-error{border:1px solid #fecaca;background:#fff1f2;color:#991b1b;border-radius:12px;padding:9px;font-weight:800}.v4-quality-queue-modal{position:fixed;inset:0;z-index:790;background:rgba(15,23,42,.68);display:grid;place-items:center;padding:14px}.v4-quality-queue-card{width:min(900px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:22px;border:1px solid #fed7aa;box-shadow:0 30px 90px rgba(15,23,42,.4);padding:16px}.v4-quality-queue-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border-bottom:1px solid #e2e8f0;padding-bottom:11px}.v4-quality-queue-head h3{margin:0;color:#9a3412}.v4-quality-queue-head p{margin:5px 0 0;color:#64748b}.v4-quality-queue-head button,.v4-quality-row button{border:1px solid #fdba74;background:#fff7ed;color:#9a3412;border-radius:11px;padding:8px 11px;font-weight:900;cursor:pointer}.v4-quality-queue-list{display:grid;gap:8px;margin-top:12px}.v4-quality-row{display:flex;justify-content:space-between;align-items:center;gap:12px;border:1px solid #e2e8f0;border-radius:14px;padding:10px;background:#f8fafc}.v4-quality-row b{display:block;color:#0f172a}.v4-quality-row span,.v4-quality-row small{display:block;margin-top:3px;color:#64748b}.v4-quality-empty{border:1px dashed #cbd5e1;border-radius:14px;padding:14px;color:#64748b;background:#f8fafc}.v4-quality-privacy{margin-top:12px;border:1px dashed #fdba74;background:#fffaf5;color:#7c2d12;border-radius:12px;padding:9px;font-size:12px;font-weight:800}@media(max-width:640px){.v4-quality-head,.v4-quality-queue-head,.v4-quality-row{display:grid}.v4-quality-head button,.v4-quality-queue-head button,.v4-quality-row button{width:100%}}`;
  document.head.appendChild(style);
}

function ensurePanel() {
  const stats = document.querySelector('.v4-lead-stats');
  if (!stats) return null;
  let panel = document.getElementById(PANEL_ID);
  if (panel) return panel;
  panel = document.createElement('section');
  panel.id = PANEL_ID;
  panel.className = 'v4-quality-panel';
  panel.setAttribute('aria-label', 'Операционное качество CRM');
  const summary = document.getElementById('leadAnalyticsSummaryV1');
  (summary || stats).insertAdjacentElement('afterend', panel);
  return panel;
}

function queueHost() {
  let host = document.getElementById(QUEUE_HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = QUEUE_HOST_ID;
    document.body.appendChild(host);
  }
  return host;
}

function activeLead(lead) {
  const definition = statusDefinition('lead', lead?.status || 'Новая');
  return definition ? definition.terminal !== true : true;
}

function qualityCard(label, value, hint, { goodWhenZero = true, queue = '' } = {}) {
  const numeric = Number(value || 0);
  const good = goodWhenZero ? numeric === 0 : numeric > 0;
  const tag = queue ? 'button' : 'div';
  const queueAttr = queue ? ` type="button" data-quality-queue="${esc(queue)}"${numeric === 0 ? ' disabled' : ''}` : '';
  return `<${tag} class="v4-quality-card${good ? ' is-good' : ''}"${queueAttr}><span>${esc(label)}</span><b>${esc(numeric)}</b><small>${esc(hint)}</small></${tag}>`;
}

function renderPanel() {
  ensureStyles();
  const panel = ensurePanel();
  if (!panel) return;

  if (!canOpenV4Tab('leads')) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;

  if (busy) {
    panel.innerHTML = '<div class="v4-quality-note">Загружаю read-only показатели качества CRM...</div>';
    return;
  }

  if (errorText) {
    panel.innerHTML = `<div class="v4-quality-head"><div><h3>Операционное качество CRM</h3><p>Только минимальные рабочие поля, без телефонов, сообщений и финансовых сумм.</p></div><button type="button" data-quality-refresh>Повторить</button></div><div class="v4-quality-error">${esc(errorText)}</div>`;
    return;
  }

  if (!snapshot) {
    panel.innerHTML = '<div class="v4-quality-note">Показатели загрузятся после подтверждения доступа к CRM.</div>';
    return;
  }

  panel.innerHTML = `
    <div class="v4-quality-head">
      <div>
        <h3>Операционное качество CRM</h3>
        <p>Read-only snapshot всей доступной базы. Проблемные показатели можно открыть как рабочую очередь.</p>
      </div>
      <button type="button" data-quality-refresh>Обновить</button>
    </div>
    <div class="v4-quality-grid">
      ${qualityCard('Активные без ответственного', snapshot.activeUnassigned, 'Открыть очередь назначения', { queue: 'unassigned' })}
      ${qualityCard('Без следующего контакта', snapshot.activeWithoutNextContact, 'Открыть очередь планирования', { queue: 'no_next_contact' })}
      ${qualityCard('Просрочен контакт', snapshot.activeOverdueContact, 'Открыть просроченную очередь', { queue: 'overdue_contact' })}
      ${qualityCard('Потребности ниже 80%', snapshot.needsBelow80, 'Открыть очередь дозаполнения', { queue: 'needs_below_80' })}
      ${qualityCard('Заказы', snapshot.ordersTotal, 'Связанные заказы в CRM', { goodWhenZero: false })}
      ${qualityCard('Записи расходов', snapshot.expensesTotal, 'Нужны для фактической прибыли', { goodWhenZero: false })}
      ${qualityCard('Дизайн-задачи', snapshot.designTasksTotal, 'Нужны для отдельного дизайн-процесса', { goodWhenZero: false })}
    </div>
    <div class="v4-quality-note">Очереди не меняют данные. Они не показывают телефон, сообщение, email, клиентские суммы или внутренние комментарии.</div>`;
}

function leadQueueRow(lead) {
  const nextContact = lead.next_contact_at ? `Следующий контакт: ${dateTimeRu(lead.next_contact_at)}` : 'Следующий контакт не назначен';
  return `<article class="v4-quality-row"><div><b>${esc(lead.service || 'Услуга не указана')}</b><span>${esc(lead.source || 'Источник не указан')} · ${esc(lead.status || 'Новая')}</span><small>Заявка ${esc(shortId(lead.id))} · создана ${esc(dateTimeRu(lead.created_at))} · ${esc(nextContact)}</small></div><button type="button" data-quality-open-lead="${esc(lead.id)}">Открыть заявку</button></article>`;
}

function needQueueRow(need) {
  return `<article class="v4-quality-row"><div><b>Потребность ${esc(shortId(need.id))}</b><span>Заполнено: ${esc(Number(need.completeness_score || 0))}% · ${esc(need.status || 'Статус не указан')}</span><small>Заявка ${esc(shortId(need.lead_id))} · обновлено ${esc(dateTimeRu(need.updated_at || need.created_at))}</small></div>${need.lead_id ? `<button type="button" data-quality-open-lead="${esc(need.lead_id)}">Открыть заявку</button>` : ''}</article>`;
}

function queueItems(kind) {
  return snapshot?.queues?.[kind] || [];
}

function closeQueue() {
  activeQueue = '';
  queueHost().innerHTML = '';
}

function openQueue(kind) {
  const meta = QUEUE_META[kind];
  if (!meta || !snapshot) return;
  activeQueue = kind;
  const rows = queueItems(kind);
  const rowHtml = kind === 'needs_below_80'
    ? rows.map(needQueueRow).join('')
    : rows.map(leadQueueRow).join('');
  queueHost().innerHTML = `<div class="v4-quality-queue-modal" role="dialog" aria-modal="true" aria-label="${esc(meta.title)}"><section class="v4-quality-queue-card"><div class="v4-quality-queue-head"><div><h3>${esc(meta.title)}</h3><p>${esc(meta.hint)}</p></div><button type="button" data-quality-queue-close>Закрыть</button></div><div class="v4-quality-queue-list">${rowHtml || '<div class="v4-quality-empty">Очередь пуста.</div>'}</div><div class="v4-quality-privacy">В очереди намеренно не отображаются имя, телефон, сообщение, email, финансовые суммы и внутренние комментарии.</div></section></div>`;
}

async function readRows(table, fields) {
  const response = await supabaseClient.from(table).select(fields).limit(1000);
  if (response.error) throw response.error;
  return response.data || [];
}

async function loadQuality(force = false) {
  if (!v4State.crmReady || !canOpenV4Tab('leads') || busy) return;
  if (!force && snapshot && Date.now() - loadedAt < CACHE_MS) {
    renderPanel();
    return;
  }

  busy = true;
  errorText = '';
  renderPanel();
  try {
    const [leads, needs, orders, expenses, designTasks] = await Promise.all([
      readRows('leader_leads', LEAD_FIELDS),
      readRows('leader_lead_needs', NEED_FIELDS),
      readRows('leader_orders', 'id,status'),
      readRows('leader_expenses', 'id,status'),
      readRows('leader_design_tasks', 'id,task_status')
    ]);
    const active = leads.filter(activeLead);
    const now = Date.now();
    const unassigned = active.filter((lead) => !lead.assigned_to);
    const withoutNextContact = active.filter((lead) => !lead.next_contact_at);
    const overdueContact = active.filter((lead) => lead.next_contact_at && new Date(lead.next_contact_at).getTime() < now);
    const needsBelow80 = needs.filter((need) => Number(need.completeness_score || 0) < 80);

    snapshot = {
      activeUnassigned: unassigned.length,
      activeWithoutNextContact: withoutNextContact.length,
      activeOverdueContact: overdueContact.length,
      needsBelow80: needsBelow80.length,
      ordersTotal: orders.length,
      expensesTotal: expenses.length,
      designTasksTotal: designTasks.length,
      queues: {
        unassigned: unassigned.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || ''))),
        no_next_contact: withoutNextContact.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || ''))),
        overdue_contact: overdueContact.sort((a, b) => String(a.next_contact_at || '').localeCompare(String(b.next_contact_at || ''))),
        needs_below_80: needsBelow80.sort((a, b) => Number(a.completeness_score || 0) - Number(b.completeness_score || 0))
      }
    };
    loadedAt = Date.now();
    if (activeQueue) openQueue(activeQueue);
  } catch (error) {
    console.warn('CRM operational quality read warning:', error);
    errorText = 'Не удалось загрузить read-only показатели. Рабочие данные CRM не изменялись.';
    closeQueue();
  } finally {
    busy = false;
    renderPanel();
  }
}

function openQueueLead(leadId) {
  if (!leadId) return;
  closeQueue();
  openLeadRoute(leadId);
  if (typeof window.v4SetTab === 'function') window.v4SetTab('card');
}

function boot() {
  renderPanel();
  subscribeState(() => renderPanel());
  document.addEventListener('leader-v4:crm-ready', () => loadQuality(true));
  document.addEventListener('leader-v4:leads-loaded', () => loadQuality(false));
  document.addEventListener('leader-v4:tab-opened', (event) => {
    if (event.detail?.tab === 'leads') loadQuality(false);
  });
  document.addEventListener('click', (event) => {
    const refresh = event.target.closest?.('[data-quality-refresh]');
    if (refresh) {
      event.preventDefault();
      loadQuality(true);
      return;
    }
    const queue = event.target.closest?.('[data-quality-queue]');
    if (queue) {
      event.preventDefault();
      openQueue(queue.dataset.qualityQueue);
      return;
    }
    const open = event.target.closest?.('[data-quality-open-lead]');
    if (open) {
      event.preventDefault();
      openQueueLead(open.dataset.qualityOpenLead);
      return;
    }
    if (event.target.closest?.('[data-quality-queue-close]') || event.target.classList?.contains('v4-quality-queue-modal')) {
      event.preventDefault();
      closeQueue();
    }
  }, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && activeQueue) closeQueue();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
