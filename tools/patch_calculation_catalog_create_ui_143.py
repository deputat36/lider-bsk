#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / 'crm/v4/assets/v4/calculations.js'
text = PATH.read_text(encoding='utf-8')


def replace_once(needle: str, replacement: str, label: str):
    global text
    if replacement in text:
        return
    count = text.count(needle)
    if count != 1:
        raise SystemExit(f'{label}: expected one marker, got {count}')
    text = text.replace(needle, replacement, 1)

replace_once(
    "import { catalogRowToDraftItem, catalogRowToTypicalDraftItem, legacyCatalogFallbackRows, loadCalculationCatalog } from './calculation-catalog-source-v1.js';\nimport { contractorQuoteDraftItem } from './calculation-contractor-quote-model-v1.js';",
    "import { catalogRowToDraftItem, catalogRowToTypicalDraftItem, legacyCatalogFallbackRows, loadCalculationCatalog } from './calculation-catalog-source-v1.js';\nimport { createCalculationCatalogItem } from './calculation-catalog-create-v1.js';\nimport { canPerformV4Action, CRM_V4_ACTIONS } from './action-permissions-v1.js';\nimport { contractorQuoteDraftItem } from './calculation-contractor-quote-model-v1.js';",
    'catalog create imports'
)

replace_once(
    "function catalogSourceLabel() {\n  return calculationCatalogSource === 'remote' ? 'Каталог CRM' : 'Встроенный резервный каталог';\n}\n\nfunction makeCatalogRawItem(row, options = {}) {",
    "function catalogSourceLabel() {\n  return calculationCatalogSource === 'remote' ? 'Каталог CRM' : 'Встроенный резервный каталог';\n}\n\nfunction canManageCalculationCatalog() {\n  return !isStagingWorkflowEnvironment(V4_CONFIG.supabaseUrl)\n    && canPerformV4Action(CRM_V4_ACTIONS.CATALOG_MANAGE);\n}\n\nfunction renderCatalogCreatePanel() {\n  if (isStagingWorkflowEnvironment(V4_CONFIG.supabaseUrl)) {\n    return '<div class=\"v4-calc-mode-help\">Добавление новой номенклатуры отключено в staging. Для проверки расчёта используйте резервный каталог или ручную позицию.</div>';\n  }\n  if (!canManageCalculationCatalog()) {\n    return '<div class=\"v4-calc-mode-help\">Новой номенклатурой управляет руководитель. Разовую работу можно добавить режимом «Ручная позиция».</div>';\n  }\n  return `\n    <details class=\"v4-calc-settings\">\n      <summary>+ Новая позиция каталога</summary>\n      <div class=\"v4-calc-mode-help\">Добавьте повторно используемую услугу или материал. После сохранения позиция сразу будет выбрана в этом расчёте.</div>\n      <div class=\"v4-form-grid\">\n        <label>Категория<input id=\"calcCatalogCreateCategory\" placeholder=\"Например: Наружная реклама\"></label>\n        <label>Название<input id=\"calcCatalogCreateName\" placeholder=\"Например: Табличка ПВХ 3 мм\"></label>\n        <label>Ед. измерения\n          <select id=\"calcCatalogCreateUnit\"><option>шт</option><option>м²</option><option>м</option><option>комплект</option><option>услуга</option><option>100 шт</option></select>\n        </label>\n        <label>Тип\n          <select id=\"calcCatalogCreateType\"><option>Изготовление</option><option>Материал</option><option>Услуга</option><option>Дизайн</option><option>Монтаж</option></select>\n        </label>\n        <label>Себестоимость за ед., ₽<input id=\"calcCatalogCreateCost\" type=\"number\" min=\"0\" step=\"0.01\" value=\"0\"></label>\n        <label>Наценка по умолчанию, %<input id=\"calcCatalogCreateMarkup\" type=\"number\" min=\"0\" step=\"0.1\" value=\"30\"></label>\n        <label>Минимальная цена клиенту, ₽<input id=\"calcCatalogCreateMin\" type=\"number\" min=\"0\" step=\"0.01\" value=\"0\"></label>\n        <label>Фиксированная цена клиенту, ₽<input id=\"calcCatalogCreateClient\" type=\"number\" min=\"0\" step=\"0.01\" placeholder=\"Пусто = по наценке\"></label>\n        <label>Описание<input id=\"calcCatalogCreateDescription\" placeholder=\"Что входит в позицию\"></label>\n      </div>\n      <div class=\"v4-form-actions\">\n        <button id=\"calcCreateCatalogItemBtn\" type=\"button\">Добавить в каталог</button>\n      </div>\n    </details>`;\n}\n\nfunction catalogCreateInputFromForm() {\n  return {\n    category: val('calcCatalogCreateCategory'),\n    name: val('calcCatalogCreateName'),\n    unit: val('calcCatalogCreateUnit') || 'шт',\n    item_type: val('calcCatalogCreateType') || 'Изготовление',\n    contractor_price: num('calcCatalogCreateCost'),\n    markup_percent: num('calcCatalogCreateMarkup'),\n    min_client_price: num('calcCatalogCreateMin'),\n    default_client_price: num('calcCatalogCreateClient'),\n    description: val('calcCatalogCreateDescription')\n  };\n}\n\nasync function createCatalogItemFromCalculation() {\n  if (!canManageCalculationCatalog()) {\n    toast('Добавлять номенклатуру могут только администратор или владелец');\n    return;\n  }\n  const button = byId('calcCreateCatalogItemBtn');\n  if (button) button.disabled = true;\n  try {\n    setStatus('Добавляю позицию в каталог...', 'warn');\n    const result = await timeout(createCalculationCatalogItem({\n      supabaseClient,\n      input: catalogCreateInputFromForm(),\n      allowWrite: canManageCalculationCatalog()\n    }), 10000, 'Каталог не ответил за 10 секунд');\n    if (!result.ok || !result.row) {\n      const message = result.error?.message || 'Не удалось добавить позицию в каталог.';\n      toast(message);\n      setStatus(message, 'error');\n      return;\n    }\n    const row = result.row;\n    calculationCatalogRows = [...calculationCatalogRows.filter((item) => item.id !== row.id && item.name !== row.name), row]\n      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || String(a.category || '').localeCompare(String(b.category || ''), 'ru') || String(a.name || '').localeCompare(String(b.name || ''), 'ru'));\n    calculationCatalogSource = 'remote';\n    setCalcMode('catalog');\n    const select = byId('calcCatalogBackedItem');\n    if (select) select.value = row.id || row.name;\n    renderSmartPreview();\n    toast('Позиция добавлена в каталог и выбрана в расчёте');\n    setStatus('Новая позиция каталога готова к расчёту.', 'good');\n  } catch (error) {\n    const message = friendlyError(error);\n    toast(message);\n    setStatus(`Ошибка каталога: ${message}`, 'error');\n  } finally {\n    const currentButton = byId('calcCreateCatalogItemBtn');\n    if (currentButton) currentButton.disabled = false;\n  }\n}\n\nfunction makeCatalogRawItem(row, options = {}) {",
    'catalog create helpers'
)

