#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CALC = ROOT / 'crm/v4/assets/v4/calculations.js'
OFFERS = ROOT / 'crm/v4/assets/v4/offers.js'
PRINT = ROOT / 'crm/v4/assets/v4/offer-print-brand-v4.js'
REVIEW = ROOT / 'crm/v4/assets/v4/calculation-draft-review-v1.js'


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 occurrence, got {count}')
    return text.replace(old, new, 1)


def replace_between(text, start_marker, end_marker, replacement, label, start_from=0):
    start = text.index(start_marker, start_from)
    end = text.index(end_marker, start)
    return text[:start] + replacement + text[end:]


calc = CALC.read_text(encoding='utf-8')
calc = replace_once(
    calc,
    "import { contractorQuoteDraftItem } from './calculation-contractor-quote-model-v1.js';",
    "import { contractorQuoteDraftItem, contractorQuoteDraftValidation } from './calculation-contractor-quote-model-v1.js';",
    'contractor import'
)

old_modes = """const MODES = [
  ['catalog', 'Из каталога'],
  ['contractor_quote', 'Подрядчик / готовая смета'],
  ['composite', 'Составное изделие'],
  ['banner', 'Баннер'],
  ['film', 'Плёнка / наклейки'],
  ['sheet', 'ПВХ / листовой материал'],
  ['pvc_shapes', 'ПВХ-фигуры'],
  ['letters', 'Буквы / цифры'],
  ['photo', 'Фото A4'],
  ['service', 'Дизайн / монтаж / доставка'],
  ['custom', 'Ручная позиция']
];"""
new_modes = """const PRIMARY_MODES = [
  ['catalog', 'Из каталога'],
  ['contractor_quote', 'По цене подрядчика'],
  ['custom', 'Своя позиция'],
  ['composite', 'Составное изделие']
];
const TEMPLATE_MODES = [
  ['banner', 'Баннер'],
  ['film', 'Плёнка / наклейки'],
  ['sheet', 'ПВХ / листовой материал'],
  ['pvc_shapes', 'ПВХ-фигуры'],
  ['letters', 'Буквы / цифры'],
  ['photo', 'Фото A4'],
  ['service', 'Дизайн / монтаж / доставка']
];
const MODES = [...PRIMARY_MODES, ...TEMPLATE_MODES];"""
calc = replace_once(calc, old_modes, new_modes, 'mode groups')

old_mode_render = """function modeOptions(selected = 'banner') {
  return MODES.map(([value, label]) => `<option value=\"${esc(value)}\" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`).join('');
}

function renderModeButtons(selected = 'banner') {
  return MODES.map(([value, label]) => `<button type=\"button\" class=\"${value === selected ? 'is-active' : ''}\" data-calc-mode=\"${esc(value)}\">${esc(label)}</button>`).join('');
}"""
new_mode_render = """function modeOptions(selected = 'catalog') {
  return MODES.map(([value, label]) => `<option value=\"${esc(value)}\" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`).join('');
}

function modeButtonMarkup([value, label], selected) {
  return `<button type=\"button\" class=\"${value === selected ? 'is-active' : ''}\" data-calc-mode=\"${esc(value)}\">${esc(label)}</button>`;
}

function renderModeButtons(selected = 'catalog') {
  const templateSelected = TEMPLATE_MODES.some(([value]) => value === selected);
  return `
    <div class=\"v4-mode-group v4-mode-group-primary\" role=\"group\" aria-label=\"Основные способы добавить позицию\">
      ${PRIMARY_MODES.map((mode) => modeButtonMarkup(mode, selected)).join('')}
    </div>
    <details class=\"v4-more-modes\" ${templateSelected ? 'open' : ''}>
      <summary>Ещё варианты: баннер, плёнка, ПВХ и другие шаблоны</summary>
      <div class=\"v4-mode-group\" role=\"group\" aria-label=\"Шаблоны расчёта\">
        ${TEMPLATE_MODES.map((mode) => modeButtonMarkup(mode, selected)).join('')}
      </div>
    </details>`;
}"""
calc = replace_once(calc, old_mode_render, new_mode_render, 'mode renderer')

