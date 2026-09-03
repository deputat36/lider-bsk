#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / 'crm/v4/assets/v4/calculations.js'
text = PATH.read_text(encoding='utf-8')


def replace_once(needle: str, replacement: str, label: str):
    global text
    if replacement in text:
        return
    if needle not in text:
        raise SystemExit(f'Missing patch marker: {label}')
    text = text.replace(needle, replacement, 1)

replace_once(
    "import { catalogRowToDraftItem, legacyCatalogFallbackRows, loadCalculationCatalog } from './calculation-catalog-source-v1.js';",
    "import { catalogRowToDraftItem, catalogRowToTypicalDraftItem, legacyCatalogFallbackRows, loadCalculationCatalog } from './calculation-catalog-source-v1.js';",
    'typical catalog adapter import'
)

replace_once(
    "let calculationCatalogRows = legacyCatalogFallbackRows(CATALOG);",
    "const LEGACY_CATALOG_ROWS = legacyCatalogFallbackRows(CATALOG);\nlet calculationCatalogRows = LEGACY_CATALOG_ROWS;",
    'stable legacy fallback rows'
)

replace_once(
    "function catalogByName(name) {\n  return CATALOG.find((item) => item.name === name) || null;\n}\n\nfunction catalogOptions(filter, selected = '') {\n  return CATALOG.filter(filter).map((item) => `<option value=\"${esc(item.name)}\" ${item.name === selected ? 'selected' : ''}>${esc(item.name)} · ${money(item.price)} / ${esc(item.unit)}</option>`).join('');\n}",
    "function catalogByName(name) {\n  return calculationCatalogRows.find((item) => item.name === name)\n    || LEGACY_CATALOG_ROWS.find((item) => item.name === name)\n    || null;\n}\n\nfunction catalogOptions(filter, selected = '') {\n  return calculationCatalogRows.filter(filter).map((item) => `<option value=\"${esc(item.name)}\" ${item.name === selected ? 'selected' : ''}>${esc(item.name)} · ${money(item.contractor_price)} / ${esc(item.unit)}</option>`).join('');\n}",
    'catalog lookup and options use loaded rows'
)

replace_once(
    "function catalogSourceLabel() {\n  return calculationCatalogSource === 'remote' ? 'Каталог CRM' : 'Встроенный резервный каталог';\n}\n",
    "function catalogSourceLabel() {\n  return calculationCatalogSource === 'remote' ? 'Каталог CRM' : 'Встроенный резервный каталог';\n}\n\nfunction makeCatalogRawItem(row, options = {}) {\n  if (!row) return null;\n  return catalogRowToTypicalDraftItem(row, {\n    ...options,\n    catalogSource: row.settings?.legacy_fallback ? 'fallback' : calculationCatalogSource\n  });\n}\n",
    'catalog-backed standard item helper'
)

replace_once(
    "    rows.push(makeRawItem({\n      category: material.category,\n      itemType: 'Баннер',\n      name: `${material.name} · ${num('calcWidth')}×${num('calcHeight')} м · ${num('calcQty') || 1} шт`,\n      unit: material.unit,\n      qty: units,\n      contractorPrice: material.price,\n      comment: `Площадь: ${units.toFixed(2)} м²`,\n      data: { calculation_mode: 'banner', width: num('calcWidth'), height: num('calcHeight'), pieces: num('calcQty') || 1 }\n    }));",
    "    rows.push(makeCatalogRawItem(material, {\n      itemType: 'Баннер',\n      name: `${material.name} · ${num('calcWidth')}×${num('calcHeight')} м · ${num('calcQty') || 1} шт`,\n      qty: units,\n      comment: `Площадь: ${units.toFixed(2)} м²`,\n      calculationMode: 'banner',\n      data: { width: num('calcWidth'), height: num('calcHeight'), pieces: num('calcQty') || 1 }\n    }));",
    'banner material catalog item'
)

replace_once(
    "      rows.push(makeRawItem({ category: hem.category, itemType: 'Доп. услуга', name: 'Проклейка баннера по периметру', unit: hem.unit, qty: per, contractorPrice: num('calcHemmingCost'), comment: `Периметр всего: ${per.toFixed(2)} м`, data: { calculation_mode: 'banner_hemming' } }));",
    "      rows.push(makeCatalogRawItem(hem, { itemType: 'Доп. услуга', name: 'Проклейка баннера по периметру', qty: per, contractorPrice: num('calcHemmingCost'), comment: `Периметр всего: ${per.toFixed(2)} м`, calculationMode: 'banner_hemming' }));",
    'banner hemming catalog item'
)

replace_once(
    "      rows.push(makeRawItem({ category: grommet.category, itemType: 'Доп. услуга', name: `Люверсы по периметру, шаг ${step} м`, unit: grommet.unit, qty: count, contractorPrice: num('calcGrommetCost'), comment: `Расчёт: ${per.toFixed(2)} м / ${step} м = ${count} шт`, data: { calculation_mode: 'banner_grommets', step } }));",
    "      rows.push(makeCatalogRawItem(grommet, { itemType: 'Доп. услуга', name: `Люверсы по периметру, шаг ${step} м`, qty: count, contractorPrice: num('calcGrommetCost'), comment: `Расчёт: ${per.toFixed(2)} м / ${step} м = ${count} шт`, calculationMode: 'banner_grommets', data: { step } }));",
    'banner grommets catalog item'
)

