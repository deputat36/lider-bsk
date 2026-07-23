import './lead-workflow-staging-bootstrap-v1.js';

export const LEAD_ASSIGNABLE_ROLES = Object.freeze(['owner', 'admin', 'manager']);

function clean(value) {
  return String(value ?? '').trim();
}

export function normalizeLeadAssignmentRole(value) {
  return clean(value).toLowerCase();
}

export function leadResponsibilityState(lead = {}, context = {}) {
  const assignedTo = clean(lead.assigned_to);
  const currentUserId = clean(context.currentUserId);
  const currentUserRole = normalizeLeadAssignmentRole(context.currentUserRole);
  const canTake = Boolean(currentUserId) && LEAD_ASSIGNABLE_ROLES.includes(currentUserRole);

  if (!assignedTo) {
    return Object.freeze({
      key: 'unassigned',
      assignedTo: '',
      label: 'Без ответственного',
      className: 'is-warn',
      canTake
    });
  }

  if (currentUserId && assignedTo === currentUserId) {
    return Object.freeze({
      key: 'mine',
      assignedTo,
      label: 'Ответственный: вы',
      className: 'is-good',
      canTake: false
    });
  }

  return Object.freeze({
    key: 'other',
    assignedTo,
    label: 'Назначена другому сотруднику',
    className: 'is-neutral',
    canTake: false
  });
}

export function buildLeadSelfAssignment(lead = {}, context = {}) {
  const responsibility = leadResponsibilityState(lead, context);
  if (responsibility.key !== 'unassigned' || !responsibility.canTake) return null;

  const leadId = clean(lead.id);
  const currentUserId = clean(context.currentUserId);
  if (!leadId || !currentUserId) return null;

  const previousStatus = clean(lead.status) || 'Новая';
  const nextStatus = previousStatus === 'Новая' ? 'В работе' : previousStatus;
  const actorLabel = clean(context.actorLabel);
  const eventBody = actorLabel
    ? `Ответственный назначен: ${actorLabel}. Заявка взята в работу.`
    : 'Ответственный назначен текущему пользователю. Заявка взята в работу.';

  return Object.freeze({
    leadId,
    previousStatus,
    nextStatus,
    patch: Object.freeze({ assigned_to: currentUserId, status: nextStatus }),
    event: Object.freeze({
      eventType: 'Ответственный',
      oldStatus: previousStatus,
      newStatus: nextStatus,
      body: eventBody
    })
  });
}

export function leadTakeButtonModel(lead = {}, context = {}) {
  const responsibility = leadResponsibilityState(lead, context);
  if (responsibility.key === 'unassigned' && responsibility.canTake) {
    return Object.freeze({ visible: true, action: 'take', label: 'Взять в работу', disabled: false });
  }
  if (responsibility.key === 'mine' && (clean(lead.status) || 'Новая') === 'Новая') {
    return Object.freeze({ visible: true, action: 'work', label: 'Принять заявку', disabled: false });
  }
  return Object.freeze({ visible: false, action: '', label: '', disabled: false });
}
