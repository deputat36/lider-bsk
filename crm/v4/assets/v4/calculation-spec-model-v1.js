export function parseCalculationPairs(value) {
  return String(value || '')
    .replace(/шт/gi, '')
    .split(/[;,\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((raw) => {
      const normalized = raw.replace(/[×*\-]/, 'x');
      const [name, quantity] = normalized.split('x').map((part) => part?.trim());
      const qty = Number(String(quantity || 1).replace(',', '.'));
      return { name: name || raw, qty: Number.isFinite(qty) && qty > 0 ? qty : 1 };
    });
}

export function parseCalculationDiameters(value) {
  return parseCalculationPairs(value)
    .map((item) => ({ diameter: Number(String(item.name).replace(',', '.')), qty: item.qty }))
    .filter((item) => Number.isFinite(item.diameter) && item.diameter > 0);
}

export function circleAreaSquareMeters(diameterCm, qty = 1) {
  const radiusMeters = Number(diameterCm || 0) / 200;
  return Math.PI * radiusMeters * radiusMeters * Number(qty || 0);
}
