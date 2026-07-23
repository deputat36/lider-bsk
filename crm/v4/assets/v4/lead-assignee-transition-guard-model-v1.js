export const LEAD_ASSIGNEE_REQUIRED_STATUSES = Object.freeze([
  'В работе',
  'Уточнение деталей',
  'Расчёт подготовлен',
  'КП отправлено',
  'Ждём ответ',
  'Нужно пересчитать',
  'Согласовано'
]);

const REQUIRED_STATUS_SET = new Set(LEAD_ASSIGNEE_REQUIRED_STATUSES);

function normalizedText(value) {
  return String(value ?? '').trim();
}

export function leadStatusRequiresAssignee(status) {
  return REQUIRED_STATUS_SET.has(normalizedText(status));
}

export function leadHasAssignee(lead) {
  return Boolean(normalizedText(lead?.assigned_to));
}

export function evaluateLeadAssigneeTransition(lead, targetStatus) {
  const currentStatus = normalizedText(lead?.status) || 'Новая';
  const normalizedTarget = normalizedText(targetStatus);
  const hasAssignee = leadHasAssignee(lead);
  const requiresAssignee = leadStatusRequiresAssignee(normalizedTarget);

  if (!normalizedTarget) {
    return {
      allowed: false,
      code: 'invalid_target_status',
      currentStatus,
      targetStatus: '',
      requiresAssignee: false,
      hasAssignee,
      message: 'Не выбран новый статус заявки.'
    };
  }

  if (normalizedTarget === currentStatus) {
    return {
      allowed: true,
      code: 'no_change',
      currentStatus,
      targetStatus: normalizedTarget,
      requiresAssignee,
      hasAssignee,
      message: 'Статус заявки уже установлен.'
    };
  }

  if (!requiresAssignee || hasAssignee) {
    return {
      allowed: true,
      code: requiresAssignee ? 'assignee_present' : 'assignee_not_required',
      currentStatus,
      targetStatus: normalizedTarget,
      requiresAssignee,
      hasAssignee,
      message: ''
    };
  }

  return {
    allowed: false,
    code: 'assignee_required',
    currentStatus,
    targetStatus: normalizedTarget,
    requiresAssignee: true,
    hasAssignee: false,
    message: 'Сначала назначьте ответственного, затем переводите заявку в работу.'
  };
}
