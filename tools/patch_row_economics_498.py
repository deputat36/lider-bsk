#!/usr/bin/env python3
from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'crm/v4/assets/v4/calculation-draft-review-v1.js'
text = path.read_text(encoding='utf-8')


def replace_once(needle, replacement, label):
    global text
    if replacement in text:
        return
    count = text.count(needle)
    if count != 1:
        raise SystemExit(f'{label}: expected one marker, got {count}')
    text = text.replace(needle, replacement, 1)

replace_once(
    "  calculationDraftClearDecision,\n  calculationDraftReviewDescriptor,",
    "  calculationDraftClearDecision,\n  calculationDraftEconomics,\n  calculationDraftReviewDescriptor,",
    'economics import'
)

old_field = '''function fieldValue(id) {
  return text(document.getElementById(id)?.value);
}
'''
new_field = '''function fieldValue(id) {
  return text(document.getElementById(id)?.value);
}

function money(value) {
  return `${Math.round(Number(value || 0)).toLocaleString('ru-RU')} ₽`;
}

function percent(value) {
  return value === null || value === undefined
    ? '—'
    : `${Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;
}

function decorateRowEconomics(row) {
  const contractor = row?.querySelector('[data-calc-row-field="contractor_price"]');
  const client = row?.querySelector('[data-calc-row-field="client_price"]');
  const clientCell = client?.closest('td');
  clientCell?.querySelector('.v4-calc-row-economics')?.remove();
  if (!contractor || !client || !clientCell) return;
  const economics = calculationDraftEconomics({
    contractorPrice: contractor.value,
    clientPrice: client.value
  });
  const details = document.createElement('small');
  details.className = `v4-calc-row-economics${economics.isLoss ? ' is-loss' : ''}`;
  details.textContent = `Прибыль ${money(economics.profitPerUnit)} / ед. · Наценка ${percent(economics.markupPercent)} · Маржа ${percent(economics.marginPercent)}`;
  details.setAttribute('aria-label', `Экономика позиции: прибыль ${money(economics.profitPerUnit)} на единицу, наценка ${percent(economics.markupPercent)}, маржа ${percent(economics.marginPercent)}`);
  clientCell.append(details);
}
'''
replace_once(old_field, new_field, 'economics DOM helper')

old_auto = '''    if (autoButton) {
      autoButton.setAttribute('aria-label', aria.autoPrice);
      autoButton.title = aria.autoPrice;
      let state = autoButton.parentElement?.querySelector('.v4-calc-price-state');
      if (!state) {
        state = document.createElement('small');
        state.className = 'v4-calc-price-state';
        autoButton.parentElement?.append(state);
      }
      state.textContent = autoButton.disabled ? 'Автоматическая цена' : 'Ручная цена';
    }
    if (removeButton) {'''
new_auto = '''    if (autoButton) {
      autoButton.setAttribute('aria-label', aria.autoPrice);
      autoButton.title = aria.autoPrice;
      let state = autoButton.parentElement?.querySelector('.v4-calc-price-state');
      if (!state) {
        state = document.createElement('small');
        state.className = 'v4-calc-price-state';
        autoButton.parentElement?.append(state);
      }
      state.textContent = autoButton.disabled ? 'Автоматическая цена' : 'Ручная цена';
    }
    decorateRowEconomics(row);
    if (removeButton) {'''
replace_once(old_auto, new_auto, 'decorate economics in rows')

old_bind = '''function bindDraftReviewEvents(section) {
  section.addEventListener('click', (event) => {'''
new_bind = '''function bindDraftReviewEvents(section) {
  section.addEventListener('input', (event) => {
    const field = event.target.closest('[data-calc-row-field="contractor_price"], [data-calc-row-field="client_price"]');
    if (!field) return;
    decorateRowEconomics(field.closest('tr'));
  });

  section.addEventListener('click', (event) => {'''
replace_once(old_bind, new_bind, 'live economics input listener')

for marker in [
    'calculationDraftEconomics',
    'function decorateRowEconomics(row)',
    'v4-calc-row-economics',
    'Экономика позиции:',
    "[data-calc-row-field=\"contractor_price\"], [data-calc-row-field=\"client_price\"]",
]:
    if marker not in text:
        raise SystemExit('missing row economics marker: ' + marker)

path.write_text(text, encoding='utf-8')
print('Per-position calculation economics integrated')
