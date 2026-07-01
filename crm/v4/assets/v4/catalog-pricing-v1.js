export const CATALOG_PRICING_V1 = 'catalog-pricing-v1-20260701';

function numberValue(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function catalogClientUnitPrice(row) {
  const contractor = numberValue(row?.contractor_price);
  const markup = numberValue(row?.markup_percent);
  const minPrice = numberValue(row?.min_client_price);
  const defaultPrice = numberValue(row?.default_client_price);
  const calculated = Math.ceil(contractor * (1 + markup / 100));
  const base = defaultPrice > 0 ? defaultPrice : calculated;
  return Math.max(base, minPrice);
}

export function catalogPricingSnapshot(row) {
  return {
    id: row?.id || null,
    category: row?.category || '',
    name: row?.name || '',
    unit: row?.unit || 'шт',
    item_type: row?.item_type || 'Изготовление',
    contractor_price: numberValue(row?.contractor_price),
    markup_percent: numberValue(row?.markup_percent),
    min_client_price: numberValue(row?.min_client_price),
    default_client_price: numberValue(row?.default_client_price),
    calculation_mode: row?.calculation_mode || 'markup',
    settings: row?.settings || {}
  };
}

export function catalogDraftItem(row, qty = 1, extraData = {}) {
  const quantity = Math.max(0, numberValue(qty) || 1);
  return {
    catalog_id: row?.id || null,
    category: row?.category || 'Каталог',
    item_type: row?.item_type || 'Изготовление',
    name: row?.name || 'Позиция каталога',
    unit: row?.unit || 'шт',
    qty: quantity,
    contractor_price: numberValue(row?.contractor_price),
    client_price: catalogClientUnitPrice(row),
    comment: row?.description || '',
    data: {
      ...extraData,
      builder_version: 'calc-builder-v2',
      mode: 'catalog',
      visibility: extraData.visibility || 'single_line',
      catalog_snapshot: catalogPricingSnapshot(row)
    }
  };
}
