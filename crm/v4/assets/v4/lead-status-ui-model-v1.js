import {
  allowedStatusTransitions,
  canTransitionStatus,
  statusDefinition,
  statusDomain
} from './status-transitions-v1.js';

export const LEAD_QUICK_FILTERS = Object.freeze([
  Object.freeze({ value: 'active', label: 'Активные в работе' }),
  Object.freeze({ value: 'no_phone', label: 'Без телефона' }),
  Object.freeze({ value: 'no_next_contact', label: 'Без следующего контакта' }),
  Object.freeze({ value: 'site', label: 'Заявки с сайта' }),
  Object.freeze({ value: 'archive', label: 'Архив / завершённые' })
]);

export function rawLeadStatus(value) {
  return String(value ?? '').trim() || 'Новая';
}

export function leadStatusDefinitions() {
  return Object.values(statusDomain('lead')?.statuses || {});
}

export function unknownLeadStatuses(leads = []) {
  const result = new Set();
  for (const lead of leads || []) {
    const raw = rawLeadStatus(lead?.status);
    if (!statusDefinition('lead', raw)) result.add(raw);
  }
  return [...result].sort((left, right) => left.localeCompare(right, 'ru-RU'));
}

export function leadStatusFilterOptions(leads = [], currentValue = 'active') {
  const options = [
    ...LEAD_QUICK_FILTERS,
    { value: 'Все', label: 'Все статусы' },
    ...leadStatusDefinitions().map((item) => ({ value: item.label, label: item.label, unknown: false }))
  ];

  const unknown = unknownLeadStatuses(leads);
  const current = String(currentValue || '').trim();
  if (current && !LEAD_QUICK_FILTERS.some((item) => item.value === current) && current !== 'Все' && !statusDefinition('lead', current)) {
    unknown.push(current);
  }

  for (const raw of [...new Set(unknown)]) {
    options.push({ value: raw, label: `Неизвестный статус: ${raw}`, unknown: true });
  }

  const seen = new Set();
  return options.filter((item) => {
    if (seen.has(item.value)) return false;
    seen.add(item.value);
    return true;
  });
}

export function leadStatusUiModel(rawValue) {
  const raw = rawLeadStatus(rawValue);
  const current = statusDefinition('lead', raw);
  if (!current) {
    return Object.freeze({
      known: false,
      raw,
      key: '',
      label: raw,
      terminal: false,
      transitions: Object.freeze([]),
      warning: `Неизвестный статус «${raw}» сохранён без изменения. Смена статуса заблокирована до сопоставления с registry.`
    });
  }

  const definitions = statusDomain('lead')?.statuses || {};
  const transitions = allowedStatusTransitions('lead', current.key)
    .map((key) => definitions[key])
    .filter(Boolean)
    .map((item) => Object.freeze({
      key: item.key,
      label: item.label,
      terminal: item.terminal === true
    }));

  return Object.freeze({
    known: true,
    raw,
    key: current.key,
    label: current.label,
    terminal: current.terminal === true,
    transitions: Object.freeze(transitions),
    warning: ''
  });
}

export function canLeadStatusTransition(fromValue, toValue) {
  return canTransitionStatus('lead', rawLeadStatus(fromValue), rawLeadStatus(toValue));
}

function primaryAction(type, label, hint, options = {}) {
  return Object.freeze({
    type,
    label,
    hint,
    targetId: options.targetId || '',
    targetStatus: options.targetStatus || ''
  });
}

export function leadPrimaryAction(lead = {}, context = {}) {
  if (lead.converted_order_id || rawLeadStatus(lead.status) === 'Создан заказ') {
    return primaryAction('open_orders', 'Открыть заказ', 'Заказ уже создан. Проверьте исполнение, оплату и ближайший срок.');
  }

  const model = leadStatusUiModel(lead.status);
  if (!model.known) {
    return primaryAction('other_actions', 'Проверить статус', 'Статус заявки не распознан. Сначала сопоставьте его с рабочим этапом.');
  }

  const needCount = Number(context.needCount || 0);
  const nextContactTime = lead.next_contact_at ? new Date(lead.next_contact_at).getTime() : NaN;
  const now = Number(context.now || Date.now());
  const contactMissingOrOverdue = !Number.isFinite(nextContactTime) || nextContactTime < now;

  if (model.key === 'new') {
    return primaryAction('transition', 'Принять заявку', 'После принятия зафиксируйте задачу клиента коротким брифом.', { targetStatus: 'В работе' });
  }
  if (model.key === 'in_work' || model.key === 'details') {
    if (needCount > 0) {
      return primaryAction('scroll', 'Перейти к расчёту', 'Потребность сохранена. Проверьте состав и рассчитайте цену.', { targetId: 'calculationsBox' });
    }
    return primaryAction('open_need', 'Зафиксировать потребность', 'Заполните только то, что влияет на цену, срок, дизайн или монтаж.');
  }
  if (model.key === 'estimate_ready') {
    return primaryAction('scroll', 'Сформировать КП', 'Расчёт готов. Проверьте клиентские суммы и подготовьте предложение.', { targetId: 'offersBox' });
  }
  if (model.key === 'offer_sent' || model.key === 'waiting') {
    if (contactMissingOrOverdue) {
      return primaryAction('focus_contact', 'Назначить следующий контакт', 'Укажите дату возврата к клиенту, чтобы заявка не потерялась.');
    }
    return primaryAction('other_actions', 'Зафиксировать ответ клиента', 'Следующий контакт назначен. После ответа выберите результат в дополнительных действиях.');
  }
  if (model.key === 'recalc') {
    return primaryAction('scroll', 'Пересчитать заказ', 'Создайте новую версию расчёта, не меняя согласованные данные незаметно.', { targetId: 'calculationsBox' });
  }
  if (model.key === 'agreed') {
    return primaryAction('scroll', 'Создать заказ', 'Откройте согласованное КП и создайте заказ одним подтверждённым действием.', { targetId: 'offersBox' });
  }
  if (model.terminal) {
    return primaryAction('none', 'Заявка завершена', 'История сохранена. Возврат в работу выполняется только отдельным разрешённым сценарием.');
  }

  return primaryAction('open_need', 'Продолжить работу', 'Проверьте потребность и выполните следующий шаг по заявке.');
}
