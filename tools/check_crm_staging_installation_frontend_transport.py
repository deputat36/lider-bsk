#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGING = 'otulfnouybahfnsycxqn'
PRODUCTION = 'ofewxuqfjhamgerwzull'
READ_MD5 = '01e91816d4f3a6a1bea2d6cbe760011f'
WRITE_MD5 = '0ed4669197dac1f2695d0eec54e1'
EDGE_SHA = '24183605aad2c5cfcc84ebe14c348dcfce1b68de41a43dcfb973f65cef8cb369'

FILES = {
    'config': ROOT / 'crm/v4/assets/v4/config.js',
    'production_index': ROOT / 'crm/v4/index.html',
    'staging_page': ROOT / 'crm/v4/staging-installation.html',
    'harness': ROOT / 'crm/v4/assets/v4/staging-installation-harness-v1.js',
    'route': ROOT / 'crm/v4/assets/v4/installation-job-save-route-v1.js',
    'transport': ROOT / 'crm/v4/assets/v4/installation-job-staging-transport-v1.js',
    'staging_card': ROOT / 'crm/v4/assets/v4/installation-job-staging-card-v1.js',
    'production_card': ROOT / 'crm/v4/assets/v4/installation-job-card-v2.js',
    'migration': ROOT / 'supabase/staging-migrations/20260722_05_installation_read_capabilities.sql',
    'acceptance': ROOT / 'supabase/staging-tests/20260722_installation_frontend_wiring_acceptance.sql',
    'contract': ROOT / 'contracts/crm-staging-installation-frontend-transport-v1.json',
    'runtime': ROOT / 'contracts/crm-staging-installation-runtime-smoke-v1.json',
    'doc': ROOT / 'docs/CRM_STAGING_INSTALLATION_FRONTEND_TRANSPORT_V1_2026-07-22.md',
    'route_test': ROOT / 'tools/test_installation_job_save_route.mjs',
    'transport_test': ROOT / 'tools/test_installation_job_staging_transport.mjs',
    'config_test': ROOT / 'tools/test_crm_v4_config_routes.mjs',
    'card_test': ROOT / 'tools/test_installation_job_staging_card_contract.mjs',
    'workflow': ROOT / '.github/workflows/crm-staging-installation-frontend-transport-check.yml',
}

errors = []
texts = {}
for name, path in FILES.items():
    if not path.is_file():
        errors.append(f'Missing file: {path.relative_to(ROOT)}')
        texts[name] = ''
    else:
        texts[name] = path.read_text(encoding='utf-8')


def require(name, *markers):
    for marker in markers:
        if marker not in texts.get(name, ''):
            errors.append(f'{name}: missing marker {marker!r}')


require('config',
    "environment: 'production'",
    f"supabaseUrl: 'https://{PRODUCTION}.supabase.co'",
    "authStorageKey: 'leader_crm_v4_main_session'",
    "environment: 'staging_installation'",
    f"supabaseUrl: 'https://{STAGING}.supabase.co'",
    "authStorageKey: 'leader_crm_v4_staging_installation_session'",
    "'/lider-bsk/crm/v4/staging-installation.html'",
    "'/crm/v4/staging-installation.html'",
    "'deputat36.github.io'",
    'isV4StagingInstallationPage',
    'resolveV4Config')

require('staging_page',
    'noindex,nofollow,noarchive',
    'ИЗОЛИРОВАННЫЙ STAGING',
    'Не используйте реальные данные',
    'stagingLoginForm',
    'stagingJobId',
    'stagingInstallationCardHost',
    'staging-installation-harness-v1.js')

require('harness',
    'isV4StagingInstallationPage',
    "V4_CONFIG.environment === 'staging_installation'",
    "leader_crm_v4_staging_installation_session",
    'supabaseClient.auth.getSession()',
    'supabaseClient.auth.signInWithPassword',
    "supabaseClient.auth.signOut({ scope: 'local' })",
    'openStagingInstallationJobCard',
    'Сетевые запросы не выполнялись')

require('route',
    "mode: 'staging_edge'",
    'atomic: true',
    'browserDirectWrite: false',
    "mode: 'production_legacy'",
    "reason: 'existing_production_path'",
    'atomic: false',
    'browserDirectWrite: true',
    'createInstallationJobIdempotencyKey')