replace_once(
    "    rows.push(makeRawItem({ category: material.category, itemType: 'Плёнка', name: `${material.name} · ${num('calcWidth')}×${num('calcHeight')} м · ${num('calcQty') || 1} шт`, unit: material.unit, qty: units, contractorPrice: material.price, comment: `Площадь: ${units.toFixed(2)} м²`, data: { calculation_mode: 'film', width: num('calcWidth'), height: num('calcHeight'), pieces: num('calcQty') || 1 } }));",
    "    rows.push(makeCatalogRawItem(material, { itemType: 'Плёнка', name: `${material.name} · ${num('calcWidth')}×${num('calcHeight')} м · ${num('calcQty') || 1} шт`, qty: units, comment: `Площадь: ${units.toFixed(2)} м²`, calculationMode: 'film', data: { width: num('calcWidth'), height: num('calcHeight'), pieces: num('calcQty') || 1 } }));",
    'film material catalog item'
)

replace_once(
    "      rows.push(makeRawItem({ category: mount.category, itemType: 'Доп. материал', name: 'Монтажная плёнка', unit: mount.unit, qty: units, contractorPrice: num('calcMountFilmCost'), comment: `Площадь: ${units.toFixed(2)} м²`, data: { calculation_mode: 'mount_film' } }));",
    "      rows.push(makeCatalogRawItem(mount, { itemType: 'Доп. материал', name: 'Монтажная плёнка', qty: units, contractorPrice: num('calcMountFilmCost'), comment: `Площадь: ${units.toFixed(2)} м²`, calculationMode: 'mount_film' }));",
    'mount film catalog item'
)

replace_once(
    "    rows.push(makeRawItem({ category: material.category, itemType: 'Листовой материал', name: `${material.name} · ${num('calcWidth')}×${num('calcHeight')} м · ${num('calcQty') || 1} шт`, unit: material.unit, qty: units, contractorPrice: material.price, comment: `Площадь: ${units.toFixed(2)} м²`, data: { calculation_mode: 'sheet', width: num('calcWidth'), height: num('calcHeight'), pieces: num('calcQty') || 1 } }));",
    "    rows.push(makeCatalogRawItem(material, { itemType: 'Листовой материал', name: `${material.name} · ${num('calcWidth')}×${num('calcHeight')} м · ${num('calcQty') || 1} шт`, qty: units, comment: `Площадь: ${units.toFixed(2)} м²`, calculationMode: 'sheet', data: { width: num('calcWidth'), height: num('calcHeight'), pieces: num('calcQty') || 1 } }));",
    'sheet material catalog item'
)

replace_once(
    "      rows.push(makeRawItem({ category: film.category, itemType: 'Печать', name: `Печать: ${film.name}`, unit: 'м²', qty: units, contractorPrice: film.price, comment: `Площадь: ${units.toFixed(2)} м²`, data: { calculation_mode: 'sheet_print' } }));",
    "      rows.push(makeCatalogRawItem(film, { itemType: 'Печать', name: `Печать: ${film.name}`, unit: 'м²', qty: units, comment: `Площадь: ${units.toFixed(2)} м²`, calculationMode: 'sheet_print' }));",
    'sheet print catalog item'
)

replace_once(
    "    rows.push(makeRawItem({ category: item.category, itemType: 'Фото', name: item.name, unit: item.unit, qty, contractorPrice: item.price, comment: `${qty} шт`, data: { calculation_mode: 'photo' } }));",
    "    rows.push(makeCatalogRawItem(item, { itemType: 'Фото', name: item.name, qty, comment: `${qty} шт`, calculationMode: 'photo' }));",
    'photo catalog item'
)

replace_once(
    "      rows.push(makeRawItem({ category: lam.category, itemType: 'Доп. услуга', name: lam.name, unit: lam.unit, qty, contractorPrice: lam.price, comment: `${qty} шт`, data: { calculation_mode: 'photo_lamination' } }));",
    "      rows.push(makeCatalogRawItem(lam, { itemType: 'Доп. услуга', name: lam.name, qty, comment: `${qty} шт`, calculationMode: 'photo_lamination' }));",
    'photo lamination catalog item'
)

required = [
    'catalogRowToTypicalDraftItem',
    'const LEGACY_CATALOG_ROWS',
    'calculationCatalogRows.find',
    'calculationCatalogRows.filter',
    'makeCatalogRawItem(material',
    "calculationMode: 'banner'",
    "calculationMode: 'film'",
    "calculationMode: 'sheet'",
    "calculationMode: 'photo'",
]
for marker in required:
    if marker not in text:
        raise SystemExit(f'Patched calculations.js missing marker: {marker}')

# Hardcoded CATALOG remains only as fallback; active lookup/options must no longer read it directly.
if "return CATALOG.find" in text or "return CATALOG.filter" in text:
    raise SystemExit('Active catalog helpers still read hardcoded CATALOG directly')

PATH.write_text(text, encoding='utf-8')
print('Typical calculation modes now use loaded leader_catalog with legacy fallback')
