import { CRM_V4_ACTIONS } from './action-permissions-v1.js';

const status = ({ key, label, aliases = [], terminal = false, allowedTo = [], action, timestampField = '', auditEvent = '' }) => Object.freeze({
  key,
  label,
  aliases: Object.freeze([label, ...aliases]),
  terminal,
  allowedTo: Object.freeze(allowedTo),
  action,
  timestampField,
  auditEvent
});

const domain = ({ key, label, action, statuses, actionByTarget = {} }) => Object.freeze({
  key,
  label,
  action,
  actionByTarget: Object.freeze({ ...actionByTarget }),
  statuses: Object.freeze(statuses)
});

export const CRM_STATUS_REGISTRY_VERSION = 1;

export const CRM_STATUS_DOMAINS = Object.freeze({
  lead: domain({
    key: 'lead',
    label: 'Заявка',
    action: CRM_V4_ACTIONS.LEADS_TRANSITION,
    statuses: {
      new: status({ key: 'new', label: 'Новая', allowedTo: ['in_work', 'details', 'rejected', 'spam'], action: CRM_V4_ACTIONS.LEADS_TRANSITION, auditEvent: 'lead.status.changed' }),
      in_work: status({ key: 'in_work', label: 'В работе', allowedTo: ['details', 'estimate_ready', 'waiting', 'rejected', 'no_answer', 'expensive', 'cancelled', 'spam'], action: CRM_V4_ACTIONS.LEADS_TRANSITION, auditEvent: 'lead.status.changed' }),
      details: status({ key: 'details', label: 'Уточнение деталей', allowedTo: ['in_work', 'estimate_ready', 'waiting', 'rejected', 'no_answer', 'cancelled'], action: CRM_V4_ACTIONS.LEADS_TRANSITION, auditEvent: 'lead.status.changed' }),
      estimate_ready: status({ key: 'estimate_ready', label: 'Расчёт подготовлен', aliases: ['Расчет подготовлен'], allowedTo: ['offer_sent', 'recalc', 'details', 'rejected'], action: CRM_V4_ACTIONS.LEADS_TRANSITION, auditEvent: 'lead.status.changed' }),
      offer_sent: status({ key: 'offer_sent', label: 'КП отправлено', allowedTo: ['waiting', 'agreed', 'recalc', 'rejected', 'no_answer', 'expensive', 'cancelled'], action: CRM_V4_ACTIONS.LEADS_TRANSITION, auditEvent: 'lead.status.changed' }),
      waiting: status({ key: 'waiting', label: 'Ждём ответ', aliases: ['Ждем ответ'], allowedTo: ['offer_sent', 'agreed', 'recalc', 'no_answer', 'rejected', 'cancelled'], action: CRM_V4_ACTIONS.LEADS_TRANSITION, auditEvent: 'lead.status.changed' }),
      recalc: status({ key: 'recalc', label: 'Нужно пересчитать', allowedTo: ['estimate_ready', 'details', 'rejected', 'cancelled'], action: CRM_V4_ACTIONS.LEADS_TRANSITION, auditEvent: 'lead.status.changed' }),
      agreed: status({ key: 'agreed', label: 'Согласовано', allowedTo: ['order_created', 'recalc', 'cancelled'], action: CRM_V4_ACTIONS.LEADS_TRANSITION, auditEvent: 'lead.status.changed' }),
      order_created: status({ key: 'order_created', label: 'Создан заказ', terminal: true, allowedTo: [], action: CRM_V4_ACTIONS.LEADS_TRANSITION, timestampField: 'converted_at', auditEvent: 'lead.converted_to_order' }),
      rejected: status({ key: 'rejected', label: 'Отказ', terminal: true, allowedTo: [], action: CRM_V4_ACTIONS.LEADS_TRANSITION, auditEvent: 'lead.rejected' }),
      no_answer: status({ key: 'no_answer', label: 'Не отвечает', terminal: true, allowedTo: [], action: CRM_V4_ACTIONS.LEADS_TRANSITION, auditEvent: 'lead.no_answer' }),
      expensive: status({ key: 'expensive', label: 'Дорого', terminal: true, allowedTo: [], action: CRM_V4_ACTIONS.LEADS_TRANSITION, auditEvent: 'lead.too_expensive' }),
      cancelled: status({ key: 'cancelled', label: 'Передумал', terminal: true, allowedTo: [], action: CRM_V4_ACTIONS.LEADS_TRANSITION, auditEvent: 'lead.cancelled' }),
      spam: status({ key: 'spam', label: 'Спам', terminal: true, allowedTo: [], action: CRM_V4_ACTIONS.LEADS_TRANSITION, auditEvent: 'lead.spam' })
    }
  }),

  offer: domain({
    key: 'offer',
    label: 'Коммерческое предложение',
    action: CRM_V4_ACTIONS.OFFERS_TRANSITION,
    statuses: {
      draft: status({ key: 'draft', label: 'Черновик', allowedTo: ['sent', 'void'], action: CRM_V4_ACTIONS.OFFERS_TRANSITION, auditEvent: 'offer.status.changed' }),
      sent: status({ key: 'sent', label: 'Отправлено', allowedTo: ['agreed', 'rejected', 'expired', 'draft'], action: CRM_V4_ACTIONS.OFFERS_TRANSITION, timestampField: 'sent_at', auditEvent: 'offer.sent' }),
      agreed: status({ key: 'agreed', label: 'Согласовано', terminal: true, allowedTo: [], action: CRM_V4_ACTIONS.OFFERS_TRANSITION, timestampField: 'accepted_at', auditEvent: 'offer.accepted' }),
      rejected: status({ key: 'rejected', label: 'Отклонено', terminal: true, allowedTo: [], action: CRM_V4_ACTIONS.OFFERS_TRANSITION, auditEvent: 'offer.rejected' }),
      expired: status({ key: 'expired', label: 'Истёк срок', aliases: ['Истек срок'], terminal: true, allowedTo: [], action: CRM_V4_ACTIONS.OFFERS_TRANSITION, auditEvent: 'offer.expired' }),
      void: status({ key: 'void', label: 'Аннулировано', terminal: true, allowedTo: [], action: CRM_V4_ACTIONS.OFFERS_TRANSITION, auditEvent: 'offer.voided' })
    }
  }),

  order: domain({
    key: 'order',
    label: 'Заказ',
    action: CRM_V4_ACTIONS.ORDERS_TRANSITION,
    statuses: {
      new: status({ key: 'new', label: 'Новый', allowedTo: ['layout_review', 'production', 'cancelled'], action: CRM_V4_ACTIONS.ORDERS_TRANSITION, auditEvent: 'order.status.changed' }),
      layout_review: status({ key: 'layout_review', label: 'Макет на согласовании', allowedTo: ['production', 'new', 'cancelled'], action: CRM_V4_ACTIONS.ORDERS_TRANSITION, auditEvent: 'order.status.changed' }),
      production: status({ key: 'production', label: 'В производстве', allowedTo: ['ready', 'issued', 'cancelled'], action: CRM_V4_ACTIONS.ORDERS_TRANSITION, timestampField: 'sent_to_contractor_at', auditEvent: 'order.production_started' }),
      ready: status({ key: 'ready', label: 'Готово', allowedTo: ['issued', 'closed', 'production'], action: CRM_V4_ACTIONS.ORDERS_TRANSITION, timestampField: 'ready_at', auditEvent: 'order.ready' }),
      issued: status({ key: 'issued', label: 'Выдано', allowedTo: ['closed'], action: CRM_V4_ACTIONS.ORDERS_TRANSITION, timestampField: 'issued_at', auditEvent: 'order.issued' }),
      closed: status({ key: 'closed', label: 'Закрыт', terminal: true, allowedTo: [], action: CRM_V4_ACTIONS.ORDERS_TRANSITION, timestampField: 'completed_at', auditEvent: 'order.closed' }),
      cancelled: status({ key: 'cancelled', label: 'Отменён', aliases: ['Отменен'], terminal: true, allowedTo: [], action: CRM_V4_ACTIONS.ORDERS_TRANSITION, auditEvent: 'order.cancelled' })
    }
  }),

  layout: domain({
    key: 'layout',
    label: 'Макет',
    action: CRM_V4_ACTIONS.DESIGN_WRITE,
    statuses: {
      none: status({ key: 'none', label: 'Макета нет', allowedTo: ['in_progress', 'review', 'not_required'], action: CRM_V4_ACTIONS.DESIGN_WRITE, auditEvent: 'layout.status.changed' }),
      in_progress: status({ key: 'in_progress', label: 'Макет в работе', allowedTo: ['review', 'revisions', 'not_required'], action: CRM_V4_ACTIONS.DESIGN_WRITE, auditEvent: 'layout.status.changed' }),
      review: status({ key: 'review', label: 'На согласовании', allowedTo: ['approved', 'revisions', 'in_progress'], action: CRM_V4_ACTIONS.DESIGN_WRITE, auditEvent: 'layout.review_started' }),
      revisions: status({ key: 'revisions', label: 'На доработке', allowedTo: ['in_progress', 'review', 'approved'], action: CRM_V4_ACTIONS.DESIGN_WRITE, auditEvent: 'layout.revision_requested' }),
      approved: status({ key: 'approved', label: 'Макет согласован', terminal: true, allowedTo: [], action: CRM_V4_ACTIONS.DESIGN_WRITE, timestampField: 'layout_approved_at', auditEvent: 'layout.approved' }),
      not_required: status({ key: 'not_required', label: 'Не требуется', terminal: true, allowedTo: [], action: CRM_V4_ACTIONS.DESIGN_WRITE, auditEvent: 'layout.not_required' })
    }
  }),

  production: domain({
    key: 'production',
    label: 'Производство',
    action: CRM_V4_ACTIONS.PRODUCTION_WRITE,
    statuses: {
      not_sent: status({ key: 'not_sent', label: 'Не передано', allowedTo: ['queued', 'in_production', 'not_required'], action: CRM_V4_ACTIONS.PRODUCTION_WRITE, auditEvent: 'production.status.changed' }),
      queued: status({ key: 'queued', label: 'В очереди', allowedTo: ['in_production', 'cancelled'], action: CRM_V4_ACTIONS.PRODUCTION_WRITE, auditEvent: 'production.queued' }),
      in_production: status({ key: 'in_production', label: 'В производстве', allowedTo: ['ready', 'stopped', 'cancelled'], action: CRM_V4_ACTIONS.PRODUCTION_WRITE, timestampField: 'started_at', auditEvent: 'production.started' }),
      stopped: status({ key: 'stopped', label: 'Приостановлено', allowedTo: ['queued', 'in_production', 'cancelled'], action: CRM_V4_ACTIONS.PRODUCTION_WRITE, auditEvent: 'production.stopped' }),
      ready: status({ key: 'ready', label: 'Готово', allowedTo: ['issued'], action: CRM_V4_ACTIONS.PRODUCTION_WRITE, timestampField: 'ready_at', auditEvent: 'production.ready' }),
      issued: status({ key: 'issued', label: 'Выдано', terminal: true, allowedTo: [], action: CRM_V4_ACTIONS.PRODUCTION_WRITE, timestampField: 'issued_at', auditEvent: 'production.issued' }),
      not_required: status({ key: 'not_required', label: 'Не требуется', terminal: true, allowedTo: [], action: CRM_V4_ACTIONS.PRODUCTION_WRITE, auditEvent: 'production.not_required' }),
      cancelled: status({ key: 'cancelled', label: 'Отменено', terminal: true, allowedTo: [], action: CRM_V4_ACTIONS.PRODUCTION_WRITE, auditEvent: 'production.cancelled' })
    }
  }),

  installation: domain({
    key: 'installation',
    label: 'Монтаж',
    action: CRM_V4_ACTIONS.INSTALLATION_WRITE,
    statuses: {
      unassigned: status({ key: 'unassigned', label: 'Не назначен', aliases: ['', '<NULL>'], allowedTo: ['scheduled', 'not_required', 'cancelled'], action: CRM_V4_ACTIONS.INSTALLATION_WRITE, auditEvent: 'installation.status.changed' }),
      scheduled: status({ key: 'scheduled', label: 'Запланирован', allowedTo: ['in_progress', 'postponed', 'cancelled'], action: CRM_V4_ACTIONS.INSTALLATION_WRITE, timestampField: 'scheduled_at', auditEvent: 'installation.scheduled' }),
      postponed: status({ key: 'postponed', label: 'Перенесён', aliases: ['Перенесен'], allowedTo: ['scheduled', 'in_progress', 'cancelled'], action: CRM_V4_ACTIONS.INSTALLATION_WRITE, auditEvent: 'installation.postponed' }),
      in_progress: status({ key: 'in_progress', label: 'В работе', allowedTo: ['completed', 'postponed', 'cancelled'], action: CRM_V4_ACTIONS.INSTALLATION_WRITE, auditEvent: 'installation.started' }),
      completed: status({ key: 'completed', label: 'Выполнен', aliases: ['Завершён', 'Завершен'], terminal: true, allowedTo: [], action: CRM_V4_ACTIONS.INSTALLATION_WRITE, timestampField: 'completed_at', auditEvent: 'installation.completed' }),
      not_required: status({ key: 'not_required', label: 'Не требуется', terminal: true, allowedTo: [], action: CRM_V4_ACTIONS.INSTALLATION_WRITE, auditEvent: 'installation.not_required' }),
      cancelled: status({ key: 'cancelled', label: 'Отменён', aliases: ['Отменен'], terminal: true, allowedTo: [], action: CRM_V4_ACTIONS.INSTALLATION_WRITE, auditEvent: 'installation.cancelled' })
    }
  }),

  payment: domain({
    key: 'payment',
    label: 'Оплата заказа',
    action: CRM_V4_ACTIONS.FINANCE_WRITE,
    statuses: {
      unpaid: status({ key: 'unpaid', label: 'Не оплачено', allowedTo: ['prepayment', 'partial', 'paid'], action: CRM_V4_ACTIONS.FINANCE_WRITE, auditEvent: 'order.payment_status.changed' }),
      prepayment: status({ key: 'prepayment', label: 'Предоплата', allowedTo: ['partial', 'paid', 'unpaid'], action: CRM_V4_ACTIONS.FINANCE_WRITE, auditEvent: 'order.payment_status.changed' }),
      partial: status({ key: 'partial', label: 'Частично оплачено', allowedTo: ['paid', 'unpaid'], action: CRM_V4_ACTIONS.FINANCE_WRITE, auditEvent: 'order.payment_status.changed' }),
      paid: status({ key: 'paid', label: 'Оплачено', terminal: true, allowedTo: [], action: CRM_V4_ACTIONS.FINANCE_WRITE, timestampField: 'paid_at', auditEvent: 'order.paid' })
    }
  }),

  payment_record: domain({
    key: 'payment_record',
    label: 'Платёж',
    action: CRM_V4_ACTIONS.FINANCE_WRITE,
    statuses: {
      planned: status({ key: 'planned', label: 'Планируется', allowedTo: ['posted', 'cancelled'], action: CRM_V4_ACTIONS.FINANCE_WRITE, auditEvent: 'payment.status.changed' }),
      posted: status({ key: 'posted', label: 'Проведён', aliases: ['Проведен'], terminal: true, allowedTo: [], action: CRM_V4_ACTIONS.FINANCE_WRITE, timestampField: 'payment_date', auditEvent: 'payment.posted' }),
      cancelled: status({ key: 'cancelled', label: 'Отменён', aliases: ['Отменен'], terminal: true, allowedTo: [], action: CRM_V4_ACTIONS.FINANCE_WRITE, auditEvent: 'payment.cancelled' })
    }
  }),

  design_task: domain({
    key: 'design_task',
    label: 'Дизайн-задача',
    action: CRM_V4_ACTIONS.DESIGN_WRITE,
    statuses: {
      new: status({ key: 'new', label: 'Новая', allowedTo: ['in_progress', 'cancelled'], action: CRM_V4_ACTIONS.DESIGN_WRITE, auditEvent: 'design_task.status.changed' }),
      in_progress: status({ key: 'in_progress', label: 'В работе', allowedTo: ['review', 'revisions', 'cancelled'], action: CRM_V4_ACTIONS.DESIGN_WRITE, timestampField: 'started_at', auditEvent: 'design_task.started' }),
      review: status({ key: 'review', label: 'На согласовании', allowedTo: ['approved', 'revisions', 'cancelled'], action: CRM_V4_ACTIONS.DESIGN_WRITE, auditEvent: 'design_task.review_started' }),
      revisions: status({ key: 'revisions', label: 'На доработке', allowedTo: ['in_progress', 'review', 'cancelled'], action: CRM_V4_ACTIONS.DESIGN_WRITE, auditEvent: 'design_task.revision_requested' }),
      approved: status({ key: 'approved', label: 'Согласовано', allowedTo: ['completed'], action: CRM_V4_ACTIONS.DESIGN_WRITE, timestampField: 'approved_at', auditEvent: 'design_task.approved' }),
      completed: status({ key: 'completed', label: 'Завершено', terminal: true, allowedTo: [], action: CRM_V4_ACTIONS.DESIGN_WRITE, timestampField: 'completed_at', auditEvent: 'design_task.completed' }),
      cancelled: status({ key: 'cancelled', label: 'Отменено', terminal: true, allowedTo: [], action: CRM_V4_ACTIONS.DESIGN_WRITE, auditEvent: 'design_task.cancelled' })
    }
  }),

  document: domain({
    key: 'document',
    label: 'Документ заказа',
    action: CRM_V4_ACTIONS.DOCUMENTS_UPDATE,
    actionByTarget: {
      draft: CRM_V4_ACTIONS.DOCUMENTS_CREATE,
      generated: CRM_V4_ACTIONS.DOCUMENTS_GENERATE,
      sent: CRM_V4_ACTIONS.DOCUMENTS_SEND,
      signed: CRM_V4_ACTIONS.DOCUMENTS_SIGN,
      void: CRM_V4_ACTIONS.DOCUMENTS_VOID
    },
    statuses: {
      draft: status({ key: 'draft', label: 'Черновик', allowedTo: ['generated', 'void'], action: CRM_V4_ACTIONS.DOCUMENTS_CREATE, auditEvent: 'document.draft.created' }),
      generated: status({ key: 'generated', label: 'Сформирован', allowedTo: ['sent', 'signed', 'void'], action: CRM_V4_ACTIONS.DOCUMENTS_GENERATE, timestampField: 'generated_at', auditEvent: 'document.generated' }),
      sent: status({ key: 'sent', label: 'Отправлен клиенту', allowedTo: ['signed', 'void'], action: CRM_V4_ACTIONS.DOCUMENTS_SEND, timestampField: 'sent_at', auditEvent: 'document.sent' }),
      signed: status({ key: 'signed', label: 'Подписан', terminal: true, allowedTo: [], action: CRM_V4_ACTIONS.DOCUMENTS_SIGN, timestampField: 'signed_at', auditEvent: 'document.signed' }),
      void: status({ key: 'void', label: 'Аннулирован', terminal: true, allowedTo: [], action: CRM_V4_ACTIONS.DOCUMENTS_VOID, timestampField: 'voided_at', auditEvent: 'document.voided' })
    }
  })
});

