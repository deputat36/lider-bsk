import { catalogDraftItem } from './catalog-pricing-v1.js';

export const CALCULATION_CATALOG_SOURCE_V1 = 'calculation-catalog-source-v1-20260903';

export const CATALOG_SELECT_FIELDS = [
  'id',
  'category',
  'name',
  'unit',
  'contractor_price',
  'description',
  'item_type',
  'markup_percent',
  'min_client_price',
  'default_client_price',
  'calculation_mode',
  'settings',
  'sort_order',
  'is_active'
].join(',');

function text(value, fallback = '') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeCatalogRow(row = {}) {
  return {
    id: row.id || null,
    category: text(row.category, 'Каталог'),
    name: text(row.name, 'Позиция каталога'),
    unit: text(row.unit, 'шт'),
    contractor_price: Math.max(0, number(row.contractor_price)),
    description: text(row.description),
    item_type: text(row.item_type, 'Изготовление'),
    markup_percent: number(row.markup_percent),
    min_client_price: Math.max(0, number(row.min_client_price)),
    default_client_price: Math.max(0, number(row.default_client_price)),
    calculation_mode: text(row.calculation_mode, 'markup'),
    settings: row.settings && typeof row.settings === 'object' && !Array.isArray(row.settings) ? row.settings : {},
    sort_order: Math.max(0, number(row.sort_order)),
    is_active: row.is_active !== false
  };
}

export function normalizeCatalogRows(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map(normalizeCatalogRow)
    .filter((row) => row.is_active && row.name)
    .sort((a, b) => a.sort_order - b.sort_order || a.category.localeCompare(b.category, 'ru') || a.name.localeCompare(b.name, 'ru'));
}

export function legacyCatalogFallbackRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row, index) => normalizeCatalogRow({
    id: row.id || null,
    category: row.category,
    name: row.name,
    unit: row.unit,
    contractor_price: row.contractor_price ?? row.price ?? 0,
    description: row.description || '',
    item_type: row.item_type || 'Изготовление',
    markup_percent: row.markup_percent ?? 0,
    min_client_price: row.min_client_price ?? row.price ?? 0,
    default_client_price: row.default_client_price ?? row.price ?? 0,
    calculation_mode: row.calculation_mode || 'fixed',
    settings: { ...(row.settings || {}), legacy_fallback: true },
    sort_order: row.sort_order ?? index,
    is_active: true
  }));
}

function isMissingCatalogError(error) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return code === '42P01' || message.includes('leader_catalog') && (message.includes('does not exist') || message.includes('not found'));
}

export async function loadCalculationCatalog({ supabaseClient, fallbackRows = [] } = {}) {
  const fallback = normalizeCatalogRows(legacyCatalogFallbackRows(fallbackRows));
  if (!supabaseClient?.from) {
    return { rows: fallback, source: 'fallback', warning: 'catalog_client_unavailable' };
  }

  try {
    const query = supabaseClient
      .from('leader_catalog')
      .select(CATALOG_SELECT_FIELDS)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    const { data, error } = await query;
    if (error) {
      return {
        rows: fallback,
        source: 'fallback',
        warning: isMissingCatalogError(error) ? 'catalog_table_unavailable' : 'catalog_read_failed'
      };
    }
    const rows = normalizeCatalogRows(data || []);
    if (!rows.length) return { rows: fallback, source: 'fallback', warning: 'catalog_empty' };
    return { rows, source: 'remote', warning: null };
  } catch {
    return { rows: fallback, source: 'fallback', warning: 'catalog_read_failed' };
  }
}

export function catalogRowToDraftItem(row, qty = 1, extraData = {}) {
  return catalogDraftItem(normalizeCatalogRow(row), qty, {
    ...extraData,
    catalog_source_version: CALCULATION_CATALOG_SOURCE_V1
  });
}
