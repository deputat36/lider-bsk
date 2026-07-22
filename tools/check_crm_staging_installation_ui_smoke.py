#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    'runner': ROOT / 'tools/run_crm_staging_installation_ui_smoke.mjs',
    'test': ROOT / 'tools/test_crm_staging_installation_ui_smoke.mjs',
    'contract': ROOT / 'contracts/crm-staging-installation-ui-smoke-v1.json',
    'doc': ROOT / 'docs/CRM_STAGING_INSTALLATION_UI_SMOKE_V1_2026-07-22.md',
    'workflow': ROOT / '.github/workflows/crm-staging-installation-ui-smoke-check.yml',
    'card': ROOT / 'crm/v4/assets/v4/installation-job-card-v2.js',
    'config': ROOT / 'crm/v4/assets/v4/config.js',
    'wiring_contract': ROOT / 'contracts/crm-staging-installation-frontend-transport-v1.json',
    'runtime_contract': ROOT / 'contracts/crm-staging-installation-runtime-smoke-v1.json',
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
    'mode===\'plan\'',
    'mode!==\'run\'',
])

runner = texts.get('runner', '')
for forbidden in [
    '--screenshot=',
    'SUPABASE_SERVICE_ROLE_KEY',
    'STAGING_SUPABASE_SECRET_KEY',
    'sb_secret_',
    'service_role',
    'createUser(',
    'deleteUser(',
    '.from(',
    '.insert(',
    '.update(',
    '.delete(',
    '.upsert(',
    '.rpc(',
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
except json.JSONDecodeError as exc:
    errors.append(f'Invalid UI smoke contract JSON: {exc}')
    contract = {}

if contract.get('version') != 1:
    errors.append('UI smoke contract version must be 1')
if contract.get('status') != 'source_ready_runtime_not_executed':
    errors.append('UI smoke status must remain source_ready_runtime_not_executed')
environment = contract.get('environment', {})
if environment.get('project_ref') != 'otulfnouybahfnsycxqn':
    errors.append('UI smoke staging project drifted')
if environment.get('production_enabled') is not False:
    errors.append('UI smoke production must remain disabled')
if environment.get('localhost_only') is not True:
    errors.append('UI smoke must remain localhost-only')
runner_contract = contract.get('runner', {})
if runner_contract.get('expected_mutation_count') != 1:
    errors.append('UI smoke expected mutation count must be 1')
if runner_contract.get('screenshot_run_enabled') is not False:
    errors.append('UI smoke screenshot run must remain disabled')
if runner_contract.get('user_logout_in_finally') is not True:
    errors.append('UI smoke logout must remain in finally')
evidence = contract.get('evidence', {})
if evidence.get('runtime_completed') is not False:
    errors.append('UI smoke runtime must not be marked completed before real run')
cleanup = contract.get('cleanup', {})
for key in ['local_credentials_deleted', 'local_temp_copy_deleted', 'browser_session_logged_out']:
    if cleanup.get(key) is not True:
        errors.append(f'UI smoke cleanup must keep {key}=true')
production = contract.get('production_boundary', {})
for key in ['production_supabase_changed', 'production_frontend_changed', 'production_edge_deployed', 'production_auth_changed', 'production_data_changed', 'nav_changed']:
    if production.get(key) is not False:
        errors.append(f'production boundary must keep {key}=false')

try:
    wiring_contract = json.loads(texts.get('wiring_contract', '{}'))
except json.JSONDecodeError as exc:
    errors.append(f'Invalid wiring contract JSON: {exc}')
    wiring_contract = {}
if wiring_contract.get('version') != 2:
    errors.append('frontend wiring contract v2 is required')
if wiring_contract.get('frontend', {}).get('source_wired_to_card') is not True:
    errors.append('frontend wiring must be completed before UI smoke source')

try:
    runtime_contract = json.loads(texts.get('runtime_contract', '{}'))
except json.JSONDecodeError as exc:
    errors.append(f'Invalid runtime contract JSON: {exc}')
    runtime_contract = {}
if runtime_contract.get('status') != 'completed_clean':
    errors.append('runtime JWT smoke must be completed_clean')
if runtime_contract.get('assertions', {}).get('real_user_jwt_used') is not True:
    errors.append('runtime evidence must confirm a real user JWT')
if runtime_contract.get('cleanup_postflight', {}).get('auth_users') != 0:
    errors.append('runtime evidence must keep auth_users=0 after cleanup')

require('doc', [
    'Authenticated staging UI smoke карточки монтажа v1',
    'YES_USE_EXISTING_SYNTHETIC_FIXTURES',
    'ровно одну update-мутацию',
    'автоматический скриншот отключён',
    'runtime UI smoke ещё не выполнен',
    'Production не изменяется',
    'Figma не изменяется',
])
require('workflow', [
    'node --check tools/run_crm_staging_installation_ui_smoke.mjs',
    'node --check tools/test_crm_staging_installation_ui_smoke.mjs',
    'node tools/test_crm_staging_installation_ui_smoke.mjs',
    'node tools/run_crm_staging_installation_ui_smoke.mjs --mode=plan',
    'python3 tools/check_crm_staging_installation_ui_smoke.py',
])

for name in ['runner', 'test', 'contract', 'doc', 'workflow']:
    value = texts.get(name, '')
    if re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}', value):
        errors.append(f'{name}: JWT-like secret found')
    if re.search(r'sb_secret_[A-Za-z0-9_-]{12,}', value):
        errors.append(f'{name}: secret key-like value found')

if errors:
    print('\n'.join(errors), file=sys.stderr)
    raise SystemExit(1)

print('Installation staging UI smoke is source-ready, exact-staging-only, single-mutation, no-secret, and runtime remains not executed.')
