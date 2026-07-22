#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGING = 'otulfnouybahfnsycxqn'
PRODUCTION = 'ofewxuqfjhamgerwzull'
READ_MD5 = '5a353818606012d0e657a83f133723b6'
WRITE_MD5 = '0ed4669197dac1f2695d0eec54e1'
LOCKED_SHA = '5152c788bc25988378b57e453b16ee8be4a7d3d5f74f11b85318fc5c77daf977'

FILES = {
    'evidence': ROOT / 'contracts/crm-staging-installation-runtime-smoke-v1.json',
    'transport': ROOT / 'supabase/staging-migrations/20260722_02_pg_net_smoke_transport.sql',
    'fix': ROOT / 'supabase/staging-migrations/20260722_03_installation_read_order_status_fix.sql',
    'cleanup': ROOT / 'supabase/staging-migrations/20260722_04_pg_net_smoke_transport_cleanup.sql',
    'locked': ROOT / 'supabase/staging-functions/leader-staging-installation-smoke-bootstrap/index.ts',
    'read_contract': ROOT / 'contracts/crm-staging-installation-read-edge-v1.json',
    'command_contract': ROOT / 'contracts/crm-staging-installation-command-edge-v1.json',
    'jwt_contract': ROOT / 'contracts/crm-staging-installation-user-jwt-smoke-v1.json',
    'docs': ROOT / 'docs/SUPABASE_STAGING_INSTALLATION_USER_JWT_SMOKE_V1_2026-07-21.md',
    'workflow': ROOT / '.github/workflows/crm-staging-installation-runtime-smoke-check.yml',
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


try:
    evidence = json.loads(texts['evidence'])
    read = json.loads(texts['read_contract'])
    command = json.loads(texts['command_contract'])
    jwt = json.loads(texts['jwt_contract'])
except Exception as exc:
    evidence, read, command, jwt = {}, {}, {}, {}
    errors.append(f'Invalid JSON: {exc}')

for key, value in {
    'contract': 'crm-staging-installation-runtime-smoke',
    'version': 1,
    'project_ref': STAGING,
    'environment': 'staging',
    'issue': 436,
    'run_id': '6a1524f5-dae4-40fc-af57-308a196cbae6',
    'status': 'completed_clean',
}.items():
    if evidence.get(key) != value:
        errors.append(f'evidence: {key} must equal {value!r}')

expected_cases = {
    'read_missing_jwt': 401,
    'read_invalid_jwt': 401,
    'read_forbidden': 403,
    'read_authorized': 200,
    'update_forbidden': 403,
    'update_authorized': 201,
    'update_replay': 200,
    'read_after_update': 200,
}
if evidence.get('runtime_cases') != expected_cases:
    errors.append('evidence: runtime case matrix drifted')
for key in (
    'privacy_projection', 'linked_order_consistent', 'single_update_event',
    'idempotent_replay', 'real_user_jwt_used',
    'canonical_read_permission_checked', 'canonical_write_permission_checked',
):
    if evidence.get('assertions', {}).get(key) is not True:
        errors.append(f'evidence.assertions: {key} must be true')

defect = evidence.get('discovered_defect', {})
for key in ('database_row_was_correct', 'fixed'):
    if defect.get(key) is not True:
        errors.append(f'evidence.defect: {key} must be true')
if defect.get('fix_migration_version') != '20260722055815':
    errors.append('evidence.defect: fix migration drifted')

transport = evidence.get('temporary_transport', {})
if transport.get('install_migration_version') != '20260722053726' or transport.get('cleanup_migration_version') != '20260722060407':
    errors.append('evidence.transport: migration versions drifted')
if transport.get('pg_net_installed_after_cleanup') is not False or transport.get('net_schema_exists_after_cleanup') is not False:
    errors.append('evidence.transport: pg_net/net must be absent')

bootstrap = evidence.get('bootstrap', {})
for key, value in {
    'slug': 'leader-staging-installation-smoke-bootstrap',
    'final_version': 8,
    'status': 'ACTIVE_LOCKED',
    'verify_jwt': True,
    'sha256': LOCKED_SHA,
    'locked_response': 410,
    'runtime_credentials_in_repository': False,
}.items():
    if bootstrap.get(key) != value:
        errors.append(f'evidence.bootstrap: {key} drifted')

rpc = evidence.get('rpc_postflight', {})
read_rpc = rpc.get('read', {})
if (read_rpc.get('md5'), read_rpc.get('bytes')) != (READ_MD5, 5432):
    errors.append('evidence.rpc: read fingerprint drifted')
for key in ('security_invoker', 'empty_search_path', 'order_installation_status_included', 'service_role_execute'):
    if read_rpc.get(key) is not True:
        errors.append(f'evidence.rpc.read: {key} must be true')
for key in ('anon_execute', 'authenticated_execute'):
    if read_rpc.get(key) is not False:
        errors.append(f'evidence.rpc.read: {key} must be false')
update_rpc = rpc.get('update', {})
if (update_rpc.get('md5'), update_rpc.get('bytes')) != (WRITE_MD5, 19061):
    errors.append('evidence.rpc: update fingerprint drifted')
if update_rpc.get('unchanged') is not True:
    errors.append('evidence.rpc: update must remain unchanged')

for key, value in (evidence.get('cleanup_postflight') or {}).items():
    if value != 0:
        errors.append(f'evidence.cleanup: {key} must be zero')

production = evidence.get('production_boundary', {})
if production.get('project_ref') != PRODUCTION:
    errors.append('evidence.production: wrong project ref')
for key in (
    'read_rpc_exists', 'read_fix_migration_exists', 'pg_net_smoke_migration_exists',
    'installation_edge_deployed', 'bootstrap_edge_deployed', 'database_changed',
    'auth_changed', 'frontend_changed', 'nav_changed',
):
    if production.get(key) is not False:
        errors.append(f'evidence.production: {key} must be false')

if read.get('database', {}).get('rpc_md5') != READ_MD5 or read.get('runtime_gate', {}).get('user_jwt_smoke_completed') is not True:
    errors.append('read contract: runtime/fingerprint drifted')
if command.get('readiness', {}).get('user_jwt_smoke_completed') is not True or command.get('readiness', {}).get('frontend_switch_ready') is not True:
    errors.append('command contract: staging gate must be ready')
if command.get('readiness', {}).get('production_ready') is not False:
    errors.append('command contract: production must remain not ready')
if jwt.get('runtime_status') != 'completed_clean':
    errors.append('JWT contract: runtime status drifted')

require('transport',
    '20260722053726', 'staging_pg_net_smoke_transport_20260722',
    'create extension if not exists pg_net',
    "project_ref = 'otulfnouybahfnsycxqn'")
require('fix',
    '20260722055815', 'staging_installation_read_order_status_fix_20260722',
    "'installation_status', o.installation_status",
    'revoke all on function public.leader_read_installation_job_rpc(uuid, uuid) from public, anon, authenticated')
require('cleanup',
    '20260722060407', 'staging_pg_net_smoke_transport_cleanup_20260722',
    'drop extension if exists pg_net cascade', 'drop schema if exists net cascade')
require('locked',
    "error: 'bootstrap_locked'", 'status: 410', "'Cache-Control': 'no-store'")
for forbidden in ('fetch(', '/auth/v1/', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEYS', 'password', 'access_token'):
    if forbidden in texts['locked']:
        errors.append(f'locked bootstrap contains forbidden runtime marker {forbidden!r}')
require('docs',
    'Staging installation user-JWT smoke v3',
    'manager update → `201`', 'command receipts: `0`',
    'Production `ofewxuqfjhamgerwzull` не вызывался')
require('workflow',
    'CRM staging installation runtime smoke check',
    'deno check supabase/staging-functions/leader-staging-installation-smoke-bootstrap/index.ts',
    'python3 tools/check_crm_staging_installation_runtime_smoke.py')

secret_patterns = (
    r'sb_secret_[A-Za-z0-9_-]{10,}',
    r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}',
    r'installation-smoke-[^\s"\']+@',
)
for name, content in texts.items():
    for pattern in secret_patterns:
        if re.search(pattern, content):
            errors.append(f'{name}: forbidden credential-like material matched {pattern!r}')

if errors:
    print('Installation runtime smoke checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('Installation runtime JWT smoke, cleanup, projection fix and production boundary are coherent.')