replace_once(
    "      <div class=\"v4-form-grid\">\n        <label>Позиция\n          <select id=\"calcCatalogBackedItem\">${catalogBackedOptions()}</select>\n        </label>\n        <label>Количество\n          <input id=\"calcCatalogBackedQty\" type=\"number\" min=\"0.01\" step=\"0.01\" value=\"1\">\n        </label>\n      </div>\n    `;",
    "      <div class=\"v4-form-grid\">\n        <label>Позиция\n          <select id=\"calcCatalogBackedItem\">${catalogBackedOptions()}</select>\n        </label>\n        <label>Количество\n          <input id=\"calcCatalogBackedQty\" type=\"number\" min=\"0.01\" step=\"0.01\" value=\"1\">\n        </label>\n      </div>\n      ${renderCatalogCreatePanel()}\n    `;",
    'catalog mode create panel'
)

replace_once(
    "    if (event.target.closest('#addSmartCalcItemBtn')) addSmartItems();",
    "    if (event.target.closest('#calcCreateCatalogItemBtn')) {\n      createCatalogItemFromCalculation();\n      return;\n    }\n    if (event.target.closest('#addSmartCalcItemBtn')) addSmartItems();",
    'catalog create click handler'
)

required = [
    "from './calculation-catalog-create-v1.js'",
    "from './action-permissions-v1.js'",
    'CRM_V4_ACTIONS.CATALOG_MANAGE',
    '!isStagingWorkflowEnvironment(V4_CONFIG.supabaseUrl)',
    'renderCatalogCreatePanel()',
    'calcCreateCatalogItemBtn',
    'createCatalogItemFromCalculation',
    'createCalculationCatalogItem({',
    "setCalcMode('catalog')",
]
for marker in required:
    if marker not in text:
        raise SystemExit(f'Patched calculations.js missing marker: {marker}')

PATH.write_text(text, encoding='utf-8')
print('Catalog create UI integrated into unified calculation workspace')
