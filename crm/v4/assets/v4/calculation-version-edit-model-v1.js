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

function validTimestamp(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function nextCalculationVersion(calculations = []) {
  const versions = (Array.isArray(calculations) ? calculations : [])
    .map((calculation) => positiveVersion(calculation?.version_number));
  return (versions.length ? Math.max(0, ...versions) : 0) + 1;
}

export function calculationVersionLegacyPreflight(calculations = [], {
  sourceCalculationId = '',
  expectedUpdatedAt = ''
} = {}) {
  const rows = Array.isArray(calculations) ? calculations : [];
  const sourceId = cleanText(sourceCalculationId);
  const expectedTimestamp = validTimestamp(expectedUpdatedAt);
  const source = rows.find((calculation) => cleanText(calculation?.id) === sourceId) || null;

  if (!sourceId || !source) {
    return Object.freeze({
      ok: false,
      code: 'source_missing',
      message: 'Исходный расчёт больше не найден. Обновите список и откройте его заново.',
      nextVersion: null,
      duplicateVersions: Object.freeze([])
    });
  }

  const actualTimestamp = validTimestamp(source.updated_at);
  if (expectedTimestamp === null || actualTimestamp === null || actualTimestamp !== expectedTimestamp) {
    return Object.freeze({
      ok: false,
      code: 'source_changed',
      message: 'Исходный расчёт изменился после открытия. Обновите список и повторите правки.',
      nextVersion: null,
      duplicateVersions: Object.freeze([])
    });
  }

  const counts = new Map();
  rows.forEach((calculation) => {
    const version = positiveVersion(calculation?.version_number);
    if (version > 0) counts.set(version, (counts.get(version) || 0) + 1);
  });
  const duplicateVersions = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([version]) => version)
    .sort((a, b) => a - b);

  if (duplicateVersions.length) {
    return Object.freeze({
      ok: false,
      code: 'duplicate_version_inventory',
      message: `Найдены повторяющиеся номера версий: ${duplicateVersions.join(', ')}. Новое сохранение заблокировано до проверки истории.`,
      nextVersion: null,
      duplicateVersions: Object.freeze(duplicateVersions)
    });
  }

  return Object.freeze({
    ok: true,
    code: 'ready',
    message: 'Источник и номера версий проверены.',
    nextVersion: nextCalculationVersion(rows),
    duplicateVersions: Object.freeze([])
  });
}

export function calculationVersionDraftTitle(source = {}, nextVersion = 1) {
  const base = cleanText(source.title, 'Расчёт')
    .replace(/\s*[—-]\s*(?:версия|правки)\s*v?\d+\s*$/iu, '')
    .trim();
  return `${base} — правки v${positiveVersion(nextVersion) || 1}`;
}

export function rebaseCalculationVersionDraftTitle(draft = {}, source = {}, nextVersion = 1) {
  const previousAutoTitle = cleanText(draft.autoTitle);
  const currentTitle = cleanText(draft.title);
  const autoTitle = calculationVersionDraftTitle(source, nextVersion);
  const customized = Boolean(currentTitle && previousAutoTitle && currentTitle !== previousAutoTitle);
  return Object.freeze({
    title: customized ? currentTitle : autoTitle,
    autoTitle,
    customized,
    transportTitle: customized ? currentTitle : null
  });
}

export function calculationVersionTransportTitle(draft = {}) {
  const currentTitle = cleanText(draft.title);
  const autoTitle = cleanText(draft.autoTitle);
  return currentTitle && currentTitle !== autoTitle ? currentTitle : null;
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
  const draft = {
    sourceCalculationId: cleanText(source.id),
    sourceVersion: positiveVersion(source.version_number) || 1,
    sourceTitle: cleanText(source.title, 'Расчёт'),
    leadId: cleanText(source.lead_id),
    clientId: cleanText(source.client_id) || null,
    needId: cleanText(source.need_id) || null,
    publicComment: cleanText(source.public_comment),
    internalComment: `Создано как новая версия расчёта v${positiveVersion(source.version_number) || 1}. Исходный расчёт сохранён без изменений.`,
    nextVersion: nextCalculationVersion(calculations),
    items: copyCalculationItemsForVersion(items)
  };
  let customTitle = '';
  let customized = false;
  Object.defineProperties(draft, {
    autoTitle: {
      enumerable: true,
      get() {
        return calculationVersionDraftTitle({ title: draft.sourceTitle }, draft.nextVersion);
      }
    },
    title: {
      enumerable: true,
      get() {
        return customized ? customTitle : draft.autoTitle;
      },
      set(value) {
        const nextTitle = cleanText(value);
        customized = Boolean(nextTitle && nextTitle !== draft.autoTitle);
        customTitle = nextTitle;
      }
    },
    titleCustomized: {
      enumerable: true,
      get() {
        return customized;
      }
    }
  });
  return draft;
}
