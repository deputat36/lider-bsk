import { supabaseClient } from './supabase-client.js';
import { V4_CONFIG } from './config.js';
import { timeout } from './api.js';
import { v4State, setState } from './state.js';
import { setStatus, toast } from './ui.js';
import { buildStagingLeadListWorkflowAction } from './lead-workflow-staging-list-model-v1.js';
import {
  createLeadWorkflowIdempotencyKey,
  invokeStagingLeadWorkflow,
  leadWorkflowPersistenceRoute
} from './lead-workflow-staging-transport-v1.js';

const route = leadWorkflowPersistenceRoute(V4_CONFIG.supabaseUrl);
let busy = false;

function text(value) { return String(value ?? '').trim(); }

function e2eDiagnosticProbe(stage) {
  if (route.mode !== 'staging_edge' || !['127.0.0.1', 'localhost'].includes(window.location.hostname)) return;
  const safeStage = text(stage).toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 64);
  if (!safeStage) return;
  const base = text(V4_CONFIG.supabaseUrl).replace(/\/+$/, '');
  const key = text(V4_CONFIG.supabasePublishableKey);
  if (!base || !key) return;
  fetch(`${base}/rest/v1/rpc/crm_e2e_diag_${safeStage}`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: '{}'
  }).catch(() => undefined);
}

function nextContactDate(kind) {
  const date = new Date();
  if (kind === 'today17') date.setHours(17, 0, 0, 0);
  if (kind === 'tomorrow') { date.setDate(date.getDate() + 1); date.setHours(10, 0, 0, 0); }
  if (kind === 'plus3d') { date.setDate(date.getDate() + 3); date.setHours(10, 0, 0, 0); }
  if (kind === 'plus7d') { date.setDate(date.getDate() + 7); date.setHours(10, 0, 0, 0); }
  return date.toISOString();
}