render_fields_start = calc.index('function renderModeFields')
contractor_start = calc.index("  if (mode === 'contractor_quote') {", render_fields_start)
contractor_end = calc.index("  if (mode === 'composite') {", contractor_start)
contractor_render = """  if (mode === 'contractor_quote') {
    return `
      <div class=\"v4-calc-mode-help\"><b>По готовой цене подрядчика:</b> сначала напишите понятное название и характеристики для клиента. Ниже отдельно внесите внутреннюю смету — название подрядчика и его цены в КП не попадут.</div>
      <section class=\"v4-contractor-client-card\" aria-label=\"Данные позиции для клиента\">
        <div class=\"v4-contractor-card-head\">
          <div><h5>Что увидит клиент</h5><p>Это название и описание попадут в коммерческое предложение.</p></div>
          <span class=\"v4-client-badge\">Для клиента</span>
        </div>
        <div class=\"v4-form-grid\">
          <label>Название для клиента *<input id=\"calcContractorClientTitle\" placeholder=\"Например: Световая вывеска «ОВОЩИ»\"></label>
          <label>Количество<input id=\"calcContractorQty\" type=\"number\" min=\"0.01\" step=\"0.01\" value=\"1\"></label>
          <label>Единица<select id=\"calcContractorUnit\"><option>комплект</option><option>шт</option><option>м²</option><option>услуга</option></select></label>
          <label>Итог клиенту вручную, ₽<input id=\"calcContractorClient\" type=\"number\" min=\"0\" step=\"1\" placeholder=\"Пусто = по общей наценке\"></label>
          <label class=\"wide\">Характеристики / описание для клиента<textarea id=\"calcContractorClientDescription\" rows=\"3\" placeholder=\"Например: объёмные световые буквы, 3000×700 мм, акрил 3 мм, светодиодная подсветка, цвет по макету\"></textarea></label>
        </div>
      </section>
      <details class=\"v4-contractor-internal-card\" open>
        <summary><span>Внутренний расчёт себестоимости</span><small>Клиент этого не увидит</small></summary>
        <div class=\"v4-form-grid\">
          <label>Подрядчик<input id=\"calcContractorVendor\" placeholder=\"Кто изготовит / дал цену\"></label>
          <label>Цена подрядчика за весь объём, ₽<input id=\"calcContractorBase\" type=\"number\" min=\"0\" step=\"1\" value=\"0\"></label>
          <label>Доставка, ₽<input id=\"calcContractorDelivery\" type=\"number\" min=\"0\" step=\"1\" value=\"0\"></label>
          <label>Монтаж, ₽<input id=\"calcContractorInstallation\" type=\"number\" min=\"0\" step=\"1\" value=\"0\"></label>
          <label>Дизайн, ₽<input id=\"calcContractorDesign\" type=\"number\" min=\"0\" step=\"1\" value=\"0\"></label>
          <label>Прочие расходы, ₽<input id=\"calcContractorOther\" type=\"number\" min=\"0\" step=\"1\" value=\"0\"></label>
          <label class=\"wide\">Внутренняя заметка<input id=\"calcContractorComment\" placeholder=\"Например: смета поставщика, срок, что учтено отдельно\"></label>
        </div>
      </details>
    `;
  }
"""
calc = calc[:contractor_start] + contractor_render + calc[contractor_end:]

current_start = calc.index('function currentModeItems()')
calc = replace_once(calc[current_start:], "  const mode = val('calcSmartMode') || 'banner';", "  const mode = val('calcSmartMode') || 'catalog';", 'current mode default') if False else calc
# Replace scoped default safely.
scoped = calc[current_start:]
scoped = replace_once(scoped, "  const mode = val('calcSmartMode') || 'banner';", "  const mode = val('calcSmartMode') || 'catalog';", 'current mode default')
calc = calc[:current_start] + scoped
current_start = calc.index('function currentModeItems()')
contractor_start = calc.index("  if (mode === 'contractor_quote') {", current_start)
contractor_end = calc.index("  if (mode === 'banner') {", contractor_start)
contractor_logic = """  if (mode === 'contractor_quote') {
    const prepared = contractorQuoteDraftValidation({
      clientTitle: val('calcContractorClientTitle'),
      clientDescription: val('calcContractorClientDescription'),
      qty: num('calcContractorQty') || 1,
      unit: val('calcContractorUnit') || 'комплект',
      itemType: 'Изготовление',
      vendor: val('calcContractorVendor'),
      base: num('calcContractorBase'),
      delivery: num('calcContractorDelivery'),
      installation: num('calcContractorInstallation'),
      design: num('calcContractorDesign'),
      other: num('calcContractorOther'),
      clientPrice: num('calcContractorClient'),
      internalComment: val('calcContractorComment')
    });
    if (!prepared.ok) {
      calculationModeError = prepared.errors.includes('contractor_client_title_required')
        ? 'Укажите понятное название позиции для клиента'
        : 'Укажите цену подрядчика или другие внутренние расходы';
      return [];
    }
    return applyAutoPrice([prepared.item]);
  }
"""
calc = calc[:contractor_start] + contractor_logic + calc[contractor_end:]

