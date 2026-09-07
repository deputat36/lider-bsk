export const CONTRACTOR_QUOTE_MODEL_V1 = 'contractor-quote-model-v1-20260907';

function numberValue(value) {
  const parsed = Number(String(value ?? '').replace(',', '.').replace(/\s+/g, ''));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function textValue(value, fallback = '') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function unitValue(value) {
  const normalized = textValue(value, 'комплект');
  return ['шт', 'комплект', 'м²', 'услуга'].includes(normalized) ? normalized : 'комплект';
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
  const clientTotal = numberValue(input.clientPrice);
  const totalCost = base + delivery + installation + design + other;
  const vendor = textValue(input.vendor);
  const clientTitle = textValue(input.clientTitle || input.title, 'Позиция по смете подрядчика');
  const clientDescription = textValue(input.clientDescription || input.characteristics);
  const qty = Math.max(0.01, numberValue(input.qty) || 1);
  const unit = unitValue(input.unit);
  const contractorPrice = totalCost / qty;
  const clientPrice = clientTotal > 0 ? clientTotal / qty : 0;

  return {
    category: 'Подрядный расчёт',
    item_type: textValue(input.itemType, 'Изготовление'),
    name: clientTitle,
    unit,
    qty,
    contractor_price: contractorPrice,
    client_price: clientPrice,
    comment: textValue(input.internalComment || input.comment),
    data: {
      builder_version: 'calc-builder-v2',
      mode: 'contractor_quote',
      calculation_mode: 'contractor_quote',
      visibility: 'single_line',
      client_visible: true,
      client_title: clientTitle,
      client_description: clientDescription || null,
      vendor: vendor || null,
      contractor: { id: null, name: vendor || null },
      contractor_quote: {
        base,
        delivery,
        installation,
        design,
        other,
        total_cost: totalCost,
        quoted_quantity: qty,
        quoted_unit: unit
      },
      components: [
        { code: 'base', label: 'Цена подрядчика', amount: base },
        { code: 'delivery', label: 'Доставка', amount: delivery },
        { code: 'installation', label: 'Монтаж', amount: installation },
        { code: 'design', label: 'Дизайн', amount: design },
        { code: 'other', label: 'Прочие расходы', amount: other }
      ],
      pricing: {
        manual_client_total: clientTotal > 0 ? clientTotal : null,
        manual_client_price: clientTotal > 0 ? clientPrice : null
      },
      price_source: clientTotal > 0 ? 'manual' : 'auto',
      model_version: CONTRACTOR_QUOTE_MODEL_V1
    }
  };
}

export function contractorQuoteDraftValidation(input = {}) {
  const errors = [];
  const clientTitle = textValue(input.clientTitle || input.title);
  const totalCost = contractorQuoteCost(input);
  if (!clientTitle) errors.push('contractor_client_title_required');
  if (totalCost <= 0) errors.push('contractor_cost_required');
  return {
    ok: errors.length === 0,
    errors,
    item: contractorQuoteDraftItem({ ...input, clientTitle })
  };
}