function cardActionFromClick(target) {
  const card = target.closest('#leadCardSection');
  if (!card) return null;

  const primary = target.closest('[data-lead-primary-action]');
  if (primary?.dataset.leadPrimaryAction === 'assign_self') {
    const userId = text(v4State.user?.id);
    const lead = v4State.currentLead || {};
    if (!userId) return { button: primary, context: 'card', error: 'Не найден текущий пользователь staging.' };
    return {
      button: primary,
      context: 'card',
      lead,
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
    return {
      button: statusButton,
      context: 'card',
      lead: v4State.currentLead,
      label: 'Обновляю статус...',
      patch: { status }
    };
  }

  const contactButton = target.closest('[data-next-contact]');
  if (contactButton) {
    const kind = text(contactButton.dataset.nextContact);
    let nextContactAt = null;
    if (kind === 'save') {
      const inputValue = text(document.getElementById('leadNextContactInput')?.value);
      if (inputValue && !Number.isFinite(Date.parse(inputValue))) {
        return { button: contactButton, context: 'card', error: 'Проверьте дату и время следующего контакта.' };
      }
      nextContactAt = inputValue ? new Date(inputValue).toISOString() : null;
    } else if (kind !== 'clear') {
      nextContactAt = nextContactDate(kind);
    }
    const currentStatus = text(v4State.currentLead?.status) || 'Новая';
    return {
      button: contactButton,
      context: 'card',
      lead: v4State.currentLead,
      label: 'Сохраняю следующий контакт...',
      patch: {
        next_contact_at: nextContactAt,
        status: currentStatus === 'Новая' ? 'Ждём ответ' : currentStatus
      }
    };
  }

  return null;
}

function listActionFromClick(target) {
  if (!target.closest('#leadsSection')) return null;
  const button = target.closest('button[data-action]');
  const actionName = text(button?.dataset.action);
  if (!['take', 'work'].includes(actionName)) return null;

  const leadId = text(button.closest('.v4-lead-card')?.dataset.id);
  const lead = (v4State.leads || []).find((item) => text(item?.id) === leadId) || null;
  const model = buildStagingLeadListWorkflowAction({
    action: actionName,
    lead,
    userId: v4State.user?.id
  });
  if (!model) return null;
  return {
    ...model,
    button,
    context: 'list',
    listActionName: actionName
  };
}

function actionFromClick(target) {
  if (!target?.closest) return null;
  return cardActionFromClick(target) || listActionFromClick(target);
}

async function loadCurrentLeadVersion(lead) {
  if (!lead?.id) return null;
  if (lead.updated_at) return lead;

  const response = await timeout(
    supabaseClient
      .from('leader_leads')
      .select('id,status,assigned_to,next_contact_at,updated_at')
      .eq('id', lead.id)
      .maybeSingle(),
    12000,
    'Актуальная версия заявки не загрузилась за 12 секунд'
  );
  if (response.error) throw response.error;
  if (!response.data?.updated_at) throw new Error('Актуальная версия заявки не найдена');
  return { ...lead, ...response.data };
}

async function resolveAction(action) {
  if (action.error) return action;
  const lead = await loadCurrentLeadVersion(action.lead || v4State.currentLead);
  if (!lead) return { ...action, error: 'Заявка ещё не готова. Обновите список.' };

  if (action.context !== 'list') return { ...action, lead };

  const refreshedModel = buildStagingLeadListWorkflowAction({
    action: action.listActionName,
    lead,
    userId: v4State.user?.id
  });
  return refreshedModel
    ? { ...action, ...refreshedModel, lead }
    : { ...action, lead, error: 'Действие списка заявки не распознано.' };
}

function mergeLeadState(partialLead) {
  const partial = partialLead && typeof partialLead === 'object' ? partialLead : {};
  const id = text(partial.id);
  const current = v4State.currentLead;
  const mergedCurrent = id && text(current?.id) === id ? { ...current, ...partial } : current;
  const mergedList = (v4State.leads || []).map((lead) => (
    id && text(lead?.id) === id ? { ...lead, ...partial } : lead
  ));
  const merged = id && text(mergedCurrent?.id) === id
    ? mergedCurrent
    : mergedList.find((lead) => text(lead?.id) === id) || partial;

  setState({
    currentLead: mergedCurrent,
    leads: mergedList
  });
  return merged;
}

function refreshCard(leadId = '') {
  if (leadId && text(v4State.currentLead?.id) !== text(leadId)) return;
  const button = document.getElementById('refreshLeadBtn');
  if (button) window.setTimeout(() => button.click(), 0);
}

function refreshList({ openLeadId = '' } = {}) {
  window.setTimeout(() => {
    if (openLeadId) {
      const card = [...document.querySelectorAll('#leadsList .v4-lead-card')]
        .find((item) => text(item?.dataset.id) === text(openLeadId));
      card?.querySelector('button[data-action="open"]')?.click();
    }
    document.getElementById('reloadLeadsBtn')?.click();
  }, 0);
}

function refreshAfterResult(action, leadId) {
  if (action.context === 'list') refreshList({ openLeadId: leadId });
  else refreshCard(leadId);
}

function dispatchWorkflowUpdated({ lead, result, action }) {
  document.dispatchEvent(new CustomEvent('leader-v4:lead-workflow-updated', {
    detail: {
      lead,
      requestId: result.requestId,
      replay: result.replay === true,
      source: action.context === 'list' ? 'lead_list' : 'lead_card'
    }
  }));
}

function reconcileSuccessfulWorkflow({ serverLead, result, action, fallbackLead }) {
  let merged = serverLead;
  try {
    merged = mergeLeadState(serverLead);
    toast(result.message);
    setStatus(result.message, 'good');
  } catch (error) {
    console.error('[leader-crm] lead workflow persisted but local reconciliation failed', error);
    toast('Изменение заявки сохранено. Обновляю карточку.');
    setStatus('Изменение сохранено, обновляю интерфейс', 'warn');
  }
  refreshAfterResult(action, merged?.id || serverLead?.id || fallbackLead?.id);
}

async function saveWorkflow(rawAction) {
  let action;
  try {
    action = await resolveAction(rawAction);
  } catch (_) {
    toast('Не удалось получить актуальную версию заявки. Обновите список.');
    setStatus('Актуальная версия заявки не загрузилась', 'error');
    refreshAfterResult(rawAction, rawAction.lead?.id);
    return;
  }

  const lead = action.lead;
  if (!lead?.id || !lead?.updated_at) {
    toast('Заявка ещё не готова. Обновите её.');
    refreshAfterResult(action, lead?.id);
    return;
  }
  if (action.error) {
    toast(action.error);
    setStatus(action.error, 'error');
    refreshAfterResult(action, lead.id);
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
  e2eDiagnosticProbe('invoke_start');

  try {
    const result = await invokeStagingLeadWorkflow({
      client: supabaseClient,
      supabaseUrl: V4_CONFIG.supabaseUrl,
      publishableKey: V4_CONFIG.supabasePublishableKey,
      lead,
      patch: action.patch,
      idempotencyKey
    });
    e2eDiagnosticProbe(`invoke_returned_${result.kind || 'unknown'}`);

    if (!result.ok) {
      toast(result.message);
      setStatus(result.message, result.kind === 'no_effect' ? 'warn' : 'error');
      if (result.kind === 'conflict') refreshAfterResult(action, lead.id);
      return;
    }

    const serverLead = result.data?.lead && typeof result.data.lead === 'object'
      ? result.data.lead
      : lead;

    dispatchWorkflowUpdated({ lead: serverLead, result, action });
    reconcileSuccessfulWorkflow({ serverLead, result, action, fallbackLead: lead });
  } catch (_) {
    e2eDiagnosticProbe('invoke_exception');
    toast('Не удалось сохранить рабочий маршрут заявки.');
    setStatus('Ошибка защищённого сохранения заявки', 'error');
    refreshAfterResult(action, lead.id);
  } finally {
    busy = false;
    if (action.button?.isConnected) action.button.disabled = false;
  }
}

function interceptStagingWorkflow(event) {
  if (route.mode !== 'staging_edge') return;
  const action = actionFromClick(event.target);
  if (!action) return;
  e2eDiagnosticProbe('click_intercepted');
  event.preventDefault();
  event.stopImmediatePropagation();
  saveWorkflow(action);
}

document.addEventListener('click', interceptStagingWorkflow, true);
e2eDiagnosticProbe('handler_ready');
