#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
CALC = ROOT / 'crm/v4/assets/v4/calculations.js'
CREATE = ROOT / 'crm/v4/assets/v4/calculation-catalog-create-v1.js'

calc = CALC.read_text(encoding='utf-8')
create = CREATE.read_text(encoding='utf-8')
errors = []

for marker in [
    "from './calculation-catalog-create-v1.js'",
    "from './action-permissions-v1.js'",
    'CRM_V4_ACTIONS.CATALOG_MANAGE',
    'canManageCalculationCatalog()',
    'calcCreateCatalogItemBtn',
    'calcCatalogCreateCategory',
    'calcCatalogCreateName',
    'calcCatalogCreateUnit',
    'calcCatalogCreateCost',
    'calcCatalogCreateMarkup',
    'createCatalogItemFromCalculation',
    'createCalculationCatalogItem({',
    "setCalcMode('catalog')",
    'calculationCatalogRows =',
]:
    if marker not in calc:
        errors.append(f'Missing catalog-create UI marker: {marker}')

for marker in [
    'catalogCreateValidation',
    'normalizeCatalogCreateInput',
    'invokeStagingCatalogManagement',
    'createCalculationCatalogAttempt',
    'catalogManagementWriteAvailability',
    'catalog_write_not_allowed',
    'catalog_actor_changed',
]:
    if marker not in create:
        errors.append(f'Missing catalog-create helper marker: {marker}')

# The same exact-origin gate protects catalog management and calculator creation.
if 'catalogManagementWriteAvailability({ supabaseUrl: V4_CONFIG.supabaseUrl' not in calc:
    errors.append('Catalog create UI is missing the shared environment gate')
for token in ['.insert(', '.update(', '.upsert(', '.delete(', '.rpc(']:
    if token in create:
        errors.append('Catalog create helper bypasses the shared server command: '+token)

# Browser helper must rely on ordinary authenticated RLS, never elevated secrets.
for forbidden in ['service_role', 'sb_secret_', 'SUPABASE_SERVICE_ROLE_KEY']:
    if forbidden in calc or forbidden in create:
        errors.append(f'Forbidden elevated credential marker: {forbidden}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('Calculation catalog create UI contract: PASS')
