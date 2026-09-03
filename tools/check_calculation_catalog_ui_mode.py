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
    "from './calculation-catalog-source-v1.js'",
    "['catalog', 'Из каталога']",
    'calcCatalogBackedItem',
    'calcCatalogBackedQty',
    'catalogRowToDraftItem(row,',
    'catalog_source: calculationCatalogSource',
    'ensureCalculationCatalog();',
    "isStagingWorkflowEnvironment(V4_CONFIG.supabaseUrl) ? null : supabaseClient",
    "catalog_id: raw.catalog_id || null",
]:
    if marker not in calc:
        errors.append(f'Missing calculation catalog UI marker: {marker}')

for marker in [
    ".from('leader_catalog')",
    ".eq('is_active', true)",
    "source: 'remote'",
    "source: 'fallback'",
    'legacyCatalogFallbackRows',
    'catalogRowToDraftItem',
]:
    if marker not in source:
        errors.append(f'Missing catalog source marker: {marker}')

# The UI must use the isolated source layer. A direct table read in calculations.js
# would bypass the staging no-network guard and duplicate the catalog contract.
if ".from('leader_catalog')" in calc:
    errors.append('calculations.js must not read leader_catalog directly')

# Exact staging deliberately has no leader_catalog table. The source must receive a
# null client there, so the fallback is local and the authenticated E2E gains no 4xx.
unsafe = 'loadCalculationCatalog({ supabaseClient, fallbackRows: CATALOG })'
if unsafe in calc:
    errors.append('Staging-unsafe direct catalog load remains in calculations.js')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('Calculation catalog UI mode contract: PASS')
