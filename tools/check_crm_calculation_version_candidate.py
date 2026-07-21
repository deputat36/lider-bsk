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
    'canonical_deployment': ROOT / 'contracts/crm-staging-calc-offer-canonical-permissions-v1.json',
    'doc': ROOT / 'docs/SUPABASE_STAGING_CALCULATION_VERSION_CANDIDATE_2026-07-15.md',
    'canonical_doc': ROOT / 'docs/SUPABASE_STAGING_CALCULATION_OFFER_CANONICAL_PERMISSIONS_2026-07-21.md',
    'workflow': ROOT / '.github/workflows/crm-calculation-version-candidate-check.yml',
}

errors: list[str] = []
texts: dict[str, str] = {}

for name, path in FILES.items():
    if not path.is_file():
        errors.append(f'Missing file: {path.relative_to(ROOT)}')
        texts[name] = ''
    else:
        texts[name] = path.read_text(encoding='utf-8')


def require(name: str, markers: list[str] | tuple[str, ...]) -> None:
    for marker in markers:
        if marker not in texts[name]:
            errors.append(f'{name}: missing marker {marker!r}')


def forbid(name: str, markers: list[str] | tuple[str, ...]) -> None:
    for marker in markers:
        if marker in texts[name]:
            errors.append(f'{name}: forbidden marker {marker!r}')


sql = texts['sql']
edge = texts['edge']
contract = texts['contract']
acceptance = texts['acceptance']
config = texts['config']

if PRODUCTION in sql or PRODUCTION in edge or PRODUCTION in contract or PRODUCTION in acceptance:
    errors.append('Staging SQL, tests and Edge source must not contain production project ref')
if STAGING not in sql or STAGING not in contract or STAGING not in acceptance:
    errors.append('Staging source must contain exact staging project ref')
if f'project_id = "{PRODUCTION}"' not in config:
    errors.append('Standard supabase/config.toml must remain bound to production')
if f'project_id = "{STAGING}"' in config:
    errors.append('Staging ref must not replace standard config project id')
if not re.search(r'\[functions\.leader-crm-calculations\]\s*verify_jwt\s*=\s*true', config):
    errors.append('leader-crm-calculations must require verify_jwt=true')

require('sql', [
    '-- STAGING ONLY.',
    'leader_staging.environment_guard',
    "project_ref = 'otulfnouybahfnsycxqn'",
    "repository = 'deputat36/lider-bsk'",
    'create table if not exists public.leader_lead_calculations',
    'create table if not exists public.leader_lead_calculation_items',
    'leader_lead_calculations_lead_version_uidx',
    'create or replace function public.leader_create_calculation_version_rpc(p_payload jsonb)',
    'security invoker',
    "set search_path = ''",
    "v_action <> 'calculation.create_version'",
    'pg_advisory_xact_lock',
    'for update',
    'coalesce(max(version_number), 0) + 1',
    'grant execute on function public.leader_create_calculation_version_rpc(jsonb) to service_role',
])
forbid('sql', [
    'grant update on table public.leader_lead_calculations',
    'grant delete on table public.leader_lead_calculations',
    'update public.leader_lead_calculations',
    'delete from public.leader_lead_calculations',
    'security definer',
])

require('edge', [
    "import 'jsr:@supabase/functions-js/edge-runtime.d.ts'",
    'if (projectRef !== STAGING_PROJECT_REF)',
    "error: 'wrong_environment'",
    '/auth/v1/user',
    'validateCalculationRequest(input)',
    "'/rest/v1/rpc/leader_actor_has_crm_action_rpc'",
    'body: JSON.stringify({ p_actor_id: actorId, p_action: permission })',
    'const permissionResult = await canonicalPermission(',
    'if (!permissionResult.allowed)',
    "'/rest/v1/rpc/leader_create_calculation_version_rpc'",
    'actor_id: checked.user.id',
    'actor_email: checked.user.email',
    'request: validation.request',
    'result.idempotent_replay === true ? 200 : 201',
])
forbid('edge', [
    'leader_user_profiles?user_id=',
    'activeProfile(',
    'canWriteCalculation',
    'CALCULATION_WRITE_ROLES',
    '/rest/v1/leader_lead_calculations',
    '/rest/v1/leader_lead_calculation_items',
    "method: 'PATCH'",
    "method: 'DELETE'",
    'details: await',
])

