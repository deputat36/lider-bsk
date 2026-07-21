const scenario = ({ key, label, status, eventType, comment, nextContact = null, consequence }) => Object.freeze({
  key,
  label,
  status,
  eventType,
  comment,
  nextContact: nextContact ? Object.freeze({ ...nextContact }) : null,
  consequence
});

export const LEAD_EXCEPTION_SCENARIOS = Object.freeze([
  scenario({
    key: 'client_changed',
    label: 'Клиент изменил параметры заказа',
    status: 'Нужно пересчитать',
    eventType: 'Проблема',
    nextContact: { days: 1, hour: 10, minute: 0 },
    comment: 'Клиент изменил параметры заказа. Нужно зафиксировать новые данные, подготовить новую версию расчёта и повторно согласовать цену и срок. Старую согласованную версию не изменять.',
    consequence: 'Потребность и расчёт нужно обновить новой версией; прежнее согласование должно остаться в истории.'
  }),
  scenario({
    key: 'additional_work',
    label: 'Клиент попросил добавить работы',
    status: 'Нужно пересчитать',
    eventType: 'Комментарий',
    nextContact: { days: 1, hour: 10, minute: 0 },
    comment: 'Клиент попросил добавить работы. Нужно уточнить состав, пересчитать стоимость и срок, затем получить отдельное подтверждение дополнительной работы.',
    consequence: 'Дополнительную работу нельзя незаметно включать в старую согласованную сумму.'
  }),
  scenario({
    key: 'client_thinks',
    label: 'Клиент думает или задерживает ответ',
    status: 'Ждём ответ',
    eventType: 'Следующий контакт',
    nextContact: { days: 3, hour: 10, minute: 0 },
    comment: 'Клиент взял время на решение. Нужно вернуться к нему в назначенную дату и уточнить результат без закрытия заявки.',
    consequence: 'Заявка остаётся активной и появится в контроле ближайших контактов.'
  }),
  scenario({
    key: 'no_contact',
    label: 'Не удалось связаться',
    status: 'Ждём ответ',
    eventType: 'Звонок',
    nextContact: { days: 1, hour: 10, minute: 0 },
    comment: 'Связаться с клиентом не удалось. Нужно повторить попытку в назначенное время и только после нескольких попыток принимать решение о завершении заявки.',
    consequence: 'Помощник не переводит заявку в необратимый статус «Не отвечает» после одной попытки.'
  }),
  scenario({
    key: 'too_expensive',
    label: 'Клиенту дорого',
    status: 'Нужно пересчитать',
    eventType: 'Проблема',
    nextContact: { days: 1, hour: 10, minute: 0 },
    comment: 'Клиенту дорого. Нужно проверить себестоимость и маржу, подготовить более доступный вариант или обоснование цены, не обещая скидку без расчёта.',
    consequence: 'Перед скидкой нужно увидеть её влияние на прибыль и минимально допустимую цену.'
  }),
  scenario({
    key: 'deadline_shift',
    label: 'Клиент переносит срок',
    status: 'Уточнение деталей',
    eventType: 'Комментарий',
    nextContact: { days: 1, hour: 10, minute: 0 },
    comment: 'Клиент попросил перенести срок. Нужно зафиксировать новую дату, проверить влияние на дизайн, производство и монтаж и уведомить задействованных исполнителей.',
    consequence: 'Прежний обещанный срок должен остаться в истории, а связанные задачи потребуют проверки.'
  })
]);

const SCENARIO_BY_KEY = Object.freeze(Object.fromEntries(LEAD_EXCEPTION_SCENARIOS.map((item) => [item.key, item])));

export function leadExceptionScenario(key) {
  return SCENARIO_BY_KEY[String(key || '')] || null;
}

export function leadExceptionContactDate(rule, now = new Date()) {
  if (!rule) return null;
  const source = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  if (!Number.isFinite(source.getTime())) return null;
  source.setDate(source.getDate() + Number(rule.days || 0));
  source.setHours(Number(rule.hour || 10), Number(rule.minute || 0), 0, 0);
  return source;
}

export function buildLeadExceptionPlan(key) {
  const item = leadExceptionScenario(key);
  if (!item) return null;
  return Object.freeze({
    key: item.key,
    label: item.label,
    status: item.status,
    eventType: item.eventType,
    comment: item.comment,
    nextContact: item.nextContact,
    consequence: item.consequence,
    saveNotice: 'Изменения ещё не сохранены. Кнопка применит статус, следующий контакт и запись истории одним действием.'
  });
}

export function buildLeadExceptionApplication(key, lead = {}, now = new Date()) {
  const plan = buildLeadExceptionPlan(key);
  const leadId = String(lead?.id || '').trim();
  if (!plan || !leadId) return null;
  const contactDate = leadExceptionContactDate(plan.nextContact, now);
  const oldStatus = String(lead?.status || 'Новая').trim() || 'Новая';
  return Object.freeze({
    scenarioKey: plan.key,
    label: plan.label,
    leadId,
    leadPatch: Object.freeze({
      status: plan.status,
      next_contact_at: contactDate ? contactDate.toISOString() : null
    }),
    timelineEvent: Object.freeze({
      eventType: plan.eventType,
      body: plan.comment,
      oldStatus,
      newStatus: plan.status
    }),
    consequence: plan.consequence
  });
}

export function leadExceptionApplyOutcome({ leadSaved = false, eventSaved = false, deduplicated = false } = {}) {
  if (leadSaved && eventSaved) {
    return Object.freeze({
      phase: 'success',
      retryHistory: false,
      message: deduplicated
        ? 'Изменения применены. Такая запись истории уже существовала и не была продублирована.'
        : 'Изменения применены: статус, следующий контакт и история обновлены.'
    });
  }
  if (leadSaved) {
    return Object.freeze({
      phase: 'partial',
      retryHistory: true,
      message: 'Статус и следующий контакт сохранены, но запись истории не подтверждена. Повторите только запись в истории.'
    });
  }
  return Object.freeze({
    phase: 'error',
    retryHistory: false,
    message: 'Изменения не сохранены. Проверьте соединение и повторите действие.'
  });
}
