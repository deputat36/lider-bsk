export const LEAD_LIST_PREFERENCES_KEY = 'leader_crm_v4_lead_list_preferences_v1';

const ALLOWED_SORTS = new Set(['created_desc', 'created_asc', 'next_contact_asc', 'status_asc']);
const DEFAULTS = Object.freeze({ status: 'active', source: 'Все', sort: 'created_desc' });

export function normalizeLeadListPreferences(value = {}) {
  return {
    status: typeof value.status === 'string' && value.status.trim() ? value.status : DEFAULTS.status,
    source: typeof value.source === 'string' && value.source.trim() ? value.source : DEFAULTS.source,
    sort: ALLOWED_SORTS.has(value.sort) ? value.sort : DEFAULTS.sort
  };
}

export function loadLeadListPreferences(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(LEAD_LIST_PREFERENCES_KEY);
    return normalizeLeadListPreferences(raw ? JSON.parse(raw) : DEFAULTS);
  } catch (_) {
    return { ...DEFAULTS };
  }
}

export function saveLeadListPreferences(value, storage = globalThis.localStorage) {
  const normalized = normalizeLeadListPreferences(value);
  try { storage?.setItem?.(LEAD_LIST_PREFERENCES_KEY, JSON.stringify(normalized)); } catch (_) { /* local preference is optional */ }
  return normalized;
}

export function resetLeadListPreferences(storage = globalThis.localStorage) {
  try { storage?.removeItem?.(LEAD_LIST_PREFERENCES_KEY); } catch (_) { /* local preference is optional */ }
  return { ...DEFAULTS };
}

export function sortLeadRows(rows, sort = DEFAULTS.sort) {
  const copy = [...(rows || [])];
  const time = (value, fallback) => {
    const parsed = Date.parse(value || '');
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  if (sort === 'created_asc') return copy.sort((a, b) => time(a.created_at, Infinity) - time(b.created_at, Infinity));
  if (sort === 'next_contact_asc') return copy.sort((a, b) => time(a.next_contact_at, Infinity) - time(b.next_contact_at, Infinity) || time(b.created_at, 0) - time(a.created_at, 0));
  if (sort === 'status_asc') return copy.sort((a, b) => String(a.status || 'Новая').localeCompare(String(b.status || 'Новая'), 'ru') || time(b.created_at, 0) - time(a.created_at, 0));
  return copy.sort((a, b) => time(b.created_at, 0) - time(a.created_at, 0));
}

export function describeLeadFilters(filters = {}) {
  const normalized = normalizeLeadListPreferences(filters);
  const labels = [];
  if (normalized.status !== DEFAULTS.status) labels.push(`статус: ${normalized.status === 'Все' ? 'все' : normalized.status}`);
  if (normalized.source !== DEFAULTS.source) labels.push(`источник: ${normalized.source}`);
  if (String(filters.search || '').trim()) labels.push(`поиск: «${String(filters.search).trim()}»`);
  if (normalized.sort !== DEFAULTS.sort) {
    const sortLabels = { created_asc: 'сначала старые', next_contact_asc: 'по следующему контакту', status_asc: 'по статусу' };
    labels.push(`сортировка: ${sortLabels[normalized.sort]}`);
  }
  return labels;
}

export function defaultLeadListPreferences() {
  return { ...DEFAULTS };
}
