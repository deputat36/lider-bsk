const MODE_LABELS = Object.freeze({
  banner: 'Баннер',
  banner_hemming: 'Проклейка',
  banner_grommets: 'Люверсы',
  film: 'Плёнка',
  mount_film: 'Монтажная плёнка',
  plotter_cut: 'Плоттерная резка',
  sheet: 'Листовой материал',
  sheet_print: 'Печать',
  sheet_lamination: 'Накатка / ламинация',
  sheet_cut: 'Резка деталей',
  photo: 'Фото',
  photo_lamination: 'Ламинация',
  pvc_shape_material: 'ПВХ-фигура',
  pvc_shape_print: 'Печать на фигуре',
  pvc_shape_cut: 'Фигурная резка',
  letters: 'Буквы / цифры',
  service: 'Услуга',
  custom: 'Ручная позиция',
  rounding: 'Округление'
});

function text(value) {
  return String(value ?? '').trim();
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function savedCalculationPositionLabel(count) {
  const value = Math.max(0, Number(count) || 0);
  const lastTwo = value % 100;
  const last = value % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${value} позиций`;
  if (last === 1) return `${value} позиция`;
  if (last >= 2 && last <= 4) return `${value} позиции`;
  return `${value} позиций`;
}

export function savedCalculationItemReview(item = {}, index = 0) {
  const data = item?.data && typeof item.data === 'object' && !Array.isArray(item.data) ? item.data : {};
  const name = text(item.name) || `Позиция ${Number(index) + 1}`;
  const category = text(item.category) || 'Без категории';
  const itemType = text(item.item_type) || MODE_LABELS[data.calculation_mode] || 'Позиция';
  const characteristics = [];
  const explicit = text(data.characteristics);
  if (explicit) characteristics.push(explicit);

  const width = positiveNumber(data.width);
  const height = positiveNumber(data.height);
  if (width && height) characteristics.push(`Размер: ${width}×${height} м`);

  const diameter = positiveNumber(data.diameter_cm);
  if (diameter) characteristics.push(`Диаметр: ${diameter} см`);

  const thickness = positiveNumber(data.thickness_mm);
  if (thickness) characteristics.push(`Толщина: ${thickness} мм`);

  const symbol = text(data.symbol);
  if (symbol) characteristics.push(`Знак: ${symbol}`);

  const heightCm = positiveNumber(data.height_cm);
  if (heightCm) characteristics.push(`Высота: ${heightCm} см`);

  const color = text(data.color);
  if (color) characteristics.push(`Цвет: ${color}`);

  const material = text(data.material);
  if (material) characteristics.push(`Материал: ${material}`);

  const pieces = positiveNumber(data.pieces);
  if (pieces) characteristics.push(`Изделий: ${pieces} шт`);

  const mode = text(data.calculation_mode);
  const modeLabel = MODE_LABELS[mode] || '';
  const priceSource = data.price_source === 'manual' ? 'Ручная цена' : data.price_source === 'auto' ? 'Автоматическая цена' : '';

  return {
    rowNumber: Math.max(0, Number(index) || 0) + 1,
    name,
    category,
    itemType,
    modeLabel,
    characteristics: [...new Set(characteristics)],
    priceSource,
    rowLabel: `Позиция ${Math.max(0, Number(index) || 0) + 1}: ${name}`
  };
}

export function savedCalculationDetailsCopy(count) {
  return `Сохранено: ${savedCalculationPositionLabel(count)}. Эти строки используются для КП и заказа.`;
}
