#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
helper = root / 'crm/v4/assets/v4/role-tab-permissions-v1.js'
tabs = root / 'crm/v4/assets/v4/crm-v4-tabs-lite.js'
menu = root / 'crm/v4/assets/v4/crm-v4-expanded-menu-v1.js'
manual = root / 'docs/CRM_V4_ROLE_TAB_MATRIX_MANUAL_TEST_2026-07-10.md'

errors = []

checks = {
    helper: [
        'export const CRM_V4_TABS',
        'export const CRM_V4_ROLE_TABS',
        'owner: FULL_ACCESS',
        'admin: FULL_ACCESS',
        'manager: Object.freeze([',
        "'finance_control'",
        "designer: Object.freeze(['production'])",
        "installer: Object.freeze(['production'])",
        "contractor: Object.freeze(['production'])",
        'export function canOpenV4Tab',
        'export function firstAllowedV4Tab',
        'export function applyV4TabButtonVisibility',
        'serverEnforcement: false',
        'tracked in #202',
    ],
    tabs: [
        "from './role-tab-permissions-v1.js'",
        'function permittedTab(requested)',
        'canOpenV4Tab(normalized)',
        'firstAllowedV4Tab()',
        "new CustomEvent('leader-v4:tab-denied'",
        'applyV4TabButtonVisibility(document)',
        "document.addEventListener('leader-v4:crm-ready'",
    ],
    menu: [
        "import { applyV4TabButtonVisibility } from './role-tab-permissions-v1.js';",
        'applyV4TabButtonVisibility(nav)',
        "document.addEventListener('leader-v4:tab-denied'",
    ],
    manual: [
        'owner / admin',
        'manager',
        'accountant',
        'designer / installer / contractor',
        'Manager must not see',
        'direct unauthorized tab navigation is denied',
        'defense-in-depth, not the server-side authorization source of truth',
        'does not alter RLS, grants, policies, Auth, database data or Edge Functions',
    ],
}

for path, markers in checks.items():
    if not path.exists():
        errors.append(f'Missing role-tab file: {path.relative_to(root)}')
        continue
    text = path.read_text(encoding='utf-8')
    for marker in markers:
        if marker not in text:
            errors.append(f'Missing role-tab marker in {path.relative_to(root)}: {marker}')

if helper.exists():
    text = helper.read_text(encoding='utf-8')
    manager_start = text.find('manager: Object.freeze([')
    manager_end = text.find(']),', manager_start)
    manager_block = text[manager_start:manager_end] if manager_start >= 0 and manager_end >= 0 else ''
    for forbidden in ["'management_dashboard'", "'finance_control'", "'user_admin'"]:
        if forbidden in manager_block:
            errors.append(f'Manager role must not include sensitive tab: {forbidden}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM v4 conservative UI role-tab matrix is valid; server enforcement remains separate.')
