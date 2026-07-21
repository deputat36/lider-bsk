import { v4State, subscribeState } from './state.js';
import { byId, setStatus, toast } from './ui.js';
import {
  canLeadStatusTransition,
  leadStatusFilterOptions,
  leadStatusUiModel,
  rawLeadStatus
} from './lead-status-ui-model-v1.js?v=20260721-followup-1';

const STYLE_ID = 'leadStatusUiRegistryV1Styles';
let syncScheduled = false;

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (match) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[match]));
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `.v4-lead-status.is-unknown{border-color:#f59e0b;background:#fffbeb;color:#92400e}.v4-status-registry-warning{width:100%;border:1px solid #fcd34d;background:#fffbeb;color:#92400e;border-radius:12px;padding:9px;font-size:12px;font-weight:900}.v4-status-registry-note{width:100%;border:1px dashed #cbd5e1;background:#f8fafc;color:#475569;border-radius:12px;padding:8px;font-size:12px;font-weight:800}.v4-lead-inline-hint.is-unknown-status{background:#fffbeb;border-color:#fcd34d;color:#92400e}`;
  document.head.appendChild(style);
}

function optionSignature(options) {
  return options.map((item) => `${item.value}\u0000${item.label}`).join('\u0001');
}

function currentOptionSignature(select) {
  return [...select.options].map((item) => `${item.value}\u0000${item.textContent || ''}`).join('\u0001');
}

function syncStatusFilter() {
  const select = byId('leadStatusFilter');
  if (!select) return;
  const current = select.value || v4State.leadFilters?.status || 'active';
  const options = leadStatusFilterOptions(v4State.leads || [], current);
  const expected = optionSignature(options);
  if (currentOptionSignature(select) !== expected) {
    select.innerHTML = options.map((item) => `<option value="${esc(item.value)}"${item.value === current ? ' selected' : ''}${item.unknown ? ' data-unknown-status="true"' : ''}>${esc(item.label)}</option>`).join('');
  }
  select.value = options.some((item) => item.value === current) ? current : 'active';
}

function leadById(id) {
  return (v4State.leads || []).find((lead) => String(lead.id) === String(id)) || null;
}

function ensureHints(card) {
  let hints = card.querySelector('.v4-lead-inline-hints');
  if (hints) return hints;
  const title = card.querySelector('.v4-lead-title-row');
  if (!title) return null;
  hints = document.createElement('div');
  hints.className = 'v4-lead-inline-hints';
  title.insertAdjacentElement('afterend', hints);
  return hints;
}

function syncLeadListCards() {
  document.querySelectorAll('.v4-lead-card[data-id]').forEach((card) => {
    const lead = leadById(card.dataset.id);
    if (!lead) return;
    const model = leadStatusUiModel(lead.status);
    const chip = card.querySelector('.v4-lead-status');
    if (chip) {
      chip.classList.toggle('is-unknown', !model.known);
      chip.title = model.known ? `Registry: ${model.key}` : model.warning;
    }

    const hints = ensureHints(card);
    let unknownHint = card.querySelector('[data-lead-unknown-status]');
    if (!model.known && hints) {
      if (!unknownHint) {
        unknownHint = document.createElement('span');
        unknownHint.className = 'v4-lead-inline-hint is-unknown-status';
        unknownHint.dataset.leadUnknownStatus = 'true';
        hints.appendChild(unknownHint);
      }
      unknownHint.textContent = `Неизвестный статус: ${model.raw}`;
      unknownHint.title = model.warning;
    } else if (unknownHint) {
      unknownHint.remove();
    }

    const workButton = card.querySelector('button[data-action="work"]');
    if (workButton) {
      const allowed = model.known && model.key !== 'in_work' && canLeadStatusTransition(model.raw, 'В работе');
      workButton.hidden = !allowed;
      workButton.disabled = !allowed;
      workButton.title = allowed ? 'Перевести по registry в статус «В работе»' : (model.known ? 'Переход в работу недоступен из текущего статуса' : model.warning);
    }
  });
}

