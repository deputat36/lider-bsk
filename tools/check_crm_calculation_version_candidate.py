#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRODUCTION = 'ofewxuqfjhamgerwzull'
STAGING = 'otulfnouybahfnsycxqn'

FILES = {
    'sql': ROOT / 'supabase/staging-migrations/20260715_02_calculation_version_harness.sql',
    'acceptance': ROOT / 'supabase/staging-tests/20260715_calculation_version_acceptance.sql',
    'edge': ROOT / 'supabase/functions/leader-crm-calculations/index.ts',
    'contract': ROOT / 'supabase/functions/leader-crm-calculations/contract.ts',
    'test': ROOT / 'supabase/functions/leader-crm-calculations/contract_test.ts',
    'config': ROOT / 'supabase/config.toml',
    'environment': ROOT / 'contracts/supabase-environments-v1.json',
    'action_contract': ROOT / 'contracts/calculation-create-version-server-contract-v1.json',
    'doc': ROOT / 'docs/SUPABASE_STAGING_CALCULATION_VERSION_CANDIDATE_2026-07-15.md',
    'workflow': ROOT / '.github/workflows/crm-calculation-version-candidate-check.yml',
}

errors = []
texts = {}


def read(name: str) -> str:
    path = FILES[name]
    if not path.exists():
        errors.append(f'Missing file: {path.relative_to(ROOT)}')
        return ''
    text = path.read_text(encoding='utf-8')
    texts[name] = text
    return text


def require(name: str, markers) -> None:
    text = texts.get(name, '')
    for marker in markers:
        if marker not in text:
            errors.append(f'{name}: missing marker {marker!r}')


for name in FILES:
    read(name)

sql = texts.get('sql', '')
acceptance = texts.get('acceptance', '')
edge = texts.get('edge', '')
contract = texts.get('contract', '')
test = texts.get('test', '')
config = texts.get('config', '')
doc = texts.get('doc', '')
workflow = texts.get('workflow', '')

if PRODUCTION in sql or PRODUCTION in edge or PRODUCTION in contract or PRODUCTION in test or PRODUCTION in acceptance:
    errors.append('Staging SQL, tests and Edge source must not contain the production project ref')
if STAGING not in sql or STAGING not in contract or STAGING not in acceptance:
    errors.append('Staging source must contain the exact staging project ref')
if f'project_id = "{PRODUCTION}"' not in config:
    errors.append('Standard supabase/config.toml must remain bound to production')
if f'project_id = "{STAGING}"' in config:
    errors.append('Staging ref must not replace the standard config project id')
if '[functions.leader-crm-calculations]' not in config or not re.search(r'\[functions\.leader-crm-calculations\]\s*verify_jwt\s*=\s*true', config):
    errors.append('leader-crm-calculations must require verify_jwt=true')

require('sql', [
    '-- STAGING ONLY.',
    'leader_staging.environment_guard',
    "project_ref = 'otulfnouybahfnsycxqn'",
    "repository = 'deputat36/lider-bsk'",
    "to_regclass('leader_private.leader_command_receipts')",
    'create table if not exists public.leader_lead_calculations',
    'create table if not exists public.leader_lead_calculation_items',
    'leader_lead_calculations_lead_version_uidx',
    'on public.leader_lead_calculations (lead_id, version_number)',
    'enable row level security',
    'revoke all on table public.leader_lead_calculations from public, anon, authenticated',
    'grant select, insert on table public.leader_lead_calculations to service_role',
    'grant select, insert on table public.leader_lead_calculation_items to service_role',
    'create or replace function public.leader_create_calculation_version_rpc(p_payload jsonb)',
    'security invoker',
    "set search_path = ''",
    "v_action <> 'calculation.create_version'",
    'extensions.digest',
    'pg_advisory_xact_lock',
    "v_action || ':receipt:' || v_idempotency_key",
    "v_action || ':lead:' || v_source.lead_id::text",
    'for update',
    'v_source.updated_at <> v_expected_updated_at',
    "'duplicate_version_inventory'",
    'coalesce(max(version_number), 0) + 1',
    "'Черновик'",
    "'in_progress'",
    "state = 'success'",
    'commercial_offer_id,',
    'order_id,',
    'grant execute on function public.leader_create_calculation_version_rpc(jsonb) to service_role',
])

for forbidden in [
    'grant update on table public.leader_lead_calculations',
    'grant delete on table public.leader_lead_calculations',
    'grant select, insert, update on table public.leader_lead_calculations',
    'grant all on table public.leader_lead_calculations',
    'update public.leader_lead_calculations',
    'delete from public.leader_lead_calculations',
    'update public.leader_lead_calculation_items',
    'delete from public.leader_lead_calculation_items',
    'security definer',
]:
    if forbidden in sql.lower():
        errors.append(f'SQL contains forbidden source-mutation or privilege marker: {forbidden}')

