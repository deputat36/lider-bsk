export const CALCULATION_COMPOSITE_MODEL_V1 = 'calculation-composite-model-v1-20260904';

function text(value, fallback = '') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function number(value, fallback = 0) {
  const parsed = Number(String(value ?? '').replace(',', '.').replace(/\s+/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeCompositeVisibility(value) {
  return value === 'detailed' ? 'detailed' : 'single_line';
}

export function normalizeCompositeComponents(components = []) {
  return (Array.isArray(components) ? components : [])
    .map((component, index) => {
      const qty = Math.max(0, number(component?.qty, 1) || 1);
      const contractorPrice = Math.max(0, number(component?.contractor_price));
      const clientPrice = Math.max(0, number(component?.client_price));
      return {
        title: text(component?.title, `Компонент ${index + 1}`),
        qty,
        unit: text(component?.unit, 'шт'),
        contractor_price: contractorPrice,
        contractor_sum: qty * contractorPrice,
        client_price: clientPrice,
        client_sum: qty * clientPrice,
        client_visible: component?.client_visible !== false,
        comment: text(component?.comment)
      };
    })
    .filter((component) => component.title && component.qty > 0);
}

export function compositeDraftItem(input = {}) {
  const title = text(input.title, 'Составное изделие');
  const visibility = normalizeCompositeVisibility(input.visibility);
  const components = normalizeCompositeComponents(input.components);
  const contractorTotal = components.reduce((sum, component) => sum + component.contractor_sum, 0);
  const allComponentClientTotal = components.reduce((sum, component) => sum + component.client_sum, 0);
  const visibleComponentClientTotal = components
    .filter((component) => component.client_visible)
    .reduce((sum, component) => sum + component.client_sum, 0);
  const manualClientTotal = Math.max(0, number(input.client_price));
  const clientTotal = visibility === 'detailed'
    ? visibleComponentClientTotal
    : manualClientTotal > 0 ? manualClientTotal : allComponentClientTotal;

  return {
    catalog_id: null,
    category: text(input.category, 'Составное изделие'),
    item_type: text(input.item_type, 'Изготовление'),
    name: title,
    unit: text(input.unit, 'комплект'),
    qty: 1,
    contractor_price: contractorTotal,
    client_price: clientTotal,
    comment: text(input.comment),
    data: {
      builder_version: 'calc-builder-v2',
      mode: 'composite',
      calculation_mode: 'composite',
      visibility,
      client_title: title,
      components,
      component_count: components.length,
      composite_totals: {
        contractor_total: contractorTotal,
        all_component_client_total: allComponentClientTotal,
        visible_component_client_total: visibleComponentClientTotal,
        manual_client_total: manualClientTotal
      },
      price_source: clientTotal > 0 ? 'manual' : 'auto'
    }
  };
}

export function compositeDraftValidation(input = {}) {
  const item = compositeDraftItem(input);
  const errors = [];
  if (!text(input.title)) errors.push('composite_title_required');
  if (!item.data.components.length) errors.push('composite_components_required');
  if (item.data.visibility === 'detailed') {
    const visible = item.data.components.filter((component) => component.client_visible);
    if (!visible.length) errors.push('composite_visible_component_required');
    if (visible.some((component) => component.client_sum <= 0)) errors.push('composite_visible_component_price_required');
  }
  return { ok: errors.length === 0, errors, item };
}
