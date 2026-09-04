#!/usr/bin/env python3
from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'crm/v4/assets/v4/calculations.js'
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
    "import { marginPercentFromMarkup, markupPercentForSubtotal, priceWithMarkup, repriceAutomaticItems } from './calculation-pricing-model-v1.js';",
    "import { marginPercentFromMarkup, markupPercentForSubtotal, markupPercentFromMargin, normalizeMarginPercent, priceWithMarkup, repriceAutomaticItems } from './calculation-pricing-model-v1.js';",
    'pricing import'
)

old_settings = '''function calcSettings() {
  return {
    fixedMarkup: byId('calcMarkup')?.value ?? '',
    smallLimit: num('calcSmallLimit') || 3000,
    smallMarkup: num('calcSmallMarkup') || 30,
    medLimit: num('calcMedLimit') || 10000,
    mediumMarkup: num('calcMedMarkup') || 20,
    largeMarkup: num('calcLargeMarkup') || 10,
    roundStep: Math.max(1, num('calcRoundStep') || 10)
  };
}
'''
new_settings = '''function targetMarginState() {
  const raw = String(byId('calcTargetMargin')?.value ?? '').trim();
  if (!raw) return { active: false, valid: true, margin: null, markup: null };
  const margin = normalizeMarginPercent(raw, null);
  const markup = markupPercentFromMargin(raw, null);
  return { active: true, valid: margin !== null && markup !== null, margin, markup };
}

function calcSettings() {
  const targetMargin = targetMarginState();
  return {
    fixedMarkup: targetMargin.active && targetMargin.valid ? targetMargin.markup : (byId('calcMarkup')?.value ?? ''),
    targetMargin: targetMargin.margin,
    targetMarginActive: targetMargin.active,
    targetMarginValid: targetMargin.valid,
    smallLimit: num('calcSmallLimit') || 3000,
    smallMarkup: num('calcSmallMarkup') || 30,
    medLimit: num('calcMedLimit') || 10000,
    mediumMarkup: num('calcMedMarkup') || 20,
    largeMarkup: num('calcLargeMarkup') || 10,
    roundStep: Math.max(1, num('calcRoundStep') || 10)
  };
}
'''
replace_once(old_settings, new_settings, 'target margin settings')

old_apply = '''function applyAutoPrice(rows) {
  const settings = calcSettings();
  const currentContractor = draftItems.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.contractor_price || 0), 0);'''
new_apply = '''function applyAutoPrice(rows) {
  const settings = calcSettings();
  if (settings.targetMarginActive && !settings.targetMarginValid) {
    calculationModeError = 'Целевая маржа должна быть меньше 100% и не может быть отрицательной';
    return rows;
  }
  const currentContractor = draftItems.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.contractor_price || 0), 0);'''
replace_once(old_apply, new_apply, 'invalid target margin auto price guard')

old_ui = '''      <section class="v4-pricing-control" aria-label="Управление ценой расчёта">
        <div><h4>Наценка к себестоимости</h4><p>Наценка 20% означает: себестоимость 1 000 ₽ → клиенту 1 200 ₽. Итоговая маржа при этом 16,7%.</p></div>
        <div class="v4-markup-presets" role="group" aria-label="Быстрый выбор наценки"><button type="button" data-calc-markup="auto" class="is-active">Авто 10–30%</button><button type="button" data-calc-markup="10">10%</button><button type="button" data-calc-markup="20">20%</button><button type="button" data-calc-markup="30">30%</button></div>
        <label class="v4-markup-input">Своя наценка, %<input id="calcMarkup" type="number" min="0" step="1" placeholder="Автоматически"></label>
        <div id="calcPricingExplanation" class="v4-pricing-explanation" aria-live="polite"></div>
      </section>'''
