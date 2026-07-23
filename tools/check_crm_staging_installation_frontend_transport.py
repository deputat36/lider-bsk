#!/usr/bin/env python3
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    'config': ROOT / 'crm/v4/assets/v4/config.js',
    'route': ROOT / 'crm/v4/assets/v4/installation-job-save-route-v1.js',
    'write_transport': ROOT / 'crm/v4/assets/v4/installation-job-staging-transport-v1.js',
    'read_transport': ROOT / 'crm/v4/assets/v4/installation-job-staging-read-transport-v1.js',
    'card': ROOT / 'crm/v4/assets/v4/installation-job-card-v2.js',
    'contract': ROOT / 'contracts/crm-staging-installation-frontend-transport-v1.json',
    'runtime_contract': ROOT / 'contracts/crm-staging-installation-runtime-smoke-v1.json',
    'ui_contract': ROOT / 'contracts/crm-staging-installation-ui-smoke-v1.json',
    'doc': ROOT / 'docs/CRM_STAGING_INSTALLATION_FRONTEND_TRANSPORT_V1_2026-07-22.md',
    'route_test': ROOT / 'tools/test_installation_job_save_route.mjs',
    'write_test': ROOT / 'tools/test_installation_job_staging_transport.mjs',
    'read_test': ROOT / 'tools/test_installation_job_staging_read_transport.mjs',
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


def require(name, markers):
    for marker in markers:
        if marker not in texts.get(name, ''):
            errors.append(f'{name}: missing marker {marker!r}')


require('config', [
    "supabaseUrl: 'https://ofewxuqfjhamgerwzull.supabase.co'",
    "authStorageKey: 'leader_crm_v4_main_session'",
])
require('route', [
    "mode: 'staging_edge'", "mode: 'production_locked'",
    'browserDirectWrite: false', "reason: 'production_backend_not_deployed'",
    'отдельного production rollout', 'createInstallationJobIdempotencyKey',
])
require('write_transport', [
    "const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'",
    "const ACTION = 'installation_job.update'", "const PERMISSION = 'installation.write'",
    'client.auth.getSession()', 'client.functions.invoke(FUNCTION_SLUG, { body: command })',
    'const exactExpectedUpdatedAt = text(expectedUpdatedAt)',
    'expected_updated_at: exactExpectedUpdatedAt',
    'idempotency_key', 'patch_field_not_allowed',
])
if "expected_updated_at: new Date(expectedUpdatedAt).toISOString()" in texts['write_transport']:
    errors.append('write transport must not truncate PostgreSQL microseconds')
require('read_transport', [
    "const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'",
    "const ACTION = 'installation_job.read'", "const PERMISSION = 'installation.read'",
    'client.auth.getSession()', 'client.functions.invoke(FUNCTION_SLUG, { body: command })',
    'installationReadBundle', 'source?.entity',
    'hostname.toLowerCase() === STAGING_HOSTNAME',
])

for name in ['write_transport', 'read_transport']:
    for forbidden in ['.from(', '.insert(', '.update(', '.delete(', '.upsert(', '.rpc(', 'SUPABASE_SERVICE_ROLE_KEY']:
        if forbidden in texts.get(name, ''):
            errors.append(f'{name} contains forbidden browser persistence/secret marker: {forbidden}')

card = texts.get('card', '')
require('card', [
    "from './config.js'",
    "from './installation-job-save-route-v1.js'",
    "from './installation-job-staging-transport-v1.js'",
    "from './installation-job-staging-read-transport-v1.js'",
    'installationJobPersistenceRoute(V4_CONFIG.supabaseUrl)',
    'invokeStagingInstallationJobRead({', 'invokeStagingInstallationJob({',
    'expectedUpdatedAt: old.updated_at',
    'idempotencyKey: createInstallationJobIdempotencyKey(jobId)',
    'readAfterSuccess: () => fetchBundle(jobId)',
    'commentsSection = isStaging',
    'В staging комментарии доступны только для чтения',
    'data-installation-staging-edge',
    ".from('leader_installation_jobs').update(patch)",
    ".from('leader_orders').update(",
    ".from('leader_installation_events').insert(",
])

read_branch = card.find('if (stagingEdgeEnabled()) {')
first_direct_read = card.find("supabaseClient.from('leader_installation_jobs').select(jobFields())")
if read_branch < 0 or first_direct_read < 0 or read_branch > first_direct_read:
    errors.append('card must choose staging Edge read before direct browser read')

save_function = card.find('async function saveJob(jobId)')
staging_write = card.find('if (stagingEdgeEnabled()) {', save_function)
direct_write = card.find("supabaseClient.from('leader_installation_jobs').update(patch)", save_function)
if save_function < 0 or staging_write < 0 or direct_write < 0 or staging_write > direct_write:
    errors.append('card must choose staging Edge update before production direct write fallback')

edge_start = card.find('const edgePatch = {', save_function)
edge_end = card.find('\n    };', edge_start)
if edge_start < 0 or edge_end < 0:
    errors.append('card edgePatch block missing')
else:
    edge_patch = card[edge_start:edge_end]
    for forbidden in ['updated_by', 'updated_at', 'started_at', 'completed_at', 'accepted_at', 'event_type', 'created_by']:
        if forbidden in edge_patch:
            errors.append(f'edgePatch contains server-owned field: {forbidden}')

