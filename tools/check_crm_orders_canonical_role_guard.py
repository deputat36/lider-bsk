#!/usr/bin/env python3
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
ORDERS = ROOT / 'supabase/functions/leader-crm-orders/index.ts'
REGISTRY = ROOT / 'crm/v4/assets/v4/action-permissions-v1.js'
DOC = ROOT / 'docs/CRM_ORDERS_CANONICAL_ROLE_GUARD_2026-07-16.md'
WORKFLOW = ROOT / '.github/workflows/crm-server-action-rbac-check.yml'
SNAPSHOT_CHECKER = ROOT / 'tools/check_supabase_edge_function_sources.py'

EXPECTED_ROLES = {
    'owner',
    'admin',
    'manager',
    'accountant',
    'designer',
    'installer',
    'contractor',
}

errors = []

for path in (ORDERS, REGISTRY, DOC, WORKFLOW, SNAPSHOT_CHECKER):
    if not path.is_file():
        errors.append(f'Missing required file: {path.relative_to(ROOT)}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

orders = ORDERS.read_text(encoding='utf-8')
registry = REGISTRY.read_text(encoding='utf-8')
doc = DOC.read_text(encoding='utf-8')
workflow = WORKFLOW.read_text(encoding='utf-8')
snapshot_checker = SNAPSHOT_CHECKER.read_text(encoding='utf-8')

canonical_match = re.search(
    r"const CANONICAL_ROLES = new Set\(\[(.*?)\]\)",
    orders,
    flags=re.S,
)
if not canonical_match:
    errors.append('Missing CANONICAL_ROLES set in leader-crm-orders source')
    canonical_roles = set()
else:
    canonical_roles = set(re.findall(r"'([a-z_]+)'", canonical_match.group(1)))
    if canonical_roles != EXPECTED_ROLES:
        errors.append(
            'Canonical role set mismatch: '
            f'expected={sorted(EXPECTED_ROLES)} actual={sorted(canonical_roles)}'
        )

matrix_match = re.search(
    r"const ORDER_ACTIONS_BY_ROLE: Record<string, Set<string>> = \{(.*?)\n\}",
    orders,
    flags=re.S,
)
if not matrix_match:
    errors.append('Missing ORDER_ACTIONS_BY_ROLE matrix')
    matrix_roles = set()
else:
    matrix_roles = set(re.findall(r"^\s{2}([a-z_]+):", matrix_match.group(1), flags=re.M))
    unexpected = matrix_roles - EXPECTED_ROLES
    if unexpected:
        errors.append(f'Non-canonical matrix roles: {sorted(unexpected)}')

if 'production: new Set' in orders:
    errors.append('Non-canonical production role must not be present in the orders matrix')

for role in sorted(EXPECTED_ROLES):
    if f'  {role}:' not in registry:
        errors.append(f'Missing canonical browser registry role: {role}')
if '  production:' in registry:
    errors.append('Browser action registry must not define a production role')

function_match = re.search(
    r"function canOrderAction\(.*?\n\}",
    orders,
    flags=re.S,
)
if not function_match:
    errors.append('Missing canOrderAction function')
else:
    body = function_match.group(0)
    required = (
        'const currentRole = role(profile)',
        'if (!CANONICAL_ROLES.has(currentRole)) return false',
        'const permissions = ORDER_ACTIONS_BY_ROLE[currentRole]',
    )
    for marker in required:
        if marker not in body:
            errors.append(f'Missing canOrderAction marker: {marker}')
    guard_pos = body.find('CANONICAL_ROLES.has(currentRole)')
    lookup_pos = body.find('ORDER_ACTIONS_BY_ROLE[currentRole]')
    if guard_pos < 0 or lookup_pos < 0 or guard_pos > lookup_pos:
        errors.append('Canonical role guard must run before matrix lookup')

required_doc_markers = (
    'CRM orders Edge canonical role guard',
    'No `production` profile exists',
    'production `leader-crm-orders` remains ACTIVE v2',
    'production `leader-crm-leads` remains ACTIVE v12',
    'This is not the complete server-side RBAC implementation',
    'No Supabase deployment or database change',
)
for marker in required_doc_markers:
    if marker not in doc:
        errors.append(f'Missing documentation marker: {marker}')

required_workflow_markers = (
    "- 'docs/CRM_ORDERS_CANONICAL_ROLE_GUARD_2026-07-16.md'",
    "- 'tools/check_crm_orders_canonical_role_guard.py'",
    'python3 tools/check_crm_orders_canonical_role_guard.py',
)
for marker in required_workflow_markers:
    if marker not in workflow:
        errors.append(f'Missing workflow marker: {marker}')

for marker in ('CANONICAL_ROLES', 'CANONICAL_ROLES.has(currentRole)'):
    if marker not in snapshot_checker:
        errors.append(f'Missing Edge snapshot marker: {marker}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM orders source rejects non-canonical roles before matrix lookup.')
