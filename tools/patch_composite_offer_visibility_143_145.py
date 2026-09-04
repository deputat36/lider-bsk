#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CALC_PATH = ROOT / 'crm/v4/assets/v4/calculations.js'
OFFERS_PATH = ROOT / 'crm/v4/assets/v4/offers.js'
calc = CALC_PATH.read_text(encoding='utf-8')
offers = OFFERS_PATH.read_text(encoding='utf-8')


def replace_once(source: str, needle: str, replacement: str, label: str) -> str:
    if replacement in source:
        return source
    count = source.count(needle)
    if count != 1:
        raise SystemExit(f'{label}: expected one marker, got {count}')
    return source.replace(needle, replacement, 1)

calc = replace_once(
    calc,
    "import { contractorQuoteDraftItem } from './calculation-contractor-quote-model-v1.js';",
    "import { contractorQuoteDraftItem } from './calculation-contractor-quote-model-v1.js';\nimport { compositeDraftValidation } from './calculation-composite-model-v1.js';",
    'composite import'
)

calc = replace_once(
    calc,
    "  ['contractor_quote', 'Подрядчик / готовая смета'],\n  ['banner', 'Баннер'],",
    "  ['contractor_quote', 'Подрядчик / готовая смета'],\n  ['composite', 'Составное изделие'],\n  ['banner', 'Баннер'],",
    'composite mode registry'
)

calc = replace_once(
    calc,
    "let saveBusy = false;",
    "let saveBusy = false;\nlet calculationModeError = '';",
    'mode error state'
)

helpers = r'''function renderCompositeComponentRow(index = 0) {
  const numberLabel = Number(index || 0) + 1;
  return `
    <div class="v4-subcard" data-composite-component>
      <div class="v4-subcard-head"><div><b>Компонент ${numberLabel}</b></div><button type="button" data-action="remove-composite-component">Убрать</button></div>
      <div class="v4-form-grid">
        <label>Название<input data-composite-field="title" placeholder="Например: ПВХ 3 мм"></label>
        <label>Количество<input data-composite-field="qty" type="number" min="0.01" step="0.01" value="1"></label>
        <label>Ед.
          <select data-composite-field="unit"><option>шт</option><option>м²</option><option>м</option><option>комплект</option><option>услуга</option></select>
        </label>
        <label>Себестоимость за ед., ₽<input data-composite-field="contractor_price" type="number" min="0" step="0.01" value="0"></label>
        <label>Цена клиенту за ед., ₽<input data-composite-field="client_price" type="number" min="0" step="0.01" value="0"></label>
        <label>Комментарий<input data-composite-field="comment" placeholder="Материал, размер, работа"></label>
      </div>
      <div class="v4-option-row"><label><input data-composite-field="client_visible" type="checkbox" checked> Показывать этот компонент в подробном КП</label></div>
    </div>`;
}

function compositeComponentsFromForm() {
  return [...document.querySelectorAll('#calcCompositeComponents [data-composite-component]')].map((row) => {
    const field = (name) => row.querySelector(`[data-composite-field="${name}"]`);
    return {
      title: field('title')?.value || '',
      qty: parseNum(field('qty')?.value || 1),
      unit: field('unit')?.value || 'шт',
      contractor_price: parseNum(field('contractor_price')?.value || 0),
      client_price: parseNum(field('client_price')?.value || 0),
      client_visible: Boolean(field('client_visible')?.checked),
      comment: field('comment')?.value || ''
    };
  });
}

function compositeInputFromForm() {
  return {
    title: val('calcCompositeTitle'),
    category: 'Составное изделие',
    item_type: 'Изготовление',
    unit: 'комплект',
    visibility: val('calcCompositeVisibility') || 'single_line',
    client_price: num('calcCompositeClient'),
    comment: val('calcCompositeComment'),
    components: compositeComponentsFromForm()
  };
}

function compositeValidationMessage(errors = []) {
  if (errors.includes('composite_title_required')) return 'Укажите название составного изделия';
  if (errors.includes('composite_components_required')) return 'Добавьте хотя бы один компонент';
  if (errors.includes('composite_visible_component_required')) return 'Для подробного КП отметьте хотя бы один клиентский компонент';
  if (errors.includes('composite_visible_component_price_required')) return 'Для видимых компонентов подробного КП укажите цену клиенту';
  return 'Проверьте состав изделия';
}

'''
calc = replace_once(
    calc,
    "function renderModeFields(mode = 'banner') {",
    helpers + "function renderModeFields(mode = 'banner') {",
    'composite UI helpers'
)

