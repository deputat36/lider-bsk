#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / 'crm/v4/assets/v4/catalog-management-model-v1.js'
VIEW = ROOT / 'crm/v4/assets/v4/catalog-management-v1.js'
ROLE_TABS = ROOT / 'crm/v4/assets/v4/role-tab-permissions-v1.js'
MENU = ROOT / 'crm/v4/assets/v4/crm-v4-expanded-menu-v1.js'
TABS = ROOT / 'crm/v4/assets/v4/crm-v4-tabs-lite.js'
ROUTE = ROOT / 'crm/v4/assets/v4/crm-navigation-route-v1.js'
LOADER = ROOT / 'crm/v4/assets/v4/crm-v4-tab-loader-v1.js'

files = [MODEL, VIEW, ROLE_TABS, MENU, TABS, ROUTE, LOADER]
missing = [str(path.relative_to(ROOT)) for path in files if not path.exists()]
if missing:
    print('Missing catalog management files: ' + ', '.join(missing))
    sys.exit(1)

model = MODEL.read_text(encoding='utf-8')
view = VIEW.read_text(encoding='utf-8')
role_tabs = ROLE_TABS.read_text(encoding='utf-8')
menu = MENU.read_text(encoding='utf-8')
tabs = TABS.read_text(encoding='utf-8')
route = ROUTE.read_text(encoding='utf-8')
loader = LOADER.read_text(encoding='utf-8')
errors = []

for marker in [
    'CATALOG_MANAGEMENT_MODEL_V1',
    'normalizeCatalogManagementRow',
    'catalogManagementSummary',
    'catalogManagementCategories',
    'filterCatalogManagementRows',
    'normalizeCatalogPriceLog',
    'catalogPriceLogChanges',
    'calculated_client_price',
]:
    if marker not in model:
        errors.append('Missing catalog management model marker: ' + marker)

for marker in [
    "CRM_V4_ACTIONS.CATALOG_READ",
    "CRM_V4_ACTIONS.CATALOG_MANAGE",
    ".from('leader_catalog')",
    ".from('leader_catalog_price_logs')",
    "data.v4ManagedSection = 'catalog'",
    'catalogManagementSearch',
    'catalogManagementCategory',
    'catalogManagementStatus',
    'catalogManagementSort',
    'История цены',
    'Редактирование защищено',
    'server-side командой',
    'export async function mount()',
    'loadCatalogManagement',
    'refreshCatalogManagement',
]:
    if marker not in view:
        errors.append('Missing catalog management view marker: ' + marker)

for forbidden in ['.insert(', '.update(', '.delete(', '.upsert(', 'service_role', 'sb_secret_']:
    if forbidden in view:
        errors.append('Catalog management v1 must remain read-only: ' + forbidden)

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

print('Catalog management v1 is a lazy owner/admin read-only catalog screen with filters and price history: PASS')
