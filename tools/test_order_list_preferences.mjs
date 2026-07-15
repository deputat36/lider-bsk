import assert from 'node:assert/strict';
import { ORDER_LIST_PREFERENCES_KEY, describeOrderListState, loadOrderListPreferences, resetOrderListPreferences, saveOrderListPreferences, selectOrderRows } from '../crm/v4/assets/v4/order-list-preferences-v1.js';

const map = new Map();
const storage = { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: (key) => map.delete(key) };
assert.deepEqual(loadOrderListPreferences(storage), { filter: 'active', sort: 'created_desc' });
saveOrderListPreferences({ filter: 'payment', sort: 'amount_desc', search: '+7900' }, storage);
assert.equal(map.get(ORDER_LIST_PREFERENCES_KEY).includes('+7900'), false);
assert.deepEqual(loadOrderListPreferences(storage), { filter: 'payment', sort: 'amount_desc' });

const rows = [
  { id: 'closed', status: 'Выдан', created_at: '2026-07-01', deadline: '2026-07-02', client_total: 100, payment_status: 'Оплачен' },
  { id: 'late', status: 'В производстве', created_at: '2026-07-03', deadline: '2026-07-10', client_total: 500, payment_status: 'Частично', client_name: 'Бормаш' },
  { id: 'future', status: 'Новый', created_at: '2026-07-04', deadline: '2026-07-20', client_total: 300, payment_status: 'Не оплачен' }
];
const helpers = { isActive: (status) => status !== 'Выдан', designNeedsCheck: (row) => row.id === 'future', now: new Date('2026-07-15') };
assert.deepEqual(selectOrderRows(rows, { filter: 'active', sort: 'created_desc' }, helpers).map((row) => row.id), ['future', 'late']);
assert.deepEqual(selectOrderRows(rows, { filter: 'overdue', sort: 'created_desc' }, helpers).map((row) => row.id), ['late']);
assert.deepEqual(selectOrderRows(rows, { filter: 'payment', sort: 'amount_desc' }, helpers).map((row) => row.id), ['late', 'future']);
assert.deepEqual(selectOrderRows(rows, { filter: 'design', sort: 'created_desc' }, helpers).map((row) => row.id), ['future']);
assert.deepEqual(selectOrderRows(rows, { filter: 'all', sort: 'deadline_asc', search: 'Бормаш' }, helpers).map((row) => row.id), ['late']);
assert.deepEqual(describeOrderListState({ filter: 'overdue', sort: 'deadline_asc', search: 'щит' }), ['фильтр: просроченные', 'поиск: «щит»', 'сортировка: по ближайшему сроку']);
assert.deepEqual(resetOrderListPreferences(storage), { filter: 'active', sort: 'created_desc' });
console.log('Order list preferences behavior is valid.');
