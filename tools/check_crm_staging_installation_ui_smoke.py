#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    'runner': ROOT / 'tools/run_crm_staging_installation_ui_smoke.mjs',
    'test': ROOT / 'tools/test_crm_staging_installation_ui_smoke.mjs',
    'transport': ROOT / 'crm/v4/assets/v4/installation-job-staging-transport-v1.js',
    'transport_test': ROOT / 'tools/test_installation_job_staging_transport.mjs',
    'contract': ROOT / 'contracts/crm-staging-installation-ui-smoke-v1.json',
    'wiring_contract': ROOT / 'contracts/crm-staging-installation-frontend-transport-v1.json',
    'runtime_contract': ROOT / 'contracts/crm-staging-installation-runtime-smoke-v1.json',
    'doc': ROOT / 'docs/CRM_STAGING_INSTALLATION_UI_SMOKE_V1_2026-07-22.md',
    'workflow': ROOT / '.github/workflows/crm-staging-installation-ui-smoke-check.yml',
    'runtime_workflow': ROOT / '.github/workflows/crm-staging-installation-authenticated-ui-smoke-runtime.yml',
    'card': ROOT / 'crm/v4/assets/v4/installation-job-card-v2.js',
    'config': ROOT / 'crm/v4/assets/v4/config.js',
    'reconcile': ROOT / 'supabase/staging-migrations/20260722_06_installation_read_rpc_main_reconcile.sql',
    'state': ROOT / 'supabase/staging-migrations/20260722_07_installation_ui_smoke_state.sql',
    'prepare': ROOT / 'supabase/staging-migrations/20260722_08_installation_ui_smoke_prepare_rpc.sql',
    'cleanup_rpc': ROOT / 'supabase/staging-migrations/20260722_09_installation_ui_smoke_cleanup_rpc.sql',
    'inspect': ROOT / 'supabase/staging-migrations/20260722_10_installation_ui_smoke_inspect_rpc.sql',
    'harness_cleanup': ROOT / 'supabase/staging-migrations/20260722_11_installation_ui_smoke_harness_cleanup.sql',
    'oidc_runtime': ROOT / 'supabase/staging-functions/leader-staging-installation-ui-smoke-bootstrap/oidc-runtime.ts',
    'locked': ROOT / 'supabase/staging-functions/leader-staging-installation-ui-smoke-bootstrap/index.ts',
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


require('runner', [
    "export const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'",
    "export const PRODUCTION_PROJECT_REF = 'ofewxuqfjhamgerwzull'",
    "export const CONFIRMATION = 'YES_USE_EXISTING_SYNTHETIC_FIXTURES'",
    "export const EVIDENCE_VERSION = 'leader-installation-staging-ui-smoke-evidence-v1'",
    'assertExactStagingUrl',
    'staging_environment_guard_failed',
    'explicit_fixture_confirmation_required',
    "new Set(['installer', 'manager', 'admin', 'owner'])",
    'temporary_local_copy: true',
    'mutation_count_expected: 1',
    'screenshot_run_enabled: false',
    'external_fixture_lifecycle_required: true',
    "authStorageKey: 'leader_crm_v4_staging_ui_smoke_session'",
    "import './assets/v4/installation-job-card-v2.js'",
    'signInWithPassword',
    'data-installation-staging-edge',
    'data-save-installation-job',
    'server_read_back_timeout',
    'mutation_count:1',
    "signOut({scope:'local'})",
    "server.listen(0,'127.0.0.1'",
    "mkdtemp(path.join(tmpdir(),'lider-installation-ui-smoke-'))",
    "await rm(tempRoot,{recursive:true,force:true})",
    "await writeFile(path.join(tempV4,'assets','v4','config.js')",
    "'--dump-dom'",
    'headless_dom_dump:true',
    'screenshot_created:false',
])

runner = texts.get('runner', '')
for forbidden in [
    '--screenshot=', 'SUPABASE_SERVICE_ROLE_KEY', 'STAGING_SUPABASE_SECRET_KEY',
    'sb_secret_', 'service_role', 'createUser(', 'deleteUser(',
    '.from(', '.insert(', '.update(', '.delete(', '.upsert(', '.rpc(',
]:
    if forbidden in runner:
        errors.append(f'runner contains forbidden server mutation/secret marker: {forbidden}')
if runner.count("document.querySelector('[data-save-installation-job]')?.click()") != 1:
    errors.append('runner generated page must click save exactly once')
if runner.count("const dump=await runChrome(chrome") != 1:
    errors.append('runner must execute exactly one browser DOM run')
if 'screenshotPath' in runner or 'screenshotTarget' in runner:
    errors.append('runner must not contain a second screenshot execution path')

require('test', [
    'staging_environment_guard_failed',
    'explicit_fixture_confirmation_required',
    "STAGING_INSTALLATION_UI_ROLE: 'accountant'",
    'mutation_count_expected, 1',
    'screenshot_run_enabled, false',
    'synthetic-password-value',
    'mutation_count:1',
    'Installation staging UI smoke runner tests passed.',
])
require('transport', [
    'const exactExpectedUpdatedAt = text(expectedUpdatedAt)',
    'expected_updated_at: exactExpectedUpdatedAt',
])
if 'expected_updated_at: new Date(expectedUpdatedAt).toISOString()' in texts['transport']:
    errors.append('transport must preserve PostgreSQL microseconds')
