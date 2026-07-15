export const ORDER_LIST_PREFERENCES_KEY = 'leader_crm_v4_order_list_preferences_v1';
const FILTERS = new Set(['active', 'all', 'overdue', 'payment', 'design']);
const SORTS = new Set(['created_desc', 'deadline_asc', 'amount_desc', 'status_asc']);
const DEFAULTS = Object.freeze({ filter: 'active', sort: 'created_desc' });

export function normalizeOrderListPreferences(value = {}) {
  return {
    filter: FILTERS.has(value.filter) ? value.filter : DEFAULTS.filter,
    sort: SORTS.has(value.sort) ? value.sort : DEFAULTS.sort
  };
}

export function loadOrderListPreferences(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(ORDER_LIST_PREFERENCES_KEY);
    return normalizeOrderListPreferences(raw ? JSON.parse(raw) : DEFAULTS);
  } catch (_) { return { ...DEFAULTS }; }
}

export function saveOrderListPreferences(value, storage = globalThis.localStorage) {
  const normalized = normalizeOrderListPreferences(value);
  try { storage?.setItem?.(ORDER_LIST_PREFERENCES_KEY, JSON.stringify(normalized)); } catch (_) { /* optional */ }
  return normalized;
}

export function resetOrderListPreferences(storage = globalThis.localStorage) {
  try { storage?.removeItem?.(ORDER_LIST_PREFERENCES_KEY); } catch (_) { /* optional */ }
  return { ...DEFAULTS };
}

export function paymentNeedsAttention(order) {
  const text = String(order?.payment_status || '').toLowerCase();
  return !text || text.includes('не') || text.includes('част') || text.includes('долг') || text.includes('ожид');
}

export function orderMatchesSearch(order, search) {
  const query = String(search || '').trim().toLowerCase();
  if (!query) return true;
  return [order?.order_number, order?.project_name, order?.client_name, order?.client_phone, order?.status, order?.payment_status]
    .join(' ').toLowerCase().includes(query);
}

export function selectOrderRows(rows, preferences, helpers = {}) {
  const value = normalizeOrderListPreferences(preferences);
  const active = helpers.isActive || (() => true);
  const design = helpers.designNeedsCheck || (() => false);
  const now = helpers.now instanceof Date ? helpers.now : new Date();
  const filtered = (rows || []).filter((order) => {
    if (!orderMatchesSearch(order, preferences?.search)) return false;
    if (value.filter === 'active') return active(order.status);
    if (value.filter === 'overdue') return active(order.status) && order.deadline && new Date(order.deadline) < now;
    if (value.filter === 'payment') return paymentNeedsAttention(order);
    if (value.filter === 'design') return design(order);
    return true;
  });
  const time = (date, fallback) => { const parsed = Date.parse(date || ''); return Number.isFinite(parsed) ? parsed : fallback; };
  if (value.sort === 'deadline_asc') return filtered.sort((a, b) => time(a.deadline, Infinity) - time(b.deadline, Infinity));
  if (value.sort === 'amount_desc') return filtered.sort((a, b) => Number(b.client_total || 0) - Number(a.client_total || 0));
  if (value.sort === 'status_asc') return filtered.sort((a, b) => String(a.status || '').localeCompare(String(b.status || ''), 'ru'));
  return filtered.sort((a, b) => time(b.created_at, 0) - time(a.created_at, 0));
}

export function describeOrderListState(preferences = {}) {
  const value = normalizeOrderListPreferences(preferences);
  const filterLabels = { all: 'все заказы', overdue: 'просроченные', payment: 'оплата под контролем', design: 'проверить дизайн' };
  const sortLabels = { deadline_asc: 'по ближайшему сроку', amount_desc: 'по сумме', status_asc: 'по статусу' };
  const result = [];
  if (value.filter !== 'active') result.push(`фильтр: ${filterLabels[value.filter]}`);
  if (String(preferences.search || '').trim()) result.push(`поиск: «${String(preferences.search).trim()}»`);
  if (value.sort !== 'created_desc') result.push(`сортировка: ${sortLabels[value.sort]}`);
  return result;
}
