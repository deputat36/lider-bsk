#!/usr/bin/env python3
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRODUCTION = 'ofewxuqfjhamgerwzull'
STAGING = 'otulfnouybahfnsycxqn'

FILES = {
    'install': ROOT / 'supabase/staging-migrations/20260715_04_calculation_version_install.sql',
    'grants': ROOT / 'supabase/staging-migrations/20260715_05_calculation_version_grant_hardening.sql',
    'acceptance': ROOT / 'supabase/staging-tests/20260715_calculation_version_acceptance.sql',
    'safe_acceptance': ROOT / 'supabase/staging-tests/20260715_calculation_version_safe_response.sql',
    'edge': ROOT / 'supabase/functions/leader-crm-calculations/index.ts',
    'doc': ROOT / 'docs/SUPABASE_STAGING_CALCULATION_VERSION_INSTALL_2026-07-15.md',
    'workflow': ROOT / '.github/workflows/crm-calculation-staging-install-check.yml',
}

errors = []
texts = {}
for name, path in FILES.items():
    if not path.is_file():
        errors.append(f'Missing file: {path.relative_to(ROOT)}')
        texts[name] = ''
    else:
        texts[name] = path.read_text(encoding='utf-8')


def require(name, markers):
    text = texts[name]
    for marker in markers:
        if marker not in text:
            errors.append(f'{name}: missing marker {marker!r}')


install = texts['install']
grants = texts['grants']
edge = texts['edge']
doc = texts['doc']

for label in ('install', 'grants'):
    text = texts[label]
    if PRODUCTION in text:
        errors.append(f'{label} must not contain production project ref')
    if STAGING not in text:
        errors.append(f'{label} must contain exact staging project ref')
    if 'leader_staging.environment_guard' not in text:
        errors.append(f'{label} must require environment guard')

require('install', [
    '-- Canonical first-install migration for calculation.create_version.',
    'create table if not exists public.leader_lead_calculations',
    'create table if not exists public.leader_lead_calculation_items',
    'leader_lead_calculations_lead_version_uidx',
    'alter table public.leader_lead_calculations enable row level security',
    'alter table public.leader_lead_calculation_items enable row level security',
    'create or replace function leader_private.leader_create_calculation_version_rpc_internal_v1(p_payload jsonb)',
    'create or replace function public.leader_create_calculation_version_rpc(p_payload jsonb)',
    'language plpgsql',
    'language sql',
    'security invoker',
    "set search_path = ''",
    'pg_advisory_xact_lock',
    "v_action || ':receipt:' || v_idempotency_key",
    "v_action || ':lead:' || v_source.lead_id::text",
    'for update',
    'v_source.updated_at is distinct from v_expected_updated_at',
    "'duplicate_version_inventory'",
    'coalesce(max(version_number), 0) + 1',
    "'Черновик'",
    "'in_progress'",
    "state = 'success'",
    'v_items_response := v_items_response || jsonb_build_array(jsonb_build_object(',
    'v_calculation_response := jsonb_build_object(',
    "'calculation', v_calculation_response",
    "'items', v_items_response",
    "'idempotent_replay', false",
    'select leader_private.leader_create_calculation_version_rpc_internal_v1(p_payload)',
    "notify pgrst, 'reload schema'",
])

if 'to_jsonb(v_new_calculation)' in install or 'to_jsonb(v_item_row)' in install or 'to_jsonb(item_row)' in install:
    errors.append('Canonical install must not use whole-row response projection')
if 'security definer' in install.lower():
    errors.append('Canonical install must not introduce SECURITY DEFINER')

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
    if f"'{field}', v_new_calculation.{field}" not in install:
        errors.append(f'Canonical calculation response missing field: {field}')
for field in item_fields:
    if f"'{field}', v_item_row.{field}" not in install:
        errors.append(f'Canonical item response missing field: {field}')

for forbidden_response in [
    "'created_by', v_new_calculation.created_by",
    "'updated_by', v_new_calculation.updated_by",
    "'commercial_offer_id', v_new_calculation.commercial_offer_id",
    "'order_id', v_new_calculation.order_id",
    "'calculation_id', v_item_row.calculation_id",
    "'lead_id', v_item_row.lead_id",
]:
    if forbidden_response in install:
        errors.append(f'Canonical safe response leaked field: {forbidden_response}')

require('grants', [
    'revoke all on table public.leader_lead_calculations from public, anon, authenticated, service_role',
    'revoke all on table public.leader_lead_calculation_items from public, anon, authenticated, service_role',
    'grant select, insert on table public.leader_lead_calculations to service_role',
    'grant select, insert on table public.leader_lead_calculation_items to service_role',
    "has_table_privilege('service_role', 'public.leader_lead_calculations', 'UPDATE')",
    "has_table_privilege('service_role', 'public.leader_lead_calculations', 'DELETE')",
    "has_table_privilege('service_role', 'public.leader_lead_calculation_items', 'UPDATE')",
    "has_table_privilege('service_role', 'public.leader_lead_calculation_items', 'DELETE')",
    "raise exception 'service_role_write_privilege_too_broad'",
])

for forbidden_grant in (
    'grant update on table public.leader_lead_calculations',
    'grant delete on table public.leader_lead_calculations',
    'grant all on table public.leader_lead_calculations',
    'grant update on table public.leader_lead_calculation_items',
    'grant delete on table public.leader_lead_calculation_items',
    'grant all on table public.leader_lead_calculation_items',
):
    if forbidden_grant in grants.lower():
        errors.append(f'Grant hardening contains forbidden grant: {forbidden_grant}')

require('acceptance', [
    'leader_create_calculation_version_rpc',
    'source_calculation_was_modified',
    'idempotent_replay_failed',
    'idempotency_conflict_not_detected',
    'negative_profit_not_rejected',
    'rollback;',
])
require('safe_acceptance', [
    'calculation_response_projection_drifted',
    'item_response_projection_drifted',
    'receipt_did_not_store_safe_response',
    'browser_execute_privilege_leaked',
    'service_role_execute_privilege_missing',
    'rollback;',
])

require('edge', [
    "STAGING_PROJECT_REF",
    '/rest/v1/rpc/leader_create_calculation_version_rpc',
    'validateCalculationRequest(input)',
])
if 'leader_create_calculation_version_rpc_internal_v1' in edge:
    errors.append('Edge must not call private calculation persistence function')

require('doc', [
    '20260715_04_calculation_version_install.sql',
    '20260715_05_calculation_version_grant_hardening.sql',
    'default privileges',
    'только `SELECT, INSERT`',
    'Для чистого staging применяются только',
    '20260715_02` и `20260715_03` остаются проектной историей',
    'security advisors',
    'performance advisors',
    'Production rollout остаётся отдельным approval gate',
])

require('workflow', [
    'python3 -m py_compile tools/check_crm_calculation_staging_install.py',
    'python3 tools/check_crm_calculation_staging_install.py',
])

for label, text in texts.items():
    if re.search(r'sb_secret_[A-Za-z0-9_-]{10,}', text):
        errors.append(f'{label} contains possible secret material')
    if re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}', text):
        errors.append(f'{label} contains possible JWT material')

for forbidden_prefix in ('nav_', 'parket_', 'broker_'):
    if forbidden_prefix in install or forbidden_prefix in grants:
        errors.append(f'Install scope entered forbidden prefix: {forbidden_prefix}')

if errors:
    print('CRM calculation staging-install checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('Calculation staging install is consolidated, safe-projected, least-privilege and staging-only.')
