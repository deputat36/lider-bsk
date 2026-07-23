import assert from 'node:assert/strict';
import {
  LEAD_WORK_QUICK_FILTERS,
  buildLeadWorkflowIndex,
  emptyLeadWorkflowIndex,
  isLeadWorkQuickFilter,
  leadMatchesWorkQuickFilter,
  leadWorkQuickFilterCounts,
  leadWorkQuickFilterModels
} from '../crm/v4/assets/v4/lead-work-quick-filters-v1.js';

const now = new Date('2026-07-23T09:00:00.000Z');
const leads = [
  { id: 'lead-new', status: 'Новая', next_contact_at: null },
  { id: 'lead-work', status: 'В работе', next_contact_at: '2026-07-24T09:00:00.000Z' },
  { id: 'lead-details', status: 'Уточнение деталей', next_contact_at: '2026-07-22T09:00:00.000Z' },
  { id: 'lead-recalc', status: 'Нужно пересчитать', next_contact_at: null },
  { id: 'lead-offer-status', status: 'КП отправлено', next_contact_at: '2026-07-24T10:00:00.000Z' },
  { id: 'lead-offer-row', status: 'Расчёт подготовлен', next_contact_at: '2026-07-24T11:00:00.000Z' },
  { id: 'lead-waiting', status: 'Ждём ответ', next_contact_at: '2026-07-22T10:00:00.000Z' },
  { id: 'lead-closed', status: 'Создан заказ', next_contact_at: '2026-07-20T09:00:00.000Z' }
];

const workflowIndex = buildLeadWorkflowIndex({
  calculations: [
    { lead_id: 'lead-details', status: 'Расчёт подготовлен', is_current_revision: true },
    { lead_id: 'lead-recalc', status: 'Расчёт подготовлен', is_current_revision: true },
    { lead_id: 'lead-work', status: 'Черновик', is_current_revision: false },
    { lead_id: 'lead-ignored', status: 'Аннулирован', is_current_revision: true }
  ],
  offers: [
    { lead_id: 'lead-offer-row', status: 'Отправлено' },
    { lead_id: 'lead-work', status: 'Черновик' },
    { lead_id: 'lead-closed', status: 'Отправлено' }
  ]
});

assert.deepEqual(LEAD_WORK_QUICK_FILTERS.map((item) => item.key), [
  'Новая',
  'overdue_contact',
  'no_next_contact',
  'needs_calculation',
  'offer_waiting'
]);
assert.equal(isLeadWorkQuickFilter('needs_calculation'), true);
assert.equal(isLeadWorkQuickFilter('unknown'), false);

assert.equal(workflowIndex.calculationLeadIds.has('lead-details'), true);
assert.equal(workflowIndex.calculationLeadIds.has('lead-work'), false);
assert.equal(workflowIndex.sentOfferLeadIds.has('lead-offer-row'), true);
assert.equal(workflowIndex.sentOfferLeadIds.has('lead-work'), false);

assert.equal(leadMatchesWorkQuickFilter(leads[0], 'Новая', workflowIndex, now), true);
assert.equal(leadMatchesWorkQuickFilter(leads[2], 'overdue_contact', workflowIndex, now), true);
assert.equal(leadMatchesWorkQuickFilter(leads[7], 'overdue_contact', workflowIndex, now), false);
assert.equal(leadMatchesWorkQuickFilter(leads[0], 'no_next_contact', workflowIndex, now), true);
assert.equal(leadMatchesWorkQuickFilter(leads[3], 'needs_calculation', workflowIndex, now), true);
assert.equal(leadMatchesWorkQuickFilter(leads[2], 'needs_calculation', workflowIndex, now), false);
assert.equal(leadMatchesWorkQuickFilter(leads[1], 'needs_calculation', workflowIndex, now), true);
assert.equal(leadMatchesWorkQuickFilter(leads[4], 'offer_waiting', workflowIndex, now), true);
assert.equal(leadMatchesWorkQuickFilter(leads[5], 'offer_waiting', workflowIndex, now), true);
assert.equal(leadMatchesWorkQuickFilter(leads[7], 'offer_waiting', workflowIndex, now), false);

const counts = leadWorkQuickFilterCounts(leads, workflowIndex, now);
assert.deepEqual(counts, {
  'Новая': 1,
  overdue_contact: 2,
  no_next_contact: 2,
  needs_calculation: 2,
  offer_waiting: 3
});

const unavailable = leadWorkQuickFilterModels({
  leads,
  workflowIndex: emptyLeadWorkflowIndex(),
  activeFilter: 'overdue_contact',
  workflowReady: false,
  now
});
assert.equal(unavailable.find((item) => item.key === 'overdue_contact').disabled, false);
assert.equal(unavailable.find((item) => item.key === 'overdue_contact').active, true);
assert.equal(unavailable.find((item) => item.key === 'needs_calculation').disabled, true);
assert.equal(unavailable.find((item) => item.key === 'offer_waiting').disabled, true);

const ready = leadWorkQuickFilterModels({ leads, workflowIndex, activeFilter: 'offer_waiting', workflowReady: true, now });
assert.equal(ready.find((item) => item.key === 'offer_waiting').count, 3);
assert.equal(ready.find((item) => item.key === 'offer_waiting').active, true);
assert.equal(ready.find((item) => item.key === 'offer_waiting').disabled, false);

console.log('Lead work quick filter model tests passed.');
