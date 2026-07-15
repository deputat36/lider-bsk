const TYPE_MODE = Object.freeze({ 'Баннер': 'banner', 'Пленка / наклейки': 'film', 'Табличка': 'sheet', 'Полиграфия': 'photo', 'Дизайн': 'service', 'Монтаж': 'service' });
export function numericNeedValue(value, fallback = '') { const match = String(value ?? '').replace(',', '.').match(/\d+(?:\.\d+)?/); return match ? match[0] : fallback; }
export function needCalculationPrefill(need = {}) {
  const data = need.structured_data || {};
  return { needId: need.id || '', mode: TYPE_MODE[need.need_type] || 'custom', title: need.title || need.need_type || 'Расчёт по потребности', width: numericNeedValue(data.width), height: numericNeedValue(data.height), quantity: numericNeedValue(data.quantity || data.print_run, '1'), material: String(data.material || '').trim(), comment: need.description || '' };
}
