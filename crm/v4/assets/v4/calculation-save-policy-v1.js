// Shared browser policy. Prices may be zero and profit may be negative;
// malformed numbers and non-positive quantities are never a pricing override.
const money = (value) => `${Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`;
const numeric = (value) => value !== null && value !== '' && value !== undefined
  && typeof value !== 'boolean' && Number.isFinite(Number(value));

export function calculationSaveDecision(items, totals) {
  const validItems = Array.isArray(items) && items.length > 0 && items.length <= 200
    && items.every((item) => ['qty', 'contractor_price', 'client_price'].every((key) => numeric(item[key]))
      && Number(item.qty) > 0 && Number(item.qty) <= 1000000
      && Number(item.contractor_price) >= 0 && Number(item.contractor_price) <= 1000000000
      && Number(item.client_price) >= 0 && Number(item.client_price) <= 1000000000);
  const validTotals = totals && ['client_total', 'contractor_cost', 'profit', 'margin_percent']
    .every((key) => numeric(totals[key])) && totals.client_total >= 0 && totals.contractor_cost >= 0;
  if (!validItems || !validTotals) return { ok: false, confirmation: '', message: 'Проверьте позиции: количество больше 0, цены — конечные неотрицательные числа.' };
  let warning = '';
  if (totals.client_total === 0) warning = `Бесплатная работа: 0 ₽. Себестоимость: ${money(totals.contractor_cost)}. Прибыль: ${money(totals.profit)}.`;
  else if (totals.profit < 0) warning = `Расчёт убыточный: ${money(totals.profit)}.`;
  else if (totals.profit === 0) warning = 'Работа в ноль: прибыль 0 ₽.';
  else if (items.some((item) => Number(item.client_price) === 0)) warning = 'В расчёте есть бесплатные позиции.';
  return { ok: true, message: warning, confirmation: warning ? `${warning}\nСохранить расчёт с этой ценой?` : '' };
}
