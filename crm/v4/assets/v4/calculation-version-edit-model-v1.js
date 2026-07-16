function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveVersion(value) {
  const parsed = Math.trunc(number(value));
  return parsed > 0 ? parsed : 0;
}

function cleanText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function cloneData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return {};
  }
}

export function nextCalculationVersion(calculations = []) {
  const versions = (Array.isArray(calculations) ? calculations : [])
    .map((calculation) => positiveVersion(calculation?.version_number));
  return (versions.length ? Math.max(0, ...versions) : 0) + 1;
}

export function calculationVersionDraftTitle(source = {}, nextVersion = 1) {
  const base = cleanText(source.title, 'Расчёт')
    .replace(/\s*[—-]\s*(?:версия|правки)\s*v?\d+\s*$/iu, '')
    .trim();
  return `${base} — правки v${positiveVersion(nextVersion) || 1}`;
}

export function copyCalculationItemsForVersion(items = []) {
  return (Array.isArray(items) ? items : []).map((item, index) => ({
    catalog_id: cleanText(item?.catalog_id) || null,
    category: cleanText(item?.category, 'Ручная позиция'),
    item_type: cleanText(item?.item_type, 'Услуга'),
    name: cleanText(item?.name, `Позиция ${index + 1}`),
    unit: cleanText(item?.unit, 'шт'),
    qty: Math.max(0, number(item?.qty)),
    contractor_price: Math.max(0, number(item?.contractor_price)),
    client_price: Math.max(0, number(item?.client_price)),
    comment: cleanText(item?.comment),
    data: cloneData(item?.data),
    sort_order: index + 1
  }));
}

export function calculationVersionItem(item = {}, index = 0) {
  const qty = Math.max(0, number(item.qty));
  const contractorPrice = Math.max(0, number(item.contractor_price));
  const clientPrice = Math.max(0, number(item.client_price));
  const contractorSum = Math.round(qty * contractorPrice * 100) / 100;
  const clientSum = Math.round(qty * clientPrice * 100) / 100;
  const profit = Math.round((clientSum - contractorSum) * 100) / 100;
  const markupPercent = contractorSum > 0
    ? Math.round(((clientSum - contractorSum) / contractorSum) * 10000) / 100
    : 0;
  const marginPercent = clientSum > 0
    ? Math.round((profit / clientSum) * 10000) / 100
    : 0;
  return {
    catalog_id: cleanText(item.catalog_id) || null,
    category: cleanText(item.category, 'Ручная позиция'),
    item_type: cleanText(item.item_type, 'Услуга'),
    name: cleanText(item.name, `Позиция ${index + 1}`),
    unit: cleanText(item.unit, 'шт'),
    qty,
    contractor_price: contractorPrice,
    contractor_sum: contractorSum,
    markup_percent: markupPercent,
    client_price: clientPrice,
    client_sum: clientSum,
    profit,
    margin_percent: marginPercent,
    comment: cleanText(item.comment),
    data: cloneData(item.data),
    sort_order: index + 1
  };
}

export function calculationVersionTotals(items = []) {
  const calculated = (Array.isArray(items) ? items : []).map(calculationVersionItem);
  const contractorCost = Math.round(calculated.reduce((sum, item) => sum + item.contractor_sum, 0) * 100) / 100;
  const clientTotal = Math.round(calculated.reduce((sum, item) => sum + item.client_sum, 0) * 100) / 100;
  const profit = Math.round((clientTotal - contractorCost) * 100) / 100;
  const marginPercent = clientTotal > 0
    ? Math.round((profit / clientTotal) * 10000) / 100
    : 0;
  const warnings = [];
  if (!calculated.length) warnings.push('Нет позиций расчёта');
  if (calculated.some((item) => item.qty <= 0)) warnings.push('Количество должно быть больше 0');
  if (calculated.some((item) => item.client_price <= 0)) warnings.push('Цена клиенту должна быть больше 0');
  if (profit < 0) warnings.push('Расчёт убыточный');
  if (clientTotal > 0 && marginPercent < 20) warnings.push('Маржа ниже 20%');
  return {
    items: calculated,
    contractor_cost: contractorCost,
    client_total: clientTotal,
    profit,
    margin_percent: marginPercent,
    warnings,
    warning_level: warnings.some((warning) => /убыточ|количество|цена клиенту/i.test(warning))
      ? 'critical'
      : warnings.length ? 'warning' : 'ok',
    canSave: calculated.length > 0
      && calculated.every((item) => item.qty > 0 && item.client_price > 0)
      && clientTotal > 0
      && profit >= 0
  };
}

export function createCalculationVersionDraft(source = {}, items = [], calculations = []) {
  const nextVersion = nextCalculationVersion(calculations);
  return {
    sourceCalculationId: cleanText(source.id),
    sourceVersion: positiveVersion(source.version_number) || 1,
    leadId: cleanText(source.lead_id),
    clientId: cleanText(source.client_id) || null,
    needId: cleanText(source.need_id) || null,
    title: calculationVersionDraftTitle(source, nextVersion),
    publicComment: cleanText(source.public_comment),
    internalComment: `Создано как новая версия расчёта v${positiveVersion(source.version_number) || 1}. Исходный расчёт сохранён без изменений.`,
    nextVersion,
    items: copyCalculationItemsForVersion(items)
  };
}
