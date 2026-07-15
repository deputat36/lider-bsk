#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGING = 'otulfnouybahfnsycxqn'
PRODUCTION = 'ofewxuqfjhamgerwzull'

FILES = {
    'transport': ROOT / 'crm/v4/assets/v4/calculation-version-staging-transport-v1.js',
    'calculations': ROOT / 'crm/v4/assets/v4/calculations.js',
    'index': ROOT / 'crm/v4/index.html',
    'permissions': ROOT / 'crm/v4/assets/v4/action-permissions-v1.js',
    'config': ROOT / 'crm/v4/assets/v4/config.js',
    'supabase_config': ROOT / 'supabase/config.toml',
    'edge_contract': ROOT / 'supabase/functions/leader-crm-calculations/contract.ts',
    'edge_test': ROOT / 'supabase/functions/leader-crm-calculations/contract_test.ts',
    'transport_contract': ROOT / 'contracts/calculation-version-staging-transport-v1.json',
    'server_contract': ROOT / 'contracts/calculation-create-version-server-contract-v1.json',
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


def require(name: str, markers: tuple[str, ...] | list[str]) -> None:
    for marker in markers:
        if marker not in texts[name]:
            errors.append(f'{name}: missing marker {marker!r}')


def forbid(name: str, markers: tuple[str, ...] | list[str]) -> None:
    for marker in markers:
        if marker in texts[name]:
            errors.append(f'{name}: forbidden marker found {marker!r}')


require('transport', [
    STAGING,
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
require('edge_contract', [
    "CALCULATION_PERMISSION = 'calculations.write'",
    "CALCULATION_ACTION = 'calculation.create_version'",
    f"STAGING_PROJECT_REF = '{STAGING}'",
])
require('edge_test', [
    "CALCULATION_PERMISSION === 'calculations.write'",
    'permission drifted from CRM_V4_ACTIONS.CALCULATIONS_WRITE',
])

if 'calculation-version-staging-transport-v1.js' in texts['calculations']:
    errors.append('calculations.js must not import or wire staging transport before authenticated E2E')
if 'calculation-version-staging-transport-v1.js' in texts['index']:
    errors.append('production CRM index must not load staging transport before authenticated E2E')
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
except json.JSONDecodeError as exc:
    errors.append(f'Invalid JSON contract: {exc}')
    transport_contract = {}
    server_contract = {}

if transport_contract.get('environment', {}).get('allowed_project_ref') != STAGING:
    errors.append('transport contract staging ref drifted')
if transport_contract.get('environment', {}).get('production_project_ref') != PRODUCTION:
    errors.append('transport contract production ref drifted')
if transport_contract.get('environment', {}).get('production_enabled') is not False:
    errors.append('transport contract must keep production disabled')
if transport_contract.get('authorization', {}).get('permission') != 'calculations.write':
    errors.append('transport contract permission drifted')
if transport_contract.get('authorization', {}).get('canonical_registry') != 'crm/v4/assets/v4/action-permissions-v1.js':
    errors.append('transport contract canonical registry drifted')
if transport_contract.get('transport', {}).get('production_ui_wired') is not False:
    errors.append('transport contract must not claim production UI wiring')
if transport_contract.get('boundaries', {}).get('staging_auth_e2e_required_before_ui_wiring') is not True:
    errors.append('transport contract must retain Auth E2E gate')

if server_contract.get('status') != 'staging_deployed_production_gated':
    errors.append('server contract status must reflect staging deployment and production gate')
if server_contract.get('authorization', {}).get('permission') != 'calculations.write':
    errors.append('server contract permission drifted')
if server_contract.get('environment', {}).get('production_deployed') is not False:
    errors.append('server contract must keep production undeployed')
if server_contract.get('transport', {}).get('production_ui_enabled') is not False:
    errors.append('server contract must keep production UI disabled')

require('test', [
    "permission, 'calculations.write'",
    'production_locked',
    'forbidden field leaked',
    'contractor_price_invalid',
    'idempotency_key_invalid',
    'leader-crm-calculations',
    'idempotent_replay',
    'stale_source',
    'duplicate_inventory',
    'readAfterSuccess',
    'production-locked, minimized and replay-safe',
])
require('runbook', [
    STAGING,
    PRODUCTION,
    '`calculations.write`',
    '0 Auth users',
    'HTTP 201',
    'HTTP 200',
    'HTTP 409',
    'HTTP 403',
    'production `calculations.js`',
    'staging Edge v2',
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

for forbidden_prefix in ('nav_', 'parket_', 'broker_'):
    if forbidden_prefix in texts['transport']:
        errors.append(f'transport entered forbidden object scope: {forbidden_prefix}')

if errors:
    print('Calculation staging transport checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('Calculation staging transport is environment-locked, canonical-permission aligned, minimized and not wired to production UI.')
