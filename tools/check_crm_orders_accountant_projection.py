#!/usr/bin/env python3
"""Validate accountant permissions and role-specific projections in leader-crm-orders."""

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'supabase/functions/leader-crm-orders/index.ts'
REGISTRY = ROOT / 'crm/v4/assets/v4/action-permissions-v1.js'
SPEC = ROOT / 'docs/CRM_SERVER_ACTION_RBAC_SPEC_2026-07-10.md'
DOC = ROOT / 'docs/CRM_ORDERS_ACCOUNTANT_PROJECTION_2026-07-16.md'
WORKFLOW = ROOT / '.github/workflows/crm-server-action-rbac-check.yml'

EXPECTED_ACCOUNTANT_PERMISSIONS = {'list', 'update:payment_status'}
EXPECTED_MANAGER_FIELDS = [
    'id', 'order_number', 'created_at', 'updated_at', 'project_name',
    'client_name', 'client_phone', 'status', 'deadline', 'source',
    'layout_status', 'production_status', 'installation_status', 'priority',
    'current_stage', 'next_action', 'progress_percent',
]
EXPECTED_ACCOUNTANT_FIELDS = [
    'id', 'order_number', 'created_at', 'updated_at', 'project_name',
    'status', 'payment_status', 'deadline', 'client_total', 'contractor_cost',
    'prepayment', 'balance',
]

errors: list[str] = []


def read(path: Path) -> str:
    if not path.is_file():
        errors.append(f'Missing file: {path.relative_to(ROOT)}')
        return ''
    return path.read_text(encoding='utf-8')


def require(text: str, marker: str, label: str) -> None:
    if marker not in text:
        errors.append(f'{label}: missing marker {marker!r}')


def matrix_permissions(source: str, role: str) -> set[str]:
    match = re.search(rf"{role}:\s*new Set\(\[(.*?)\]\)", source, flags=re.S)
    if not match:
        errors.append(f'source: missing {role} permission block')
        return set()
    return set(re.findall(r"'([^']+)'", match.group(1)))


def projection(source: str, role: str) -> list[str]:
    match = re.search(rf"^\s*{role}:\s*'([^']+)'", source, flags=re.M)
    if not match:
        errors.append(f'source: missing {role} projection')
        return []
    return match.group(1).split(',')


source = read(SOURCE)
registry = read(REGISTRY)
spec = read(SPEC)
doc = read(DOC)
workflow = read(WORKFLOW)

accountant_permissions = matrix_permissions(source, 'accountant')
if accountant_permissions != EXPECTED_ACCOUNTANT_PERMISSIONS:
    errors.append(
        'accountant permissions drift: '
        f'expected={sorted(EXPECTED_ACCOUNTANT_PERMISSIONS)} '
        f'actual={sorted(accountant_permissions)}'
    )

manager_fields = projection(source, 'manager')
accountant_fields = projection(source, 'accountant')
if manager_fields != EXPECTED_MANAGER_FIELDS:
    errors.append(f'manager projection drift: {manager_fields}')
if accountant_fields != EXPECTED_ACCOUNTANT_FIELDS:
    errors.append(f'accountant projection drift: {accountant_fields}')

for forbidden in (
    'update:status', 'update:layout_status', 'update:production_status',
    'update:layout_comment', 'update:deadline', 'update:any',
):
    if forbidden in accountant_permissions:
        errors.append(f'accountant must not receive {forbidden}')

for field in ('payment_status', 'client_total', 'contractor_cost', 'profit', 'prepayment', 'balance'):
    if field in manager_fields:
        errors.append(f'manager projection leaked finance field: {field}')

for field in (
    'client_name', 'client_phone', 'lead_id', 'client_id', 'source',
    'layout_status', 'layout_comment', 'production_status', 'installation_status',
    'profit', 'data',
):
    if field in accountant_fields:
        errors.append(f'accountant projection leaked non-required field: {field}')

for marker in (
    "const ORDER_FIELDS_BY_ROLE: Record<string, string> = {",
    "const ROLE_MATRIX_VERSION = '20260716-edge-role-matrix-2'",
    "function orderFieldsForRole(profile:",
    "return ORDER_FIELDS_BY_ROLE[role(profile)] || ''",
    "const fields = orderFieldsForRole(profile)",
    "if (!fields) return unauthorized('list', profile)",
    "if (!fields) return unauthorized('update', profile)",
    "encodeURIComponent(fields)",
    "return await listOrders(url, serviceRole, checked.profile)",
    "return await updateOrder(url, serviceRole, checked.profile, body)",
):
    require(source, marker, 'source')

list_start = source.find('async function listOrders')
list_end = source.find('async function updateOrder', list_start)
update_start = source.find('async function updateOrder')
update_end = source.find('Deno.serve', update_start)
list_block = source[list_start:list_end] if list_start >= 0 and list_end >= 0 else ''
update_block = source[update_start:update_end] if update_start >= 0 and update_end >= 0 else ''
for label, block, guard in (
    ('list', list_block, "if (!fields) return unauthorized('list', profile)"),
    ('update', update_block, "if (!fields) return unauthorized('update', profile)"),
):
    if not block:
        errors.append(f'source: missing {label} handler block')
        continue
    lookup = block.find('const fields = orderFieldsForRole(profile)')
    guard_pos = block.find(guard)
    rest_pos = block.find('const res = await rest')
    if not 0 <= lookup < guard_pos < rest_pos:
        errors.append(f'source: {label} projection must be checked before REST')
    if 'encodeURIComponent(orderFields)' in block:
        errors.append(f'source: {label} still uses broad orderFields directly')

accountant_registry = re.search(
    r"accountant: Object\.freeze\(\[(.*?)\]\),\s*designer:",
    registry,
    flags=re.S,
)
if not accountant_registry:
    errors.append('browser registry: accountant block missing')
else:
    block = accountant_registry.group(1)
    for marker in ('CRM_V4_ACTIONS.ORDERS_READ', 'CRM_V4_ACTIONS.FINANCE_WRITE'):
        if marker not in block:
            errors.append(f'browser registry: accountant missing {marker}')
    if 'CRM_V4_ACTIONS.ORDERS_UPDATE' in block:
        errors.append('browser registry: accountant must not receive broad ORDERS_UPDATE')

for marker in (
    '| `list` | `orders.read` | allow | allow | allow',
    '| `update.payment_status` | `finance.write` | allow | deny | allow',
    '### accountant',
):
    require(spec, marker, 'RBAC spec')

for marker in (
    'accountant', 'update:payment_status', 'ORDER_FIELDS_BY_ROLE',
    'client_phone', 'contractor_cost', 'Production Supabase не изменён',
):
    require(doc, marker, 'documentation')

for marker in (
    "'tools/check_crm_orders_accountant_projection.py'",
    "'docs/CRM_ORDERS_ACCOUNTANT_PROJECTION_2026-07-16.md'",
    'python3 tools/check_crm_orders_accountant_projection.py',
):
    require(workflow, marker, 'workflow')

if errors:
    print('CRM orders accountant projection checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('CRM orders accountant access is finance-only and all role responses use exact projections.')
