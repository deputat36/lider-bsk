import { supabaseClient } from './supabase-client.js';
import { v4State, subscribeState } from './state.js';
import { canOpenV4Tab } from './role-tab-permissions-v1.js';

const PANEL_ID = 'leadOperationalQualityV1';
const STYLE_ID = 'leadOperationalQualityV1Styles';
const TERMINAL_LEAD_STATUSES = new Set(['Создан заказ', 'Отказ', 'Не отвечает', 'Дорого', 'Передумал', 'Спам']);
const CACHE_MS = 60000;

let busy = false;
let loadedAt = 0;
let snapshot = null;
let errorText = '';

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `.v4-quality-panel{margin:12px 0 14px;border:1px solid #fed7aa;background:#fffaf5;border-radius:16px;padding:12px;display:grid;gap:10px}.v4-quality-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.v4-quality-head h3{margin:0;color:#9a3412;font-size:15px}.v4-quality-head p{margin:5px 0 0;color:#7c2d12;font-size:12px;font-weight:800}.v4-quality-head button{border:1px solid #fdba74;background:#fff;color:#9a3412;border-radius:999px;padding:6px 10px;font-weight:900;cursor:pointer}.v4-quality-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px}.v4-quality-card{border:1px solid #fed7aa;background:#fff;border-radius:14px;padding:10px}.v4-quality-card span{display:block;color:#9a3412;font-size:11px;font-weight:900;text-transform:uppercase}.v4-quality-card b{display:block;margin-top:4px;font-size:22px;color:#431407}.v4-quality-card small{display:block;margin-top:4px;color:#78716c}.v4-quality-card.is-good{border-color:#bbf7d0;background:#f0fdf4}.v4-quality-card.is-good span,.v4-quality-card.is-good b{color:#166534}.v4-quality-note{border:1px dashed #fdba74;border-radius:12px;padding:9px;color:#7c2d12;font-size:12px;font-weight:800}.v4-quality-error{border:1px solid #fecaca;background:#fff1f2;color:#991b1b;border-radius:12px;padding:9px;font-weight:800}@media(max-width:640px){.v4-quality-head{display:grid}.v4-quality-head button{width:100%}}`;
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

function activeLead(lead) {
  return !TERMINAL_LEAD_STATUSES.has(lead?.status || 'Новая');
}

function qualityCard(label, value, hint, goodWhenZero = true) {
  const numeric = Number(value || 0);
  const good = goodWhenZero ? numeric === 0 : numeric > 0;
  return `<div class="v4-quality-card${good ? ' is-good' : ''}"><span>${esc(label)}</span><b>${esc(numeric)}</b><small>${esc(hint)}</small></div>`;
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
    panel.innerHTML = `<div class="v4-quality-head"><div><h3>Операционное качество CRM</h3><p>Только агрегаты, без персональных данных и финансовых сумм.</p></div><button type="button" data-quality-refresh>Повторить</button></div><div class="v4-quality-error">${esc(errorText)}</div>`;
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
        <p>Read-only snapshot всей доступной базы. Персональные данные и суммы не выводятся.</p>
      </div>
      <button type="button" data-quality-refresh>Обновить</button>
    </div>
    <div class="v4-quality-grid">
      ${qualityCard('Активные без ответственного', snapshot.activeUnassigned, 'Назначьте менеджера')}
      ${qualityCard('Без следующего контакта', snapshot.activeWithoutNextContact, 'Укажите дату следующего шага')}
      ${qualityCard('Потребности ниже 80%', snapshot.needsBelow80, 'Дозаполните бриф до расчёта/КП')}
      ${qualityCard('Заказы', snapshot.ordersTotal, 'Связанные заказы в CRM', false)}
      ${qualityCard('Записи расходов', snapshot.expensesTotal, 'Нужны для фактической прибыли', false)}
      ${qualityCard('Дизайн-задачи', snapshot.designTasksTotal, 'Нужны для отдельного дизайн-процесса', false)}
    </div>
    <div class="v4-quality-note">Панель не меняет данные. Исторические строки без request_id/phone_normalized не исправляются автоматически.</div>`;
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
      readRows('leader_leads', 'id,status,assigned_to,next_contact_at'),
      readRows('leader_lead_needs', 'id,completeness_score,status'),
      readRows('leader_orders', 'id,status'),
      readRows('leader_expenses', 'id,status'),
      readRows('leader_design_tasks', 'id,status')
    ]);
    const active = leads.filter(activeLead);
    snapshot = {
      activeUnassigned: active.filter((lead) => !lead.assigned_to).length,
      activeWithoutNextContact: active.filter((lead) => !lead.next_contact_at).length,
      needsBelow80: needs.filter((need) => Number(need.completeness_score || 0) < 80).length,
      ordersTotal: orders.length,
      expensesTotal: expenses.length,
      designTasksTotal: designTasks.length
    };
    loadedAt = Date.now();
  } catch (error) {
    console.warn('CRM operational quality read warning:', error);
    errorText = 'Не удалось загрузить агрегированные показатели. Рабочие данные CRM не изменялись.';
  } finally {
    busy = false;
    renderPanel();
  }
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
    if (!event.target.closest?.('[data-quality-refresh]')) return;
    event.preventDefault();
    loadQuality(true);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
