export const CATALOG_MANAGEMENT_MODEL_V1 = 'catalog-management-model-v1-20260904';

function text(value, fallback = '') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeCatalogManagementRow(row = {}) {
  const contractorPrice = Math.max(0, number(row.contractor_price));
  const markupPercent = Math.max(0, number(row.markup_percent));
  const minClientPrice = Math.max(0, number(row.min_client_price));
  const defaultClientPrice = row.default_client_price === null || row.default_client_price === undefined
    ? null
    : Math.max(0, number(row.default_client_price));
  const calculatedClientPrice = Math.max(
    minClientPrice,
    defaultClientPrice && defaultClientPrice > 0
      ? defaultClientPrice
      : contractorPrice * (1 + markupPercent / 100)
  );
  return {
    id: row.id || null,
    category: text(row.category, 'Без категории'),
    name: text(row.name, 'Без названия'),
    unit: text(row.unit, 'шт'),
    contractor_price: contractorPrice,
    markup_percent: markupPercent,
    min_client_price: minClientPrice,
    default_client_price: defaultClientPrice,
    calculation_mode: text(row.calculation_mode, defaultClientPrice ? 'fixed' : 'markup'),
    item_type: text(row.item_type, 'Изготовление'),
    description: text(row.description),
    sort_order: Math.max(0, Math.trunc(number(row.sort_order))),
    is_active: row.is_active !== false,
    calculated_client_price: calculatedClientPrice,
    updated_at: row.updated_at || null,
    created_at: row.created_at || null
  };
}

export function catalogManagementSummary(rows = []) {
  const list = (Array.isArray(rows) ? rows : []).map(normalizeCatalogManagementRow);
  return {
    total: list.length,
    active: list.filter((row) => row.is_active).length,
    inactive: list.filter((row) => !row.is_active).length,
    categories: new Set(list.map((row) => row.category)).size
  };
}

export function catalogManagementCategories(rows = []) {
  return [...new Set((Array.isArray(rows) ? rows : []).map((row) => normalizeCatalogManagementRow(row).category))]
    .sort((a, b) => a.localeCompare(b, 'ru'));
}

export function filterCatalogManagementRows(rows = [], filters = {}) {
  const query = text(filters.search).toLowerCase();
  const category = text(filters.category);
  const status = text(filters.status, 'all');
  const sort = text(filters.sort, 'sort_order');
  const list = (Array.isArray(rows) ? rows : []).map(normalizeCatalogManagementRow).filter((row) => {
    if (query) {
      const haystack = `${row.name} ${row.category} ${row.item_type} ${row.description}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (category && category !== 'all' && row.category !== category) return false;
    if (status === 'active' && !row.is_active) return false;
    if (status === 'inactive' && row.is_active) return false;
    return true;
  });

  return list.sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name, 'ru');
    if (sort === 'category') return a.category.localeCompare(b.category, 'ru') || a.name.localeCompare(b.name, 'ru');
    if (sort === 'cost_desc') return b.contractor_price - a.contractor_price || a.name.localeCompare(b.name, 'ru');
    if (sort === 'updated_desc') return String(b.updated_at || '').localeCompare(String(a.updated_at || '')) || a.name.localeCompare(b.name, 'ru');
    return a.sort_order - b.sort_order || a.category.localeCompare(b.category, 'ru') || a.name.localeCompare(b.name, 'ru');
  });
}

export function normalizeCatalogPriceLog(row = {}) {
  return {
    id: row.id || null,
    catalog_id: row.catalog_id || null,
    change_type: text(row.change_type, 'price_update'),
    reason: text(row.reason),
    changed_by_email: text(row.changed_by_email),
    old_contractor_price: row.old_contractor_price === null ? null : number(row.old_contractor_price),
    new_contractor_price: row.new_contractor_price === null ? null : number(row.new_contractor_price),
    old_markup_percent: row.old_markup_percent === null ? null : number(row.old_markup_percent),
    new_markup_percent: row.new_markup_percent === null ? null : number(row.new_markup_percent),
    old_min_client_price: row.old_min_client_price === null ? null : number(row.old_min_client_price),
    new_min_client_price: row.new_min_client_price === null ? null : number(row.new_min_client_price),
    old_default_client_price: row.old_default_client_price === null ? null : number(row.old_default_client_price),
    new_default_client_price: row.new_default_client_price === null ? null : number(row.new_default_client_price),
    old_is_active: row.old_is_active,
    new_is_active: row.new_is_active,
    created_at: row.created_at || null
  };
}

export function catalogPriceLogChanges(log = {}) {
  const row = normalizeCatalogPriceLog(log);
  const changes = [];
  const add = (label, oldValue, newValue, suffix = '') => {
    if (oldValue === newValue || (oldValue === null && newValue === null)) return;
    const show = (value) => value === null || value === undefined ? '—' : `${value}${suffix}`;
    changes.push(`${label}: ${show(oldValue)} → ${show(newValue)}`);
  };
  add('Себестоимость', row.old_contractor_price, row.new_contractor_price, ' ₽');
  add('Наценка', row.old_markup_percent, row.new_markup_percent, '%');
  add('Минимум клиенту', row.old_min_client_price, row.new_min_client_price, ' ₽');
  add('Цена клиенту', row.old_default_client_price, row.new_default_client_price, ' ₽');
  if (row.old_is_active !== row.new_is_active && row.new_is_active !== null && row.new_is_active !== undefined) {
    changes.push(`Статус: ${row.old_is_active === false ? 'выключена' : 'активна'} → ${row.new_is_active === false ? 'выключена' : 'активна'}`);
  }
  return changes;
}
