#!/usr/bin/env python3
from pathlib import Path
import sys

path = Path(__file__).resolve().parents[1] / 'crm' / 'v4' / 'assets' / 'v4' / 'calculations.js'
text = path.read_text(encoding='utf-8')
original = text


def replace_once(needle: str, replacement: str, label: str):
    global text
    if replacement in text:
        return
    if needle not in text:
        raise SystemExit(f'Missing patch marker: {label}')
    text = text.replace(needle, replacement, 1)


replace_once(
    "import { isStagingWorkflowEnvironment } from './workflow-staging-transport-v1.js';",
    "import { isStagingWorkflowEnvironment } from './workflow-staging-transport-v1.js';\nimport { catalogRowToDraftItem, legacyCatalogFallbackRows, loadCalculationCatalog } from './calculation-catalog-source-v1.js';",
    'catalog source import'
)

replace_once(
    "];\n\nconst MODES = [\n  ['banner', 'Баннер'],",
    "];\n\nlet calculationCatalogRows = legacyCatalogFallbackRows(CATALOG);\nlet calculationCatalogSource = 'fallback';\nlet calculationCatalogLoadPromise = null;\n\nconst MODES = [\n  ['catalog', 'Из каталога'],\n  ['banner', 'Баннер'],",
    'catalog state and mode'
)

replace_once(
    "function catalogOptions(filter, selected = '') {\n  return CATALOG.filter(filter).map((item) => `<option value=\"${esc(item.name)}\" ${item.name === selected ? 'selected' : ''}>${esc(item.name)} · ${money(item.price)} / ${esc(item.unit)}</option>`).join('');\n}\n",
    "function catalogOptions(filter, selected = '') {\n  return CATALOG.filter(filter).map((item) => `<option value=\"${esc(item.name)}\" ${item.name === selected ? 'selected' : ''}>${esc(item.name)} · ${money(item.price)} / ${esc(item.unit)}</option>`).join('');\n}\n\nfunction catalogBackedOptions(selected = '') {\n  return calculationCatalogRows.map((row) => `<option value=\"${esc(row.id || row.name)}\" ${(row.id || row.name) === selected ? 'selected' : ''}>${esc(row.category)} · ${esc(row.name)} · ${esc(row.unit)}</option>`).join('');\n}\n\nfunction catalogBackedRow(value) {\n  return calculationCatalogRows.find((row) => (row.id || row.name) === value) || calculationCatalogRows[0] || null;\n}\n\nfunction catalogSourceLabel() {\n  return calculationCatalogSource === 'remote' ? 'Каталог CRM' : 'Встроенный резервный каталог';\n}\n\nasync function ensureCalculationCatalog() {\n  if (calculationCatalogLoadPromise) return calculationCatalogLoadPromise;\n  calculationCatalogLoadPromise = loadCalculationCatalog({ supabaseClient, fallbackRows: CATALOG }).then((result) => {\n    calculationCatalogRows = result.rows;\n    calculationCatalogSource = result.source;\n    if (val('calcSmartMode') === 'catalog') setCalcMode('catalog');\n    return result;\n  });\n  return calculationCatalogLoadPromise;\n}\n",
    'catalog helpers'
)

replace_once(
    "function renderModeFields(mode = 'banner') {\n  if (mode === 'banner') {",
    "function renderModeFields(mode = 'banner') {\n  if (mode === 'catalog') {\n    return `\n      <div class=\"v4-calc-mode-help\"><b>Позиция из справочника:</b> выберите готовую услугу или материал. Цена и правила берутся из ${esc(catalogSourceLabel())}; в сохранённом расчёте фиксируется snapshot.</div>\n      <div class=\"v4-form-grid\">\n        <label>Позиция\n          <select id=\"calcCatalogBackedItem\">${catalogBackedOptions()}</select>\n        </label>\n        <label>Количество\n          <input id=\"calcCatalogBackedQty\" type=\"number\" min=\"0.01\" step=\"0.01\" value=\"1\">\n        </label>\n      </div>\n    `;\n  }\n  if (mode === 'banner') {",
    'catalog mode form'
)

replace_once(
    "function currentModeItems() {\n  const mode = val('calcSmartMode') || 'banner';\n  const rows = [];\n  if (mode === 'banner') {",
    "function currentModeItems() {\n  const mode = val('calcSmartMode') || 'banner';\n  const rows = [];\n  if (mode === 'catalog') {\n    const row = catalogBackedRow(val('calcCatalogBackedItem'));\n    if (!row) return [];\n    return [catalogRowToDraftItem(row, num('calcCatalogBackedQty') || 1, { catalog_source: calculationCatalogSource })];\n  }\n  if (mode === 'banner') {",
    'catalog mode draft item'
)

replace_once(
    "export function bootCalculations() {\n  if (window.LeaderV4CalculationsBooted) return;\n  window.LeaderV4CalculationsBooted = true;\n  bindCalculationEvents();",
    "export function bootCalculations() {\n  if (window.LeaderV4CalculationsBooted) return;\n  window.LeaderV4CalculationsBooted = true;\n  ensureCalculationCatalog();\n  bindCalculationEvents();",
    'catalog load on boot'
)

required = [
    "['catalog', 'Из каталога']",
    'calcCatalogBackedItem',
    'calcCatalogBackedQty',
    'catalogRowToDraftItem',
    'loadCalculationCatalog',
    'catalog_source: calculationCatalogSource',
    'ensureCalculationCatalog();'
]
for marker in required:
    if marker not in text:
        raise SystemExit(f'Patched file missing marker: {marker}')

if text == original:
    print('calculations.js catalog mode already wired')
    sys.exit(0)

path.write_text(text, encoding='utf-8')
print('calculations.js catalog mode wired')
