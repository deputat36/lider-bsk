export const QUOTE_STATUSES = Object.freeze({ new: 'Ожидаем расчёт', clarification: 'Нужно уточнение', review: 'Расчёт получен', changes: 'Ожидаем исправления', accepted: 'Принят', cancelled: 'Отменён' });
export const QUOTE_WRITES = Object.freeze(['create','respond','clarify','change','update','accept','cancel','template.save']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const quoteUuid = value => typeof value === 'string' && UUID.test(value);
export function quoteEnvironment(url) {
  try { return new URL(url).origin === 'https://otulfnouybahfnsycxqn.supabase.co'; } catch (_) { return false; }
}
export function quoteNumber(value, { positive = false, max = 1e9, precision = 2 } = {}) {
  const text = String(value ?? '').trim().replace(',', '.');
  const number = text === '' ? NaN : Number(text);
  if (!Number.isFinite(number) || number < 0 || (positive && number === 0) || number > max || Math.abs(number * 10 ** precision - Math.round(number * 10 ** precision)) > 0.0001) throw Error('Проверьте количество и себестоимость: пустые, отрицательные и слишком точные значения недопустимы.');
  return number;
}
export function quoteItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 80) throw Error('В ответе должно быть от 1 до 80 позиций.');
  const ids = new Set();
  return items.map(item => {
    const name = String(item.name ?? '').trim(), unit = String(item.unit ?? '').trim(), specification = String(item.specification ?? '');
    if (!quoteUuid(item.id) || ids.has(item.id) || !name || name.length > 500 || !unit || unit.length > 40 || specification.length > 2000) throw Error('Проверьте название, единицу и параметры позиции.');
    ids.add(item.id);
    return { id: item.id, name, unit, specification, qty: quoteNumber(item.qty, { positive: true, max: 1e6, precision: 3 }), unit_cost: quoteNumber(item.unit_cost) };
  });
}
export function quoteCalculationItems(selection, { template = false } = {}) {
  const items = quoteItems(selection.items);
  // Internal notes, vendor and source IDs never become a client description.
  return items.map(item => ({
    category: 'Подрядный расчёт', item_type: 'Изготовление', name: item.name, unit: item.unit, qty: item.qty,
    contractor_price: item.unit_cost, client_price: 0, comment: '',
    data: {
      builder_version: 'calc-builder-v2', mode: 'contractor_quote', calculation_mode: 'contractor_quote', visibility: 'single_line', client_visible: true,
      client_title: item.name, client_description: item.specification || null, price_source: 'auto',
      vendor: selection.vendor_name || null,
      quote_source: { task_id: selection.task_id || null, quote_id: selection.quote_id || selection.source_quote_id || null, item_id: item.id, template_id: template ? selection.id : null, cost_date: selection.cost_date || null }
    }
  }));
}
export function quoteErrorMessage(code) {
  return ({ source_changed: 'Задание изменилось. Ваш ввод сохранён. Обновите карточку и сверьте актуальное ТЗ.', forbidden: 'Недостаточно прав.', not_found: 'Задание недоступно или не найдено.', quote_expired: 'Срок цены истёк. Запросите новый ответ подрядчика.', quote_not_accepted: 'Сначала примите расчёт подрядчика.', invalid_transition: 'Действие уже недоступно для этого статуса. Обновите карточку.', idempotency_conflict: 'Повтор запроса отличается от первоначального.', invalid_assignee: 'Выберите действующего подрядчика.', invalid_payload: 'Проверьте поля формы.', invalid_items: 'Проверьте позиции ответа.', invalid_selection: 'Выберите позиции из текущей версии ответа.', auth_required: 'Требуется действующий вход.', environment_locked: 'Запросы расчёта доступны в тестовой среде до включения рабочего сервера.', response_source_required: 'Укажите, откуда получен ответ подрядчика.' })[code] || 'Не удалось получить подтверждение сервера. Повторите тот же запрос; введённые данные сохранены.';
}
