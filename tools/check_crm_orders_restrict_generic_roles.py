#!/usr/bin/env python3
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
ORDERS = ROOT / 'supabase/functions/leader-crm-orders/index.ts'
DOC = ROOT / 'docs/CRM_ORDERS_RESTRICT_GENERIC_ROLES_2026-07-16.md'
WORKFLOW = ROOT / '.github/workflows/crm-server-action-rbac-check.yml'
SNAPSHOT_CHECKER = ROOT / 'tools/check_supabase_edge_function_sources.py'

EXPECTED_MATRIX_ROLES = {'owner', 'admin', 'manager', 'accountant'}
RESTRICTED_ROLES = {'designer', 'installer', 'contractor'}

errors = []
for path in (ORDERS, DOC, WORKFLOW, SNAPSHOT_CHECKER):
    if not path.is_file():
        errors.append(f'Missing required file: {path.relative_to(ROOT)}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

orders = ORDERS.read_text(encoding='utf-8')
doc = DOC.read_text(encoding='utf-8')
workflow = WORKFLOW.read_text(encoding='utf-8')
snapshot_checker = SNAPSHOT_CHECKER.read_text(encoding='utf-8')

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
    if matrix_roles != EXPECTED_MATRIX_ROLES:
        errors.append(
            f'Generic order matrix mismatch: expected={sorted(EXPECTED_MATRIX_ROLES)} '
            f'actual={sorted(matrix_roles)}'
        )

for role in RESTRICTED_ROLES:
    if re.search(rf"^\s{{2}}{role}:\s*new Set", matrix_match.group(1) if matrix_match else '', flags=re.M):
        errors.append(f'Restricted role must not have a generic orders matrix entry: {role}')

canonical_match = re.search(r"const CANONICAL_ROLES = new Set\(\[(.*?)\]\)", orders, flags=re.S)
if not canonical_match:
    errors.append('Missing canonical role set')
else:
    canonical_roles = set(re.findall(r"'([a-z_]+)'", canonical_match.group(1)))
    for role in RESTRICTED_ROLES:
        if role not in canonical_roles:
            errors.append(f'Restricted role must remain canonical and fail by permission, not role parsing: {role}')

for marker in (
    "if (!CANONICAL_ROLES.has(currentRole)) return false",
    "return Boolean(permissions?.has('*') || permissions?.has(permission))",
    "return json(403, { error: 'forbidden'",
    "accountant: new Set([",
    "'update:payment_status'",
):
    if marker not in orders:
        errors.append(f'Missing fail-closed source marker: {marker}')

required_doc_markers = (
    'CRM orders generic endpoint restriction',
    'designer, installer and contractor are recognized roles',
    'accountant',
    '`update:payment_status`',
    '`403 forbidden`',
    'production `leader-crm-orders` remains ACTIVE v2',
    'no Edge Function is deployed',
)
for marker in required_doc_markers:
    if marker not in doc:
        errors.append(f'Missing documentation marker: {marker}')

required_workflow_markers = (
    "- 'docs/CRM_ORDERS_RESTRICT_GENERIC_ROLES_2026-07-16.md'",
    "- 'tools/check_crm_orders_restrict_generic_roles.py'",
    'python3 tools/check_crm_orders_restrict_generic_roles.py',
)
for marker in required_workflow_markers:
    if marker not in workflow:
        errors.append(f'Missing workflow marker: {marker}')

for marker in ('ORDER_ACTIONS_BY_ROLE', 'CANONICAL_ROLES.has(currentRole)', 'ORDER_FIELDS_BY_ROLE'):
    if marker not in snapshot_checker:
        errors.append(f'Missing source snapshot marker: {marker}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('Generic CRM orders source allows office roles plus narrow accountant finance access; job roles remain denied.')