permission_pos = edge.find('const permissionResult = await canonicalPermission(')
business_pos = edge.find("'/rest/v1/rpc/leader_create_calculation_version_rpc'", permission_pos)
if permission_pos < 0 or business_pos < 0 or permission_pos >= business_pos:
    errors.append('Canonical permission must be checked before calculation business RPC')

require('contract', [
    "CALCULATION_ACTION = 'calculation.create_version'",
    "CALCULATION_PERMISSION = 'calculations.write'",
    "STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'",
    'MAX_CALCULATION_ITEMS = 200',
    "'action'", "'request_id'", "'expected_updated_at'", "'payload'",
    "'source_calculation_id'", "'idempotency_key'", "'items'",
    'contains unknown or server-owned fields',
    "case 'duplicate_version_inventory':",
])
forbid('contract', ['CALCULATION_WRITE_ROLES', 'canWriteCalculation', 'normalizeRole'])
require('test', [
    'canonical permission matches CRM action registry',
    "CALCULATION_PERMISSION === 'calculations.write'",
    'server-owned envelope and payload fields are rejected',
    'server-derived item fields are rejected',
    'empty and oversized item lists are rejected',
    'RPC error codes map to stable HTTP statuses',
])
forbid('test', ['canonical calculation-write roles are allowed', 'canWriteCalculation'])

require('acceptance', [
    '-- STAGING ONLY acceptance script.',
    'begin;',
    'leader_staging.environment_guard',
    'leader_create_calculation_version_rpc',
    'source_calculation_was_modified',
    'idempotent_replay_failed',
    'idempotency_conflict_not_detected',
    'rollback;',
])

try:
    environment = json.loads(texts['environment'])
    action_contract = json.loads(texts['action_contract'])
    canonical = json.loads(texts['canonical_deployment'])
except json.JSONDecodeError as exc:
    errors.append(f'Invalid JSON contract: {exc}')
    environment = action_contract = canonical = {}

if environment.get('environments', {}).get('production', {}).get('project_id') != PRODUCTION:
    errors.append('Environment registry production ref drifted')
if environment.get('environments', {}).get('staging', {}).get('project_id') != STAGING:
    errors.append('Environment registry staging ref drifted')
if action_contract.get('action') != 'calculation.create_version':
    errors.append('Action contract drifted')
if action_contract.get('transport', {}).get('staging_version') != 5:
    errors.append('Active calculation staging version must be 5')
auth = action_contract.get('authorization', {})
if auth.get('permission') != 'calculations.write':
    errors.append('Action contract permission drifted')
if auth.get('database_permission_rpc') != 'public.leader_actor_has_crm_action_rpc':
    errors.append('Action contract canonical permission RPC drifted')
if auth.get('local_role_allowlist') is not False:
    errors.append('Action contract local role allowlist returned')
if action_contract.get('environment', {}).get('production_deployed') is not False:
    errors.append('Production must remain undeployed')
if canonical.get('functions', {}).get('leader-crm-calculations', {}).get('version') != 5:
    errors.append('Canonical deployment calculation version drifted')

require('canonical_doc', [
    'active version: `5`',
    '`calculations.write`',
    'public.leader_actor_has_crm_action_rpc',
    'Production rollout требует отдельного explicit approval',
])
require('workflow', [
    'denoland/setup-deno@v2',
    'deno check supabase/functions/leader-crm-calculations/index.ts',
    'deno test supabase/functions/leader-crm-calculations/contract_test.ts',
    'python3 tools/check_crm_calculation_version_candidate.py',
])

for name, text in texts.items():
    if re.search(r'sb_secret_[A-Za-z0-9_-]{10,}', text) or re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}', text):
        errors.append(f'{name} contains possible secret material')

if errors:
    print('CRM calculation version candidate checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('Calculation create-version contract is staging-deployed, JWT-protected, canonical-permission gated, atomic and production-locked.')
