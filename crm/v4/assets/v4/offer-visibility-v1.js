const VERSION = 'offer-visibility-v1-20260701';

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function moneyNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function offerVisibilityVersion() {
  return VERSION;
}

export function itemVisibility(item) {
  const data = asObject(item?.data);
  return data.visibility || 'single_line';
}

export function itemClientTitle(item) {
  const data = asObject(item?.data);
  return data.client_title || item?.name || 'Позиция';
}

export function publicOfferRows(items) {
  const rows = [];
  asArray(items).forEach((item) => {
    const clientSum = moneyNumber(item?.client_sum);
    if (clientSum <= 0) return;
    const data = asObject(item?.data);
    const visibility = itemVisibility(item);
    if (visibility === 'internal_only') return;
    if (visibility === 'detailed') {
      const components = asArray(data.components).filter((component) => component?.client_visible);
      if (components.length) {
        components.forEach((component) => {
          rows.push({
            name: component.title || itemClientTitle(item),
            qty: component.qty || 1,
            unit: component.unit || '',
            client_sum: moneyNumber(component.client_sum || 0),
            parent_sum: clientSum,
            mode: 'detailed_component'
          });
        });
        return;
      }
    }
    rows.push({
      name: itemClientTitle(item),
      qty: item?.qty || 1,
      unit: item?.unit || '',
      client_sum: clientSum,
      mode: 'single_line'
    });
  });
  return rows;
}

export function shortOfferItemNames(items, limit = 8) {
  return publicOfferRows(items).slice(0, limit).map((row) => row.name);
}
