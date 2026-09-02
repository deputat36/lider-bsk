#!/usr/bin/env python3
from pathlib import Path
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
STAGING_HOSTNAME = 'otulfnouybahfnsycxqn.supabase.co'
FILES = {
    'config': ROOT / 'crm/v4/assets/v4/config.js',
    'bootstrap': ROOT / 'crm/v4/assets/v4/calculation-version-integrity-model-v1.js',
    'route': ROOT / 'crm/v4/assets/v4/calculation-version-save-route-v1.js',
    'transport': ROOT / 'crm/v4/assets/v4/calculation-version-staging-transport-v1.js',
    'transport_contract': ROOT / 'contracts/calculation-version-staging-transport-v1.json',
    'editor': ROOT / 'crm/v4/assets/v4/calculation-version-editor-v1.js',
    'route_test': ROOT / 'tools/test_calculation_version_save_route.mjs',
    'transport_test': ROOT / 'tools/test_calculation_version_staging_transport.mjs',
    'edit_doc': ROOT / 'docs/CRM_CALCULATION_EDIT_AS_NEW_VERSION_2026-07-16.md',
    'runbook': ROOT / 'docs/CRM_CALCULATION_VERSION_STAGING_TRANSPORT_RUNBOOK_2026-07-15.md',
    'inventory': ROOT / 'docs/CRM_V4_BACKEND_WRITE_INVENTORY_ADDENDUM_2026-07-10.md',
    'workflow': ROOT / '.github/workflows/crm-calculation-staging-ui-wiring-check.yml',
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
    text = texts.get(name, '')
    for marker in markers:
        if marker not in text:
            errors.append(f'{name}: missing marker {marker!r}')


require('config', [
    "supabaseUrl: 'https://ofewxuqfjhamgerwzull.supabase.co'",
    "authStorageKey: 'leader_crm_v4_main_session'",
])

require('bootstrap', [
    "import('./calculation-version-editor-v1.js?v=20260827-observer-fix-1')",
    'CRM_V4_ACTIONS.CALCULATIONS_WRITE',
])

require('route', [
    "from './calculation-version-staging-transport-v1.js?v=20260827-revision-1'",
    "mode: 'staging_edge'",
    'enabled: true',
    'atomic: true',
    'browserDirectWrite: false',
    "mode: 'production_locked'",
    'enabled: false',
    "reason: 'production_backend_not_deployed'",
    'Прямое сохранение из браузера отключено',
    'createCalculationVersionIdempotencyKey',
    'buildCalculationVersionTransportDraft',
    'calculation-version:',
])

for forbidden in [
    "mode: 'production_legacy'",
    'browserDirectWrite: true',
    'supabaseClient',
    '.from(',
    '.insert(',
    '.update(',
    '.delete(',
    'service_role',
]:
    if forbidden in texts.get('route', ''):
        errors.append(f'route model contains forbidden legacy/persistence marker: {forbidden}')

require('transport', [
    "const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'",
    'const STAGING_HOSTNAME = `${STAGING_PROJECT_REF}.supabase.co`',
    'hostname === STAGING_HOSTNAME ? STAGING_PROJECT_REF :',
    "const FUNCTION_SLUG = 'leader-crm-calculations'",
    "const ACTION = 'calculation.create_version'",
    "const PERMISSION = 'calculations.write'",
    'client.auth.getSession()',
    'client.functions.invoke(FUNCTION_SLUG, { body: command })',
    'expected_updated_at',
    'idempotency_key',
    'hostname: STAGING_HOSTNAME',
])

for forbidden in ['.from(', '.insert(', '.update(', '.delete(', '.upsert(', '.rpc(', 'service_role']:
    if forbidden in texts.get('transport', ''):
        errors.append(f'staging transport contains forbidden browser persistence: {forbidden}')

try:
    transport_contract = json.loads(texts.get('transport_contract', '{}'))
except json.JSONDecodeError as exc:
    errors.append(f'Invalid transport contract JSON: {exc}')
    transport_contract = {}
if transport_contract.get('status') != 'source_wired_staging_runtime_gated_production_locked':
    errors.append('transport contract status must include production lock')
if transport_contract.get('environment', {}).get('allowed_hostname') != STAGING_HOSTNAME:
    errors.append('transport contract exact staging hostname drifted')
if transport_contract.get('environment', {}).get('production_route') != 'production_locked':
    errors.append('transport contract must record production_locked')
if transport_contract.get('environment', {}).get('wrong_environment') != 'fail_closed_on_non_exact_hostname_before_session_or_invoke':
    errors.append('transport contract must fail closed on every non-exact hostname')
if transport_contract.get('transport', {}).get('production_browser_direct_write') is not False:
    errors.append('transport contract must forbid production browser direct writes')

require('editor', [
    "from './config.js'",
    'CRM_V4_ACTIONS.CALCULATIONS_WRITE',
    'canPerformV4Action',
    'invokeStagingCalculationVersion',
    'calculationVersionPersistenceRoute',
    'createCalculationVersionIdempotencyKey',
    'buildCalculationVersionTransportDraft',
    "data-version-persistence=\"${esc(route.mode)}\"",
    "if (!route.enabled || route.mode !== 'staging_edge')",
    'versionDraft.sourceUpdatedAt = source.updated_at',
    'async function saveVersionDraftThroughStaging',
    'readAfterSuccess: () => refreshSavedCalculations(leadId)',
    'Прямое сохранение версии из production-браузера отключено',
    'Новая версия — недоступно',
])

staging_match = re.search(
    r'async function saveVersionDraftThroughStaging\(leadId\) \{(?P<body>.*?)\n\}\n\nasync function saveVersionDraft\(',
    texts.get('editor', ''),
    re.S,
)
if not staging_match:
    errors.append('Could not isolate saveVersionDraftThroughStaging body')
else:
    staging_body = staging_match.group('body')
    for forbidden in ['.from(', '.insert(', '.update(', '.delete(', '.upsert(', '.rpc(', 'rollbackLegacyCalculation']:
        if forbidden in staging_body:
            errors.append(f'staging editor branch contains forbidden direct write: {forbidden}')
    for required in ['invokeStagingCalculationVersion', 'expectedUpdatedAt', 'idempotencyKey', 'canPerformV4Action']:
        if required not in staging_body:
            errors.append(f'staging editor branch missing {required}')

for forbidden in [
    '.insert(',
    '.update(',
    '.delete(',
    '.upsert(',
    'rollbackLegacyCalculation',
    'saveVersionDraftLegacy',
    'freshLegacyVersionPreflight',
    'production_legacy',
    'otulfnouybahfnsycxqn',
    'SUPABASE_SERVICE_ROLE_KEY',
    'service_role',
    'nav_',
    'parket_',
    'broker_',
]:
    if forbidden in texts.get('editor', ''):
        errors.append(f'editor contains forbidden production write/environment marker: {forbidden}')

require('route_test', [
    "mode, 'staging_edge'",
    "mode, 'production_locked'",
    "enabled, false",
    "browserDirectWrite, false",
    'production_backend_not_deployed',
    'otulfnouybahfnsycxqn.example.com',
    'createCalculationVersionIdempotencyKey',
    'server-row-id-must-not-pass',
    'must not enter transport payload',
    'Calculation version save route tests passed.',
])

require('transport_test', [
    'invokeStagingCalculationVersion',
    'evil.otulfnouybahfnsycxqn.supabase.co',
    'must fail closed',
    'production_locked',
    'idempotent_replay',
    'exact-hostname bound',
])

require('edit_doc', [
    'exact staging URL',
    '`staging_edge`',
    '`production_locked`',
    'browser INSERT/DELETE удалены',
    'production server action не включается',
])

require('runbook', [
    'подключён к редактору только при exact staging URL',
    'Production URL использует `production_locked`',
    'staging содержит 0 Auth users',
    'authenticated HTTP E2E остаётся непроверенным',
])

require('inventory', [
    'staging route: JWT Edge/RPC без browser writes',
    'production route: fail-closed',
    'removed from the direct-write inventory',
])

require('workflow', [
    'node --check crm/v4/assets/v4/calculation-version-save-route-v1.js',
    'node --check crm/v4/assets/v4/calculation-version-editor-v1.js',
    'node tools/test_calculation_version_save_route.mjs',
    'node tools/test_calculation_version_staging_transport.mjs',
    'python3 tools/check_calculation_version_staging_ui_wiring.py',
    'python3 tools/check_calculation_edit_as_new_version.py',
    'python3 tools/check_crm_v4_backend_write_inventory.py',
])

if errors:
    print('\n'.join(errors), file=sys.stderr)
    raise SystemExit(1)

print('Calculation version editor persists only through exact staging Edge/RPC and fails closed in production.')
