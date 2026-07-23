export const LEAD_FOLLOWUP_REQUIRED_STATUSES = Object.freeze([
  'КП отправлено',
  'Ждём ответ'
]);

export const OFFER_FOLLOWUP_REQUIRED_ACTIONS = Object.freeze([
  'mark-offer-sent'
]);

const REQUIRED_STATUS_SET = new Set(LEAD_FOLLOWUP_REQUIRED_STATUSES);
const REQUIRED_OFFER_ACTION_SET = new Set(OFFER_FOLLOWUP_REQUIRED_ACTIONS);

function normalizedText(value) {
  return String(value ?? '').trim();
}

function resolvedNow(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : Date.now();
}

export function leadStatusRequiresFutureFollowup(status) {
  return REQUIRED_STATUS_SET.has(normalizedText(status));
}

export function offerActionRequiresFutureFollowup(action) {
  return REQUIRED_OFFER_ACTION_SET.has(normalizedText(action));
}

export function leadFollowupState(lead, now = Date.now()) {
  const raw = normalizedText(lead?.next_contact_at);
  if (!raw) {
    return Object.freeze({
      key: 'missing',
      valid: false,
      nextContactAt: '',
      nextContactTime: NaN,
      message: 'Следующий контакт не назначен.'
    });
  }

  const time = new Date(raw).getTime();
  if (!Number.isFinite(time)) {
    return Object.freeze({
      key: 'invalid',
      valid: false,
      nextContactAt: raw,
      nextContactTime: NaN,
      message: 'Дата следующего контакта заполнена некорректно.'
    });
  }

  if (time <= resolvedNow(now)) {
    return Object.freeze({
      key: 'overdue',
      valid: false,
      nextContactAt: raw,
      nextContactTime: time,
      message: 'Следующий контакт уже просрочен.'
    });
  }

  return Object.freeze({
    key: 'scheduled',
    valid: true,
    nextContactAt: raw,
    nextContactTime: time,
    message: ''
  });
}

export function evaluateLeadFollowupTransition(lead, targetStatus, now = Date.now()) {
  const currentStatus = normalizedText(lead?.status) || 'Новая';
  const normalizedTarget = normalizedText(targetStatus);
  const requiresFollowup = leadStatusRequiresFutureFollowup(normalizedTarget);
  const followup = leadFollowupState(lead, now);

  if (!normalizedTarget) {
    return Object.freeze({
      allowed: false,
      code: 'invalid_target_status',
      currentStatus,
      targetStatus: '',
      requiresFollowup: false,
      followup,
      message: 'Не выбран новый статус заявки.'
    });
  }

  if (normalizedTarget === currentStatus) {
    return Object.freeze({
      allowed: true,
      code: 'no_change',
      currentStatus,
      targetStatus: normalizedTarget,
      requiresFollowup,
      followup,
      message: ''
    });
  }

  if (!requiresFollowup) {
    return Object.freeze({
      allowed: true,
      code: 'followup_not_required',
      currentStatus,
      targetStatus: normalizedTarget,
      requiresFollowup: false,
      followup,
      message: ''
    });
  }

  if (followup.valid) {
    return Object.freeze({
      allowed: true,
      code: 'future_followup_present',
      currentStatus,
      targetStatus: normalizedTarget,
      requiresFollowup: true,
      followup,
      message: ''
    });
  }

  return Object.freeze({
    allowed: false,
    code: `followup_${followup.key}`,
    currentStatus,
    targetStatus: normalizedTarget,
    requiresFollowup: true,
    followup,
    message: `${followup.message} Сначала назначьте будущую дату возврата к клиенту.`
  });
}

export function evaluateOfferFollowupAction(lead, action, now = Date.now()) {
  const normalizedAction = normalizedText(action);
  if (!offerActionRequiresFutureFollowup(normalizedAction)) {
    return Object.freeze({
      allowed: true,
      code: 'offer_followup_not_required',
      action: normalizedAction,
      transition: null,
      message: ''
    });
  }

  const transition = evaluateLeadFollowupTransition(lead, 'КП отправлено', now);
  return Object.freeze({
    allowed: transition.allowed,
    code: transition.allowed ? 'offer_future_followup_present' : transition.code,
    action: normalizedAction,
    transition,
    message: transition.message
  });
}
