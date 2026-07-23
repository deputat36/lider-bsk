import { supabaseClient } from './supabase-client.js';
import { V4_CONFIG } from './config.js';
import { v4State, setState } from './state.js';
import { setStatus, toast } from './ui.js';
import {
  createLeadWorkflowIdempotencyKey,
  invokeStagingLeadWorkflow,
  leadWorkflowPersistenceRoute
} from './lead-workflow-staging-transport-v1.js';

const route = leadWorkflowPersistenceRoute(V4_CONFIG.supabaseUrl);
let busy = false;

function text(value) { return String(value ?? '').trim(); }

function nextContactDate(kind) {
  const date = new Date();
  if (kind === 'today17') date.setHours(17, 0, 0, 0);
  if (kind === 'tomorrow') { date.setDate(date.getDate() + 1); date.setHours(10, 0, 0, 0); }
  if (kind === 'plus3d') { date.setDate(date.getDate() + 3); date.setHours(10, 0, 0, 0); }
  if (kind === 'plus7d') { date.setDate(date.getDate() + 7); date.setHours(10, 0, 0, 0); }
  return date.toISOString();
}

function actionFromClick(target) {
  if (!target?.closest) return null;
  const card = target.closest('#leadCardSection');
  if (!card) return null;

  const primary = target.closest('[data-lead-primary-action]');
  if (primary?.dataset.leadPrimaryAction === 'assign_self') {
    const userId = text(v4State.user?.id);
    const lead = v4State.currentLead || {};
    if (!userId) return { button: primary, error: 'Не найден текущий пользователь staging.' };
    return {
      button: primary,
      label: 'Назначаю ответственного...',
      patch: {
        assigned_to: userId,
        status: text(lead.status) === 'Новая' || !text(lead.status) ? 'В работе' : text(lead.status)
      }
    };
  }

  const statusButton = target.closest('[data-lead-status]');
  if (statusButton) {
    const status = text(statusButton.dataset.leadStatus);
    if (!status) return null;
    return { button: statusButton, label: 'Обновляю статус...', patch: { status } };
  }

  const contactButton = target.closest('[data-next-contact]');
  if (contactButton) {
    const kind = text(contactButton.dataset.nextContact);
    let nextContactAt = null;
    if (kind === 'save') {
      const inputValue = text(document.getElementById('leadNextContactInput')?.value);
      if (inputValue && !Number.isFinite(Date.parse(inputValue))) {
        return { button: contactButton, error: 'Проверьте дату и время следующего контакта.' };
      }
      nextContactAt = inputValue ? new Date(inputValue).toISOString() : null;
    } else if (kind !== 'clear') {
      nextContactAt = nextContactDate(kind);
    }
    const currentStatus = text(v4State.currentLead?.status) || 'Новая';
    return {
      button: contactButton,
      label: 'Сохраняю следующий контакт...',
      patch: {
        next_contact_at: nextContactAt,
        status: currentStatus === 'Новая' ? 'Ждём ответ' : currentStatus
      }
    };
  }

  return null;
}

function mergeLeadState(partialLead) {
  const current = v4State.currentLead || {};
  const merged = { ...current, ...(partialLead || {}) };
  setState({
    currentLead: merged,
    leads: (v4State.leads || []).map((lead) => lead.id === merged.id ? { ...lead, ...merged } : lead)
  });
  return merged;
}

function refreshCard() {
  const button = document.getElementById('refreshLeadBtn');
  if (button) window.setTimeout(() => button.click(), 0);
}

async function saveWorkflow(action) {
  const lead = v4State.currentLead;
  if (!lead?.id || !lead?.updated_at) {
    toast('Карточка заявки ещё не готова. Обновите её.');
    return;
  }
  if (action.error) {
    toast(action.error);
    setStatus(action.error, 'error');
    return;
  }
  if (busy) {
    toast('Предыдущее изменение заявки ещё сохраняется.');
    return;
  }

  let idempotencyKey;
  try {
    idempotencyKey = createLeadWorkflowIdempotencyKey(lead.id);
  } catch (_) {
    toast('Не удалось создать безопасный идентификатор команды.');
    setStatus('Ошибка подготовки команды заявки', 'error');
    return;
  }

  busy = true;
  if (action.button) action.button.disabled = true;
  setStatus(action.label || 'Сохраняю рабочий маршрут...', 'warn');

  try {
    const result = await invokeStagingLeadWorkflow({
      client: supabaseClient,
      supabaseUrl: V4_CONFIG.supabaseUrl,
      lead,
      patch: action.patch,
      idempotencyKey
    });

    if (!result.ok) {
      toast(result.message);
      setStatus(result.message, result.kind === 'no_effect' ? 'warn' : 'error');
      if (result.kind === 'conflict') refreshCard();
      return;
    }

    const merged = mergeLeadState(result.data?.lead);
    document.dispatchEvent(new CustomEvent('leader-v4:lead-workflow-updated', {
      detail: { lead: merged, requestId: result.requestId, replay: result.replay === true }
    }));
    toast(result.message);
    setStatus(result.message, 'good');
    refreshCard();
  } catch (_) {
    toast('Не удалось сохранить рабочий маршрут заявки.');
    setStatus('Ошибка защищённого сохранения заявки', 'error');
  } finally {
    busy = false;
    if (action.button?.isConnected) action.button.disabled = false;
  }
}

function interceptStagingWorkflow(event) {
  if (route.mode !== 'staging_edge') return;
  const action = actionFromClick(event.target);
  if (!action) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  saveWorkflow(action);
}

document.addEventListener('click', interceptStagingWorkflow, true);
