export const CLEAR_CONFIRMATION_WINDOW_MS = 4000;

function text(value) {
  return String(value ?? '').trim();
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

export function calculationPositionCountLabel(count) {
  const value = Math.max(0, Number(count) || 0);
  const lastTwo = value % 100;
  const last = value % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${value} позиций`;
  if (last === 1) return `${value} позиция`;
  if (last >= 2 && last <= 4) return `${value} позиции`;
  return `${value} позиций`;
}

export function calculationDraftEconomics({ contractorPrice = 0, clientPrice = 0 } = {}) {
  const cost = nonNegativeNumber(contractorPrice);
  const client = nonNegativeNumber(clientPrice);
  const profitPerUnit = client - cost;
  const markupPercent = cost > 0 ? (profitPerUnit / cost) * 100 : null;
  const marginPercent = client > 0 ? (profitPerUnit / client) * 100 : null;
  return {
    contractorPrice: cost,
    clientPrice: client,
    profitPerUnit,
    markupPercent: Number.isFinite(markupPercent) ? markupPercent : null,
    marginPercent: Number.isFinite(marginPercent) ? marginPercent : null,
    isLoss: profitPerUnit < 0
  };
}

export function calculationDraftClearDecision({ rowCount = 0, armedUntil = 0, now = Date.now() } = {}) {
  const count = Math.max(0, Number(rowCount) || 0);
  const current = Number(now) || 0;
  const armed = Number(armedUntil) || 0;
  if (count === 0) return { action: 'empty', armedUntil: 0 };
  if (armed > current) return { action: 'clear', armedUntil: 0 };
  return { action: 'arm', armedUntil: current + CLEAR_CONFIRMATION_WINDOW_MS };
}

export function calculationDraftRowLabels(index, name) {
  const rowNumber = Math.max(0, Number(index) || 0) + 1;
  const safeName = text(name) || `Позиция ${rowNumber}`;
  return {
    row: `Позиция ${rowNumber}: ${safeName}`,
    quantity: `Количество — ${safeName}`,
    contractorPrice: `Себестоимость за единицу — ${safeName}`,
    clientPrice: `Цена клиенту за единицу — ${safeName}`,
    autoPrice: `Вернуть автоматическую цену — ${safeName}`,
    remove: `Удалить позицию — ${safeName}`
  };
}

export function calculationDraftReviewDescriptor({ modeLabel, category, itemType, characteristics, previewName } = {}) {
  const mode = text(modeLabel) || 'Позиция расчёта';
  return {
    category: text(category) || mode,
    itemType: text(itemType) || 'Состав позиции',
    characteristics: text(characteristics),
    previewName: text(previewName)
  };
}

export function reconcileCalculationDraftReview(existing, pending, beforeCount, afterCount) {
  const current = Array.isArray(existing) ? [...existing] : [];
  const descriptors = Array.isArray(pending) ? pending : [];
  const before = Math.max(0, Number(beforeCount) || 0);
  const after = Math.max(0, Number(afterCount) || 0);
  const added = Math.max(0, after - before);
  if (!added) return current.slice(0, after);
  const fallback = calculationDraftReviewDescriptor();
  const additions = Array.from({ length: added }, (_, index) => descriptors[index] || fallback);
  return [...current.slice(0, before), ...additions].slice(0, after);
}
