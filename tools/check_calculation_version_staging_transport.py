#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGING = 'otulfnouybahfnsycxqn'
STAGING_HOSTNAME = f'{STAGING}.supabase.co'
PRODUCTION = 'ofewxuqfjhamgerwzull'
ACTIVE_EDGE_VERSION = 5
ACTIVE_EDGE_HASH = '4cd0bde123d6f6c052e0c5337ca01f17a0f76edfb5adf2eed1975e25e39357a4'

FILES = {
    'transport': ROOT / 'crm/v4/assets/v4/calculation-version-staging-transport-v1.js',
    'calculations': ROOT / 'crm/v4/assets/v4/calculations.js',
    'index': ROOT / 'crm/v4/index.html',
    'permissions': ROOT / 'crm/v4/assets/v4/action-permissions-v1.js',
    'config': ROOT / 'crm/v4/assets/v4/config.js',
    'supabase_config': ROOT / 'supabase/config.toml',
    'edge': ROOT / 'supabase/functions/leader-crm-calculations/index.ts',
    'edge_contract': ROOT / 'supabase/functions/leader-crm-calculations/contract.ts',
    'edge_test': ROOT / 'supabase/functions/leader-crm-calculations/contract_test.ts',
    'transport_contract': ROOT / 'contracts/calculation-version-staging-transport-v1.json',
    'server_contract': ROOT / 'contracts/calculation-create-version-server-contract-v1.json',
    'canonical_deployment': ROOT / 'contracts/crm-staging-calc-offer-canonical-permissions-v1.json',
    'test': ROOT / 'tools/test_calculation_version_staging_transport.mjs',
    'runbook': ROOT / 'docs/CRM_CALCULATION_VERSION_STAGING_TRANSPORT_RUNBOOK_2026-07-15.md',
    'workflow': ROOT / '.github/workflows/crm-calculation-version-staging-transport-check.yml',
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
            errors.append(f'{name}: forbidden marker found {marker!r}')


require('transport', [
    STAGING,
    'const STAGING_HOSTNAME = `${STAGING_PROJECT_REF}.supabase.co`',
    'hostname === STAGING_HOSTNAME ? STAGING_PROJECT_REF :',
    "FUNCTION_SLUG = 'leader-crm-calculations'",
    "ACTION = 'calculation.create_version'",
    "PERMISSION = 'calculations.write'",
    'MAX_ITEMS = 200',
    'calculationStagingTransportAvailability',
    'buildStagingCalculationVersionCommand',
    'invokeStagingCalculationVersion',
    'client.auth.getSession()',
    'client.functions.invoke(FUNCTION_SLUG, { body: command })',
    'readAfterSuccess',
    'stale_source',
    'idempotency_conflict',
    'duplicate_inventory',
    'version_conflict',
    'persistence_failed',
    'hostname: STAGING_HOSTNAME',
])
forbid('transport', [
    PRODUCTION,
    'SUPABASE_SERVICE_ROLE_KEY',
    'service_role',
    '.from(',
    '.insert(',
    '.update(',
    '.upsert(',
    '.delete(',
    '.rpc(',
    'leader_command_receipts',
])

require('permissions', [
    "CALCULATIONS_WRITE: 'calculations.write'",
    'CRM_V4_ACTIONS.CALCULATIONS_WRITE',
])
require('edge', [
    '/auth/v1/user',
    'validateCalculationRequest(input)',
    "'/rest/v1/rpc/leader_actor_has_crm_action_rpc'",
    'const permissionResult = await canonicalPermission(',
    "'/rest/v1/rpc/leader_create_calculation_version_rpc'",
])
forbid('edge', [
    'leader_user_profiles?user_id=',
    'activeProfile(',
    'canWriteCalculation',
    'CALCULATION_WRITE_ROLES',
])
require('edge_contract', [
    "CALCULATION_PERMISSION = 'calculations.write'",
    "CALCULATION_ACTION = 'calculation.create_version'",
    f"STAGING_PROJECT_REF = '{STAGING}'",
])
forbid('edge_contract', ['CALCULATION_WRITE_ROLES', 'canWriteCalculation', 'normalizeRole'])
require('edge_test', [
    "CALCULATION_PERMISSION === 'calculations.write'",
    'permission drifted from CRM_V4_ACTIONS.CALCULATIONS_WRITE',
])
forbid('edge_test', ['canWriteCalculation', 'canonical calculation-write roles are allowed'])

permission_pos = texts['edge'].find('const permissionResult = await canonicalPermission(')
business_pos = texts['edge'].find("'/rest/v1/rpc/leader_create_calculation_version_rpc'", permission_pos)
if permission_pos < 0 or business_pos < 0 or permission_pos >= business_pos:
    errors.append('Edge permission check must precede business RPC')

if 'calculation-version-staging-transport-v1.js' in texts['calculations']:
    errors.append('calculations.js must not import or wire staging transport')
if 'calculation-version-staging-transport-v1.js' in texts['index']:
    errors.append('production CRM index must not load staging transport directly')
require('calculations', [
    "supabaseClient\n        .from('leader_lead_calculations')",
    "if (event.target.closest('#saveCalculationBtn')) saveCalculation()",
])
require('config', [
    f"supabaseUrl: 'https://{PRODUCTION}.supabase.co'",
    "authStorageKey: 'leader_crm_v4_main_session'",
])
require('supabase_config', [
    f'project_id = "{PRODUCTION}"',
    '[functions.leader-crm-calculations]',
    'verify_jwt = true',
])

try:
    transport_contract = json.loads(texts['transport_contract'])
    server_contract = json.loads(texts['server_contract'])
    canonical = json.loads(texts['canonical_deployment'])
except json.JSONDecodeError as exc:
    errors.append(f'Invalid JSON contract: {exc}')
    transport_contract = server_contract = canonical = {}

if transport_contract.get('status') != 'source_wired_staging_runtime_gated_production_locked':
    errors.append('transport contract must reflect staging runtime gate and production lock')
environment = transport_contract.get('environment', {})
if environment.get('allowed_project_ref') != STAGING:
    errors.append('transport contract staging ref drifted')
if environment.get('allowed_hostname') != STAGING_HOSTNAME:
    errors.append('transport contract exact staging hostname drifted')
if environment.get('wrong_environment') != 'fail_closed_on_non_exact_hostname_before_session_or_invoke':
    errors.append('transport contract must fail closed on non-exact hostnames')
if environment.get('production_project_ref') != PRODUCTION:
    errors.append('transport contract production ref drifted')
if environment.get('production_enabled') is not False or environment.get('production_route') != 'production_locked':
    errors.append('transport contract must keep production locked')
if transport_contract.get('authorization', {}).get('permission') != 'calculations.write':
    errors.append('transport contract permission drifted')
transport_meta = transport_contract.get('transport', {})
if transport_meta.get('production_ui_wired') is not False:
    errors.append('production UI wiring must remain disabled')
if transport_meta.get('production_browser_direct_write') is not False:
    errors.append('production browser direct write must remain forbidden')
if transport_meta.get('production_compensating_delete') is not False:
    errors.append('production compensating delete must remain forbidden')

if server_contract.get('status') != 'staging_deployed_production_gated':
    errors.append('server contract status drifted')
if server_contract.get('authorization', {}).get('permission') != 'calculations.write':
    errors.append('server contract permission drifted')
if server_contract.get('authorization', {}).get('database_permission_rpc') != 'public.leader_actor_has_crm_action_rpc':
    errors.append('server contract canonical permission RPC drifted')
if server_contract.get('authorization', {}).get('local_role_allowlist') is not False:
    errors.append('server contract local role allowlist returned')
if server_contract.get('environment', {}).get('production_deployed') is not False:
    errors.append('server contract must keep production undeployed')
if server_contract.get('transport', {}).get('staging_version') != ACTIVE_EDGE_VERSION:
    errors.append('server contract active staging Edge version drifted')
if server_contract.get('transport', {}).get('staging_deployment_hash') != ACTIVE_EDGE_HASH:
    errors.append('server contract active staging Edge hash drifted')
if server_contract.get('rollback', {}).get('staging_version_2_is_not_a_valid_rollback_target') is not True:
    errors.append('server contract must keep v2 rollback forbidden')
if canonical.get('functions', {}).get('leader-crm-calculations', {}).get('version') != ACTIVE_EDGE_VERSION:
    errors.append('canonical deployment active calculation version drifted')

require('test', [
    "permission, 'calculations.write'",
    'otulfnouybahfnsycxqn.example.com',
    'evil.otulfnouybahfnsycxqn.supabase.co',
    'must fail closed',
    'production_locked',
    'forbidden field leaked',
    'contractor_price_invalid',
    'idempotency_key_invalid',
    'leader-crm-calculations',
    'idempotent_replay',
    'stale_source',
    'duplicate_inventory',
    'readAfterSuccess',
    'exact-hostname bound',
])
require('runbook', [
    STAGING,
    PRODUCTION,
    '`calculations.write`',
    'active version: `5`',
    ACTIVE_EDGE_HASH,
    'public.leader_actor_has_crm_action_rpc',
    'v4 — предпочтительный быстрый rollback',
    'staging содержит 0 Auth users',
    'authenticated HTTP E2E остаётся непроверенным',
    '`production_locked`',
])
require('workflow', [
    'node --check crm/v4/assets/v4/calculation-version-staging-transport-v1.js',
    'node tools/test_calculation_version_staging_transport.mjs',
    'deno check supabase/functions/leader-crm-calculations/index.ts',
    'deno test supabase/functions/leader-crm-calculations/contract_test.ts',
    'python3 tools/check_calculation_version_staging_transport.py',
])

secret_patterns = (
    r'sb_secret_[A-Za-z0-9_-]{10,}',
    r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}',
)
for name, source in texts.items():
    for pattern in secret_patterns:
        if re.search(pattern, source):
            errors.append(f'{name}: possible secret material')

if errors:
    print('Calculation staging transport checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('Calculation staging transport is exact-hostname locked, canonical-permission gated, production-locked and runtime-gated before Auth E2E.')
