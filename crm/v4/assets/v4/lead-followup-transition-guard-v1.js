import { v4State, subscribeState } from './state.js';
import { setStatus, toast } from './ui.js';
import {
  evaluateLeadFollowupTransition,
  evaluateOfferFollowupAction
} from './lead-followup-transition-guard-model-v1.js';

const STYLE_ID = 'leadFollowupTransitionGuardStyles';
const STATUS_NOTE_ID = 'leadFollowupTransitionGuardNote';
const OFFER_NOTE_ID = 'offerFollowupTransitionGuardNote';
const BLOCKED_TITLE = 'Сначала назначьте будущую дату следующего контакта.';
let syncScheduled = false;

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `[data-followup-transition-blocked="1"],[data-followup-offer-blocked="1"]{opacity:.62;cursor:not-allowed}.v4-followup-transition-note{margin:10px 0;border:1px solid #fcd34d;background:#fffbeb;color:#92400e;border-radius:12px;padding:10px 12px;font-weight:800;line-height:1.45}`;
  document.head.appendChild(style);
}

function currentLead() {
  return v4State.currentLead || null;
}

function ensureNote(id, host, message, before = null) {
  if (!host) return null;
  let note = document.getElementById(id);
  if (!note) {
    note = document.createElement('div');
    note.id = id;
    note.className = 'v4-followup-transition-note';
    note.setAttribute('role', 'note');
    if (before && before.parentElement === host) host.insertBefore(note, before);
    else host.appendChild(note);
  }
  if (note.textContent !== message) note.textContent = message;
  return note;
}

function removeNote(id) {
  document.getElementById(id)?.remove();
}

function syncLeadStatusButtons(lead) {
  let blockedCount = 0;
  let message = '';
  document.querySelectorAll('#leadCardSection [data-lead-status]').forEach((button) => {
    const guard = evaluateLeadFollowupTransition(lead, button.dataset.leadStatus || '');
    const blocked = !guard.allowed && guard.requiresFollowup;
    button.dataset.followupTransitionBlocked = blocked ? '1' : '0';
    button.classList.toggle('is-followup-blocked', blocked);
    if (blocked) {
      blockedCount += 1;
      message = guard.message;
      button.setAttribute('aria-disabled', 'true');
      button.title = guard.message;
    } else {
      if (button.dataset.assigneeTransitionBlocked !== '1') button.removeAttribute('aria-disabled');
      if (button.title === BLOCKED_TITLE || button.title.includes('будущую дату возврата к клиенту')) button.removeAttribute('title');
    }
  });

  const details = document.getElementById('leadOtherActions');
  const actions = details?.querySelector('.v4-quick-actions') || null;
  if (blockedCount && details) {
    ensureNote(
      STATUS_NOTE_ID,
      details,
      `${message} После сохранения даты статусы «КП отправлено» и «Ждём ответ» станут доступны.`,
      actions
    );
  } else {
    removeNote(STATUS_NOTE_ID);
  }
}

function syncOfferButtons(lead) {
  const buttons = [...document.querySelectorAll('#offersBox .v4-offer-card button[data-action="mark-offer-sent"]')];
  let blockedCount = 0;
  let message = '';

  buttons.forEach((button) => {
    const guard = evaluateOfferFollowupAction(lead, button.dataset.action || '');
    const blocked = !guard.allowed;
    button.dataset.followupOfferBlocked = blocked ? '1' : '0';
    button.classList.toggle('is-followup-blocked', blocked);
    if (blocked) {
      blockedCount += 1;
      message = guard.message;
      button.setAttribute('aria-disabled', 'true');
      button.title = guard.message;
    } else {
      button.removeAttribute('aria-disabled');
      if (button.title && button.title.includes('будущую дату возврата к клиенту')) button.removeAttribute('title');
    }
  });

  const section = document.querySelector('#offersBox .v4-offers-section');
  const head = section?.querySelector('.v4-subcard-head') || null;
  if (blockedCount && section) {
    ensureNote(
      OFFER_NOTE_ID,
      section,
      `${message} Укажите дату в блоке «Следующий контакт», затем отметьте КП отправленным.`,
      head?.nextElementSibling || null
    );
  } else {
    removeNote(OFFER_NOTE_ID);
  }
}

function syncAll() {
  syncScheduled = false;
  ensureStyles();
  const lead = currentLead();
  if (!lead) {
    removeNote(STATUS_NOTE_ID);
    removeNote(OFFER_NOTE_ID);
    return;
  }
  syncLeadStatusButtons(lead);
  syncOfferButtons(lead);
}

function scheduleSync() {
  if (syncScheduled) return;
  syncScheduled = true;
  queueMicrotask(syncAll);
}

function focusNextContact() {
  const details = document.getElementById('leadNextContactDetails');
  if (details) details.open = true;
  details?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => document.getElementById('leadNextContactInput')?.focus(), 220);
}

function blockTransition(event, message) {
  event.preventDefault();
  event.stopImmediatePropagation();
  toast(message);
  setStatus(message, 'warn');
  focusNextContact();
}

function guardClicks(event) {
  const statusButton = event.target.closest?.('#leadCardSection [data-lead-status]');
  if (statusButton) {
    const guard = evaluateLeadFollowupTransition(currentLead(), statusButton.dataset.leadStatus || '');
    if (!guard.allowed && guard.requiresFollowup) blockTransition(event, guard.message);
    return;
  }

  const offerButton = event.target.closest?.('#offersBox .v4-offer-card button[data-action="mark-offer-sent"]');
  if (!offerButton) return;
  const guard = evaluateOfferFollowupAction(currentLead(), offerButton.dataset.action || '');
  if (!guard.allowed) blockTransition(event, guard.message);
}

function observeLeadCard() {
  const host = document.getElementById('leadCardSection');
  if (!host) return;
  new MutationObserver(scheduleSync).observe(host, { childList: true, subtree: true });
}

function boot() {
  ensureStyles();
  document.addEventListener('click', guardClicks, true);
  document.addEventListener('leader-v4:lead-card-rendered', scheduleSync);
  document.addEventListener('leader-v4:offers-loaded', scheduleSync);
  document.addEventListener('leader-v4:route-change', scheduleSync);
  subscribeState(scheduleSync);
  observeLeadCard();
  scheduleSync();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
