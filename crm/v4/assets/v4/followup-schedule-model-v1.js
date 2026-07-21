export const FOLLOWUP_CLOSED_STATUSES = Object.freeze([
  'Спам',
  'Создан заказ',
  'Отказ',
  'Не отвечает',
  'Дорого',
  'Передумал'
]);

const FOLLOWUP_KINDS = Object.freeze(['plus1h', 'tomorrow', 'plus3d']);

function clean(value) {
  return String(value ?? '').trim();
}

function validDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isFollowupClosedStatus(status) {
  return FOLLOWUP_CLOSED_STATUSES.includes(clean(status));
}

export function followupDate(kind, now = new Date()) {
  if (!FOLLOWUP_KINDS.includes(kind)) return null;
  const date = validDate(now);
  if (!date) return null;
  if (kind === 'plus1h') date.setHours(date.getHours() + 1, 0, 0, 0);
  if (kind === 'tomorrow') {
    date.setDate(date.getDate() + 1);
    date.setHours(10, 0, 0, 0);
  }
  if (kind === 'plus3d') {
    date.setDate(date.getDate() + 3);
    date.setHours(10, 0, 0, 0);
  }
  return date;
}

export function isOverdueFollowupLead(lead = {}, now = new Date()) {
  if (isFollowupClosedStatus(lead.status)) return false;
  const due = validDate(lead.next_contact_at);
  const current = validDate(now);
  if (!due || !current) return false;
  return due.getTime() < current.getTime();
}

export function buildFollowupPostponePlan(lead = {}, kind, now = new Date()) {
  const leadId = clean(lead.id);
  const previousStatus = clean(lead.status) || 'Новая';
  const previousContact = validDate(lead.next_contact_at);
  const nextContact = followupDate(kind, now);
  if (!leadId || !nextContact || isFollowupClosedStatus(previousStatus)) return null;

  const nextStatus = previousStatus === 'Новая' ? 'Ждём ответ' : previousStatus;
  const previousLabel = previousContact ? previousContact.toISOString() : 'не назначен';
  const nextLabel = nextContact.toISOString();

  return Object.freeze({
    leadId,
    kind,
    previousStatus,
    nextStatus,
    previousContactAt: previousContact ? previousContact.toISOString() : null,
    nextContactAt: nextLabel,
    patch: Object.freeze({
      next_contact_at: nextLabel,
      status: nextStatus
    }),
    event: Object.freeze({
      eventType: 'Следующий контакт',
      oldStatus: previousStatus,
      newStatus: nextStatus,
      body: `Следующий контакт перенесён: ${previousLabel} → ${nextLabel}. Этап заявки: ${previousStatus}${nextStatus !== previousStatus ? ` → ${nextStatus}` : ' — без изменения'}.`
    })
  });
}
