function text(value) {
  return String(value ?? '').trim();
}

function baseResult({ lead, patch, label }) {
  return Object.freeze({
    lead,
    patch: Object.freeze({ ...patch }),
    label
  });
}

export function buildStagingLeadListWorkflowAction({ action, lead, userId } = {}) {
  const actionName = text(action);
  const actorId = text(userId);
  const row = lead && typeof lead === 'object' ? lead : null;

  if (!['take', 'work'].includes(actionName)) return null;
  if (!row?.id) {
    return Object.freeze({ error: 'Заявка не найдена в загруженном списке.' });
  }
  if (!actorId) {
    return Object.freeze({
      lead: row,
      error: 'Не найден текущий пользователь staging.'
    });
  }

  if (actionName === 'take') {
    if (text(row.assigned_to)) {
      return Object.freeze({
        lead: row,
        error: 'Заявка уже назначена. Обновите список.'
      });
    }
    return baseResult({
      lead: row,
      label: 'Назначаю вас ответственным...',
      patch: {
        assigned_to: actorId,
        status: text(row.status) === 'Новая' || !text(row.status) ? 'В работе' : text(row.status)
      }
    });
  }

  if (text(row.assigned_to) !== actorId) {
    return Object.freeze({
      lead: row,
      error: 'Сначала назначьте себя ответственным.'
    });
  }

  if (text(row.status) === 'В работе') {
    return Object.freeze({
      lead: row,
      error: 'Заявка уже находится в работе.'
    });
  }

  return baseResult({
    lead: row,
    label: 'Перевожу заявку в работу...',
    patch: { status: 'В работе' }
  });
}