require('transport',
    f"const STAGING_PROJECT_REF = '{STAGING}'",
    "const FUNCTION_SLUG = 'leader-crm-installation'",
    "const READ_ACTION = 'installation_job.read'",
    "const READ_PERMISSION = 'installation.read'",
    "const UPDATE_ACTION = 'installation_job.update'",
    "const UPDATE_PERMISSION = 'installation.write'",
    'installationStagingReadAvailability',
    'buildStagingInstallationJobReadCommand',
    'invokeStagingInstallationJobRead',
    'invokeStagingInstallationJob',
    'client.auth.getSession()',
    'client.functions.invoke(FUNCTION_SLUG, { body: command })',
    'expected_updated_at',
    'idempotency_key',
    'patch_field_not_allowed',
    'invalid_read_projection')

require('staging_card',
    'invokeStagingInstallationJobRead',
    'invokeStagingInstallationJob',
    'capabilities?.can_write === true',
    'expectedUpdatedAt: old.updated_at',
    'createInstallationJobIdempotencyKey',
    'readAfterSuccess: async () => await readBundle(jobId)',
    'Внутренние комментарии не читаются и не создаются',
    'production_legacy')

for name in ('harness', 'transport', 'staging_card'):
    for forbidden in ('.from(', '.insert(', '.update(', '.delete(', '.upsert(', '.rpc(',
                      'service_role', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEYS'):
        if forbidden in texts.get(name, ''):
            errors.append(f'{name}: forbidden browser persistence/secret marker {forbidden!r}')

for forbidden in ('client_name', 'client_phone', 'installer_cost', 'client_price', 'internal_comment'):
    if forbidden in texts.get('staging_card', ''):
        errors.append(f'staging_card: forbidden sensitive field marker {forbidden!r}')

if 'staging-installation-harness-v1.js' in texts['production_index'] or 'installation-job-staging-card-v1.js' in texts['production_index']:
    errors.append('production index must not import staging UI modules')
if 'invokeStagingInstallationJob' in texts['production_card'] or 'installation-job-staging-transport-v1.js' in texts['production_card']:
    errors.append('production card must remain disconnected from staging transport')
require('production_card',
    ".from('leader_installation_jobs').update(patch)",
    ".from('leader_orders').update(",
    ".from('leader_installation_events').insert(")

require('migration',
    '-- STAGING ONLY.',
    '20260722194950',
    'staging_installation_read_capabilities_20260722',
    f"project_ref = '{STAGING}'",
    "'capabilities', jsonb_build_object(",
    "'can_read', true",
    "'can_write', leader_private.leader_actor_has_crm_action(p_actor_id, 'installation.write')",
    "'installation_status', o.installation_status",
    'security invoker',
    "set search_path = ''",
    'revoke all on function public.leader_read_installation_job_rpc(uuid, uuid) from public, anon, authenticated',
    'grant execute on function public.leader_read_installation_job_rpc(uuid, uuid) to service_role')

require('acceptance',
    'manager_capability_projection_failed',
    'installer_capability_projection_failed',
    'accountant_permission_failed',
    'capability_projection_sensitive_marker_leaked',
    'capability_projection_identity_leaked',
    'installation_read_browser_execute_must_be_closed',
    'rollback;')
if not texts['acceptance'].lower().rstrip().endswith('rollback;'):
    errors.append('acceptance must end with ROLLBACK')
if 'commit;' in texts['acceptance'].lower():
    errors.append('acceptance must not contain COMMIT')

try:
    contract = json.loads(texts.get('contract', '{}'))
    runtime = json.loads(texts.get('runtime', '{}'))
except json.JSONDecodeError as exc:
    errors.append(f'Invalid contract JSON: {exc}')
    contract, runtime = {}, {}

for key, value in {
    'contract': 'crm-staging-installation-frontend-transport',
    'version': 2,
    'issue': 439,
    'status': 'wired_on_isolated_staging_page_production_legacy_unchanged',
}.items():
    if contract.get(key) != value:
        errors.append(f'contract: {key} must equal {value!r}')

environment = contract.get('environment', {})
for key, value in {
    'staging_project_ref': STAGING,
    'production_project_ref': PRODUCTION,
    'staging_page': 'crm/v4/staging-installation.html',
    'production_page': 'crm/v4/index.html',
    'production_route': 'production_legacy',
    'staging_session_storage': 'leader_crm_v4_staging_installation_session',
    'production_session_storage': 'leader_crm_v4_main_session',
}.items():
    if environment.get(key) != value:
        errors.append(f'contract.environment: {key} drifted')

database = contract.get('database', {})
if database.get('migration_version') != '20260722194950':
    errors.append('contract.database: migration version drifted')
if (database.get('read_rpc_md5'), database.get('read_rpc_bytes')) != (READ_MD5, 5599):
    errors.append('contract.database: read RPC fingerprint drifted')
if (database.get('write_rpc_md5'), database.get('write_rpc_bytes')) != (WRITE_MD5, 19061):
    errors.append('contract.database: write RPC fingerprint drifted')
for key in ('security_invoker', 'empty_search_path', 'service_role_execute'):
    if database.get(key) is not True:
        errors.append(f'contract.database: {key} must be true')
if database.get('browser_execute') is not False:
    errors.append('contract.database: browser_execute must be false')

transport = contract.get('transport', {})
if transport.get('function_slug') != 'leader-crm-installation' or transport.get('edge_sha256') != EDGE_SHA:
    errors.append('contract.transport: Edge deployment drifted')
for key in ('atomic_update', 'requires_current_user_session', 'requires_expected_updated_at',
            'requires_idempotency_key', 'requires_request_id', 'read_after_success_through_edge'):
    if transport.get(key) is not True:
        errors.append(f'contract.transport: {key} must be true')
for key in ('browser_direct_read_on_staging', 'browser_direct_write_on_staging', 'service_role_in_browser'):
    if transport.get(key) is not False:
        errors.append(f'contract.transport: {key} must be false')

frontend = contract.get('frontend', {})
for key in ('source_wired_to_staging_card', 'server_capability_controls_save',
            'read_only_when_can_write_false', 'client_contacts_excluded',
            'financial_fields_excluded', 'production_legacy_direct_path_preserved'):
    if frontend.get(key) is not True:
        errors.append(f'contract.frontend: {key} must be true')
for key in ('internal_comment_write_available', 'production_card_modified',
            'production_index_imports_staging', 'production_browser_behavior_changed'):
    if frontend.get(key) is not False:
        errors.append(f'contract.frontend: {key} must be false')

runtime_gate = contract.get('runtime_gate', {})
if runtime_gate.get('user_jwt_smoke_completed') is not True or runtime_gate.get('isolated_staging_ui_source_wired') is not True:
    errors.append('contract.runtime_gate: API smoke and UI source wiring must be complete')
if runtime_gate.get('authenticated_browser_ui_smoke_completed') is not False:
    errors.append('contract.runtime_gate: browser UI smoke must remain false')
if runtime.get('status') != 'completed_clean':
    errors.append('runtime evidence must remain completed_clean')

postflight = contract.get('staging_postflight', {})
for key, value in postflight.items():
    if key == 'working_data_changed':
        if value is not False:
            errors.append('contract.postflight: working_data_changed must be false')
    elif value != 0:
        errors.append(f'contract.postflight: {key} must be zero')

production = contract.get('production_boundary', {})
for key in ('production_supabase_changed', 'production_frontend_switch', 'production_edge_deploy',
            'production_auth_changed', 'production_data_changed', 'production_read_rpc_exists', 'nav_changed'):
    if production.get(key) is not False:
        errors.append(f'contract.production_boundary: {key} must be false')

require('route_test',
    "mode, 'staging_edge'",
    "mode, 'production_legacy'",
    'evil.otulfnouybahfnsycxqn.supabase.co',
    'Installation job save route tests passed.')
require('transport_test',
    'installation_job.read',
    'installation_job.update',
    'invalid_read_projection',
    "kind, 'wrong_environment'",
    "kind, 'forbidden'",
    'Installation job staging read/update transport tests passed.')
require('config_test',
    'isV4StagingInstallationPage',
    '/lider-bsk/crm/v4/staging-installation.html',
    'leader_crm_v4_main_session',
    'CRM v4 exact staging config route tests passed.')
require('card_test',
    'Installation staging card isolation contract tests passed.',
    'productionIndex.includes',
    'productionCard.includes')
require('doc',
    'Staging frontend transport монтажа v2',
    'Capability projection',
    'production_legacy',
    'ручное взаимодействие в браузере',
    'Production Supabase')
require('workflow',
    'CRM staging installation frontend transport check',
    'node tools/test_installation_job_save_route.mjs',
    'node tools/test_installation_job_staging_transport.mjs',
    'node tools/test_crm_v4_config_routes.mjs',
    'node tools/test_installation_job_staging_card_contract.mjs',
    'python3 tools/check_crm_staging_installation_frontend_transport.py')

secret_patterns = (
    r'sb_secret_[A-Za-z0-9_-]{10,}',
    r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}',
)
for name in ('config', 'staging_page', 'harness', 'route', 'transport', 'staging_card', 'contract', 'doc'):
    for pattern in secret_patterns:
        if re.search(pattern, texts.get(name, '')):
            errors.append(f'{name}: possible secret/JWT material matched {pattern!r}')

if errors:
    print('CRM staging installation frontend wiring checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('Installation UI is isolated to exact staging, Edge-backed, capability-gated and production legacy remains unchanged.')
