#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGING = 'otulfnouybahfnsycxqn'
PRODUCTION = 'ofewxuqfjhamgerwzull'
EDGE_SHA = '24183605aad2c5cfcc84ebe14c348dcfce1b68de41a43dcfb973f65cef8cb369'
READ_RPC_MD5 = '5a353818606012d0e657a83f133723b6'
WRITE_RPC_MD5 = '0ed4669197dac1f2695e763d0eec54e1'

FILES = {
    'edge': ROOT / 'supabase/staging-functions/leader-crm-installation/index.ts',
    'edge_contract': ROOT / 'supabase/staging-functions/leader-crm-installation/contract.ts',
    'base_migration': ROOT / 'supabase/staging-migrations/20260722_01_installation_job_read_rpc.sql',
    'fix_migration': ROOT / 'supabase/staging-migrations/20260722_03_installation_read_order_status_fix.sql',
    'acceptance': ROOT / 'supabase/staging-tests/20260722_installation_job_read_acceptance.sql',
    'contract': ROOT / 'contracts/crm-staging-installation-read-edge-v1.json',
    'command_contract': ROOT / 'contracts/crm-staging-installation-command-edge-v1.json',
    'runtime': ROOT / 'contracts/crm-staging-installation-runtime-smoke-v1.json',
    'docs': ROOT / 'docs/SUPABASE_STAGING_INSTALLATION_READ_EDGE_V1_2026-07-22.md',
    'workflow': ROOT / '.github/workflows/crm-staging-installation-read-edge-check.yml',
    'card': ROOT / 'crm/v4/assets/v4/installation-job-card-v2.js',
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
    contract = json.loads(texts['contract'])
    command = json.loads(texts['command_contract'])
    runtime = json.loads(texts['runtime'])
except Exception as exc:
    contract, command, runtime = {}, {}, {}
    errors.append(f'Invalid JSON: {exc}')

for key, value in {
    'contract': 'crm-staging-installation-read-edge',
    'version': 2,
    'project_ref': STAGING,
    'environment': 'staging',
}.items():
    if contract.get(key) != value:
        errors.append(f'contract: {key} must equal {value!r}')

edge = contract.get('edge', {})
for key, value in {
    'slug': 'leader-crm-installation',
    'version': 2,
    'status': 'ACTIVE',
    'verify_jwt': True,
    'sha256': EDGE_SHA,
    'contract_version': 'leader-crm-installation-edge-v2',
}.items():
    if edge.get(key) != value:
        errors.append(f'contract.edge: {key} drifted')

database = contract.get('database', {})
for key, value in {
    'base_migration_version': '20260722050355',
    'fix_migration_version': '20260722055815',
    'rpc': 'public.leader_read_installation_job_rpc(uuid,uuid)',
    'rpc_md5': READ_RPC_MD5,
    'rpc_bytes': 5432,
    'security_invoker': True,
    'empty_search_path': True,
}.items():
    if database.get(key) != value:
        errors.append(f'contract.database: {key} drifted')

projection = contract.get('projection', {})
for key in (
    'entity_has_updated_at', 'order_has_installation_status',
    'internal_comments_excluded', 'client_contacts_excluded',
    'financial_fields_excluded', 'order_data_excluded',
    'server_owned_actor_fields_excluded',
):
    if projection.get(key) is not True:
        errors.append(f'contract.projection: {key} must be true')
if (projection.get('items_limit'), projection.get('events_limit'), projection.get('comments_limit')) != (120, 30, 20):
    errors.append('contract.projection: limits drifted')

auth = contract.get('authorization', {})
for key, value in {
    'public_execute': False,
    'anon_execute': False,
    'authenticated_execute': False,
    'service_role_execute': True,
    'runtime_authorized_role': 'manager',
    'runtime_forbidden_role': 'accountant',
}.items():
    if auth.get(key) != value:
        errors.append(f'contract.authorization: {key} drifted')

acceptance = contract.get('acceptance', {})
for key in (
    'rollback_privacy_acceptance', 'runtime_user_jwt_acceptance',
    'privacy_sensitive_markers_absent', 'internal_comment_filtered',
    'item_prices_filtered', 'linked_order_status_verified',
):
    if acceptance.get(key) is not True:
        errors.append(f'contract.acceptance: {key} must be true')
if acceptance.get('persistent_fixture') is not False or acceptance.get('working_data_changed') is not False:
    errors.append('contract.acceptance: persistent data flags must be false')

write = contract.get('write_regression', {})
if (write.get('write_rpc_md5'), write.get('write_rpc_bytes')) != (WRITE_RPC_MD5, 19061):
    errors.append('contract.write_regression: write fingerprint drifted')
for key in ('success', 'linked_order_sync', 'idempotent_replay'):
    if write.get(key) is not True:
        errors.append(f'contract.write_regression: {key} must be true')
if write.get('duplicate_event') is not False:
    errors.append('contract.write_regression: duplicate event must be false')

postflight = contract.get('staging_postflight', {})
for key in ('installation_jobs', 'installation_job_items', 'installation_events', 'installation_comments', 'command_receipts', 'auth_users', 'active_profiles'):
    if postflight.get(key) != 0:
        errors.append(f'contract.postflight: {key} must be zero')
if postflight.get('runtime_edge_logs_present') is not True or postflight.get('security_error_or_warn') is not False:
    errors.append('contract.postflight: runtime logs/security evidence drifted')

runtime_gate = contract.get('runtime_gate', {})
for key in ('user_jwt_smoke_completed', 'auth_mutation_performed_on_staging', 'auth_cleanup_verified', 'frontend_switch_ready_for_separate_review'):
    if runtime_gate.get(key) is not True:
        errors.append(f'contract.runtime_gate: {key} must be true')
for key in ('frontend_read_wired', 'frontend_write_wired'):
    if runtime_gate.get(key) is not False:
        errors.append(f'contract.runtime_gate: {key} must be false')

production = contract.get('production_boundary', {})
if production.get('production_project_ref') != PRODUCTION:
    errors.append('contract.production: wrong production ref')
for key in ('production_rpc_exists', 'production_migration_exists', 'production_edge_deploy', 'production_frontend_switch', 'production_data_changed'):
    if production.get(key) is not False:
        errors.append(f'contract.production: {key} must be false')

if runtime.get('status') != 'completed_clean' or runtime.get('run_id') != '6a1524f5-dae4-40fc-af57-308a196cbae6':
    errors.append('runtime evidence: completed run missing')
if runtime.get('runtime_cases') != {
    'read_missing_jwt': 401,
    'read_invalid_jwt': 401,
    'read_forbidden': 403,
    'read_authorized': 200,
    'update_forbidden': 403,
    'update_authorized': 201,
    'update_replay': 200,
    'read_after_update': 200,
}:
    errors.append('runtime evidence: case matrix drifted')
if command.get('readiness', {}).get('user_jwt_smoke_completed') is not True:
    errors.append('command evidence: runtime smoke must be complete')
if command.get('readiness', {}).get('frontend_switch_ready') is not True:
    errors.append('command evidence: staging frontend review gate must be ready')
if command.get('readiness', {}).get('production_ready') is not False:
    errors.append('command evidence: production must remain not ready')

require('edge_contract',
    "INSTALLATION_EDGE_CONTRACT_VERSION = 'leader-crm-installation-edge-v2'",
    "INSTALLATION_READ_ACTION = 'installation_job.read'",
    "INSTALLATION_READ_PERMISSION = 'installation.read'",
    "INSTALLATION_UPDATE_ACTION = 'installation_job.update'",
    "INSTALLATION_UPDATE_PERMISSION = 'installation.write'")
require('edge',
    'projectRefFromUrl(supabaseUrl) !== STAGING_PROJECT_REF',
    'authenticatedUser(req, supabaseUrl, publicKey)',
    '/rest/v1/rpc/leader_read_installation_job_rpc',
    '/rest/v1/rpc/leader_update_installation_job_rpc')
require('base_migration',
    'create or replace function public.leader_read_installation_job_rpc',
    "'installation_job.read'", "'installation.read'",
    "lower(btrim(coalesce(c.comment_type, ''))) <> 'internal'")
require('fix_migration',
    '20260722055815',
    'staging_installation_read_order_status_fix_20260722',
    "'installation_status', o.installation_status",
    'security invoker', "set search_path = ''",
    'grant execute on function public.leader_read_installation_job_rpc(uuid, uuid) to service_role')
require('acceptance',
    'SENSITIVE_ORDER_CLIENT', 'SENSITIVE_JOB_PHONE',
    'installation_read_sensitive_marker_leaked', 'rollback;')
require('docs',
    'Staging installation read Edge v2',
    '`installation_job.read`', '`installation.read`',
    'Runtime user-JWT smoke',
    'Production `ofewxuqfjhamgerwzull` использован только read-only')
require('workflow',
    'CRM staging installation read Edge check',
    'python3 tools/check_crm_staging_installation_read_edge.py')
require('card',
    "supabaseClient.from('leader_installation_jobs').select(jobFields())",
    "supabaseClient.from('leader_installation_jobs').update(patch)")
if 'leader_read_installation_job_rpc' in texts['card'] or "installation_job.read" in texts['card']:
    errors.append('card must remain unwired in this PR')

for forbidden_key in (
    "'client_name', v_job.client_name", "'client_phone', v_job.client_phone",
    "'installer_cost', v_job.installer_cost", "'client_price', v_job.client_price",
    "'data', o.data", "'internal_comment',", "'contractor_cost', p.contractor_cost",
):
    if forbidden_key in texts['fix_migration']:
        errors.append(f'fix migration leaks forbidden projection marker {forbidden_key!r}')

for name in ('edge', 'edge_contract', 'base_migration', 'fix_migration', 'acceptance'):
    if PRODUCTION in texts[name]:
        errors.append(f'{name}: production ref forbidden in staging executable source')
    if re.search(r'sb_secret_[A-Za-z0-9_-]{10,}', texts[name]):
        errors.append(f'{name}: possible secret material')

if errors:
    print('CRM staging installation read Edge checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('CRM staging installation read Edge runtime smoke, projection fix and production boundary are coherent.')