require('transport_test', [
    '2026-07-21T20:00:00.123456+00:00',
    'command.expected_updated_at, expectedUpdatedAt',
])
require('card', [
    "from './installation-job-staging-read-transport-v1.js'",
    'invokeStagingInstallationJobRead({',
    'invokeStagingInstallationJob({',
    'readAfterSuccess: () => fetchBundle(jobId)',
])
require('config', [
    "supabaseUrl: 'https://ofewxuqfjhamgerwzull.supabase.co'",
    "authStorageKey: 'leader_crm_v4_main_session'",
])

try:
    contract = json.loads(texts.get('contract', '{}'))
    wiring_contract = json.loads(texts.get('wiring_contract', '{}'))
    runtime_contract = json.loads(texts.get('runtime_contract', '{}'))
except json.JSONDecodeError as exc:
    errors.append(f'Invalid contract JSON: {exc}')
    contract, wiring_contract, runtime_contract = {}, {}, {}

if contract.get('version') != 2:
    errors.append('UI smoke contract version must be 2')
if contract.get('status') != 'completed_clean':
    errors.append('UI smoke status must be completed_clean')
environment = contract.get('environment', {})
if environment.get('project_ref') != 'otulfnouybahfnsycxqn':
    errors.append('UI smoke staging project drifted')
if environment.get('production_enabled') is not False:
    errors.append('UI smoke production must remain disabled')
if environment.get('localhost_only') is not True:
    errors.append('UI smoke must remain localhost-only')

runtime = contract.get('runtime', {})
for key in [
    'all_steps_successful', 'authenticated', 'real_card_opened',
    'staging_edge_notice_visible', 'privacy_safe_projection', 'cost_fields_hidden',
    'comments_read_only', 'comment_write_control_hidden', 'update_via_edge',
    'server_read_back', 'title_changed', 'production_config_unchanged',
]:
    if runtime.get(key) is not True:
        errors.append(f'UI runtime {key} must be true')
if runtime.get('workflow_run_id') != 29956544804:
    errors.append('UI smoke workflow run ID drifted')
if runtime.get('conclusion') != 'success':
    errors.append('UI smoke conclusion must be success')
if runtime.get('mutation_count') != 1:
    errors.append('UI smoke mutation count must be 1')
if runtime.get('artifact_id') != 8544259027:
    errors.append('UI smoke artifact ID drifted')

bug = contract.get('discovered_defect', {})
if bug.get('code') != 'optimistic_timestamp_precision_loss':
    errors.append('timestamp defect evidence drifted')
for key in ['server_conflict_protection_worked', 'fixed']:
    if bug.get(key) is not True:
        errors.append(f'timestamp defect {key} must be true')
if bug.get('microsecond_example') != '2026-07-21T20:00:00.123456+00:00':
    errors.append('microsecond regression example drifted')

fixture = contract.get('oidc_fixture_lifecycle', {})
for key in [
    'workflow_id_token_permission', 'repository_claim_checked',
    'repository_id_claim_checked', 'actor_id_claim_checked',
    'branch_claim_checked', 'workflow_ref_claim_checked', 'event_claim_checked',
    'runner_environment_claim_checked', 'subject_claim_checked',
    'auth_admin_api_used', 'synthetic_fixture_only', 'cleanup_in_always_step',
]:
    if fixture.get(key) is not True:
        errors.append(f'OIDC fixture {key} must be true')
if fixture.get('github_secrets_required') is not False or fixture.get('runtime_credentials_in_repository') is not False:
    errors.append('OIDC fixture must not require or persist secrets')

bootstrap = contract.get('bootstrap', {})
for key, value in {
    'final_version': 3,
    'status': 'ACTIVE_LOCKED',
    'verify_jwt': True,
    'sha256': 'a6aff37145a1fd89fc94bfba2b8a7b27ecacf6eaa087ff6d4720f6d53b63cc7f',
    'locked_http_status': 410,
}.items():
    if bootstrap.get(key) != value:
        errors.append(f'bootstrap {key} drifted')

harness = contract.get('temporary_database_harness', {})
for key in ['state_table_removed', 'prepare_rpc_removed', 'cleanup_rpc_removed', 'inspect_rpc_removed']:
    if harness.get(key) is not True:
        errors.append(f'harness {key} must be true')
if harness.get('harness_cleanup_migration_version') != '20260722204939':
    errors.append('harness cleanup migration drifted')

for key, value in contract.get('cleanup_postflight', {}).items():
    if value != 0:
        errors.append(f'UI smoke cleanup {key} must be zero')
production = contract.get('production_boundary', {})
for key in [
    'production_supabase_changed', 'production_frontend_changed',
    'production_edge_deployed', 'production_auth_changed',
    'production_data_changed', 'nav_changed',
]:
    if production.get(key) is not False:
        errors.append(f'production boundary must keep {key}=false')