function transitionButton(item) {
  const danger = ['rejected', 'no_answer', 'expensive', 'cancelled', 'spam'].includes(item.key) ? ' is-danger' : '';
  return `<button type="button" class="v4-chip-button${danger}" data-lead-status="${esc(item.label)}" data-status-key="${esc(item.key)}">${esc(item.label)}</button>`;
}

function syncLeadCardStatusActions() {
  const host = document.querySelector('#leadCardSection .v4-quick-actions');
  if (!host || !v4State.currentLead) return;
  const model = leadStatusUiModel(v4State.currentLead.status);
  const signature = `${model.raw}|${model.transitions.map((item) => item.key).join(',')}`;
  if (host.dataset.registrySignature === signature) return;
  host.dataset.registrySignature = signature;

  if (!model.known) {
    host.innerHTML = `<div class="v4-status-registry-warning">${esc(model.warning)}</div>`;
    return;
  }

  const current = `<button type="button" class="v4-chip-button is-active" disabled aria-pressed="true">${esc(model.label)}</button>`;
  const transitions = model.transitions.map(transitionButton).join('');
  const note = model.terminal
    ? '<div class="v4-status-registry-note">Статус завершён. Возврат не предусмотрен текущим registry.</div>'
    : (!transitions ? '<div class="v4-status-registry-note">Для текущего статуса не описаны доступные переходы.</div>' : '');
  host.innerHTML = `${current}${transitions}${note}`;
}

function blockTransition(event, message) {
  event.preventDefault();
  event.stopImmediatePropagation();
  toast(message);
  setStatus(message, 'error');
}

function guardStatusClicks(event) {
  const quickButton = event.target.closest?.('#leadCardSection [data-lead-status]');
  if (quickButton) {
    const from = rawLeadStatus(v4State.currentLead?.status);
    const to = rawLeadStatus(quickButton.dataset.leadStatus);
    if (!canLeadStatusTransition(from, to)) {
      blockTransition(event, `Переход «${from} → ${to}» не разрешён registry.`);
    }
    return;
  }

  const nextContactButton = event.target.closest?.('#leadCardSection [data-next-contact]');
  if (nextContactButton) {
    const model = leadStatusUiModel(v4State.currentLead?.status);
    if (model.key === 'new' && !canLeadStatusTransition(model.raw, 'Ждём ответ')) {
      blockTransition(event, 'Сначала переведите новую заявку в работу, затем назначьте следующий контакт.');
    }
    return;
  }

  const workButton = event.target.closest?.('#leadsList button[data-action="work"]');
  if (!workButton) return;
  const card = workButton.closest('.v4-lead-card[data-id]');
  const lead = leadById(card?.dataset.id);
  const from = rawLeadStatus(lead?.status);
  if (!lead || !canLeadStatusTransition(from, 'В работе')) {
    blockTransition(event, lead ? `Переход «${from} → В работе» не разрешён registry.` : 'Заявка не найдена в загруженном списке.');
  }
}

function syncAll() {
  syncScheduled = false;
  ensureStyles();
  syncStatusFilter();
  syncLeadListCards();
  syncLeadCardStatusActions();
}

function scheduleSync() {
  if (syncScheduled) return;
  syncScheduled = true;
  queueMicrotask(syncAll);
}

function observeHost(id) {
  const host = byId(id);
  if (!host) return;
  new MutationObserver(scheduleSync).observe(host, { childList: true, subtree: true });
}

function boot() {
  document.addEventListener('click', guardStatusClicks, true);
  document.addEventListener('leader-v4:leads-loaded', scheduleSync);
  document.addEventListener('leader-v4:lead-card-rendered', scheduleSync);
  document.addEventListener('leader-v4:tab-opened', scheduleSync);
  subscribeState(scheduleSync);
  observeHost('leadsSection');
  observeHost('leadCardSection');
  scheduleSync();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
