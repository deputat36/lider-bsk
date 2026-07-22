#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
READ_MD5 = '5a353818606012d0e657a83f133723b6'
WRITE_MD5 = '0ed4669197dac1f2695e763d0eec54e1'

paths = {
    'evidence': 'contracts/crm-staging-installation-runtime-smoke-v1.json',
    'read': 'contracts/crm-staging-installation-read-edge-v1.json',
    'command': 'contracts/crm-staging-installation-command-edge-v1.json',
    'jwt': 'contracts/crm-staging-installation-user-jwt-smoke-v1.json',
    'transport': 'supabase/staging-migrations/20260722_02_pg_net_smoke_transport.sql',
    'fix': 'supabase/staging-migrations/20260722_03_installation_read_order_status_fix.sql',
    'cleanup': 'supabase/staging-migrations/20260722_04_pg_net_smoke_transport_cleanup.sql',
    'locked': 'supabase/staging-functions/leader-staging-installation-smoke-bootstrap/index.ts',
    'docs': 'docs/SUPABASE_STAGING_INSTALLATION_USER_JWT_SMOKE_V1_2026-07-21.md',
    'workflow': '.github/workflows/crm-staging-installation-runtime-smoke-check.yml',
}
errors = []
texts = {}
for name, relative in paths.items():
    path = ROOT / relative
    if not path.is_file():
        errors.append(f'Missing file: {relative}')
        texts[name] = ''
    else:
        texts[name] = path.read_text(encoding='utf-8')


def load(name):
    try:
        return json.loads(texts[name])
    except Exception as exc:
        errors.append(f'{name}: invalid JSON: {exc}')
        return {}


def require(name, *markers):
    for marker in markers:
        if marker not in texts[name]:
            errors.append(f'{name}: missing marker {marker!r}')


evidence, read, command, jwt = map(load, ('evidence', 'read', 'command', 'jwt'))
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
for key, expected in {
    'contract': 'crm-staging-installation-runtime-smoke',
    'version': 1,
    'project_ref': 'otulfnouybahfnsycxqn',
    'environment': 'staging',
    'issue': 436,
    'status': 'completed_clean',
    'runtime_cases': expected_cases,
}.items():
    if evidence.get(key) != expected:
        errors.append(f'evidence: {key} drifted')

for key in ('privacy_projection', 'linked_order_consistent', 'single_update_event', 'idempotent_replay', 'real_user_jwt_used'):
    if evidence.get('assertions', {}).get(key) is not True:
        errors.append(f'evidence.assertions: {key} must be true')
if evidence.get('discovered_defect', {}).get('fixed') is not True or evidence.get('discovered_defect', {}).get('fix_migration_version') != '20260722055815':
    errors.append('evidence: projection fix missing')

transport = evidence.get('temporary_transport', {})
if (transport.get('install_migration_version'), transport.get('cleanup_migration_version')) != ('20260722053726', '20260722060407'):
    errors.append('evidence: transport migration versions drifted')
if transport.get('pg_net_installed_after_cleanup') is not False or transport.get('net_schema_exists_after_cleanup') is not False:
    errors.append('evidence: temporary transport remains installed')

bootstrap = evidence.get('bootstrap', {})
if (bootstrap.get('final_version'), bootstrap.get('verify_jwt'), bootstrap.get('locked_response')) != (8, True, 410):
    errors.append('evidence: locked bootstrap state drifted')
if bootstrap.get('sha256') != '5152c788bc25988378b57e453b16ee8be4a7d3d5f74f11b85318fc5c77daf977':
    errors.append('evidence: locked bootstrap SHA drifted')

read_rpc = evidence.get('rpc_postflight', {}).get('read', {})
if (read_rpc.get('md5'), read_rpc.get('bytes')) != (READ_MD5, 5432):
    errors.append('evidence: read RPC fingerprint drifted')
if read_rpc.get('order_installation_status_included') is not True or read_rpc.get('service_role_execute') is not True:
    errors.append('evidence: read projection/access drifted')
if read_rpc.get('anon_execute') is not False or read_rpc.get('authenticated_execute') is not False:
    errors.append('evidence: browser read RPC execute must be false')
update_rpc = evidence.get('rpc_postflight', {}).get('update', {})
if (update_rpc.get('md5'), update_rpc.get('bytes'), update_rpc.get('unchanged')) != (WRITE_MD5, 19061, True):
    errors.append('evidence: update fingerprint or unchanged flag drifted')

for key, value in evidence.get('cleanup_postflight', {}).items():
    if value != 0:
        errors.append(f'evidence.cleanup: {key} must be zero')
production = evidence.get('production_boundary', {})
if production.get('project_ref') != 'ofewxuqfjhamgerwzull':
    errors.append('evidence.production: wrong project ref')
for key in ('read_rpc_exists', 'read_fix_migration_exists', 'pg_net_smoke_migration_exists', 'installation_edge_deployed', 'bootstrap_edge_deployed', 'database_changed', 'auth_changed', 'frontend_changed', 'nav_changed'):
    if production.get(key) is not False:
        errors.append(f'evidence.production: {key} must be false')

if read.get('database', {}).get('rpc_md5') != READ_MD5 or read.get('runtime_gate', {}).get('user_jwt_smoke_completed') is not True:
    errors.append('read contract: runtime/fingerprint drifted')
if command.get('readiness', {}).get('user_jwt_smoke_completed') is not True or command.get('readiness', {}).get('frontend_switch_ready') is not True:
    errors.append('command contract: staging gate must be ready')
if command.get('readiness', {}).get('production_ready') is not False or jwt.get('runtime_status') != 'completed_clean':
    errors.append('command/JWT readiness drifted')

require('transport', '20260722053726', 'create extension if not exists pg_net')
require('fix', '20260722055815', "'installation_status', o.installation_status")
require('cleanup', '20260722060407', 'drop extension if exists pg_net cascade')
require('locked', "'{\"error\":\"locked\"}'", 'status: 410', "'Cache-Control': 'no-store'")
for marker in ('fetch(', '/auth/v1/', 'SUPABASE_SERVICE_ROLE_KEY', 'password', 'access_token'):
    if marker in texts['locked']:
        errors.append(f'locked bootstrap contains forbidden marker {marker!r}')
require('docs', 'Staging installation user-JWT smoke v3', 'manager update → `201`', 'command receipts: `0`')
require('workflow', 'CRM staging installation runtime smoke check', 'python3 tools/check_crm_staging_installation_runtime_smoke.py')

for name, content in texts.items():
    for pattern in (r'sb_secret_[A-Za-z0-9_-]{10,}', r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}', r'installation-smoke-[^\s"\']+@'):
        if re.search(pattern, content):
            errors.append(f'{name}: credential-like material detected')

if errors:
    print('Installation runtime smoke checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)
print('Installation runtime JWT smoke, cleanup, projection fix and production boundary are coherent.')
