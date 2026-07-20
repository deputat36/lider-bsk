import { statusDefinition } from './status-transitions-v1.js';

function list(value) {
  return Array.isArray(value) ? value : [];
}

function time(value, endOfDay = false) {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) parsed.setUTCHours(23, 59, 59, 999);
  return parsed.getTime();
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

function productionProblem(order = {}) {
  const data = order?.data && typeof order.data === 'object' ? order.data : {};
  const value = String(order.production_status || data.production_status || data.productionStatus || '').trim().toLowerCase();
  return ['проблем', 'срыв', 'задерж', 'приост', 'передел', 'брак'].some((marker) => value.includes(marker));
}

function activeNeed(need = {}) {
  return !String(need.status || '').trim().toLowerCase().includes('архив');
}

function currentCalculation(calculation = {}) {
  return calculation.is_current_revision !== false;
}

function activeOffer(offer = {}) {
  return !offer.order_id && active('offer', offer.status, 'Черновик');
}

function candidate(base, priority, reason, nextAction, tone = 'warn', category = 'other') {
  return Object.freeze({ ...base, priority, reason, nextAction, tone, category });
}

function keepHighest(map, item) {
  const current = map.get(item.key);
  if (!current || item.priority > current.priority) map.set(item.key, item);
}

function leadKey(value) {
  return value ? `lead:${value}` : '';
}

function orderKey(value) {
  return value ? `order:${value}` : '';
}

function sourceIndexes(source = {}) {
  const needLeadIds = new Set(list(source.needs).filter(activeNeed).map((item) => item.lead_id).filter(Boolean));
  const calculationLeadIds = new Set(list(source.calculations).filter(currentCalculation).map((item) => item.lead_id).filter(Boolean));
  const offerLeadIds = new Set(list(source.offers).filter(activeOffer).map((item) => item.lead_id).filter(Boolean));
  return { needLeadIds, calculationLeadIds, offerLeadIds };
}

export function buildManagementAttentionQueue(source = {}, nowValue = Date.now()) {
  const now = Number.isFinite(Number(nowValue)) ? Number(nowValue) : Date.now();
  const day = 86400000;
  const items = new Map();
  const indexes = sourceIndexes(source);

  for (const lead of list(source.leads)) {
    const id = lead?.id;
    if (!id) continue;
    const base = { key: leadKey(id), kind: 'lead', entityId: id, leadId: id, label: lead.name || lead.service || 'Заявка' };
    const status = String(lead.status || 'Новая').trim();

    if (status === 'Создан заказ') {
      if (!lead.converted_order_id) {
        keepHighest(items, candidate(
          base,
          108,
          'Статус «Создан заказ», но связанная запись не найдена',
          'Проверить КП, расчёт и связь заказа',
          'danger',
          'problem'
        ));
      }
      continue;
    }

    if (!active('lead', status, 'Новая')) continue;
    const next = time(lead.next_contact_at);

    if (!String(lead.phone || '').trim()) {
      keepHighest(items, candidate(base, 110, 'Нет телефона для связи', 'Уточнить контакт клиента', 'danger', 'contact'));
    }
    if (next !== null && next < now) {
      keepHighest(items, candidate(base, 105, 'Следующий контакт просрочен', 'Связаться с клиентом сегодня', 'danger', 'contact'));
    }
    if (next === null) {
      keepHighest(items, candidate(base, 90, 'Не назначен следующий контакт', 'Назначить дату следующего контакта', 'danger', 'contact'));
    }
    if (status === 'Новая') {
      keepHighest(items, candidate(base, 85, 'Новая заявка ещё не разобрана', 'Открыть и квалифицировать заявку', 'warn', 'new'));
    }
    if (!indexes.needLeadIds.has(id)) {
      keepHighest(items, candidate(base, 75, 'Не зафиксирована потребность клиента', 'Заполнить короткий бриф', 'warn', 'calculation'));
    } else if (!indexes.calculationLeadIds.has(id)) {
      keepHighest(items, candidate(base, 70, 'Потребность есть, но расчёт не подготовлен', 'Подготовить расчёт', 'warn', 'calculation'));
    } else if (['Расчёт подготовлен', 'Расчет подготовлен'].includes(status) && !indexes.offerLeadIds.has(id)) {
      keepHighest(items, candidate(base, 65, 'Расчёт готов, но КП ещё не создано', 'Сформировать КП', 'warn', 'calculation'));
    }
    if (!lead.assigned_to) {
      keepHighest(items, candidate(base, 40, 'Не назначен ответственный', 'Назначить ответственного', 'warn', 'assignment'));
    }
  }

  for (const order of list(source.orders)) {
    if (!order?.id || !active('order', order.status, 'Новый')) continue;
    const base = { key: orderKey(order.id), kind: 'order', entityId: order.id, orderId: order.id, label: order.project_name || `Заказ ${order.order_number || ''}`.trim() };
    const deadline = time(order.deadline, true);
    if (deadline !== null && deadline < now) {
      keepHighest(items, candidate(base, 98, 'Срок заказа просрочен', 'Проверить блокер и обновить план', 'danger', 'problem'));
    }
    if (productionProblem(order)) {
      keepHighest(items, candidate(base, 96, 'В производстве отмечена проблема', 'Разобраться с производством', 'danger', 'problem'));
    }
    if (paymentOpen(order)) {
      keepHighest(items, candidate(base, 85, 'Оплата не закрыта', 'Проверить оплату и следующий шаг', 'danger', 'problem'));
    }
    if (deadline !== null && deadline >= now && deadline <= now + 3 * day) {
      keepHighest(items, candidate(base, 65, 'Срок заказа наступит в ближайшие 3 дня', 'Проверить готовность заказа', 'warn', 'order'));
    }
  }

  for (const job of list(source.production)) {
    if (!job?.id || !active('production', job.production_status, 'Не передано')) continue;
    const deadline = time(job.deadline);
    const key = orderKey(job.order_id) || `production:${job.id}`;
    const base = { key, kind: job.order_id ? 'order' : 'production', entityId: job.id, orderId: job.order_id, label: job.title || 'Производственная задача' };
    if (deadline !== null && deadline < now) {
      keepHighest(items, candidate(base, 97, 'Производство просрочено', 'Проверить производство и блокер', 'danger', 'problem'));
    } else if (deadline !== null && deadline <= now + 3 * day) {
      keepHighest(items, candidate(base, 62, 'Срок производства наступит в ближайшие 3 дня', 'Проверить готовность производства', 'warn', 'order'));
    }
  }

  for (const job of list(source.installation)) {
    if (!job?.id || !active('installation', job.install_status, 'Не назначен')) continue;
    const scheduled = time(job.scheduled_at);
    const key = orderKey(job.order_id) || `installation:${job.id}`;
    const base = { key, kind: job.order_id ? 'order' : 'installation', entityId: job.id, orderId: job.order_id, label: job.title || 'Монтаж' };
    if (scheduled !== null && scheduled < now) {
      keepHighest(items, candidate(base, 95, 'Монтаж просрочен', 'Связаться с ответственным за монтаж', 'danger', 'problem'));
    } else if (scheduled !== null && scheduled <= now + 3 * day) {
      keepHighest(items, candidate(base, 60, 'Монтаж запланирован на ближайшие 3 дня', 'Подтвердить готовность к монтажу', 'warn', 'order'));
    }
  }

  for (const offer of list(source.offers).filter(activeOffer)) {
    if (!offer?.id) continue;
    const validUntil = time(offer.valid_until, true);
    const key = leadKey(offer.lead_id) || `offer:${offer.id}`;
    const base = { key, kind: offer.lead_id ? 'lead' : 'offer', entityId: offer.id, leadId: offer.lead_id, label: offer.title || 'Коммерческое предложение' };
    if (validUntil !== null && validUntil < now) {
      keepHighest(items, candidate(base, 78, 'Срок действия КП истёк', 'Связаться с клиентом и обновить КП', 'danger', 'offer'));
    } else if (String(offer.status || '') === 'Отправлено') {
      keepHighest(items, candidate(base, 60, 'КП отправлено и ждёт результата', 'Проверить ответ клиента', 'warn', 'offer'));
    } else {
      keepHighest(items, candidate(base, 50, 'Черновик КП не завершён', 'Проверить и отправить КП', 'warn', 'offer'));
    }
  }

  return Object.freeze([...items.values()].sort((a, b) => b.priority - a.priority || a.key.localeCompare(b.key)));
}

