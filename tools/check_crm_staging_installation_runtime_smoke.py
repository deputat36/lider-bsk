#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNTIME_READ_MD5 = '5a353818606012d0e657a83f133723b6'
CURRENT_READ_MD5 = '01e91816d4f3a6a1bea2d6cbe760011f'
WRITE_MD5 = '0ed4669197dac1f2695d0eec54e1'
LOCKED_SHA = '5152c788bc25988378b57e453b16ee8be4a7d3d5f74f11b85318fc5c77daf977'

paths = {
    'evidence':'contracts/crm-staging-installation-runtime-smoke-v1.json',
    'read':'contracts/crm-staging-installation-read-edge-v1.json',
    'command':'contracts/crm-staging-installation-command-edge-v1.json',
    'jwt':'contracts/crm-staging-installation-user-jwt-smoke-v1.json',
    'frontend':'contracts/crm-staging-installation-frontend-transport-v1.json',
    'transport':'supabase/staging-migrations/20260722_02_pg_net_smoke_transport.sql',
    'fix':'supabase/staging-migrations/20260722_03_installation_read_order_status_fix.sql',
    'cleanup':'supabase/staging-migrations/20260722_04_pg_net_smoke_transport_cleanup.sql',
    'capability':'supabase/staging-migrations/20260722_05_installation_read_capabilities.sql',
    'locked':'supabase/staging-functions/leader-staging-installation-smoke-bootstrap/index.ts',
    'workflow':'.github/workflows/crm-staging-installation-runtime-smoke-check.yml',
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
    evidence = json.loads(texts['evidence'])
    read = json.loads(texts['read'])
    command = json.loads(texts['command'])
    jwt = json.loads(texts['jwt'])
    frontend = json.loads(texts['frontend'])
except Exception as exc:
    evidence = read = command = jwt = frontend = {}
    errors.append(f'Invalid JSON: {exc}')

for key, value in {
    'contract':'crm-staging-installation-runtime-smoke',
    'version':2,
    'issue':436,
    'project_ref':'otulfnouybahfnsycxqn',
    'environment':'staging',
    'run_id':'6a1524f5-dae4-40fc-af57-308a196cbae6',
    'status':'completed_clean',
}.items():
    if evidence.get(key) != value:
        errors.append(f'evidence.{key} drifted')

expected_cases = {
    'read_missing_jwt':401,'read_invalid_jwt':401,'read_forbidden':403,'read_authorized':200,
    'update_forbidden':403,'update_authorized':201,'update_replay':200,'read_after_update':200,
}
if evidence.get('runtime_cases') != expected_cases:
    errors.append('runtime case matrix drifted')
for key in ('privacy_projection','linked_order_consistent','single_update_event','idempotent_replay','real_user_jwt_used','canonical_read_permission_checked','canonical_write_permission_checked'):
    if evidence.get('assertions', {}).get(key) is not True:
        errors.append(f'assertions.{key} must be true')

runtime_state = evidence.get('runtime_function_state', {})
if (runtime_state.get('read_rpc_md5_at_runtime'), runtime_state.get('read_rpc_bytes_at_runtime')) != (RUNTIME_READ_MD5,5432):
    errors.append('historical runtime read fingerprint drifted')
if (runtime_state.get('write_rpc_md5'), runtime_state.get('write_rpc_bytes')) != (WRITE_MD5,19061):
    errors.append('runtime write fingerprint drifted')

enhancement = evidence.get('subsequent_safe_enhancement', {})
if enhancement.get('migration_version') != '20260722194950' or enhancement.get('code') != 'installation_read_capability_projection':
    errors.append('capability enhancement drifted')
for key in ('can_write_server_projected','runtime_edge_unchanged','write_rpc_unchanged'):
    if enhancement.get(key) is not True:
        errors.append(f'enhancement.{key} must be true')
if enhancement.get('identity_or_role_exposed') is not False:
    errors.append('enhancement identity/role must be false')

bootstrap = evidence.get('bootstrap', {})
for key, value in {'final_version':8,'status':'ACTIVE_LOCKED','verify_jwt':True,'sha256':LOCKED_SHA,'locked_response':410,'runtime_credentials_in_repository':False}.items():
    if bootstrap.get(key) != value:
        errors.append(f'bootstrap.{key} drifted')

read_post = evidence.get('rpc_postflight', {}).get('read', {})
if (read_post.get('md5'), read_post.get('bytes')) != (CURRENT_READ_MD5,5599):
    errors.append('current read postflight drifted')
for key in ('security_invoker','empty_search_path','order_installation_status_included','server_capabilities_included','service_role_execute'):
    if read_post.get(key) is not True:
        errors.append(f'read_post.{key} must be true')
for key in ('anon_execute','authenticated_execute'):
    if read_post.get(key) is not False:
        errors.append(f'read_post.{key} must be false')
update_post = evidence.get('rpc_postflight', {}).get('update', {})
if (update_post.get('md5'), update_post.get('bytes')) != (WRITE_MD5,19061) or update_post.get('unchanged') is not True:
    errors.append('current update postflight drifted')

for key, value in evidence.get('cleanup_postflight', {}).items():
    if value != 0:
        errors.append(f'cleanup.{key} must be zero')

frontend_state = evidence.get('frontend', {})
for key in ('staging_transport_source_ready','runtime_gate_completed','isolated_staging_frontend_wired'):
    if frontend_state.get(key) is not True:
        errors.append(f'frontend.{key} must be true')
if frontend_state.get('authenticated_browser_ui_smoke_completed') is not False or frontend_state.get('production_frontend_wired') is not False:
    errors.append('browser/production frontend gate drifted')

if read.get('database', {}).get('rpc_md5') != CURRENT_READ_MD5:
    errors.append('read evidence current fingerprint drifted')
if command.get('rpc_fingerprints', {}).get('leader_read_installation_job_rpc', {}).get('md5') != CURRENT_READ_MD5:
    errors.append('command evidence current fingerprint drifted')
if jwt.get('database_postcondition', {}).get('read_rpc_md5') != CURRENT_READ_MD5:
    errors.append('JWT postcondition current fingerprint drifted')
if frontend.get('database', {}).get('read_rpc_md5') != CURRENT_READ_MD5:
    errors.append('frontend evidence current fingerprint drifted')

required = {
    'transport':['20260722053726','create extension if not exists pg_net'],
    'fix':['20260722055815',"'installation_status', o.installation_status"],
    'cleanup':['20260722060407','drop extension if exists pg_net cascade'],
    'capability':['20260722194950',"'can_write', leader_private.leader_actor_has_crm_action(p_actor_id, 'installation.write')"],
    'locked':['status: 410'],
    'workflow':['CRM staging installation runtime smoke check','python3 tools/check_crm_staging_installation_runtime_smoke.py'],
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

production = evidence.get('production_boundary', {})
if production.get('project_ref') != 'ofewxuqfjhamgerwzull':
    errors.append('production project ref drifted')
for key in ('read_rpc_exists','capability_migration_exists','installation_edge_deployed','bootstrap_edge_deployed','database_changed','auth_changed','frontend_changed','nav_changed'):
    if production.get(key) is not False:
        errors.append(f'production.{key} must be false')

if errors:
    print('Installation runtime smoke checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)
print('Installation runtime history and current capability-aware postflight are coherent.')
