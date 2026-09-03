export const CONTRACTOR_QUOTE_MODEL_V1 = 'contractor-quote-model-v1-20260903';

function numberValue(value) {
  const parsed = Number(String(value ?? '').replace(',', '.').replace(/\s+/g, ''));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function textValue(value, fallback = '') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

export function contractorQuoteCost(input = {}) {
  return ['base', 'delivery', 'installation', 'design', 'other']
    .reduce((sum, key) => sum + numberValue(input[key]), 0);
}

export function contractorQuoteDraftItem(input = {}) {
  const base = numberValue(input.base);
  const delivery = numberValue(input.delivery);
  const installation = numberValue(input.installation);
  const design = numberValue(input.design);
  const other = numberValue(input.other);
  const clientPrice = numberValue(input.clientPrice);
  const contractorPrice = base + delivery + installation + design + other;
  const vendor = textValue(input.vendor);

  return {
    category: 'Подрядный расчёт',
    item_type: 'Изготовление',
    name: textValue(input.title, 'Подрядный заказ'),
    unit: 'комплект',
    qty: 1,
    contractor_price: contractorPrice,
    client_price: clientPrice,
    comment: textValue(input.comment),
    data: {
      builder_version: 'calc-builder-v2',
      mode: 'contractor_quote',
      calculation_mode: 'contractor_quote',
      visibility: 'single_line',
      client_visible: true,
      vendor: vendor || null,
      contractor_quote: {
        base,
        delivery,
        installation,
        design,
        other,
        total_cost: contractorPrice
      },
      price_source: clientPrice > 0 ? 'manual' : 'auto',
      model_version: CONTRACTOR_QUOTE_MODEL_V1
    }
  };
}
