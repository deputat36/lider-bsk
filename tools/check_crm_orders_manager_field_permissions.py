#!/usr/bin/env python3
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
ORDERS = ROOT / 'supabase/functions/leader-crm-orders/index.ts'
REGISTRY = ROOT / 'crm/v4/assets/v4/action-permissions-v1.js'
DOC = ROOT / 'docs/CRM_ORDERS_MANAGER_FIELD_PERMISSIONS_2026-07-16.md'
WORKFLOW = ROOT / '.github/workflows/crm-server-action-rbac-check.yml'
SNAPSHOT_CHECKER = ROOT / 'tools/check_supabase_edge_function_sources.py'

EXPECTED_MANAGER_PERMISSIONS = {
    'list',
    'update:status',
    'update:layout_status',
    'update:production_status',
    'update:layout_comment',
    'update:deadline',
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

manager_match = re.search(
    r"manager:\s*new Set\(\[(.*?)\]\)",
    orders,
    flags=re.S,
)
if not manager_match:
    errors.append('Missing manager role permissions in ORDER_ACTIONS_BY_ROLE')
    manager_permissions = set()
else:
    manager_permissions = set(re.findall(r"'([^']+)'", manager_match.group(1)))
    if manager_permissions != EXPECTED_MANAGER_PERMISSIONS:
        errors.append(
            'Manager permission set mismatch: '
            f'expected={sorted(EXPECTED_MANAGER_PERMISSIONS)} '
            f'actual={sorted(manager_permissions)}'
        )

for forbidden in ('update:any', 'update:payment_status'):
    if forbidden in manager_permissions:
        errors.append(f'Manager must not receive {forbidden}')

if "permissions?.has('update:any')" in orders:
    errors.append('canOrderAction must not contain the update:any shortcut')
if "canOrderAction(profile, 'update:any')" in orders:
    errors.append('canUpdateOrder must not bypass field-level checks with update:any')

can_update_match = re.search(
    r"function canUpdateOrder\(.*?\n\}",
    orders,
    flags=re.S,
)
if not can_update_match:
    errors.append('Missing canUpdateOrder function')
else:
    body = can_update_match.group(0)
    required = (
        'const fields = requestedUpdateFields(body)',
        'if (!fields.length) return true',
        'return fields.every((field) => canOrderAction(profile, `update:${field}`))',
    )
    for marker in required:
        if marker not in body:
            errors.append(f'Missing canUpdateOrder marker: {marker}')

manager_registry_match = re.search(
    r"manager: Object\.freeze\(\[(.*?)\]\),\s*accountant:",
    registry,
    flags=re.S,
)
if not manager_registry_match:
    errors.append('Missing manager browser action registry block')
else:
    manager_registry = manager_registry_match.group(1)
    if 'CRM_V4_ACTIONS.ORDERS_UPDATE' not in manager_registry:
        errors.append('Browser manager registry must include ORDERS_UPDATE')
    if 'CRM_V4_ACTIONS.FINANCE_WRITE' in manager_registry:
        errors.append('Browser manager registry must not include FINANCE_WRITE')

required_doc_markers = (
    'CRM orders manager field permissions',
    '`update:any`',
    '`update:payment_status`',
    'mixed request containing one allowed manager field and `payment_status` is denied',
    'no requests to `leader-crm-orders`',
    'production `leader-crm-orders` remains ACTIVE v2',
    'This is not complete order RBAC',
)
for marker in required_doc_markers:
    if marker not in doc:
        errors.append(f'Missing documentation marker: {marker}')

required_workflow_markers = (
    "- 'docs/CRM_ORDERS_MANAGER_FIELD_PERMISSIONS_2026-07-16.md'",
    "- 'tools/check_crm_orders_manager_field_permissions.py'",
    'python3 tools/check_crm_orders_manager_field_permissions.py',
)
for marker in required_workflow_markers:
    if marker not in workflow:
        errors.append(f'Missing workflow marker: {marker}')

for marker in ('update:status', 'update:deadline'):
    if marker not in snapshot_checker:
        errors.append(f'Missing Edge snapshot marker: {marker}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM orders manager updates use an explicit non-finance field whitelist.')
