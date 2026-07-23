import { v4State } from './state.js';
import { setStatus, toast } from './ui.js';
import { evaluateLeadAssigneeTransition } from './lead-assignee-transition-guard-model-v1.js';

const NOTE_ID = 'leadAssigneeTransitionGuardNote';
const STYLE_ID = 'leadAssigneeTransitionGuardStyles';

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `#${NOTE_ID}{margin:10px 0 0;border:1px solid #fcd34d;background:#fffbeb;color:#92400e;border-radius:12px;padding:10px 12px;font-weight:800;line-height:1.45}#leadCardSection [data-assignee-transition-blocked="1"]{opacity:.55;cursor:not-allowed}`;
  document.head.appendChild(style);
}

function currentLead() {
  return v4State.currentLead || null;
}

function statusButtons() {
  return [...document.querySelectorAll('#leadCardSection [data-lead-status]')];
}

function removeNote() {
  document.getElementById(NOTE_ID)?.remove();
}

function renderNote(message) {
  const details = document.getElementById('leadOtherActions');
  if (!details) return;
  let note = document.getElementById(NOTE_ID);
  if (!note) {
    note = document.createElement('div');
    note.id = NOTE_ID;
    note.setAttribute('role', 'note');
    const actions = details.querySelector('.v4-quick-actions');
    if (actions) actions.insertAdjacentElement('beforebegin', note);
    else details.appendChild(note);
  }
  note.textContent = message;
}

function decorateLeadCard(lead = currentLead()) {
  ensureStyles();
  removeNote();
  if (!lead) return;

  let blockedCount = 0;
  let blockedMessage = '';
  for (const button of statusButtons()) {
    const guard = evaluateLeadAssigneeTransition(lead, button.dataset.leadStatus || '');
    const blocked = guard.code === 'assignee_required';
    button.disabled = blocked;
    button.dataset.assigneeTransitionBlocked = blocked ? '1' : '0';
    if (blocked) {
      blockedCount += 1;
      blockedMessage = guard.message;
      button.setAttribute('aria-disabled', 'true');
      button.title = guard.message;
    } else {
      button.removeAttribute('aria-disabled');
      if (button.title === 'Сначала назначьте ответственного, затем переводите заявку в работу.') button.removeAttribute('title');
    }
  }

  if (blockedCount) {
    renderNote(`${blockedMessage} Статусы отказа и спама доступны без назначения.`);
  }
}

function focusAssignmentAction() {
  const target = document.getElementById('leadPrimaryActionHost');
  target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target?.querySelector('button')?.focus({ preventScroll: true });
}

function interceptBlockedTransition(event) {
  const button = event.target.closest?.('#leadCardSection [data-lead-status]');
  if (!button) return;
  const guard = evaluateLeadAssigneeTransition(currentLead(), button.dataset.leadStatus || '');
  if (guard.allowed) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  toast(guard.message);
  setStatus(guard.message, 'warn');
  focusAssignmentAction();
}

function boot() {
  ensureStyles();
  document.addEventListener('click', interceptBlockedTransition, true);
  document.addEventListener('leader-v4:lead-card-rendered', (event) => decorateLeadCard(event.detail?.lead || currentLead()));
  if (currentLead()) decorateLeadCard();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
