#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
path = root / 'crm' / 'v4' / 'assets' / 'v4' / 'calculations.js'
patch = root / 'patches' / 'crm-catalog-id-calcitem.patch'

errors = []

if not path.is_file():
    errors.append('Missing calculations.js')
    text = ''
else:
    text = path.read_text(encoding='utf-8')

for marker in (
    'const ITEM_FIELDS',
    'catalog_id',
    'function calcItem(raw, index)',
    'catalog_id: raw.catalog_id || null',
):
    if marker not in text:
        errors.append('Missing marker: ' + marker)

if text.count('catalog_id: raw.catalog_id || null') != 1:
    errors.append('calcItem must contain exactly one catalog_id preservation assignment')

calc_start = text.find('function calcItem(raw, index)')
calc_end = text.find('\n}\n\nfunction itemsWithRoundAdjustment', calc_start)
calc_body = text[calc_start:calc_end] if calc_start >= 0 and calc_end > calc_start else ''
if 'catalog_id: raw.catalog_id || null' not in calc_body:
    errors.append('catalog_id preservation must be inside calcItem')
if calc_body and calc_body.find('catalog_id: raw.catalog_id || null') > calc_body.find("category: raw.category || 'Расчёт по позиции'"):
    errors.append('catalog_id must be preserved before the remaining calculated item fields')

if not patch.is_file():
    errors.append('Missing catalog_id patch evidence file')
else:
    patch_text = patch.read_text(encoding='utf-8')
    if '+    catalog_id: raw.catalog_id || null,' not in patch_text:
        errors.append('Patch evidence no longer matches the strict catalog_id contract')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('calculations.js strictly preserves raw.catalog_id in calcItem.')
