import assert from 'node:assert/strict';
import {
  buildManagementWorkloadSnapshot,
  managementWorkloadGroup,
  MANAGEMENT_WORKLOAD_UNASSIGNED_KEY
} from '../crm/v4/assets/v4/management-workload-model-v1.js';

const now = new Date('2026-07-12T12:00:00Z').getTime();
const profiles = [
  { user_id: 'm1', full_name: 'Анна Менеджер', role: 'manager', is_active: true },
  { user_id: 'm2', full_name: 'Борис Менеджер', role: 'manager', is_active: true },
  { user_id: 'd1', full_name: 'Дизайнер', role: 'designer', is_active: true }
];
const leads = [
  { id: '1', status: 'Новая', assigned_to: 'm1', next_contact_at: '2026-07-12T14:00:00Z', created_at: '2026-07-10T10:00:00Z' },
  { id: '2', status: 'В работе', assigned_to: 'm1', next_contact_at: '2026-07-11T14:00:00Z', created_at: '2026-07-01T10:00:00Z' },
  { id: '3', status: 'Уточнение деталей', assigned_to: 'm2', next_contact_at: null, created_at: '2026-07-12T09:00:00Z' },
  { id: '4', status: 'Новая', assigned_to: null, next_contact_at: null, created_at: '2026-07-09T09:00:00Z' },
  { id: '5', status: 'Создан заказ', assigned_to: 'm1', next_contact_at: null, created_at: '2026-07-08T09:00:00Z' }
];

const snapshot = buildManagementWorkloadSnapshot(leads, profiles, now);
assert.equal(snapshot.activeCount, 4);
assert.equal(snapshot.assignedCount, 3);
assert.equal(snapshot.unassignedCount, 1);
assert.equal(snapshot.withoutNextContact, 2);
assert.equal(snapshot.overdue, 1);
assert.equal(snapshot.dueToday, 1);
assert.equal(snapshot.slaBreaches, 3);
assert.equal(snapshot.slaCoveragePercent, 25);
assert.equal(snapshot.managersWithLeads, 2);

const m1 = managementWorkloadGroup(snapshot, 'm1');
assert.equal(m1.label, 'Анна Менеджер');
assert.equal(m1.active, 2);
assert.equal(m1.overdue, 1);
assert.equal(m1.withoutNextContact, 0);
assert.equal(m1.slaCoveragePercent, 50);
assert.equal(m1.oldestLeadAgeDays, 11);
assert.deepEqual(m1.leads.map((lead) => lead.id), ['2', '1']);

const m2 = managementWorkloadGroup(snapshot, 'm2');
assert.equal(m2.active, 1);
assert.equal(m2.withoutNextContact, 1);
assert.equal(m2.slaCoveragePercent, 0);

const unassigned = managementWorkloadGroup(snapshot, MANAGEMENT_WORKLOAD_UNASSIGNED_KEY);
assert.equal(unassigned.active, 1);
assert.equal(unassigned.slaBreaches, 1);

const zero = buildManagementWorkloadSnapshot([], profiles, now);
assert.equal(zero.activeCount, 0);
assert.equal(zero.slaCoveragePercent, 100);
assert.equal(zero.managers.length, 2);
assert.equal(zero.managers[0].active, 0);

console.log('Management workload and SLA model behavior is valid.');
