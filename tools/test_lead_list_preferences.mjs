import assert from 'node:assert/strict';
import {
  LEAD_LIST_PREFERENCES_KEY,
  describeLeadFilters,
  loadLeadListPreferences,
  resetLeadListPreferences,
  saveLeadListPreferences,
  sortLeadRows
} from '../crm/v4/assets/v4/lead-list-preferences-v1.js';

const values = new Map();
const storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key)
};

assert.deepEqual(loadLeadListPreferences(storage), { status: 'active', source: 'Все', sort: 'created_desc' });
saveLeadListPreferences({ status: 'Новая', source: 'Сайт', sort: 'next_contact_asc', search: '+7900' }, storage);
assert.equal(values.get(LEAD_LIST_PREFERENCES_KEY).includes('+7900'), false, 'free search with possible PII must not persist');
assert.deepEqual(loadLeadListPreferences(storage), { status: 'Новая', source: 'Сайт', sort: 'next_contact_asc' });
assert.deepEqual(describeLeadFilters({ status: 'Новая', source: 'Сайт', search: 'баннер', sort: 'status_asc' }), [
  'статус: Новая', 'источник: Сайт', 'поиск: «баннер»', 'сортировка: по статусу'
]);

const rows = [
  { id: 'old', created_at: '2026-01-01', next_contact_at: null, status: 'В работе' },
  { id: 'soon', created_at: '2026-03-01', next_contact_at: '2026-07-16', status: 'Новая' },
  { id: 'later', created_at: '2026-02-01', next_contact_at: '2026-07-20', status: 'Согласовано' }
];
assert.deepEqual(sortLeadRows(rows, 'created_desc').map((row) => row.id), ['soon', 'later', 'old']);
assert.deepEqual(sortLeadRows(rows, 'created_asc').map((row) => row.id), ['old', 'later', 'soon']);
assert.deepEqual(sortLeadRows(rows, 'next_contact_asc').map((row) => row.id), ['soon', 'later', 'old']);
assert.deepEqual(sortLeadRows(rows, 'status_asc').map((row) => row.id), ['old', 'soon', 'later']);
assert.deepEqual(resetLeadListPreferences(storage), { status: 'active', source: 'Все', sort: 'created_desc' });
assert.equal(values.has(LEAD_LIST_PREFERENCES_KEY), false);

console.log('Lead list preferences behavior is valid.');
