#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / 'crm/v4/assets/v4/catalog-management-model-v1.js'
VIEW = ROOT / 'crm/v4/assets/v4/catalog-management-v1.js'
TRANSPORT = ROOT / 'crm/v4/assets/v4/catalog-management-staging-transport-v1.js'
ROLE_TABS = ROOT / 'crm/v4/assets/v4/role-tab-permissions-v1.js'
MENU = ROOT / 'crm/v4/assets/v4/crm-v4-expanded-menu-v1.js'
TABS = ROOT / 'crm/v4/assets/v4/crm-v4-tabs-lite.js'
ROUTE = ROOT / 'crm/v4/assets/v4/crm-navigation-route-v1.js'
LOADER = ROOT / 'crm/v4/assets/v4/crm-v4-tab-loader-v1.js'

files = [MODEL, VIEW, TRANSPORT, ROLE_TABS, MENU, TABS, ROUTE, LOADER]
missing = [str(path.relative_to(ROOT)) for path in files if not path.exists()]
if missing:
    print('Missing catalog management files: ' + ', '.join(missing))
    sys.exit(1)

model = MODEL.read_text(encoding='utf-8')
view = VIEW.read_text(encoding='utf-8')
transport = TRANSPORT.read_text(encoding='utf-8')
role_tabs = ROLE_TABS.read_text(encoding='utf-8')
menu = MENU.read_text(encoding='utf-8')
tabs = TABS.read_text(encoding='utf-8')
route = ROUTE.read_text(encoding='utf-8')
loader = LOADER.read_text(encoding='utf-8')
errors = []

for marker in [
    'CATALOG_MANAGEMENT_MODEL_V1', 'normalizeCatalogManagementRow',
    'catalogManagementSummary', 'catalogManagementCategories',
    'filterCatalogManagementRows', 'normalizeCatalogPriceLog',
    'catalogPriceLogChanges', 'calculated_client_price',
]:
    if marker not in model:
        errors.append('Missing catalog management model marker: ' + marker)

for marker in [
    "CRM_V4_ACTIONS.CATALOG_READ", "CRM_V4_ACTIONS.CATALOG_MANAGE",
    ".from('leader_catalog')", ".from('leader_catalog_price_logs')",
    "node.dataset.v4ManagedSection = 'catalog'", 'catalogManagementSearch',
    'catalogManagementCategory', 'catalogManagementStatus', 'catalogManagementSort',
    'История цены', 'catalogManagementCreateBtn', 'catalogManagementEditBtn',
    'catalogManagementEditor', 'invokeStagingCatalogManagement',
    'catalogManagementWriteAvailability', 'Production read-only',
    'export async function mount()', 'loadCatalogManagement', 'refreshCatalogManagement',
]:
    if marker not in view:
        errors.append('Missing catalog management view marker: ' + marker)

# Browser code may read catalog/log tables directly, but all writes must cross the JWT Edge transport.
for forbidden in ['.insert(', '.update(', '.delete(', '.upsert(', '.rpc(', 'service_role', 'sb_secret_']:
    if forbidden in view:
        errors.append('Catalog management view contains forbidden browser write/elevation marker: ' + forbidden)

for marker in [
    "const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'",
    "const FUNCTION_SLUG = 'leader-crm-catalog'",
    "const ACTION = 'catalog.manage'",
    "const PERMISSION = 'catalog.manage'",
    'catalogManagementWriteAvailability', 'buildCatalogManagementCommand',
    'catalogManagementIdempotencyKey', 'client.auth.getSession',
    'client.functions.invoke(FUNCTION_SLUG', 'production_locked',
]:
    if marker not in transport:
        errors.append('Missing catalog staging transport marker: ' + marker)
for forbidden in ['.from(', '.insert(', '.update(', '.delete(', '.upsert(', '.rpc(', 'service_role', 'sb_secret_']:
    if forbidden in transport:
        errors.append('Catalog staging transport must use Edge only: ' + forbidden)

for name, source, markers in [
    ('role tabs', role_tabs, ["'catalog'", "owner: FULL_ACCESS", "admin: FULL_ACCESS"]),
    ('expanded menu', menu, ["{ tab: 'catalog', label: 'Каталог' }"]),
    ('tabs lite', tabs, ["'catalog'"]),
    ('navigation route', route, ["'catalog'"]),
    ('tab loader', loader, ["catalog: Object.freeze({", "requiredPermission: 'catalog'", "import('./catalog-management-v1.js", "Загружаю каталог"]),
]:
    for marker in markers:
        if marker not in source:
            errors.append(f'Missing {name} marker: {marker}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('Catalog management v1 keeps production read-only and enables owner/admin staging writes only through JWT Edge: PASS')
