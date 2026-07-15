#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
LEADS = ROOT / 'supabase/functions/leader-crm-leads/index.ts'
ORDERS = ROOT / 'supabase/functions/leader-crm-orders/index.ts'
DOC = ROOT / 'docs/CRM_EDGE_EMPTY_UPDATE_GUARD_2026-07-15.md'
WORKFLOW = ROOT / '.github/workflows/crm-server-action-rbac-check.yml'

GUARD = "if (!Object.keys(patch).length) return json(400, { error: 'no_update_fields' })"

errors: list[str] = []


def read(path: Path) -> str:
    if not path.is_file():
        errors.append(f'Missing required file: {path.relative_to(ROOT)}')
        return ''
    return path.read_text(encoding='utf-8')


def function_body(text: str, start_marker: str, end_marker: str, label: str) -> str:
    start = text.find(start_marker)
    end = text.find(end_marker, start + len(start_marker))
    if start < 0 or end < 0:
        errors.append(f'Cannot isolate {label}')
        return ''
    return text[start:end]


def check_handler(
    source: Path,
    text: str,
    start_marker: str,
    end_marker: str,
    label: str,
    last_patch_marker: str,
    rest_marker: str,
) -> None:
    if text.count(GUARD) != 1:
        errors.append(f'{source.relative_to(ROOT)} must contain exactly one no_update_fields guard')

    body = function_body(text, start_marker, end_marker, label)
    if not body:
        return

    for marker in (
        "return json(400, { error: 'id_required' })",
        GUARD,
        last_patch_marker,
        rest_marker,
    ):
        if marker not in body:
            errors.append(f'Missing {marker!r} inside {label}')

    guard_pos = body.find(GUARD)
    patch_pos = body.find(last_patch_marker)
    rest_pos = body.find(rest_marker)
    if patch_pos >= 0 and guard_pos >= 0 and guard_pos < patch_pos:
        errors.append(f'{label} guard must run after supported patch assignments')
    if rest_pos >= 0 and guard_pos >= 0 and guard_pos > rest_pos:
        errors.append(f'{label} guard must run before service-role REST call')

    if "method: 'PATCH'" not in body:
        errors.append(f'{label} no longer contains the expected PATCH request')


leads = read(LEADS)
orders = read(ORDERS)
doc = read(DOC)
workflow = read(WORKFLOW)

check_handler(
    LEADS,
    leads,
    'async function updateLead(',
    '\nasync function ensureClient(',
    'updateLead',
    "if ('reject_reason' in body) patch.reject_reason = cleanText(body.reject_reason, 300)",
    'const res = await rest(',
)
check_handler(
    ORDERS,
    orders,
    'async function updateOrder(',
    '\nDeno.serve(',
    'updateOrder',
    "if ('deadline' in body) patch.deadline = clean(body.deadline, 40) || null",
    'const res = await rest(',
)

for source, text in ((LEADS, leads), (ORDERS, orders)):
    if "return json(400, { error: 'unknown_action' })" not in text:
        errors.append(f'Missing unknown_action fail-closed response in {source.relative_to(ROOT)}')

required_doc_markers = (
    'updateLead(...)',
    'updateOrder(...)',
    '400 no_update_fields',
    'before any request to a business table',
    'No Edge Function was deployed',
    'must not be described as completion of server-side RBAC',
)
for marker in required_doc_markers:
    if marker not in doc:
        errors.append(f'Missing documentation marker: {marker}')

required_workflow_markers = (
    "- 'tools/check_crm_edge_empty_update_guard.py'",
    "- 'docs/CRM_EDGE_EMPTY_UPDATE_GUARD_2026-07-15.md'",
    'python3 tools/check_crm_edge_empty_update_guard.py',
)
for marker in required_workflow_markers:
    if marker not in workflow:
        errors.append(f'Missing workflow marker: {marker}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM lead and order Edge sources reject empty updates before service-role PATCH.')