new_ui = '''      <section class="v4-pricing-control" aria-label="Управление ценой расчёта">
        <div><h4>Цена и прибыль</h4><p>Можно управлять либо наценкой к себестоимости, либо целевой маржой. Заполняйте только один способ — CRM сама пересчитает второй показатель.</p></div>
        <div class="v4-pricing-choice">
          <div>
            <b>Наценка к себестоимости</b>
            <div class="v4-markup-presets" role="group" aria-label="Быстрый выбор наценки"><button type="button" data-calc-markup="auto" class="is-active">Авто 10–30%</button><button type="button" data-calc-markup="10">10%</button><button type="button" data-calc-markup="20">20%</button><button type="button" data-calc-markup="30">30%</button></div>
            <label class="v4-markup-input">Своя наценка, %<input id="calcMarkup" type="number" min="0" step="0.1" placeholder="Автоматически"></label>
          </div>
          <div>
            <b>Целевая маржа</b>
            <div class="v4-markup-presets" role="group" aria-label="Быстрый выбор целевой маржи"><button type="button" data-calc-margin="15">15%</button><button type="button" data-calc-margin="20">20%</button><button type="button" data-calc-margin="30">30%</button><button type="button" data-calc-margin="40">40%</button></div>
            <label class="v4-markup-input">Своя маржа, %<input id="calcTargetMargin" type="number" min="0" max="95" step="0.1" placeholder="Не задана"></label>
          </div>
        </div>
        <div id="calcPricingExplanation" class="v4-pricing-explanation" aria-live="polite"></div>
      </section>'''
replace_once(old_ui, new_ui, 'pricing control UI')

old_explanation = '''function renderPricingExplanation() {
  const box = byId('calcPricingExplanation');
  if (!box) return;
  const settings = calcSettings();
  const subtotal = draftItems.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.contractor_price || 0), 0);
  const markup = markupPercentForSubtotal(subtotal, { ...settings, mediumLimit: settings.medLimit });
  const margin = marginPercentFromMarkup(markup);
  const fixed = String(byId('calcMarkup')?.value || '').trim();
  box.innerHTML = `<b>${fixed ? `Фиксированная наценка ${Math.round(markup)}%` : `Автоматическая наценка ${Math.round(markup)}%`}</b><span>Ориентировочная маржа ${margin.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}% до округления. Ручные цены позиций не изменяются.</span>`;
  document.querySelectorAll('[data-calc-markup]').forEach((button) => button.classList.toggle('is-active', button.dataset.calcMarkup === 'auto' ? !fixed : fixed === button.dataset.calcMarkup));
}

function refreshDraftPricing() {
  const settings = calcSettings();
  draftItems = repriceAutomaticItems(draftItems, { ...settings, mediumLimit: settings.medLimit });
  renderDraftItems();
  renderPricingExplanation();
}
'''
new_explanation = '''function renderPricingExplanation() {
  const box = byId('calcPricingExplanation');
  if (!box) return;
  const settings = calcSettings();
  const targetMargin = targetMarginState();
  const fixed = String(byId('calcMarkup')?.value || '').trim();
  if (targetMargin.active && !targetMargin.valid) {
    box.innerHTML = '<b>Проверьте целевую маржу</b><span>Целевая маржа должна быть меньше 100% и не может быть отрицательной. Цена не пересчитывается, пока значение не исправлено.</span>';
    document.querySelectorAll('[data-calc-markup]').forEach((button) => button.classList.remove('is-active'));
    document.querySelectorAll('[data-calc-margin]').forEach((button) => button.classList.remove('is-active'));
    return;
  }
  const subtotal = draftItems.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.contractor_price || 0), 0);
  const markup = markupPercentForSubtotal(subtotal, { ...settings, mediumLimit: settings.medLimit });
  const margin = marginPercentFromMarkup(markup);
  if (targetMargin.active) {
    box.innerHTML = `<b>Целевая маржа ${targetMargin.margin.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%</b><span>Эквивалентная наценка ${markup.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%. Ручные цены позиций не изменяются.</span>`;
  } else {
    box.innerHTML = `<b>${fixed ? `Фиксированная наценка ${markup.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%` : `Автоматическая наценка ${Math.round(markup)}%`}</b><span>Ориентировочная маржа ${margin.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}% до округления. Ручные цены позиций не изменяются.</span>`;
  }
  document.querySelectorAll('[data-calc-markup]').forEach((button) => button.classList.toggle('is-active', !targetMargin.active && (button.dataset.calcMarkup === 'auto' ? !fixed : fixed === button.dataset.calcMarkup)));
  document.querySelectorAll('[data-calc-margin]').forEach((button) => button.classList.toggle('is-active', targetMargin.active && String(targetMargin.margin) === button.dataset.calcMargin));
}

function refreshDraftPricing() {
  const settings = calcSettings();
  if (settings.targetMarginActive && !settings.targetMarginValid) {
    renderPricingExplanation();
    return;
  }
  draftItems = repriceAutomaticItems(draftItems, { ...settings, mediumLimit: settings.medLimit });
  renderDraftItems();
  renderPricingExplanation();
}
'''
replace_once(old_explanation, new_explanation, 'pricing explanation')

