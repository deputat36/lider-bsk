#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGING = 'otulfnouybahfnsycxqn'
STAGING_HOSTNAME = f'{STAGING}.supabase.co'
PRODUCTION = 'ofewxuqfjhamgerwzull'
ACTIVE_EDGE_VERSION = 3
ACTIVE_EDGE_HASH = '0df6d23cc6d8b19903babbf711bb1da765111ff1f64eb7f8e970f1bcc9760ee4'

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
require('edge_contract', [
    "CALCULATION_PERMISSION = 'calculations.write'",
    "CALCULATION_ACTION = 'calculation.create_version'",
    f"STAGING_PROJECT_REF = '{STAGING}'",
    'return CALCULATION_WRITE_ROLES.has(normalizeRole(role))',
])
require('edge_test', [
    "CALCULATION_PERMISSION === 'calculations.write'",
    'permission drifted from CRM_V4_ACTIONS.CALCULATIONS_WRITE',
])

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
except json.JSONDecodeError as exc:
    errors.append(f'Invalid JSON contract: {exc}')
    transport_contract = {}
    server_contract = {}

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
if environment.get('production_enabled') is not False:
    errors.append('transport contract must keep production disabled')
if environment.get('production_route') != 'production_locked':
    errors.append('transport contract must keep production route locked')
if transport_contract.get('authorization', {}).get('permission') != 'calculations.write':
    errors.append('transport contract permission drifted')
if transport_contract.get('authorization', {}).get('canonical_registry') != 'crm/v4/assets/v4/action-permissions-v1.js':
    errors.append('transport contract canonical registry drifted')
transport_meta = transport_contract.get('transport', {})
if transport_meta.get('editor_source_wired') is not True:
    errors.append('transport contract must record editor source wiring')
if transport_meta.get('production_ui_wired') is not False:
    errors.append('transport contract must keep production UI wiring disabled')
if transport_meta.get('production_browser_direct_write') is not False:
    errors.append('transport contract must forbid production browser direct writes')
if transport_meta.get('production_compensating_delete') is not False:
    errors.append('transport contract must forbid production compensating delete')
if transport_meta.get('staging_runtime_config_present') is not False:
    errors.append('transport contract must keep staging runtime config absent')
boundaries = transport_contract.get('boundaries', {})
if boundaries.get('source_ui_wiring_allowed_without_auth_e2e') is not True:
    errors.append('transport contract must allow fail-closed source wiring')
if boundaries.get('staging_runtime_activation_requires_auth_e2e') is not True:
    errors.append('transport contract must retain Auth E2E gate for runtime activation')
if boundaries.get('production_rollout_requires_explicit_approval') is not True:
    errors.append('transport contract must retain explicit production approval')
if boundaries.get('legacy_browser_write_may_return') is not False:
    errors.append('transport contract must forbid restoration of legacy browser writes')

if server_contract.get('status') != 'staging_deployed_production_gated':
    errors.append('server contract status must reflect staging deployment and production gate')
if server_contract.get('authorization', {}).get('permission') != 'calculations.write':
    errors.append('server contract permission drifted')
if server_contract.get('environment', {}).get('production_deployed') is not False:
    errors.append('server contract must keep production undeployed')
if server_contract.get('transport', {}).get('production_ui_enabled') is not False:
    errors.append('server contract must keep production UI disabled')
if server_contract.get('transport', {}).get('staging_version') != ACTIVE_EDGE_VERSION:
    errors.append('server contract active staging Edge version drifted')
if server_contract.get('transport', {}).get('staging_deployment_hash') != ACTIVE_EDGE_HASH:
    errors.append('server contract active staging Edge hash drifted')
if server_contract.get('rollback', {}).get('staging_version_2_is_not_a_valid_rollback_target') is not True:
    errors.append('server contract must forbid rollback to superseded v2')

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
    'active version: `3`',
    ACTIVE_EDGE_HASH,
    'Superseded v2',
    '`normalizeRole(value)`',
    '`normalizeRole(role)`',
    'не является допустимой rollback-версией',
    '0 Auth users',
    'HTTP 201',
    'HTTP 200',
    'HTTP 409',
    'HTTP 403',
    'production `calculations.js`',
    'staging Edge v3',
    'Source wiring',
    'Runtime activation',
    '`production_locked`',
    'Browser INSERT/DELETE и compensating rollback уже удалены',
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

print('Calculation staging transport is exact-hostname locked, production-locked and runtime-gated before Auth E2E.')