if 'const patch = {\n      ...edgePatch,' not in card:
    errors.append('production fallback must extend edgePatch separately')
if 'updated_by: v4State.user?.id || null' not in card:
    errors.append('production fallback updated_by compatibility drifted')
if 'installationStatusTimestampPatch(transition, old, nowIso())' not in card:
    errors.append('production fallback status timestamp compatibility drifted')

try:
    contract = json.loads(texts.get('contract', '{}'))
    ui_contract = json.loads(texts.get('ui_contract', '{}'))
except json.JSONDecodeError as exc:
    errors.append(f'Invalid contract JSON: {exc}')
    contract, ui_contract = {}, {}

if contract.get('version') != 3:
    errors.append('contract version must be 3')
if contract.get('status') != 'exact_staging_read_write_browser_smoke_completed_production_unchanged':
    errors.append('contract status drifted')
environment = contract.get('environment', {})
if environment.get('allowed_hostname') != 'otulfnouybahfnsycxqn.supabase.co':
    errors.append('exact staging hostname drifted')
if environment.get('production_edge_route') != 'production_locked':
    errors.append('production Edge route must remain locked')
if environment.get('production_existing_browser_path_preserved') is not True:
    errors.append('production existing browser path must remain preserved')
edge = contract.get('edge', {})
if edge.get('version') != 2 or edge.get('verify_jwt') is not True:
    errors.append('Edge v2/verify_jwt contract drifted')
if edge.get('runtime_user_jwt_smoke_completed') is not True or edge.get('authenticated_browser_ui_smoke_completed') is not True:
    errors.append('runtime and browser smoke must be completed')
write_contract = contract.get('write_transport', {})
if write_contract.get('expected_updated_at_precision') != 'preserve_exact_postgresql_string':
    errors.append('optimistic timestamp precision contract drifted')
if write_contract.get('timestamp_normalization_for_optimistic_lock') is not False:
    errors.append('optimistic timestamp normalization must remain false')
frontend = contract.get('frontend', {})
if frontend.get('source_wired_to_card') is not True:
    errors.append('contract must state source is wired to card')
if frontend.get('staging_read_path') != 'single_edge_action':
    errors.append('staging read path must be a single Edge action')
if frontend.get('staging_write_path') != 'single_atomic_edge_action':
    errors.append('staging write path must be a single atomic Edge action')
if frontend.get('production_browser_behavior_changed') is not False:
    errors.append('production browser behavior must remain unchanged')
ui_smoke = contract.get('authenticated_ui_smoke', {})
for key in ['completed', 'real_card', 'real_headless_chrome', 'authenticated', 'edge_notice', 'privacy_projection', 'comments_read_only', 'single_mutation', 'server_read_back', 'title_changed', 'cleanup_completed']:
    if ui_smoke.get(key) is not True:
        errors.append(f'authenticated_ui_smoke.{key} must be true')
if ui_smoke.get('workflow_run_id') != 29956544804:
    errors.append('authenticated UI workflow run drifted')
production = contract.get('production_boundary', {})
for key in ['production_supabase_changed', 'production_frontend_switch', 'production_edge_deploy', 'production_data_changed', 'nav_changed']:
    if production.get(key) is not False:
        errors.append(f'production boundary must keep {key}=false')

if ui_contract.get('status') != 'completed_clean' or ui_contract.get('runtime', {}).get('mutation_count') != 1:
    errors.append('UI smoke evidence must be completed with one mutation')
if ui_contract.get('cleanup_postflight', {}).get('auth_users') != 0:
    errors.append('UI smoke evidence must confirm Auth cleanup')

require('runtime_contract', [
    '"status": "completed_clean"',
    '"real_user_jwt_used": true',
    '"runtime_gate_completed": true',
    '"auth_users": 0',
    '"command_receipts": 0',
])
require('route_test', [
    "mode, 'staging_edge'", "mode, 'production_locked'",
    'evil.otulfnouybahfnsycxqn.supabase.co',
    'Installation job save route tests passed.',
])
require('write_test', [
    '2026-07-21T20:00:00.123456+00:00',
    'command.expected_updated_at, expectedUpdatedAt',
    'installation_job.update', 'patch_field_not_allowed',
    "kind, 'wrong_environment'", "kind, 'forbidden'",
    'Installation job staging transport tests passed.',
])
require('read_test', [
    'installation_job.read', 'installation.read',
    'evil.otulfnouybahfnsycxqn.supabase.co', 'read_bundle_invalid',
    'Installation job staging read transport tests passed.',
])
require('doc', [
    'exact staging URL', 'runtime user-JWT smoke завершён',
    'installation_job.read', 'installation_job.update',
    'микросекунд', 'authenticated staging UI smoke завершён',
    'Production не изменялся',
])
require('workflow', [
    'node --check crm/v4/assets/v4/installation-job-card-v2.js',
    'node --check crm/v4/assets/v4/installation-job-staging-read-transport-v1.js',
    'node tools/test_installation_job_save_route.mjs',
    'node tools/test_installation_job_staging_transport.mjs',
    'node tools/test_installation_job_staging_read_transport.mjs',
    'python3 tools/check_crm_staging_installation_frontend_transport.py',
])

if errors:
    print('\n'.join(errors), file=sys.stderr)
    raise SystemExit(1)

print('Installation card uses exact-staging Edge read/write, preserves PostgreSQL timestamp precision, passes authenticated UI smoke, and keeps production unchanged.')
