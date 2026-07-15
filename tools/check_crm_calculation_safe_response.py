#!/usr/bin/env python3
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRODUCTION = 'ofewxuqfjhamgerwzull'
STAGING = 'otulfnouybahfnsycxqn'

FILES = {
    'base': ROOT / 'supabase/staging-migrations/20260715_02_calculation_version_harness.sql',
    'safe': ROOT / 'supabase/staging-migrations/20260715_03_calculation_version_safe_response.sql',
    'acceptance': ROOT / 'supabase/staging-tests/20260715_calculation_version_safe_response.sql',
    'edge': ROOT / 'supabase/functions/leader-crm-calculations/index.ts',
    'contract': ROOT / 'contracts/calculation-create-version-server-contract-v1.json',
    'doc': ROOT / 'docs/SUPABASE_STAGING_CALCULATION_VERSION_SAFE_RESPONSE_2026-07-15.md',
    'workflow': ROOT / '.github/workflows/crm-calculation-safe-response-check.yml',
}

errors = []
texts = {}

for name, path in FILES.items():
    if not path.exists():
        errors.append(f'Missing file: {path.relative_to(ROOT)}')
        texts[name] = ''
    else:
        texts[name] = path.read_text(encoding='utf-8')


def require(name, markers):
    text = texts.get(name, '')
    for marker in markers:
        if marker not in text:
            errors.append(f'{name}: missing marker {marker!r}')


safe = texts['safe']
acceptance = texts['acceptance']
edge = texts['edge']
doc = texts['doc']

if PRODUCTION in safe or PRODUCTION in acceptance:
    errors.append('Safe-response staging SQL must not contain production project ref')
if STAGING not in safe or STAGING not in acceptance:
    errors.append('Safe-response SQL must contain exact staging project ref')

require('safe', [
    '-- STAGING ONLY.',
    'leader_staging.environment_guard',
    "project_ref = 'otulfnouybahfnsycxqn'",
    "repository = 'deputat36/lider-bsk'",
    "to_regprocedure('public.leader_create_calculation_version_rpc(jsonb)')",
    "to_regprocedure('leader_private.leader_create_calculation_version_rpc_internal_v1(jsonb)')",
    'rename to leader_create_calculation_version_rpc_internal_v1',
    'set schema leader_private',
    'security invoker',
    "set search_path = ''",
    'leader_private.leader_create_calculation_version_rpc_internal_v1(p_payload)',
    "'calculation', v_calculation",
    "'items', v_items",
    "update leader_private.leader_command_receipts",
    "where action = 'calculation.create_version'",
    "state = 'success'",
    'revoke all on function public.leader_create_calculation_version_rpc(jsonb) from anon',
    'revoke all on function public.leader_create_calculation_version_rpc(jsonb) from authenticated',
    'grant execute on function public.leader_create_calculation_version_rpc(jsonb) to service_role',
    'grant execute on function leader_private.leader_create_calculation_version_rpc_internal_v1(jsonb) to service_role',
])

for marker in [
    "'created_by'",
    "'updated_by'",
    "'commercial_offer_id'",
    "'order_id'",
    "'calculation_id'",
]:
    if re.search(r"jsonb_build_object\([\s\S]*?" + re.escape(marker), safe):
        errors.append(f'Safe public projection contains forbidden field marker: {marker}')

if 'to_jsonb(v_new_calculation)' in safe or 'to_jsonb(item_row)' in safe:
    errors.append('Safe wrapper must not use whole-row to_jsonb projection')
if 'security definer' in safe.lower():
    errors.append('Safe wrapper and internal function must remain SECURITY INVOKER')

calculation_fields = [
    'id', 'lead_id', 'need_id', 'client_id', 'title', 'status', 'version_number',
    'client_total', 'contractor_cost', 'profit', 'margin_percent', 'warning_level',
    'warnings', 'public_comment', 'internal_comment', 'created_at', 'updated_at',
]
item_fields = [
    'id', 'catalog_id', 'category', 'item_type', 'name', 'unit', 'qty',
    'contractor_price', 'contractor_sum', 'markup_percent', 'client_price',
    'client_sum', 'profit', 'margin_percent', 'comment', 'data', 'sort_order',
    'created_at', 'updated_at',
]
for field in calculation_fields:
    if f"'{field}', v_raw #> '{{calculation,{field}}}'" not in safe and field != 'warnings':
        errors.append(f'Safe calculation projection missing explicit field: {field}')
if "'warnings', coalesce(v_raw #> '{calculation,warnings}', '[]'::jsonb)" not in safe:
    errors.append('Safe calculation projection missing explicit warnings fallback')
for field in item_fields:
    expected = f"'{field}', item -> '{field}'"
    if field == 'data':
        expected = "'data', coalesce(item -> 'data', '{}'::jsonb)"
    if expected not in safe:
        errors.append(f'Safe item projection missing explicit field: {field}')

require('acceptance', [
    '-- STAGING ONLY acceptance script for the public safe-response wrapper.',
    'calculation_response_projection_drifted',
    'item_response_projection_drifted',
    'calculation_server_owned_fields_leaked',
    'item_parent_identifiers_leaked',
    'receipt_did_not_store_safe_response',
    'safe_response_replay_failed',
    'browser_execute_privilege_leaked',
    'service_role_execute_privilege_missing',
    'rollback;',
])

require('edge', [
    '/rest/v1/rpc/leader_create_calculation_version_rpc',
    'result.idempotent_replay === true ? 200 : 201',
])
if 'leader_create_calculation_version_rpc_internal_v1' in edge:
    errors.append('Edge Function must never call the private persistence implementation')

require('doc', [
    'to_jsonb(v_new_calculation)',
    'to_jsonb(item_row)',
    '20260715_03_calculation_version_safe_response.sql',
    'leader_create_calculation_version_rpc_internal_v1',
    'SECURITY INVOKER',
    'safe projection',
    'migration 02 ещё не применялась',
    'Между шагами 1 и 2 Edge Function не должна быть развёрнута',
])

require('workflow', [
    'python3 -m py_compile tools/check_crm_calculation_safe_response.py',
    'python3 tools/check_crm_calculation_safe_response.py',
])

for label in ('safe', 'acceptance', 'edge', 'doc', 'workflow'):
    text = texts[label]
    if re.search(r'sb_secret_[A-Za-z0-9_-]{10,}', text):
        errors.append(f'{label} contains possible secret material')
    if re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}', text):
        errors.append(f'{label} contains possible JWT material')

for forbidden_prefix in ('nav_', 'parket_', 'broker_'):
    if forbidden_prefix in safe or forbidden_prefix in acceptance:
        errors.append(f'Safe-response scope entered forbidden object prefix: {forbidden_prefix}')

if errors:
    print('CRM calculation safe-response checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('Calculation RPC safe response is explicit, private-backed, receipt-minimized and staging-only.')
