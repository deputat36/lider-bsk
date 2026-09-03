#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
CALC = ROOT / 'crm/v4/assets/v4/calculations.js'
SOURCE = ROOT / 'crm/v4/assets/v4/calculation-catalog-source-v1.js'

calc = CALC.read_text(encoding='utf-8')
source = SOURCE.read_text(encoding='utf-8')
errors = []

for marker in [
    'catalogRowToTypicalDraftItem',
    'const LEGACY_CATALOG_ROWS = legacyCatalogFallbackRows(CATALOG)',
    'calculationCatalogRows.find',
    'LEGACY_CATALOG_ROWS.find',
    'calculationCatalogRows.filter',
    'money(item.contractor_price)',
    'function makeCatalogRawItem',
    'makeCatalogRawItem(material',
    'makeCatalogRawItem(hem',
    'makeCatalogRawItem(grommet',
    'makeCatalogRawItem(mount',
    'makeCatalogRawItem(film',
    'makeCatalogRawItem(item',
    'makeCatalogRawItem(lam',
]:
    if marker not in calc:
        errors.append(f'Missing typical catalog UI marker: {marker}')

for mode in [
    "calculationMode: 'banner'",
    "calculationMode: 'banner_hemming'",
    "calculationMode: 'banner_grommets'",
    "calculationMode: 'film'",
    "calculationMode: 'mount_film'",
    "calculationMode: 'sheet'",
    "calculationMode: 'sheet_print'",
    "calculationMode: 'photo'",
    "calculationMode: 'photo_lamination'",
]:
    if mode not in calc:
        errors.append(f'Missing catalog-backed typical mode: {mode}')

for marker in [
    'export function catalogRowToTypicalDraftItem',
    "mode: 'standard'",
    "visibility: options.visibility || 'single_line'",
    "price_source: clientPrice > 0 ? 'manual' : 'auto'",
    'catalog_client_reference_price',
    'catalog_cost_override',
    'catalog_cost_reference_price',
]:
    if marker not in source:
        errors.append(f'Missing typical catalog adapter marker: {marker}')

for forbidden in [
    'return CATALOG.find',
    'return CATALOG.filter',
    'contractorPrice: material.price',
    'contractorPrice: film.price',
    'contractorPrice: item.price',
    'contractorPrice: lam.price',
]:
    if forbidden in calc:
        errors.append(f'Hardcoded catalog remains active in typical calculation path: {forbidden}')

# The literal CATALOG is intentionally retained as local emergency fallback.
if 'const CATALOG = [' not in calc or 'legacyCatalogFallbackRows(CATALOG)' not in calc:
    errors.append('Legacy CATALOG fallback was removed instead of isolated')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('Typical calculation modes use leader_catalog first and legacy CATALOG only as fallback: PASS')