function normalized(value) {
  return String(value ?? '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
}

export function statusDomain(domainKey) {
  return CRM_STATUS_DOMAINS[String(domainKey || '').trim()] || null;
}

export function canonicalStatusKey(domainKey, rawValue) {
  const definition = statusDomain(domainKey);
  if (!definition) return '';
  const raw = normalized(rawValue);
  for (const item of Object.values(definition.statuses)) {
    if (normalized(item.key) === raw) return item.key;
    if (item.aliases.some((alias) => normalized(alias) === raw)) return item.key;
  }
  return '';
}

export function statusDefinition(domainKey, value) {
  const definition = statusDomain(domainKey);
  if (!definition) return null;
  const key = canonicalStatusKey(domainKey, value);
  return key ? definition.statuses[key] || null : null;
}

export function statusLabel(domainKey, value, fallback = '') {
  return statusDefinition(domainKey, value)?.label || String(fallback || value || '');
}

export function allowedStatusTransitions(domainKey, fromValue) {
  return [...(statusDefinition(domainKey, fromValue)?.allowedTo || [])];
}

export function canTransitionStatus(domainKey, fromValue, toValue) {
  const from = statusDefinition(domainKey, fromValue);
  const to = statusDefinition(domainKey, toValue);
  if (!from || !to) return false;
  if (from.key === to.key) return true;
  return from.allowedTo.includes(to.key);
}

export function transitionPermission(domainKey, toValue) {
  const definition = statusDomain(domainKey);
  const target = statusDefinition(domainKey, toValue);
  if (!definition || !target) return '';
  return definition.actionByTarget[target.key] || target.action || definition.action || '';
}

export function validateStatusTransition(domainKey, fromValue, toValue) {
  const definition = statusDomain(domainKey);
  const from = statusDefinition(domainKey, fromValue);
  const to = statusDefinition(domainKey, toValue);
  if (!definition) return { ok: false, reason: 'unknown_domain', domain: domainKey };
  if (!from) return { ok: false, reason: 'unknown_from_status', domain: definition.key, from: fromValue };
  if (!to) return { ok: false, reason: 'unknown_to_status', domain: definition.key, to: toValue };
  if (from.key !== to.key && !from.allowedTo.includes(to.key)) {
    return { ok: false, reason: from.terminal ? 'terminal_status' : 'transition_not_allowed', domain: definition.key, from: from.key, to: to.key };
  }
  return {
    ok: true,
    domain: definition.key,
    from: from.key,
    to: to.key,
    label: to.label,
    permission: transitionPermission(definition.key, to.key),
    timestampField: to.timestampField,
    auditEvent: to.auditEvent,
    terminal: to.terminal
  };
}

export function statusRegistrySummary() {
  return {
    version: CRM_STATUS_REGISTRY_VERSION,
    domains: Object.fromEntries(Object.entries(CRM_STATUS_DOMAINS).map(([key, value]) => [key, {
      label: value.label,
      action: value.action,
      statuses: Object.values(value.statuses).map((item) => ({ key: item.key, label: item.label, terminal: item.terminal }))
    }]))
  };
}
