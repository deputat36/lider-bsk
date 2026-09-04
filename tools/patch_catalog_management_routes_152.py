#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new):
    text = path.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'expected marker not found in {path.relative_to(ROOT)}: {old[:80]}')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')

replace_once(
    ROOT / 'crm/v4/assets/v4/role-tab-permissions-v1.js',
    "  'contact_control',\n  'public_lead_audit',",
    "  'contact_control',\n  'catalog',\n  'public_lead_audit',"
)

replace_once(
    ROOT / 'crm/v4/assets/v4/crm-v4-expanded-menu-v1.js',
    "  { tab: 'contact_control', label: 'Контроль контактов' },\n  { tab: 'public_lead_audit', label: 'Аудит заявок' },",
    "  { tab: 'contact_control', label: 'Контроль контактов' },\n  { tab: 'catalog', label: 'Каталог' },\n  { tab: 'public_lead_audit', label: 'Аудит заявок' },"
)

replace_once(
    ROOT / 'crm/v4/assets/v4/crm-v4-tabs-lite.js',
    "const MANAGED_TABS = new Set(['management_dashboard', 'orders', 'order_control', 'finance_control', 'production', 'public_lead_audit', 'contact_control', 'user_admin']);",
    "const MANAGED_TABS = new Set(['management_dashboard', 'orders', 'order_control', 'finance_control', 'production', 'contact_control', 'catalog', 'public_lead_audit', 'user_admin']);"
)

replace_once(
    ROOT / 'crm/v4/assets/v4/crm-navigation-route-v1.js',
    "  'contact_control',\n  'public_lead_audit',",
    "  'contact_control',\n  'catalog',\n  'public_lead_audit',"
)

loader = ROOT / 'crm/v4/assets/v4/crm-v4-tab-loader-v1.js'
replace_once(
    loader,
    "  public_lead_audit: Object.freeze({\n",
    "  catalog: Object.freeze({\n    requiredPermission: 'catalog',\n    importModule: managedModule(() => import('./catalog-management-v1.js?v=20260904-read-1')),\n    mount: (module) => module.mount?.(),\n    load: (module) => module.load?.(),\n    refresh: (module) => module.refresh?.(),\n    loadingMessage: 'Загружаю каталог…',\n    errorMessage: 'Каталог не загрузился.'\n  }),\n  public_lead_audit: Object.freeze({\n"
)

# Keep the established lazy-loader checker aware of the new heavy managed tab.
checker = ROOT / 'tools/check_crm_lazy_tab_loader.py'
replace_once(
    checker,
    '    "contact_control",\n    "public_lead_audit",',
    '    "contact_control",\n    "catalog",\n    "public_lead_audit",'
)
replace_once(
    checker,
    '    "contact-control-v1.js",\n    "lead-card.js",',
    '    "contact-control-v1.js",\n    "catalog-management-v1.js",\n    "lead-card.js",'
)