old_preview_line = """    <div class=\"v4-estimate-lines\">${calculated.map((item) => `<div><b>${esc(item.name)}</b><span>${Number(item.qty).toLocaleString('ru-RU')} ${esc(item.unit)} · подрядчик ${money(item.contractor_sum)} · клиент ${money(item.client_sum)}</span></div>`).join('')}</div>"""
new_preview_line = """    <div class=\"v4-estimate-lines\">${calculated.map((item) => `<div><b>${esc(item.name)}</b>${item.data?.client_description ? `<small class=\"v4-client-description\">${esc(item.data.client_description)}</small>` : ''}<span>${Number(item.qty).toLocaleString('ru-RU')} ${esc(item.unit)} · себестоимость ${money(item.contractor_sum)} · клиент ${money(item.client_sum)}</span></div>`).join('')}</div>"""
calc = replace_once(calc, old_preview_line, new_preview_line, 'smart preview line')

old_draft_cell = """      <td>${esc(item.name)}${item.comment ? `<small>${esc(item.comment)}</small>` : ''}</td>"""
new_draft_cell = """      <td>${esc(item.name)}${item.data?.client_description ? `<small class=\"v4-client-description\"><b>Для клиента:</b> ${esc(item.data.client_description)}</small>` : ''}${item.comment ? `<small class=\"v4-internal-note\"><b>Внутренне:</b> ${esc(item.comment)}</small>` : ''}</td>"""
calc = replace_once(calc, old_draft_cell, new_draft_cell, 'draft first cell')

form_start = calc.index('function renderCalcForm()')
form_end = calc.index('export function renderCalculations()', form_start)
new_form = r'''function renderCalcForm() {
  const selectedMode = byId('calcSmartMode')?.value || 'catalog';
  return `
    <div class="v4-calc-form">
      <div class="v4-calc-wizard-head">
        <div>
          <h4>Расчёт заказа</h4>
          <p>Сначала добавьте понятные позиции, затем проверьте состав и только после этого настройте итоговую цену.</p>
        </div>
        <div class="v4-calc-steps"><span>1. Что считаем</span><span>2. Состав</span><span>3. Цена</span><span>4. Сохранить</span></div>
      </div>
      <div class="v4-form-grid">
        <label>Название расчёта
          <input id="calcTitle" placeholder="Например: Вывеска для магазина на ул. Советской">
        </label>
        <label>Потребность
          <select id="calcNeedId">${needOptions()}</select>
        </label>
        <label>Общее примечание для клиента
          <input id="calcPublicComment" placeholder="Условия, которые относятся ко всему расчёту">
        </label>
      </div>

      <div class="v4-calc-auto-box">
        <div class="v4-calc-section-heading">
          <span class="v4-calc-section-number">1</span>
          <div><h4>Что считаем?</h4><p>Чаще всего достаточно выбрать каталог, цену подрядчика или свою позицию. Готовые шаблоны спрятаны ниже, чтобы не перегружать экран.</p></div>
        </div>
        <div class="v4-mode-buttons">${renderModeButtons(selectedMode)}</div>
        <label class="v4-mode-select-state">Текущий тип
          <select id="calcSmartMode" tabindex="-1" aria-hidden="true">${modeOptions(selectedMode)}</select>
        </label>
        <div id="calcModeFields">${renderModeFields(selectedMode)}</div>
        <div id="calcSmartPreview" class="v4-calc-live"></div>
        <div class="v4-form-actions">
          <button id="addSmartCalcItemBtn" type="button" class="v4-primary">Добавить позицию в расчёт</button>
        </div>
      </div>

      <div class="v4-table-wrap">
        <table class="v4-table">
          <thead><tr><th>Позиция</th><th>Ед.</th><th>Кол-во</th><th>Себест. ед.</th><th>Клиенту ед.</th><th>Сумма клиенту</th><th></th></tr></thead>
          <tbody id="calcDraftItems"></tbody>
        </table>
      </div>
      <div id="calcDraftTotals" class="v4-calc-totals"></div>
      <div id="calcDraftGuide"></div>

      <section class="v4-pricing-control" aria-label="Управление ценой расчёта">
        <div>
          <div class="v4-calc-section-heading"><span class="v4-calc-section-number">3</span><div><h4>Цена и прибыль</h4><p>Настройте итог после того, как увидели состав и себестоимость. Ручные цены позиций CRM не перезапишет.</p></div></div>
        </div>
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
        <button id="applyAutomaticCalcPricesBtn" type="button">Применить к автоматическим позициям</button>
        <p>Ручные цены и зафиксированные цены из каталога сохраняются.</p>
        <details class="v4-calc-settings">
          <summary>Дополнительные правила автоматической цены</summary>
          <div class="v4-form-grid">
            <label>Мелкий заказ до, ₽<input id="calcSmallLimit" type="number" value="3000"></label>
            <label>Наценка мелкий, %<input id="calcSmallMarkup" type="number" value="30"></label>
            <label>Средний заказ до, ₽<input id="calcMedLimit" type="number" value="10000"></label>
            <label>Наценка средний, %<input id="calcMedMarkup" type="number" value="20"></label>
            <label>Наценка крупный, %<input id="calcLargeMarkup" type="number" value="10"></label>
            <label>Шаг округления итога, ₽<input id="calcRoundStep" type="number" value="10"></label>
          </div>
        </details>
      </section>

      <div class="v4-form-actions">
        <button id="saveCalculationBtn" type="button" class="v4-primary">Сохранить расчёт</button>
        <button id="clearCalculationBtn" type="button">Очистить</button>
      </div>
    </div>
  `;
}

'''
calc = calc[:form_start] + new_form + calc[form_end:]
calc = replace_once(
    calc,
    '<p>Расчёт теперь адаптируется под позицию. Для баннера достаточно указать размер и опции, дополнительные строки создаются автоматически.</p>',
    '<p>Работайте сверху вниз: выберите, что считаете, добавьте позиции, проверьте состав и настройте цену. Технические данные подрядчиков остаются внутри CRM.</p>',
    'calculation intro'
)
calc = replace_once(
    calc,
    "'<div class=\"v4-empty\">Расчётов пока нет. Начните с типа позиции: например, баннер или плёнка.</div>'",
    "'<div class=\"v4-empty\">Расчётов пока нет. Начните с «Из каталога», «По цене подрядчика» или «Своя позиция».</div>'",
    'empty calculations text'
)
CALC.write_text(calc, encoding='utf-8')

