// UI validation and money parsing. The database repeats validation authoritatively.
export const FINANCE_METHODS = Object.freeze(['Наличные', 'Перевод', 'Безналичный расчёт', 'Карта', 'Другое']);
export const EXPENSE_CATEGORIES = Object.freeze(['Материалы', 'Подрядчик', 'Дизайн', 'Производство', 'Монтаж', 'Доставка', 'Прочее']);
export const PAYMENT_CATEGORIES = Object.freeze(['Предоплата', 'Доплата', 'Полная оплата', 'Прочее']);
export const FINANCE_ACTIONS = Object.freeze(['finance.payment.create', 'finance.expense.create', 'finance.record.void']);

export function financeAmount(value) {
  const raw = String(value ?? '').trim().replace(/[ \u00a0\u202f]/g, '').replace(',', '.');
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(raw)) throw new Error('Укажите сумму в рублях, не более двух знаков после запятой.');
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000000) throw new Error('Сумма должна быть больше нуля и не превышать 1 млрд ₽.');
  return Math.round(amount * 100) / 100;
}

export function financeDate(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || !Number.isFinite(Date.parse(raw + 'T12:00:00Z')) || new Date(raw + 'T12:00:00Z').toISOString().slice(0, 10) !== raw) throw new Error('Укажите существующую дату.');
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(new Date());
  if (raw < '2000-01-01' || raw > today) throw new Error('Укажите дату фактического платежа, не в будущем.');
  return raw;
}

export function financeCreatePayload({ orderId, kind, amount, date, method, category, comment = '' }) {
  if (!['payment', 'expense'].includes(kind)) throw new Error('Неизвестный вид операции.');
  if (!FINANCE_METHODS.includes(method)) throw new Error('Выберите способ оплаты.');
  const categories = kind === 'payment' ? PAYMENT_CATEGORIES : EXPENSE_CATEGORIES;
  if (!categories.includes(category)) throw new Error('Выберите категорию.');
  if (String(comment).trim().length > 2000) throw new Error('Комментарий: не более 2000 символов.');
  return { order_id: orderId, amount: financeAmount(amount), date: financeDate(date), method, category, comment: String(comment).trim() };
}

// Count every row. Never turn an incomplete/failed read into a zero balance.
export async function fetchAllOrderFinance(client, table, fields, orderId, pageSize = 500) {
  if (!['leader_payments', 'leader_expenses'].includes(table)) throw new Error('finance_table_invalid');
  const rows = [];
  for (let offset = 0; offset < 100000; offset += pageSize) {
    const { data, error } = await client.from(table).select(fields).eq('order_id', orderId).order('id', { ascending: true }).range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('finance_response_invalid');
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
  throw new Error('Слишком много финансовых записей: итог не рассчитан.');
}