composite_ui = r'''  if (mode === 'composite') {
    return `
      <div class="v4-calc-mode-help"><b>Составное изделие:</b> соберите изделие из материалов и работ. В расчёте оно сохраняется одной позицией, а для клиента можно показать одну итоговую строку или только выбранные компоненты.</div>
      <div class="v4-form-grid">
        <label>Название изделия<input id="calcCompositeTitle" placeholder="Например: Световая вывеска 3×1 м"></label>
        <label>Как показать клиенту
          <select id="calcCompositeVisibility"><option value="single_line">Одной строкой</option><option value="detailed">Подробно по компонентам</option></select>
        </label>
        <label>Итог клиенту вручную, ₽<input id="calcCompositeClient" type="number" min="0" step="1" placeholder="Для одной строки; пусто = сумма компонентов / общая наценка"></label>
        <label>Комментарий<input id="calcCompositeComment" placeholder="Что входит в комплект"></label>
      </div>
      <div id="calcCompositeComponents">
        ${renderCompositeComponentRow(0)}
        ${renderCompositeComponentRow(1)}
      </div>
      <div class="v4-form-actions"><button id="calcCompositeAddComponentBtn" type="button">+ Добавить компонент</button></div>
      <div class="v4-calc-mode-help">В режиме «Подробно» цена изделия для расчёта равна сумме только отмеченных клиентских компонентов. Скрытые расходы остаются внутренними.</div>
    `;
  }
'''
calc = replace_once(
    calc,
    "  if (mode === 'banner') {",
    composite_ui + "  if (mode === 'banner') {",
    'composite mode fields'
)

composite_logic = r'''  calculationModeError = '';
  if (mode === 'composite') {
    const prepared = compositeDraftValidation(compositeInputFromForm());
    if (!prepared.ok) {
      calculationModeError = compositeValidationMessage(prepared.errors);
      return [];
    }
    if (prepared.item.data.visibility === 'single_line' && Number(prepared.item.client_price || 0) <= 0) {
      return applyAutoPrice([prepared.item]);
    }
    return [prepared.item];
  }
'''
calc = replace_once(
    calc,
    "  const mode = val('calcSmartMode') || 'banner';\n  const rows = [];\n  if (mode === 'catalog') {",
    "  const mode = val('calcSmartMode') || 'banner';\n  const rows = [];\n" + composite_logic + "  if (mode === 'catalog') {",
    'composite current mode'
)

calc = replace_once(
    calc,
    "    box.innerHTML = '<em>Заполните размеры, количество или стоимость — расчёт появится автоматически.</em>';",
    "    box.innerHTML = `<em>${esc(calculationModeError || 'Заполните размеры, количество или стоимость — расчёт появится автоматически.')}</em>`;",
    'preview validation message'
)

calc = replace_once(
    calc,
    "    toast('Заполните поля расчёта позиции');",
    "    toast(calculationModeError || 'Заполните поля расчёта позиции');",
    'add validation message'
)

composite_clicks = r'''    if (event.target.closest('#calcCompositeAddComponentBtn')) {
      const container = byId('calcCompositeComponents');
      const index = container?.querySelectorAll('[data-composite-component]').length || 0;
      container?.insertAdjacentHTML('beforeend', renderCompositeComponentRow(index));
      renderSmartPreview();
      return;
    }
    const removeComposite = event.target.closest('button[data-action="remove-composite-component"]');
    if (removeComposite) {
      const container = byId('calcCompositeComponents');
      const components = container?.querySelectorAll('[data-composite-component]') || [];
      if (components.length <= 1) {
        toast('В составном изделии нужен хотя бы один компонент');
        return;
      }
      removeComposite.closest('[data-composite-component]')?.remove();
      renderSmartPreview();
      return;
    }
'''
calc = replace_once(
    calc,
    "    if (event.target.closest('#calcCreateCatalogItemBtn')) {",
    composite_clicks + "    if (event.target.closest('#calcCreateCatalogItemBtn')) {",
    'composite component click handlers'
)