old_add_start = '''function addSmartItems() {
  const items = currentModeItems();'''
new_add_start = '''function addSmartItems() {
  const targetMargin = targetMarginState();
  if (targetMargin.active && !targetMargin.valid) {
    toast('Целевая маржа должна быть меньше 100% и не может быть отрицательной');
    return;
  }
  const items = currentModeItems();'''
replace_once(old_add_start, new_add_start, 'add item target margin guard')

old_markup_click = '''    const markupButton = event.target.closest('button[data-calc-markup]');
    if (markupButton) {
      const input = byId('calcMarkup');
      if (input) input.value = markupButton.dataset.calcMarkup === 'auto' ? '' : markupButton.dataset.calcMarkup;
      refreshDraftPricing();
      return;
    }
'''
new_markup_click = '''    const markupButton = event.target.closest('button[data-calc-markup]');
    if (markupButton) {
      const input = byId('calcMarkup');
      const marginInput = byId('calcTargetMargin');
      if (marginInput) marginInput.value = '';
      if (input) input.value = markupButton.dataset.calcMarkup === 'auto' ? '' : markupButton.dataset.calcMarkup;
      refreshDraftPricing();
      return;
    }
    const marginButton = event.target.closest('button[data-calc-margin]');
    if (marginButton) {
      const input = byId('calcTargetMargin');
      const markupInput = byId('calcMarkup');
      if (markupInput) markupInput.value = '';
      if (input) input.value = marginButton.dataset.calcMargin;
      refreshDraftPricing();
      return;
    }
'''
replace_once(old_markup_click, new_markup_click, 'margin preset click')

old_input = '''  byId('leadCardSection')?.addEventListener('input', (event) => {
    if (event.target?.id === 'calcMarkup') { refreshDraftPricing(); return; }
    if (event.target.closest('#calculationsBox')) renderSmartPreview();
  });'''
new_input = '''  byId('leadCardSection')?.addEventListener('input', (event) => {
    if (event.target?.id === 'calcMarkup') {
      if (String(event.target.value || '').trim()) {
        const marginInput = byId('calcTargetMargin');
        if (marginInput) marginInput.value = '';
      }
      refreshDraftPricing();
      return;
    }
    if (event.target?.id === 'calcTargetMargin') {
      if (String(event.target.value || '').trim()) {
        const markupInput = byId('calcMarkup');
        if (markupInput) markupInput.value = '';
      }
      refreshDraftPricing();
      return;
    }
    if (event.target.closest('#calculationsBox')) renderSmartPreview();
  });'''
replace_once(old_input, new_input, 'target margin input events')

required = [
    'markupPercentFromMargin',
    'normalizeMarginPercent',
    'function targetMarginState()',
    'id="calcTargetMargin"',
    'data-calc-margin="30"',
    'Целевая маржа должна быть меньше 100%',
    "event.target?.id === 'calcTargetMargin'",
]
for marker in required:
    if marker not in text:
        raise SystemExit('missing patched marker: ' + marker)

path.write_text(text, encoding='utf-8')
print('Target-margin pricing UI integrated')