if wiring_contract.get('version') != 3:
    errors.append('frontend wiring contract v3 is required')
if wiring_contract.get('authenticated_ui_smoke', {}).get('completed') is not True:
    errors.append('frontend wiring must record completed UI smoke')
if wiring_contract.get('write_transport', {}).get('expected_updated_at_precision') != 'preserve_exact_postgresql_string':
    errors.append('frontend wiring timestamp precision drifted')
if runtime_contract.get('status') != 'completed_clean':
    errors.append('runtime JWT smoke must remain completed_clean')
if runtime_contract.get('assertions', {}).get('real_user_jwt_used') is not True:
    errors.append('runtime evidence must confirm a real user JWT')

require('reconcile', [
    '20260722202244',
    'staging_installation_read_rpc_main_reconcile_20260722',
    "project_ref = 'otulfnouybahfnsycxqn'",
    "'installation_status', o.installation_status",
])
require('state', [
    '20260722203019',
    'leader_staging.installation_ui_smoke_runs',
    'revoke all on table leader_staging.installation_ui_smoke_runs from public, anon, authenticated, service_role',
])
require('prepare', [
    '20260722203052',
    'leader_prepare_installation_ui_smoke_rpc',
    'staging_fixture_tables_not_empty',
    'SENSITIVE_UI_SMOKE_CLIENT',
    'grant execute on function public.leader_prepare_installation_ui_smoke_rpc(text,uuid,text) to service_role',
])
require('cleanup_rpc', [
    '20260722203119',
    'leader_cleanup_installation_ui_smoke_rpc',
    "delete from leader_private.leader_command_receipts",
])
require('inspect', [
    '20260722203204',
    'leader_inspect_installation_ui_smoke_rpc',
])
require('harness_cleanup', [
    '20260722204939',
    'installation_ui_smoke_cleanup_requires_empty_staging',
    'drop function if exists public.leader_prepare_installation_ui_smoke_rpc',
    'drop table if exists leader_staging.installation_ui_smoke_runs',
])
require('locked', [
    "error: 'bootstrap_locked'",
    'issue: 442',
    'status: 410',
    "'Cache-Control': 'no-store'",
])
for forbidden in ['fetch(', '/auth/v1/', 'SUPABASE_SERVICE_ROLE_KEY', 'password', 'access_token']:
    if forbidden in texts['locked']:
        errors.append(f'locked bootstrap contains runtime marker: {forbidden}')

require('oidc_runtime', [
    "const ISSUER = 'https://token.actions.githubusercontent.com'",
    "const AUDIENCE = 'leader-staging-installation-ui-smoke'",
    "const REPOSITORY_ID = '1236281954'",
    "const ACTOR_ID = '203537570'",
    "const BRANCH_REF = 'refs/heads/fix/staging-installation-read-rpc-drift-v1'",
    'workflow_ref: WORKFLOW_REF',
    "event_name: 'push'",
    "runner_environment: 'github-hosted'",
    'createRemoteJWKSet',
    'jwtVerify',
    "headers.Authorization = `Bearer ${key}`",
    "text(jwtHeader?.alg).toUpperCase() === 'HS256'",
    "serviceRequest('/auth/v1/admin/users'",
    "rpc('leader_prepare_installation_ui_smoke_rpc'",
    "rpc('leader_cleanup_installation_ui_smoke_rpc'",
])

require('runtime_workflow', [
    'id-token: write',
    'contents: read',
    'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
    'ACTIONS_ID_TOKEN_REQUEST_URL',
    'audience=${OIDC_AUDIENCE}',
    'Run real installation card in headless Chrome',
    'continue-on-error: true',
    'Cleanup Auth user and all staging fixtures',
    'if: always()',
    'mutation_count == 1',
    'test \'${{ steps.cleanup.outcome }}\' = \'success\'',
])
require('doc', [
    'Authenticated staging UI smoke карточки монтажа v2',
    'GitHub Actions run: `29956544804`',
    'микросекундами',
    'GitHub Actions OIDC',
    'HTTP `410`',
    'все счётчики `0`',
    'Production `ofewxuqfjhamgerwzull` не изменялся',
])
require('workflow', [
    'node --check tools/run_crm_staging_installation_ui_smoke.mjs',
    'node --check tools/test_crm_staging_installation_ui_smoke.mjs',
    'node tools/test_crm_staging_installation_ui_smoke.mjs',
    'node tools/run_crm_staging_installation_ui_smoke.mjs --mode=plan',
    'python3 tools/check_crm_staging_installation_ui_smoke.py',
])

secret_patterns = [
    r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}',
    r'sb_secret_[A-Za-z0-9_-]{12,}',
    r'installation-ui-\d+-\d+-[0-9a-f]{16,}@example\.invalid',
]
for name in texts:
    for pattern in secret_patterns:
        if re.search(pattern, texts[name]):
            errors.append(f'{name}: credential-like material found')

if errors:
    print('\n'.join(errors), file=sys.stderr)
    raise SystemExit(1)

print('Installation authenticated UI smoke passed once, preserved timestamp precision, removed fixtures, locked bootstrap, and kept production unchanged.')
