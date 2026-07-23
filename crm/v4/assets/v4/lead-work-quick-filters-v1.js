import { isFollowupClosedStatus, isOverdueFollowupLead } from './followup-schedule-model-v1.js';

export const LEAD_WORK_QUICK_FILTERS = Object.freeze([
  Object.freeze({ key: 'Новая', label: 'Новые', dependency: 'lead' }),
  Object.freeze({ key: 'overdue_contact', label: 'Просрочен контакт', dependency: 'lead' }),
  Object.freeze({ key: 'no_next_contact', label: 'Без следующего контакта', dependency: 'lead' }),
  Object.freeze({ key: 'needs_calculation', label: 'Нужен расчёт', dependency: 'workflow' }),
  Object.freeze({ key: 'offer_waiting', label: 'КП ждёт ответа', dependency: 'workflow' })
]);

const QUICK_FILTER_KEYS = new Set(LEAD_WORK_QUICK_FILTERS.map((item) => item.key));
const CALCULATION_STAGE_STATUSES = new Set(['В работе', 'Уточнение деталей']);
const OFFER_WAITING_LEAD_STATUSES = new Set(['КП отправлено', 'Ждём ответ']);
const SENT_OFFER_STATUSES = new Set(['Отправлено', 'КП отправлено']);
const IGNORED_CALCULATION_STATUSES = new Set(['Удалён', 'Удален', 'Аннулирован', 'Аннулировано']);

function text(value) {
  return String(value ?? '').trim();
}

function leadId(value) {
  return text(value?.lead_id || value?.leadId || value?.id);
}

export function emptyLeadWorkflowIndex() {
  return Object.freeze({
    calculationLeadIds: new Set(),
    sentOfferLeadIds: new Set()
  });
}

export function buildLeadWorkflowIndex({ calculations = [], offers = [] } = {}) {
  const calculationLeadIds = new Set();
  const sentOfferLeadIds = new Set();

  for (const row of calculations || []) {
    const id = leadId({ lead_id: row?.lead_id });
    const status = text(row?.status);
    if (!id || row?.is_current_revision === false || IGNORED_CALCULATION_STATUSES.has(status)) continue;
    calculationLeadIds.add(id);
  }

  for (const row of offers || []) {
    const id = leadId({ lead_id: row?.lead_id });
    if (!id || !SENT_OFFER_STATUSES.has(text(row?.status))) continue;
    sentOfferLeadIds.add(id);
  }

  return Object.freeze({ calculationLeadIds, sentOfferLeadIds });
}

export function isLeadWorkQuickFilter(value) {
  return QUICK_FILTER_KEYS.has(text(value));
}

export function leadMatchesWorkQuickFilter(lead = {}, filterKey = '', workflowIndex = emptyLeadWorkflowIndex(), now = new Date()) {
  const key = text(filterKey);
  const status = text(lead.status) || 'Новая';
  const id = text(lead.id);
  const active = !isFollowupClosedStatus(status);

  if (key === 'Новая') return status === 'Новая';
  if (key === 'overdue_contact') return isOverdueFollowupLead(lead, now);
  if (key === 'no_next_contact') return active && !text(lead.next_contact_at);
  if (key === 'needs_calculation') {
    if (!active || !id) return false;
    if (status === 'Нужно пересчитать') return true;
    return CALCULATION_STAGE_STATUSES.has(status) && !workflowIndex.calculationLeadIds.has(id);
  }
  if (key === 'offer_waiting') {
    if (!active || !id) return false;
    return OFFER_WAITING_LEAD_STATUSES.has(status) || workflowIndex.sentOfferLeadIds.has(id);
  }
  return false;
}

export function leadWorkQuickFilterCounts(leads = [], workflowIndex = emptyLeadWorkflowIndex(), now = new Date()) {
  const counts = {};
  for (const filter of LEAD_WORK_QUICK_FILTERS) counts[filter.key] = 0;
  for (const lead of leads || []) {
    for (const filter of LEAD_WORK_QUICK_FILTERS) {
      if (leadMatchesWorkQuickFilter(lead, filter.key, workflowIndex, now)) counts[filter.key] += 1;
    }
  }
  return Object.freeze(counts);
}

export function leadWorkQuickFilterModels({
  leads = [], workflowIndex = emptyLeadWorkflowIndex(), activeFilter = '', workflowReady = false, now = new Date()
} = {}) {
  const counts = leadWorkQuickFilterCounts(leads, workflowIndex, now);
  return LEAD_WORK_QUICK_FILTERS.map((filter) => Object.freeze({
    ...filter,
    count: counts[filter.key] || 0,
    active: text(activeFilter) === filter.key,
    disabled: filter.dependency === 'workflow' && workflowReady !== true
  }));
}
