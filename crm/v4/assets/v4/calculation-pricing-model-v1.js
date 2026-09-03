export const DEFAULT_PRICING = Object.freeze({ smallLimit: 3000, smallMarkup: 30, mediumLimit: 10000, mediumMarkup: 20, largeMarkup: 10, roundStep: 10 });

export function normalizeMarkupPercent(value, fallback = null) {
  const text = String(value ?? '').trim().replace(',', '.');
  if (!text) return fallback;
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

export function markupPercentForSubtotal(subtotal, settings = {}) {
  const fixed = normalizeMarkupPercent(settings.fixedMarkup, null);
  if (fixed !== null) return fixed;
  const smallLimit = Number(settings.smallLimit || DEFAULT_PRICING.smallLimit);
  const mediumLimit = Number(settings.mediumLimit || DEFAULT_PRICING.mediumLimit);
  if (subtotal <= smallLimit) return normalizeMarkupPercent(settings.smallMarkup, DEFAULT_PRICING.smallMarkup);
  if (subtotal <= mediumLimit) return normalizeMarkupPercent(settings.mediumMarkup, DEFAULT_PRICING.mediumMarkup);
  return normalizeMarkupPercent(settings.largeMarkup, DEFAULT_PRICING.largeMarkup);
}

export function priceWithMarkup(cost, markupPercent, roundStep = 1) {
  const raw = Number(cost || 0) * (1 + Number(markupPercent || 0) / 100);
  const step = Math.max(1, Number(roundStep || 1));
  return Math.ceil(raw / step) * step;
}

export function marginPercentFromMarkup(markupPercent) {
  const markup = Math.max(0, Number(markupPercent || 0));
  return markup ? (markup / (100 + markup)) * 100 : 0;
}

export function repriceAutomaticItems(items, settings = {}) {
  const subtotal = (items || []).reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.contractor_price || 0), 0);
  const markup = markupPercentForSubtotal(subtotal, settings);
  return (items || []).map((item) => {
    const source = item?.data?.price_source;
    if (source === 'manual' || source === 'catalog') {
      return { ...item, data: { ...(item.data || {}) } };
    }
    return {
      ...item,
      client_price: priceWithMarkup(item.contractor_price, markup, settings.roundStep),
      data: { ...(item.data || {}), price_source: 'auto', applied_markup_percent: markup }
    };
  });
}