review = REVIEW.read_text(encoding='utf-8')
old_review = """  const category = mode === 'custom' ? fieldValue('calcCustomCategory') : modeLabel;
  const itemType = mode === 'custom'
    ? fieldValue('calcCustomType')
    : mode === 'service' ? 'Услуга' : 'Состав позиции';
  const characteristics = mode === 'custom' ? fieldValue('calcCustomData') : '';"""
new_review = """  const category = mode === 'custom'
    ? fieldValue('calcCustomCategory')
    : mode === 'contractor_quote' ? 'По цене подрядчика' : modeLabel;
  const itemType = mode === 'custom'
    ? fieldValue('calcCustomType')
    : mode === 'service' ? 'Услуга' : mode === 'contractor_quote' ? 'Изготовление' : 'Состав позиции';
  const characteristics = mode === 'custom'
    ? fieldValue('calcCustomData')
    : mode === 'contractor_quote' ? fieldValue('calcContractorClientDescription') : '';"""
review = replace_once(review, old_review, new_review, 'draft review contractor metadata')
REVIEW.write_text(review, encoding='utf-8')

offers = OFFERS.read_text(encoding='utf-8')
old_offer_rows = """    visibleItems.forEach((item) => {
      const qty = Number(item.qty || 0);
      const unit = item.unit || '';
      fullLines.push(`— ${item.name}${qty ? ` — ${qty.toLocaleString('ru-RU')} ${unit}` : ''} — ${money(item.client_sum)}`);
    });"""
new_offer_rows = """    visibleItems.forEach((item) => {
      const qty = Number(item.qty || 0);
      const unit = item.unit || '';
      fullLines.push(`— ${item.name}${qty ? ` — ${qty.toLocaleString('ru-RU')} ${unit}` : ''} — ${money(item.client_sum)}`);
      if (item.description) fullLines.push(`  ${item.description}`);
    });"""
offers = replace_once(offers, old_offer_rows, new_offer_rows, 'offer full description')
OFFERS.write_text(offers, encoding='utf-8')

print_source = PRINT.read_text(encoding='utf-8')
old_print_row = """  return rows.map((item, i) => `<tr><td class=\"num\">${i + 1}</td><td><b>${esc(item.name || 'Позиция')}</b></td><td class=\"num\">${Number(item.qty || 0).toLocaleString('ru-RU')} ${esc(item.unit || 'шт')}</td><td class=\"num\">${money(item.client_sum / (Number(item.qty) || 1))}</td><td class=\"num\"><b>${money(item.client_sum)}</b></td></tr>`).join('');"""
new_print_row = """  return rows.map((item, i) => `<tr><td class=\"num\">${i + 1}</td><td><b>${esc(item.name || 'Позиция')}</b>${item.description ? `<div style=\"margin-top:4px;color:#6b7280;line-height:1.35\">${esc(item.description)}</div>` : ''}</td><td class=\"num\">${Number(item.qty || 0).toLocaleString('ru-RU')} ${esc(item.unit || 'шт')}</td><td class=\"num\">${money(item.client_sum / (Number(item.qty) || 1))}</td><td class=\"num\"><b>${money(item.client_sum)}</b></td></tr>`).join('');"""
print_source = replace_once(print_source, old_print_row, new_print_row, 'print client description')
PRINT.write_text(print_source, encoding='utf-8')

print('Issue #514 calculation UX patch applied')
