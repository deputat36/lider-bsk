#!/usr/bin/env python3
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[1]
SPEC = ROOT / 'docs' / 'CRM_SERVER_ACTION_RBAC_SPEC_2026-07-10.md'
UI_REGISTRY = ROOT / 'crm' / 'v4' / 'assets' / 'v4' / 'action-permissions-v1.js'
LEADS_EDGE = ROOT / 'supabase' / 'functions' / 'leader-crm-leads' / 'index.ts'
ORDERS_EDGE = ROOT / 'supabase' / 'functions' / 'leader-crm-orders' / 'index.ts'

EXPECTED_LEADS_ACTIONS = {
    'ensure_profile',
    'dashboard',
    'list',
    'list_orders',
    'create',
    'update',
    'ensure_client',
    'create_order',
    'create_order_from_offer',
}
EXPECTED_ORDERS_ACTIONS = {'list', 'update'}
CANONICAL_ROLES = {
    'owner',
    'admin',
    'manager',
    'accountant',
    'designer',
    'installer',
    'contractor',
}
REQUIRED_PERMISSIONS = {
    'leads.read',
    'leads.create',
    'leads.update',
    'clients.write',
    'orders.read',
    'orders.create',
    'orders.update',
    'finance.write',
    'design.write',
    'production.write',
}

LEADS_SOURCE_MARKERS = (
    "ROLE_MATRIX_VERSION = '20260712-leads-role-matrix-1'",
    'CANONICAL_ROLES',
    'ACTION_PERMISSION',
    'ROLE_ACTIONS',
    'LEAD_FIELDS_BY_ROLE',
    'ORDER_FIELDS_BY_ROLE',
    "accountant: new Set(['orders.read'])",
    'designer: new Set()',
    'installer: new Set()',
    'contractor: new Set()',
    'requireAction',
    'leadFieldsForRole',
    'orderFieldsForRole',
    'projectRow',
    'no_update_fields',
    "if (!isCanonicalRole(checked.profile))",
    'const permission = ACTION_PERMISSION[action]',
)

ORDER_SOURCE_MARKERS = (
    "ROLE_MATRIX_VERSION = '20260712-edge-role-matrix-2'",
    'CANONICAL_ROLES',
    'ORDER_ACTIONS_BY_ROLE',
    'ORDER_FIELDS_BY_ROLE',
    "accountant: new Set(['list', 'update:payment_status'])",
    'designer: new Set()',
    'installer: new Set()',
    'contractor: new Set()',
    'validateOrderUpdate',
    'no_update_fields',
    'orderFieldsForRole',
    "if (!isCanonicalRole(checked.profile))",
)

ORDER_FORBIDDEN_MARKERS = (
    'production: new Set',
    'update:any',
)


def read(path: Path) -> str:
    if not path.is_file():
        raise SystemExit(f'Missing required file: {path.relative_to(ROOT)}')
    return path.read_text(encoding='utf-8')


def routed_actions(source: str) -> set[str]:
    return set(re.findall(r"if \(action === '([^']+)'\)", source))


def require(text: str, marker: str, source: Path, errors: list[str]) -> None:
    if marker not in text:
        errors.append(f'Missing {marker!r} in {source.relative_to(ROOT)}')


def main() -> None:
    errors: list[str] = []
    spec = read(SPEC)
    registry = read(UI_REGISTRY)
    leads = read(LEADS_EDGE)
    orders = read(ORDERS_EDGE)

    leads_actions = routed_actions(leads)
    orders_actions = routed_actions(orders)

    if leads_actions != EXPECTED_LEADS_ACTIONS:
        errors.append(
            'leader-crm-leads route set changed: '
            f'expected={sorted(EXPECTED_LEADS_ACTIONS)} actual={sorted(leads_actions)}'
        )
    if orders_actions != EXPECTED_ORDERS_ACTIONS:
        errors.append(
            'leader-crm-orders route set changed: '
            f'expected={sorted(EXPECTED_ORDERS_ACTIONS)} actual={sorted(orders_actions)}'
        )

    for action in sorted(EXPECTED_LEADS_ACTIONS | EXPECTED_ORDERS_ACTIONS):
        require(spec, f'`{action}`', SPEC, errors)

    for role in sorted(CANONICAL_ROLES):
        require(spec, f'`{role}`', SPEC, errors)
        require(registry, f'  {role}:', UI_REGISTRY, errors)
        require(leads, f"'{role}'", LEADS_EDGE, errors)
        require(orders, f"'{role}'", ORDERS_EDGE, errors)

    for permission in sorted(REQUIRED_PERMISSIONS):
        require(spec, f'`{permission}`', SPEC, errors)
        require(registry, f"'{permission}'", UI_REGISTRY, errors)

    for marker in (
        'profile.bootstrap',
        'role-specific field projection',
        'field-level update',
        '403 forbidden',
        '400 unknown_action',
        'unknown role получает `403 forbidden`',
        'generic `leader-crm-orders:update` запрещён',
        'live `leader-crm-orders v2` не содержит candidate role matrix',
        'Роль `production` не является live canonical role',
        'GitHub source нельзя автоматически считать deployed production state',
        'positive/negative tests',
        'Production Supabase не изменялся',
        'production Supabase не меняется без отдельного approval',
        'Объекты `nav_*`, Parket и Broker не затрагиваются',
    ):
        require(spec, marker, SPEC, errors)

    for marker in LEADS_SOURCE_MARKERS:
        require(leads, marker, LEADS_EDGE, errors)

    for marker in ORDER_SOURCE_MARKERS:
        require(orders, marker, ORDERS_EDGE, errors)

    for marker in ORDER_FORBIDDEN_MARKERS:
        if marker in orders:
            errors.append(f'Forbidden stale order RBAC marker {marker!r} in {ORDERS_EDGE.relative_to(ROOT)}')

    # GitHub source now contains candidate enforcement, but UI must still report
    # source-only status until development and production deployment are proven.
    require(registry, 'serverEnforcement: false', UI_REGISTRY, errors)
    require(registry, "enforcement: 'ui_only'", UI_REGISTRY, errors)

    if errors:
        print('\n'.join(errors))
        sys.exit(1)

    print('CRM server action RBAC specification covers current Edge routes and canonical roles.')


if __name__ == '__main__':
    main()
