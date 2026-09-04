#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
CALC = ROOT / 'crm/v4/assets/v4/calculations.js'
SOURCE = ROOT / 'crm/v4/assets/v4/calculation-catalog-source-v1.js'
STAGING_MIGRATION = ROOT / 'supabase/staging-migrations/20260904_01_calculation_catalog_harness.sql'
STAGING_TEST = ROOT / 'supabase/staging-tests/20260904_calculation_catalog_id_acceptance.sql'

calc = CALC.read_text(encoding='utf-8')
source = SOURCE.read_text(encoding='utf-8')
migration = STAGING_MIGRATION.read_text(encoding='utf-8') if STAGING_MIGRATION.exists() else ''
acceptance = STAGING_TEST.read_text(encoding='utf-8') if STAGING_TEST.exists() else ''
errors = []

for marker in [
    "from './calculation-catalog-source-v1.js'",
    "['catalog', 'Из каталога']",
    'calcCatalogBackedItem',
    'calcCatalogBackedQty',
    'catalogRowToDraftItem(row,',
    'catalog_source: calculationCatalogSource',
    'ensureCalculationCatalog();',
    'loadCalculationCatalog({ supabaseClient, fallbackRows: CATALOG })',
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

# The UI must use the isolated source layer rather than reading the table directly.
if ".from('leader_catalog')" in calc:
    errors.append('calculations.js must not read leader_catalog directly')

# Staging now has a compatibility leader_catalog table. Do not silently force it back
# to the local fallback, otherwise catalog_id persistence cannot be exercised there.
for forbidden in [
    'isStagingWorkflowEnvironment(V4_CONFIG.supabaseUrl) ? null : supabaseClient',
    'catalogClient = null',
]:
    if forbidden in calc:
        errors.append(f'Staging catalog bypass must remain retired: {forbidden}')

for marker in [
    "project_ref = 'otulfnouybahfnsycxqn'",
    'create table if not exists public.leader_catalog',
    'alter table public.leader_catalog enable row level security',
    'grant select on table public.leader_catalog to authenticated',
    'leader_catalog_select_active',
    'leader_private.leader_has_access()',
    'leader_lead_calculation_items_catalog_id_fkey',
    'references public.leader_catalog(id)',
    'leader_lead_calculation_items_catalog_id_idx',
]:
    if marker not in migration:
        errors.append(f'Missing staging catalog harness marker: {marker}')

for marker in [
    'begin;',
    'rollback;',
    'Synthetic catalog_id acceptance #169',
    'catalog_id_not_persisted',
    'catalog_backed_calculation_join_failed',
    'join public.leader_catalog catalog on catalog.id = item.catalog_id',
]:
    if marker not in acceptance:
        errors.append(f'Missing staging catalog acceptance marker: {marker}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('Calculation catalog UI and staging catalog_id compatibility contract: PASS')