calc = replace_once(
    calc,
    "      if (draftItems[index] && ['qty', 'contractor_price', 'client_price'].includes(field)) {\n        draftItems[index][field] = Math.max(0, parseNum(rowInput.value));",
    "      if (draftItems[index] && ['qty', 'contractor_price', 'client_price'].includes(field)) {\n        if (field === 'client_price' && draftItems[index].data?.mode === 'composite' && draftItems[index].data?.visibility === 'detailed') {\n          toast('Для подробного составного изделия цена задаётся компонентами. Удалите позицию и добавьте её заново после правки состава.');\n          renderDraftItems();\n          return;\n        }\n        draftItems[index][field] = Math.max(0, parseNum(rowInput.value));",
    'protect detailed composite parent price'
)

for marker in [
    "from './calculation-composite-model-v1.js'",
    "['composite', 'Составное изделие']",
    "mode === 'composite'",
    'calcCompositeVisibility',
    'data-composite-component',
    'compositeDraftValidation(',
    'remove-composite-component',
]:
    if marker not in calc:
        raise SystemExit(f'Patched calculations.js missing marker: {marker}')

# offers.js: activate the already-designed visibility contract.
offers = replace_once(
    offers,
    "import { invokeStagingWorkflow, isStagingWorkflowEnvironment } from './workflow-staging-transport-v1.js';",
    "import { invokeStagingWorkflow, isStagingWorkflowEnvironment } from './workflow-staging-transport-v1.js';\nimport { offerVisibilityVersion, publicOfferRows, shortOfferItemNames } from './offer-visibility-v1.js';",
    'offer visibility import'
)

offers = replace_once(
    offers,
    "function publicItems(items) {\n  return (items || []).filter((item) => Number(item.client_sum || 0) > 0);\n}",
    "function publicItems(items) {\n  return publicOfferRows(items);\n}",
    'public offer rows wrapper'
)

offers = replace_once(
    offers,
    "  const visibleItems = publicItems(items);\n  const shortLines = [",
    "  const visibleItems = publicItems(items);\n  const shortNames = shortOfferItemNames(items, 8);\n  const shortLines = [",
    'short offer names'
)

offers = replace_once(
    offers,
    "  if (visibleItems.length) {\n    shortLines.push('', 'В стоимость входит:');\n    visibleItems.slice(0, 8).forEach((item) => shortLines.push(`— ${item.name}`));\n  }",
    "  if (shortNames.length) {\n    shortLines.push('', 'В стоимость входит:');\n    shortNames.forEach((name) => shortLines.push(`— ${name}`));\n  }",
    'short offer visibility list'
)

offers = replace_once(
    offers,
    "<p class=\"v4-muted\">В клиентском тексте не показываются себестоимость, прибыль, маржа и цены подрядчиков.</p>",
    "<p class=\"v4-muted\">В клиентском тексте не показываются себестоимость, прибыль, маржа и цены подрядчиков. Правила отображения: ${esc(offerVisibilityVersion())}.</p>",
    'offer visibility version in UI'
)

for marker in [
    "from './offer-visibility-v1.js'",
    'return publicOfferRows(items);',
    'shortOfferItemNames(items, 8)',
    'offerVisibilityVersion()',
]:
    if marker not in offers:
        raise SystemExit(f'Patched offers.js missing marker: {marker}')

CALC_PATH.write_text(calc, encoding='utf-8')
OFFERS_PATH.write_text(offers, encoding='utf-8')
print('Composite calculation mode and commercial-offer visibility integrated')
