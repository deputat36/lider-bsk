#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EDGE_SHA = '24183605aad2c5cfcc84ebe14c348dcfce1b68de41a43dcfb973f65cef8cb369'
READ_MD5 = '01e91816d4f3a6a1bea2d6cbe760011f'
WRITE_MD5 = '0ed4669197dac1f2695d0eec54e1'

paths = {
    'runner': 'tools/run_crm_staging_installation_user_jwt_smoke.mjs',
    'lifecycle': 'tools/run_crm_staging_installation_auth_fixture_lifecycle.mjs',
    'contract': 'contracts/crm-staging-installation-user-jwt-smoke-v1.json',
    'runtime': 'contracts/crm-staging-installation-runtime-smoke-v1.json',
    'command': 'contracts/crm-staging-installation-command-edge-v1.json',
    'read': 'contracts/crm-staging-installation-read-edge-v1.json',
    'frontend': 'contracts/crm-staging-installation-frontend-transport-v1.json',
    'workflow': '.github/workflows/crm-staging-installation-user-jwt-smoke-check.yml',
}
texts = {}
errors = []
for name, relative in paths.items():
    path = ROOT / relative
    if not path.is_file():
        errors.append(f'Missing file: {relative}')
        texts[name] = ''
    else:
        texts[name] = path.read_text(encoding='utf-8')

try:
    contract = json.loads(texts['contract'])
    runtime = json.loads(texts['runtime'])
    command = json.loads(texts['command'])
    read = json.loads(texts['read'])
    frontend = json.loads(texts['frontend'])
except Exception as exc:
    contract = runtime = command = read = frontend = {}
    errors.append(f'Invalid JSON: {exc}')

for key, value in {
    'contract':'crm-staging-installation-user-jwt-smoke',
    'version':4,
    'project_ref':'otulfnouybahfnsycxqn',
    'environment':'staging',
    'function':'leader-crm-installation',
    'edge_version':2,
    'edge_sha256':EDGE_SHA,
    'secrets_in_repository':False,
    'runtime_status':'completed_clean',
}.items():
    if contract.get(key) != value:
        errors.append(f'contract.{key} drifted')

expected_cases = {
    'read_missing_jwt':401,'read_invalid_jwt':401,'read_forbidden':403,'read_authorized':200,
    'update_forbidden':403,'update_authorized':201,'update_replay':200,'read_after_update':200,
}
actual_cases = {item.get('name'): item.get('actual_http') for item in contract.get('runtime_cases', [])}
if actual_cases != expected_cases or any(item.get('result') != 'passed' for item in contract.get('runtime_cases', [])):
    errors.append('runtime case matrix drifted')

for key in ('privacy_projection','linked_order_consistent','single_update_event','idempotent_replay'):
    if contract.get('runtime_assertions', {}).get(key) is not True:
        errors.append(f'runtime_assertions.{key} must be true')
for key in ('auth_users_after_cleanup','active_profiles_after_cleanup','working_rows_after_cleanup','receipts_after_cleanup'):
    if contract.get('runtime_assertions', {}).get(key) != 0:
        errors.append(f'runtime_assertions.{key} must be zero')

post = contract.get('database_postcondition', {})
if (post.get('read_rpc_md5'), post.get('read_rpc_bytes')) != (READ_MD5,5599):
    errors.append('read postcondition drifted')
if (post.get('update_rpc_md5'), post.get('update_rpc_bytes')) != (WRITE_MD5,19061):
    errors.append('write postcondition drifted')
for key in ('schema_reconciliation_ready','read_rpc_ready','update_rpc_ready','edge_active','verify_jwt','server_capability_projection','temporary_pg_net_removed','bootstrap_locked'):
    if post.get(key) is not True:
        errors.append(f'database_postcondition.{key} must be true')
if post.get('capability_migration_version') != '20260722194950':
    errors.append('capability migration version drifted')

for key in ('runtime_tokens_were_ephemeral','auth_admin_api_used','order_status_projection_defect_fixed','capability_projection_added_after_runtime_smoke','capability_acceptance_rollback_safe'):
    if contract.get('execution_history', {}).get(key) is not True:
        errors.append(f'execution_history.{key} must be true')
for key in ('tokens_logged','tokens_committed'):
    if contract.get('execution_history', {}).get(key) is not False:
        errors.append(f'execution_history.{key} must be false')

success = contract.get('success_effect', {})
if success.get('user_jwt_smoke_completed') is not True or success.get('isolated_staging_frontend_wired') is not True:
    errors.append('success effect staging gates drifted')
if success.get('authenticated_browser_ui_smoke_completed') is not False or success.get('production_ready') is not False:
    errors.append('browser/production success gates drifted')

if runtime.get('status') != 'completed_clean' or runtime.get('rpc_postflight', {}).get('read', {}).get('md5') != READ_MD5:
    errors.append('runtime current postflight drifted')
if command.get('readiness', {}).get('isolated_staging_frontend_wired') is not True or command.get('readiness', {}).get('production_ready') is not False:
    errors.append('command readiness drifted')
if read.get('runtime_gate', {}).get('isolated_staging_frontend_source_wired') is not True:
    errors.append('read frontend gate drifted')
if frontend.get('status') != 'wired_on_isolated_staging_page_production_legacy_unchanged':
    errors.append('frontend evidence status drifted')

required = {
    'runner': ["EXPECTED_PROJECT_REF = 'otulfnouybahfnsycxqn'", "FUNCTION_SLUG = 'leader-crm-installation'", "READ_ACTION = 'installation_job.read'", "UPDATE_ACTION = 'installation_job.update'"],
    'lifecycle': ["STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'", 'ALLOW_STAGING_AUTH_MUTATION', 'finally'],
    'workflow': ['CRM staging installation user-JWT smoke check','python3 tools/check_crm_staging_installation_user_jwt_smoke.py'],
}
for name, markers in required.items():
    for marker in markers:
        if marker not in texts[name]:
            errors.append(f'{name}: missing marker {marker!r}')

for name, content in texts.items():
    if re.search(r'sb_secret_[A-Za-z0-9_-]{10,}', content):
        errors.append(f'{name}: possible secret material')
    if re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}', content):
        errors.append(f'{name}: possible JWT material')

production = contract.get('production_boundary', {})
if production.get('production_project_ref') != 'ofewxuqfjhamgerwzull':
    errors.append('production project ref drifted')
for key in ('production_call','production_data_change','production_edge_change','production_auth_change','production_frontend_switch'):
    if production.get(key) is not False:
        errors.append(f'production.{key} must be false')

if errors:
    print('Installation user-JWT smoke checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)
print('Installation user-JWT smoke, capability postcondition and isolated staging UI gates are coherent.')
