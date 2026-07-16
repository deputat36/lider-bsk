import assert from 'node:assert/strict';
import {
  ORDER_LIST_PREFERENCES_KEY,
  describeOrderListState,
  loadOrderListPreferences,
  paymentNeedsAttention,
  resetOrderListPreferences,
  saveOrderListPreferences,
  selectOrderRows
} from '../crm/v4/assets/v4/order-list-preferences-v1.js';

const map = new Map();
const storage = { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: (key) => map.delete(key) };
assert.deepEqual(loadOrderListPreferences(storage), { filter: 'active', sort: 'created_desc' });
saveOrderListPreferences({ filter: 'payment', sort: 'amount_desc', search: '+7900' }, storage);
assert.equal(map.get(ORDER_LIST_PREFERENCES_KEY).includes('+7900'), false);
assert.deepEqual(loadOrderListPreferences(storage), { filter: 'payment', sort: 'amount_desc' });

const rows = [
  { id: 'closed', status: 'Выдано', created_at: '2026-07-01', deadline: '2026-07-02', client_total: 100, payment_status: 'Оплачено' },
  { id: 'late', status: 'В производстве', created_at: '2026-07-03', deadline: '2026-07-10', client_total: 500, payment_status: 'Частично оплачено', client_name: 'Бормаш' },
  { id: 'unknown', status: 'Новый', created_at: '2026-07-05', deadline: '2026-07-25', client_total: 400, payment_status: 'Оплата на проверке банка' },
  { id: 'future', status: 'Новый', created_at: '2026-07-04', deadline: '2026-07-20', client_total: 300, payment_status: 'Не оплачено' },
  { id: 'prepayment', status: 'Новый', created_at: '2026-07-02', deadline: '2026-07-22', client_total: 200, payment_status: 'Предоплата' }
];
const helpers = { isActive: (status) => status !== 'Выдано', designNeedsCheck: (row) => row.id === 'future', now: new Date('2026-07-15') };
assert.deepEqual(selectOrderRows(rows, { filter: 'active', sort: 'created_desc' }, helpers).map((row) => row.id), ['unknown', 'future', 'late', 'prepayment']);
assert.deepEqual(selectOrderRows(rows, { filter: 'overdue', sort: 'created_desc' }, helpers).map((row) => row.id), ['late']);
assert.deepEqual(selectOrderRows(rows, { filter: 'payment', sort: 'amount_desc' }, helpers).map((row) => row.id), ['late', 'unknown', 'future', 'prepayment']);
assert.deepEqual(selectOrderRows(rows, { filter: 'design', sort: 'created_desc' }, helpers).map((row) => row.id), ['future']);
assert.deepEqual(selectOrderRows(rows, { filter: 'all', sort: 'deadline_asc', search: 'Бормаш' }, helpers).map((row) => row.id), ['late']);
assert.deepEqual(selectOrderRows(rows, { filter: 'all', sort: 'deadline_asc', search: 'Оплачено' }, helpers).map((row) => row.id), ['closed', 'late']);
assert.equal(paymentNeedsAttention(rows[0]), false);
assert.equal(paymentNeedsAttention(rows[1]), true);
assert.equal(paymentNeedsAttention(rows[2]), true);
assert.equal(paymentNeedsAttention(rows[4]), true);
assert.deepEqual(describeOrderListState({ filter: 'overdue', sort: 'deadline_asc', search: 'щит' }), ['фильтр: просроченные', 'поиск: «щит»', 'сортировка: по ближайшему сроку']);
assert.deepEqual(resetOrderListPreferences(storage), { filter: 'active', sort: 'created_desc' });
console.log('Order list preferences use canonical payment attention rules.');
