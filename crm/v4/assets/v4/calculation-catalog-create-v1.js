import { CATALOG_SELECT_FIELDS, normalizeCatalogRow } from './calculation-catalog-source-v1.js';

export const CALCULATION_CATALOG_CREATE_V1 = 'calculation-catalog-create-v1-20260903';

function text(value, fallback = '') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function number(value, fallback = 0) {
  const parsed = Number(String(value ?? '').replace(',', '.').replace(/\s+/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeCatalogCreateInput(input = {}) {
  const defaultClientPrice = Math.max(0, number(input.default_client_price));
  const requestedMode = text(input.calculation_mode);
  return {
    category: text(input.category),
    name: text(input.name),
    unit: text(input.unit, 'шт'),
    contractor_price: Math.max(0, number(input.contractor_price)),
    description: text(input.description) || null,
    item_type: text(input.item_type, 'Изготовление'),
    markup_percent: Math.max(0, number(input.markup_percent, 30)),
    min_client_price: Math.max(0, number(input.min_client_price)),
    default_client_price: defaultClientPrice > 0 ? defaultClientPrice : null,
    calculation_mode: requestedMode || (defaultClientPrice > 0 ? 'fixed' : 'markup'),
    settings: input.settings && typeof input.settings === 'object' && !Array.isArray(input.settings) ? input.settings : {},
    sort_order: Math.max(0, Math.trunc(number(input.sort_order))),
    is_active: true
  };
}

export function catalogCreateValidation(input = {}) {
  const payload = normalizeCatalogCreateInput(input);
  if (!payload.name) return { ok: false, code: 'catalog_name_required', payload };
  if (!payload.category) return { ok: false, code: 'catalog_category_required', payload };
  if (!payload.unit) return { ok: false, code: 'catalog_unit_required', payload };
  return { ok: true, code: null, payload };
}

function mappedError(error) {
  const code = String(error?.code || 'catalog_create_failed');
  if (code === '23505') return { code: 'catalog_duplicate', message: 'Позиция с таким названием уже есть в каталоге.' };
  if (code === '42501') return { code: 'catalog_forbidden', message: 'Недостаточно прав для изменения каталога.' };
  return { code, message: String(error?.message || 'Не удалось сохранить позицию в каталог.') };
}

export async function createCalculationCatalogItem({ supabaseClient, input, allowWrite = false } = {}) {
  if (!allowWrite) {
    return { ok: false, row: null, error: { code: 'catalog_write_not_allowed', message: 'Запись в каталог недоступна.' } };
  }
  if (!supabaseClient?.from) {
    return { ok: false, row: null, error: { code: 'catalog_client_unavailable', message: 'Каталог сейчас недоступен.' } };
  }

  const validation = catalogCreateValidation(input);
  if (!validation.ok) {
    return { ok: false, row: null, error: { code: validation.code, message: 'Заполните название, категорию и единицу измерения.' } };
  }

  try {
    const response = await supabaseClient
      .from('leader_catalog')
      .insert(validation.payload)
      .select(CATALOG_SELECT_FIELDS)
      .single();
    if (response.error) return { ok: false, row: null, error: mappedError(response.error) };
    return { ok: true, row: normalizeCatalogRow(response.data || {}), error: null };
  } catch (error) {
    return { ok: false, row: null, error: mappedError(error) };
  }
}
