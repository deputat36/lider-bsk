#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CALC = ROOT / 'crm/v4/assets/v4/calculations.js'
LOADER = ROOT / 'crm/v4/assets/v4/crm-v4-tab-loader-v1.js'
INDEX = ROOT / 'crm/v4/index.html'


def replace_once(text, needle, replacement, label):
    if replacement in text:
        return text
    if needle not in text:
        raise SystemExit(f'Missing patch marker: {label}')
    return text.replace(needle, replacement, 1)

calc = CALC.read_text(encoding='utf-8')
calc = replace_once(
    calc,
    "import { catalogRowToDraftItem, legacyCatalogFallbackRows, loadCalculationCatalog } from './calculation-catalog-source-v1.js';",
    "import { catalogRowToDraftItem, legacyCatalogFallbackRows, loadCalculationCatalog } from './calculation-catalog-source-v1.js';\nimport { contractorQuoteDraftItem } from './calculation-contractor-quote-model-v1.js';",
    'contractor model import'
)
calc = replace_once(
    calc,
    "  ['catalog', 'Из каталога'],\n  ['banner', 'Баннер'],",
    "  ['catalog', 'Из каталога'],\n  ['contractor_quote', 'Подрядчик / готовая смета'],\n  ['banner', 'Баннер'],",
    'contractor mode'
)
calc = replace_once(
    calc,
    "  if (mode === 'banner') {\n    return `",
    "  if (mode === 'contractor_quote') {\n    return `\n      <div class=\"v4-calc-mode-help\"><b>Готовая смета подрядчика:</b> внесите внутренние затраты. Общая наценка задаётся выше — отдельного второго калькулятора больше нет. Клиент увидит одну итоговую строку, внутренние расходы останутся в snapshot расчёта.</div>\n      <div class=\"v4-form-grid\">\n        <label>Подрядчик<input id=\"calcContractorVendor\" placeholder=\"Кто изготовит / выполнил расчёт\"></label>\n        <label>Цена подрядчика, ₽<input id=\"calcContractorBase\" type=\"number\" min=\"0\" step=\"1\" value=\"0\"></label>\n        <label>Доставка, ₽<input id=\"calcContractorDelivery\" type=\"number\" min=\"0\" step=\"1\" value=\"0\"></label>\n        <label>Монтаж, ₽<input id=\"calcContractorInstallation\" type=\"number\" min=\"0\" step=\"1\" value=\"0\"></label>\n        <label>Дизайн, ₽<input id=\"calcContractorDesign\" type=\"number\" min=\"0\" step=\"1\" value=\"0\"></label>\n        <label>Прочие расходы, ₽<input id=\"calcContractorOther\" type=\"number\" min=\"0\" step=\"1\" value=\"0\"></label>\n        <label>Итог клиенту вручную, ₽<input id=\"calcContractorClient\" type=\"number\" min=\"0\" step=\"1\" placeholder=\"Пусто = по общей наценке\"></label>\n        <label>Комментарий к позиции<input id=\"calcContractorComment\" placeholder=\"Что входит в готовую стоимость\"></label>\n      </div>\n    `;\n  }\n  if (mode === 'banner') {\n    return `",
    'contractor fields'
)
calc = replace_once(
    calc,
    "  if (mode === 'banner') {\n    const material = catalogByName(val('calcCatalogItem'))",
    "  if (mode === 'contractor_quote') {\n    const item = contractorQuoteDraftItem({\n      title: val('calcTitle') || 'Подрядный заказ',\n      vendor: val('calcContractorVendor'),\n      base: num('calcContractorBase'),\n      delivery: num('calcContractorDelivery'),\n      installation: num('calcContractorInstallation'),\n      design: num('calcContractorDesign'),\n      other: num('calcContractorOther'),\n      clientPrice: num('calcContractorClient'),\n      comment: val('calcContractorComment')\n    });\n    if (item.contractor_price <= 0) return [];\n    return applyAutoPrice([item]);\n  }\n  if (mode === 'banner') {\n    const material = catalogByName(val('calcCatalogItem'))",
    'contractor draft item'
)
CALC.write_text(calc, encoding='utf-8')

loader = LOADER.read_text(encoding='utf-8')
loader = replace_once(
    loader,
    "      import('./calculation-draft-review-v1.js?v=20260805-tab-loader-1'),\n      import('./calculation-contractor-quote-v1.js?v=20260805-tab-loader-1'),\n      import('./offers.js?v=20260805-tab-loader-1'),",
    "      import('./calculation-draft-review-v1.js?v=20260805-tab-loader-1'),\n      import('./offers.js?v=20260805-tab-loader-1'),",
    'remove legacy contractor shell import'
)
loader = replace_once(
    loader,
    "      modules[6].bootCalculationDraftReview?.();\n      modules[8].bootOffers?.();\n      modules[9].bootOrders?.();",
    "      modules[6].bootCalculationDraftReview?.();\n      modules[7].bootOffers?.();\n      modules[8].bootOrders?.();",
    'shift lead card module indexes'
)
LOADER.write_text(loader, encoding='utf-8')

index = INDEX.read_text(encoding='utf-8')
legacy_map = '    "./assets/v4/calculation-contractor-quote-v1.js?v=20260701-shell-1": "./assets/v4/calculation-contractor-quote-v1.js?v=20260805-tab-loader-1",\n'
if legacy_map in index:
    index = index.replace(legacy_map, '', 1)
INDEX.write_text(index, encoding='utf-8')

required = [
    "['contractor_quote', 'Подрядчик / готовая смета']",
    'calcContractorVendor',
    'calcContractorBase',
    'calcContractorClient',
    "mode: 'contractor_quote'",
    'contractorQuoteDraftItem',
    "modules[7].bootOffers?.()",
    "modules[8].bootOrders?.()"
]
combined = CALC.read_text(encoding='utf-8') + LOADER.read_text(encoding='utf-8')
for marker in required:
    if marker not in combined:
        raise SystemExit(f'Missing required marker after patch: {marker}')
if 'calculation-contractor-quote-v1.js?v=20260805-tab-loader-1' in LOADER.read_text(encoding='utf-8'):
    raise SystemExit('Legacy contractor shell still loaded')

print('Unified contractor quote patch applied')