export function managementUrgentCount(queue = []) {
  return list(queue).filter((item) => Number(item?.priority || 0) >= 70).length;
}

export function buildManagementWorkSummary(source = {}, queue = [], nowValue = Date.now()) {
  const now = Number.isFinite(Number(nowValue)) ? Number(nowValue) : Date.now();
  const indexes = sourceIndexes(source);
  const activeLeads = list(source.leads).filter((lead) => String(lead.status || '') !== 'Создан заказ' && active('lead', lead.status, 'Новая'));
  const calculationLeadIds = new Set();

  for (const lead of activeLeads) {
    if (!indexes.needLeadIds.has(lead.id)
      || !indexes.calculationLeadIds.has(lead.id)
      || (['Расчёт подготовлен', 'Расчет подготовлен'].includes(String(lead.status || '')) && !indexes.offerLeadIds.has(lead.id))) {
      calculationLeadIds.add(lead.id);
    }
  }

  const offerKeys = new Set(list(source.offers).filter(activeOffer).map((offer) => leadKey(offer.lead_id) || `offer:${offer.id}`));
  const problemKeys = new Set();

  for (const lead of list(source.leads)) {
    if (String(lead.status || '') === 'Создан заказ' && !lead.converted_order_id) problemKeys.add(leadKey(lead.id));
  }
  for (const order of list(source.orders)) {
    if (!active('order', order.status, 'Новый')) continue;
    const deadline = time(order.deadline, true);
    if ((deadline !== null && deadline < now) || paymentOpen(order) || productionProblem(order)) problemKeys.add(orderKey(order.id));
  }
  for (const job of list(source.production)) {
    const deadline = time(job.deadline);
    if (active('production', job.production_status, 'Не передано') && deadline !== null && deadline < now) {
      problemKeys.add(orderKey(job.order_id) || `production:${job.id}`);
    }
  }
  for (const job of list(source.installation)) {
    const scheduled = time(job.scheduled_at);
    if (active('installation', job.install_status, 'Не назначен') && scheduled !== null && scheduled < now) {
      problemKeys.add(orderKey(job.order_id) || `installation:${job.id}`);
    }
  }

  return Object.freeze({
    urgent: list(queue).filter((item) => Number(item?.priority || 0) >= 90).length,
    newLeads: activeLeads.filter((lead) => String(lead.status || 'Новая') === 'Новая').length,
    calculations: calculationLeadIds.size,
    offers: offerKeys.size,
    problemOrders: problemKeys.size,
    totalQueue: list(queue).length
  });
}