require('edge', [
    "import 'jsr:@supabase/functions-js/edge-runtime.d.ts'",
    'if (projectRef !== STAGING_PROJECT_REF)',
    "error: 'wrong_environment'",
    "if (req.method !== 'POST')",
    'contentLength > 256 * 1024',
    '/auth/v1/user',
    'leader_user_profiles?user_id=eq.',
    '&is_active=eq.true',
    'if (!canWriteCalculation(profileResult.profile.role))',
    'permission: CALCULATION_PERMISSION',
    'validateCalculationRequest(input)',
    '/rest/v1/rpc/leader_create_calculation_version_rpc',
    'actor_id: checked.user.id',
    'actor_email: checked.user.email',
    'request: validation.request',
    "error: { code: 'calculation_version_create_failed'",
    'result.idempotent_replay === true ? 200 : 201',
])

for forbidden in [
    '/rest/v1/leader_lead_calculations',
    '/rest/v1/leader_lead_calculation_items',
    '/rest/v1/leader_command_receipts',
    "method: 'PATCH'",
    "method: 'DELETE'",
    'details: await',
]:
    if forbidden in edge:
        errors.append(f'Edge contains forbidden direct-write/detail marker: {forbidden}')

require('contract', [
    "CALCULATION_ACTION = 'calculation.create_version'",
    "CALCULATION_PERMISSION = 'calculation.write'",
    "STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'",
    'MAX_CALCULATION_ITEMS = 200',
    "'owner'", "'admin'", "'manager'",
    "'action'", "'request_id'", "'expected_updated_at'", "'payload'",
    "'source_calculation_id'", "'idempotency_key'", "'items'",
    "'catalog_id'", "'category'", "'item_type'", "'name'", "'unit'",
    "'qty'", "'contractor_price'", "'client_price'", "'comment'", "'data'", "'sort_order'",
    'contains unknown or server-owned fields',
    "case 'source_changed':",
    "case 'idempotency_conflict':",
    "case 'duplicate_version_inventory':",
])

allowed_block = re.search(r'CALCULATION_WRITE_ROLES\s*=.*?\]\)\)', contract, re.S)
if not allowed_block:
    errors.append('Canonical calculation-write allow set was not found')
elif any(role in allowed_block.group(0) for role in ("'designer'", "'accountant'", "'installer'", "'contractor'", "'production'")):
    errors.append('Non-canonical role entered the calculation-write allow set')

require('test', [
    'canonical calculation-write roles are allowed',
    "['owner', 'admin', 'manager']",
    'server-owned envelope and payload fields are rejected',
    'server-derived item fields are rejected',
    'empty and oversized item lists are rejected',
    'RPC error codes map to stable HTTP statuses',
    "rpcStatus('duplicate_version_inventory') === 409",
])

require('acceptance', [
    '-- STAGING ONLY acceptance script.',
    'begin;',
    'leader_staging.environment_guard',
    'leader_create_calculation_version_rpc',
    'source_calculation_was_modified',
    'idempotent_replay_failed',
    'idempotency_conflict_not_detected',
    'negative_profit_not_rejected',
    'failed_commands_created_extra_versions',
    'success_receipt_missing',
    'rollback;',
])

require('doc', [
    PRODUCTION,
    STAGING,
    'source-only',
    '11 сохранённых расчётов',
    '30 сохранённых строк',
    'две записи имеют номер версии 1',
    'verify_jwt=true',
    'RPC execute разрешён только `service_role`',
    'max(version_number) + 1',
    'FOR UPDATE',
    'leader_command_receipts',
    'production remediation',
    'Ни один из этих шагов текущий PR не выполняет',
])

try:
    environment = json.loads(texts.get('environment', '{}'))
    action_contract = json.loads(texts.get('action_contract', '{}'))
except json.JSONDecodeError as exc:
    errors.append(f'Invalid JSON contract: {exc}')
    environment = {}
    action_contract = {}

if environment.get('environments', {}).get('production', {}).get('project_id') != PRODUCTION:
    errors.append('Environment registry production ref drifted')
if environment.get('environments', {}).get('staging', {}).get('project_id') != STAGING:
    errors.append('Environment registry staging ref drifted')
if action_contract.get('action') != 'calculation.create_version':
    errors.append('Action contract drifted from calculation.create_version')
if action_contract.get('status') != 'source_only_candidate':
    errors.append('Action contract must remain source_only_candidate')

require('workflow', [
    'denoland/setup-deno@v2',
    'deno check supabase/functions/leader-crm-calculations/index.ts',
    'deno test supabase/functions/leader-crm-calculations/contract_test.ts',
    'python3 -m py_compile tools/check_crm_calculation_version_candidate.py',
    'python3 tools/check_crm_calculation_version_candidate.py',
])

for label in ('sql', 'acceptance', 'edge', 'contract', 'test', 'config', 'doc', 'workflow'):
    text = texts.get(label, '')
    if re.search(r'sb_secret_[A-Za-z0-9_-]{10,}', text) or re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}', text):
        errors.append(f'{label} contains possible secret material')

for forbidden_prefix in ('nav_', 'parket_', 'broker_'):
    if forbidden_prefix in sql or forbidden_prefix in edge or forbidden_prefix in contract:
        errors.append(f'Calculation candidate entered forbidden object scope: {forbidden_prefix}')

if errors:
    print('CRM calculation version candidate checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('Calculation create-version candidate is staging-locked, JWT-protected, RPC-only, atomic and source-only.')
