#!/usr/bin/env python3
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    'config': ROOT / 'crm/v4/assets/v4/config.js',
    'route': ROOT / 'crm/v4/assets/v4/installation-job-save-route-v1.js',
    'transport': ROOT / 'crm/v4/assets/v4/installation-job-staging-transport-v1.js',
    'card': ROOT / 'crm/v4/assets/v4/installation-job-card-v2.js',
    'contract': ROOT / 'contracts/crm-staging-installation-frontend-transport-v1.json',
    'doc': ROOT / 'docs/CRM_STAGING_INSTALLATION_FRONTEND_TRANSPORT_V1_2026-07-22.md',
    'route_test': ROOT / 'tools/test_installation_job_save_route.mjs',
    'transport_test': ROOT / 'tools/test_installation_job_staging_transport.mjs',
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
    "from './installation-job-staging-transport-v1.js'",
    "mode: 'staging_edge'",
    'enabled: true',
    'atomic: true',
    'browserDirectWrite: false',
    "mode: 'production_locked'",
    'enabled: false',
    "reason: 'production_backend_not_deployed'",
    'createInstallationJobIdempotencyKey',
    'installation-job:',
])
require('transport', [
    "const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'",
    'const STAGING_HOSTNAME = `${STAGING_PROJECT_REF}.supabase.co`',
    "const FUNCTION_SLUG = 'leader-crm-installation'",
    "const ACTION = 'installation_job.update'",
    "const PERMISSION = 'installation.write'",
    'client.auth.getSession()',
    'client.functions.invoke(FUNCTION_SLUG, { body: command })',
    'expected_updated_at',
    'idempotency_key',
    'patch_field_not_allowed',
    'hostname === STAGING_HOSTNAME ? STAGING_PROJECT_REF :',
])

for forbidden in ['.from(', '.insert(', '.update(', '.delete(', '.upsert(', '.rpc(', 'service_role', 'SUPABASE_SERVICE_ROLE_KEY']:
    if forbidden in texts.get('transport', ''):
        errors.append(f'transport contains forbidden browser persistence/secret marker: {forbidden}')

for forbidden in ['installation-job-save-route-v1.js', 'installation-job-staging-transport-v1.js', 'invokeStagingInstallationJob']:
    if forbidden in texts.get('card', ''):
        errors.append(f'card was wired before runtime JWT smoke: {forbidden}')

require('card', [
    ".from('leader_installation_jobs').update(patch)",
    ".from('leader_orders').update(",
    ".from('leader_installation_events').insert(",
])

try:
    contract = json.loads(texts.get('contract', '{}'))
except json.JSONDecodeError as exc:
    errors.append(f'Invalid contract JSON: {exc}')
    contract = {}

if contract.get('version') != 1:
    errors.append('contract version must be 1')
if contract.get('status') != 'source_ready_not_wired_runtime_gated_production_unchanged':
    errors.append('contract status drifted')
environment = contract.get('environment', {})
if environment.get('allowed_hostname') != 'otulfnouybahfnsycxqn.supabase.co':
    errors.append('exact staging hostname drifted')
if environment.get('production_route') != 'production_locked':
    errors.append('production route must remain locked')
frontend = contract.get('frontend', {})
if frontend.get('source_wired_to_card') is not False:
    errors.append('contract must state source is not wired to card')
if frontend.get('production_browser_behavior_changed') is not False:
    errors.append('production browser behavior must remain unchanged')
production = contract.get('production_boundary', {})
for key in ['production_supabase_changed', 'production_frontend_switch', 'production_edge_deploy', 'production_data_changed', 'nav_changed']:
    if production.get(key) is not False:
        errors.append(f'production boundary must keep {key}=false')

require('route_test', [
    "mode, 'staging_edge'",
    "mode, 'production_locked'",
    'evil.otulfnouybahfnsycxqn.supabase.co',
    'Installation job save route tests passed.',
])
require('transport_test', [
    'leader-crm-installation',
    'installation_job.update',
    'patch_field_not_allowed',
    "kind, 'wrong_environment'",
    "kind, 'forbidden'",
    'Installation job staging transport tests passed.',
])
require('doc', [
    'новый transport к карточке не подключён',
    'Production не изменялся',
    'runtime user-JWT smoke',
    'exact staging URL',
])
require('workflow', [
    'node --check crm/v4/assets/v4/installation-job-save-route-v1.js',
    'node --check crm/v4/assets/v4/installation-job-staging-transport-v1.js',
    'node tools/test_installation_job_save_route.mjs',
    'node tools/test_installation_job_staging_transport.mjs',
    'python3 tools/check_crm_staging_installation_frontend_transport.py',
])

if errors:
    print('\n'.join(errors), file=sys.stderr)
    raise SystemExit(1)

print('Installation frontend transport is exact-staging-only, source-ready, not wired, and production remains unchanged.')
