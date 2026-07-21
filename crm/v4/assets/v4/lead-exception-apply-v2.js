import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State } from './state.js';
import { setStatus, toast } from './ui.js';
import { buildLeadExceptionApplication, leadExceptionApplyOutcome } from './lead-exception-scenarios-v1.js';

const GLOBAL_FLAG = '__leaderLeadExceptionApplyV2';
const DEDUPE_WINDOW_MS = 15 * 60 * 1000;
const EVENT_RESULT_FIELDS = 'id,lead_id,event_type,old_status,new_status,body,created_by,created_by_email,created_at';

let busy = false;
let pendingApplication = null;

function publish(phase, application = pendingApplication, extra = {}) {
  document.dispatchEvent(new CustomEvent('leader-v4:lead-exception-apply-state', {
    detail: {
      phase,
      scenarioKey: application?.scenarioKey || '',
      application: application || null,
      ...extra
    }
  }));
}

async function saveLead(application) {
  const updateLead = window.leaderUpdateLeadForException;
  if (typeof updateLead !== 'function') {
    throw new Error('Карточка заявки ещё загружается. Повторите действие через несколько секунд.');
  }
  return updateLead({
    leadId: application.leadId,
    patch: application.leadPatch
  });
}

async function findRecentTimelineDuplicate(application) {
  const cutoff = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();
  const event = application.timelineEvent;
  const response = await timeout(
    supabaseClient
      .from('leader_lead_events')
      .select(EVENT_RESULT_FIELDS)
      .eq('lead_id', application.leadId)
      .eq('event_type', event.eventType)
      .eq('body', event.body)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(1),
    12000,
    'Проверка истории не завершилась за 12 секунд'
  );
  if (response.error) throw response.error;
  return response.data?.[0] || null;
}

async function saveTimeline(application, { checkDuplicate = false } = {}) {
  if (checkDuplicate) {
    const existing = await findRecentTimelineDuplicate(application);
    if (existing) return { event: existing, deduplicated: true };
  }
  const addEvent = window.leaderAddLeadEvent;
  if (typeof addEvent !== 'function') throw new Error('История заявки ещё загружается. Повторите запись через несколько секунд.');
  const event = await addEvent({
    leadId: application.leadId,
    eventType: application.timelineEvent.eventType,
    body: application.timelineEvent.body,
    oldStatus: application.timelineEvent.oldStatus,
    newStatus: application.timelineEvent.newStatus
  });
  return { event, deduplicated: false };
}

async function applyScenario(scenarioKey) {
  if (busy) return;
  const application = buildLeadExceptionApplication(scenarioKey, v4State.currentLead || {});
  if (!application) {
    publish('error', null, { message: 'Не удалось определить заявку или выбранный сценарий.' });
    return;
  }

  busy = true;
  pendingApplication = application;
  publish('applying', application, { message: 'Сохраняю статус, следующий контакт и историю...' });
  setStatus('Применяю изменение ситуации...', 'warn');

  try {
    await saveLead(application);
    try {
      const timeline = await saveTimeline(application);
      const outcome = leadExceptionApplyOutcome({ leadSaved: true, eventSaved: true, deduplicated: timeline.deduplicated });
      pendingApplication = null;
      publish(outcome.phase, application, { message: outcome.message, deduplicated: timeline.deduplicated });
      setStatus(outcome.message, 'good');
      toast('Изменения применены');
    } catch (timelineError) {
      const outcome = leadExceptionApplyOutcome({ leadSaved: true, eventSaved: false });
      publish(outcome.phase, application, { message: `${outcome.message} ${friendlyError(timelineError)}` });
      setStatus('Заявка обновлена, история требует повтора', 'warn');
      toast('Заявка обновлена, запись истории не подтверждена');
    }
  } catch (error) {
    const outcome = leadExceptionApplyOutcome({ leadSaved: false, eventSaved: false });
    pendingApplication = null;
    publish(outcome.phase, application, { message: `${outcome.message} ${friendlyError(error)}` });
    setStatus(`Ошибка изменения ситуации: ${friendlyError(error)}`, 'error');
    toast(friendlyError(error));
  } finally {
    busy = false;
  }
}

async function retryTimeline(application) {
  if (busy) return;
  const target = application || pendingApplication;
  if (!target?.leadId) {
    publish('error', null, { message: 'Нет записи, которую нужно повторить.' });
    return;
  }

  busy = true;
  pendingApplication = target;
  publish('retrying', target, { message: 'Проверяю историю и повторяю только недостающую запись...' });
  try {
    const timeline = await saveTimeline(target, { checkDuplicate: true });
    const outcome = leadExceptionApplyOutcome({ leadSaved: true, eventSaved: true, deduplicated: timeline.deduplicated });
    pendingApplication = null;
    publish(outcome.phase, target, { message: outcome.message, deduplicated: timeline.deduplicated });
    setStatus(outcome.message, 'good');
    toast('История заявки подтверждена');
  } catch (error) {
    const outcome = leadExceptionApplyOutcome({ leadSaved: true, eventSaved: false });
    publish(outcome.phase, target, { message: `${outcome.message} ${friendlyError(error)}` });
    setStatus(`История не сохранена: ${friendlyError(error)}`, 'error');
    toast(friendlyError(error));
  } finally {
    busy = false;
  }
}

function bind() {
  document.addEventListener('leader-v4:lead-exception-apply-requested', (event) => {
    applyScenario(event.detail?.scenarioKey || '');
  });
  document.addEventListener('leader-v4:lead-exception-history-retry-requested', (event) => {
    retryTimeline(event.detail?.application || pendingApplication);
  });
  document.addEventListener('leader-v4:route-change', (event) => {
    if (pendingApplication && event.detail?.leadId && event.detail.leadId !== pendingApplication.leadId) pendingApplication = null;
  });
}

if (!window[GLOBAL_FLAG]) {
  window[GLOBAL_FLAG] = true;
  bind();
}
