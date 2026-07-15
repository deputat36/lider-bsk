import { statusDefinition } from './status-transitions-v1.js';

function time(value) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function active(domain, status, fallback) {
  const definition = statusDefinition(domain, status || fallback);
  return definition ? definition.terminal !== true : true;
}

function paymentOpen(order = {}) {
  const data = order?.data && typeof order.data === 'object' ? order.data : {};
  const value = String(order.payment_status || data.payment_status || data.paymentStatus || '').trim().toLowerCase();
  return !value || value.includes('не') || value.includes('част') || value.includes('долг') || value.includes('ожид');
}

function candidate(base, priority, reason, nextAction, tone = 'warn') {
  return Object.freeze({ ...base, priority, reason, nextAction, tone });
}

function keepHighest(map, item) {
  const current = map.get(item.key);
  if (!current || item.priority > current.priority) map.set(item.key, item);
}

export function buildManagementAttentionQueue(source = {}, nowValue = Date.now()) {
  const now = Number.isFinite(Number(nowValue)) ? Number(nowValue) : Date.now();
  const day = 86400000;
  const items = new Map();

  for (const lead of Array.isArray(source.leads) ? source.leads : []) {
    if (!active('lead', lead?.status, 'Новая')) continue;
    const base = { key: `lead:${lead.id}`, kind: 'lead', entityId: lead.id, leadId: lead.id, label: lead.name || lead.service || 'Заявка' };
    const next = time(lead.next_contact_at);
    if (!String(lead.phone || '').trim()) keepHighest(items, candidate(base, 100, 'Нет телефона для связи', 'Уточнить контакт клиента', 'danger'));
    if (next !== null && next < now) keepHighest(items, candidate(base, 95, 'Следующий контакт просрочен', 'Связаться с клиентом сегодня', 'danger'));
    if (next === null) keepHighest(items, candidate(base, 80, 'Не назначен следующий контакт', 'Назначить дату следующего контакта', 'danger'));
    if ((lead.status || 'Новая') === 'Новая') keepHighest(items, candidate(base, 45, 'Новая заявка ещё не разобрана', 'Открыть и квалифицировать заявку'));
  }

  for (const order of Array.isArray(source.orders) ? source.orders : []) {
    if (!active('order', order?.status, 'Новый')) continue;
    const base = { key: `order:${order.id}`, kind: 'order', entityId: order.id, orderId: order.id, label: order.project_name || `Заказ ${order.order_number || ''}`.trim() };
    const deadline = time(order.deadline);
    if (deadline !== null && deadline < now) keepHighest(items, candidate(base, 98, 'Срок заказа просрочен', 'Проверить блокер и обновить план', 'danger'));
    if (paymentOpen(order)) keepHighest(items, candidate(base, 85, 'Оплата не закрыта', 'Проверить оплату и следующий шаг', 'danger'));
    if (deadline !== null && deadline >= now && deadline <= now + 3 * day) keepHighest(items, candidate(base, 65, 'Срок заказа наступит в ближайшие 3 дня', 'Проверить готовность заказа'));
  }

  for (const job of Array.isArray(source.production) ? source.production : []) {
    if (!active('production', job?.production_status, 'Не передано')) continue;
    const deadline = time(job.deadline);
    const base = { key: `production:${job.id}`, kind: 'production', entityId: job.id, orderId: job.order_id, label: job.title || 'Производственная задача' };
    if (deadline !== null && deadline < now) keepHighest(items, candidate(base, 96, 'Производство просрочено', 'Проверить производство и блокер', 'danger'));
    else if (deadline !== null && deadline <= now + 3 * day) keepHighest(items, candidate(base, 62, 'Срок производства наступит в ближайшие 3 дня', 'Проверить готовность производства'));
  }

  for (const job of Array.isArray(source.installation) ? source.installation : []) {
    if (!active('installation', job?.install_status, 'Не назначен')) continue;
    const scheduled = time(job.scheduled_at);
    const base = { key: `installation:${job.id}`, kind: 'installation', entityId: job.id, orderId: job.order_id, label: job.title || 'Монтаж' };
    if (scheduled !== null && scheduled < now) keepHighest(items, candidate(base, 94, 'Монтаж просрочен', 'Связаться с ответственным за монтаж', 'danger'));
    else if (scheduled !== null && scheduled <= now + 3 * day) keepHighest(items, candidate(base, 60, 'Монтаж запланирован на ближайшие 3 дня', 'Подтвердить готовность к монтажу'));
  }

  for (const offer of Array.isArray(source.offers) ? source.offers : []) {
    if (!active('offer', offer?.status, 'Черновик')) continue;
    const validUntil = time(offer.valid_until);
    const base = { key: `offer:${offer.id}`, kind: 'offer', entityId: offer.id, leadId: offer.lead_id, label: offer.title || 'Коммерческое предложение' };
    if (validUntil !== null && validUntil < now) keepHighest(items, candidate(base, 75, 'Срок действия КП истёк', 'Связаться с клиентом и обновить КП', 'danger'));
    else keepHighest(items, candidate(base, 35, 'КП ожидает результата', 'Проверить ответ клиента'));
  }

  return Object.freeze([...items.values()].sort((a, b) => b.priority - a.priority || a.key.localeCompare(b.key)));
}

export function managementUrgentCount(queue = []) {
  return (Array.isArray(queue) ? queue : []).filter((item) => Number(item?.priority || 0) >= 70).length;
}
