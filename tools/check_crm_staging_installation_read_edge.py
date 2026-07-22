#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGING = 'otulfnouybahfnsycxqn'
PRODUCTION = 'ofewxuqfjhamgerwzull'
EDGE_SHA = '24183605aad2c5cfcc84ebe14c348dcfce1b68de41a43dcfb973f65cef8cb369'
READ_RPC_MD5 = '98fc1e36b2ed8202e6580d7734088df1'
WRITE_RPC_MD5 = '0ed4669197dac1f2695d0eec54e1'

FILES = {
    'edge': ROOT / 'supabase/staging-functions/leader-crm-installation/index.ts',
    'edge_contract': ROOT / 'supabase/staging-functions/leader-crm-installation/contract.ts',
    'migration': ROOT / 'supabase/staging-migrations/20260722_01_installation_job_read_rpc.sql',
    'acceptance': ROOT / 'supabase/staging-tests/20260722_installation_job_read_acceptance.sql',
    'contract': ROOT / 'contracts/crm-staging-installation-read-edge-v1.json',
    'command_contract': ROOT / 'contracts/crm-staging-installation-command-edge-v1.json',
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


def require(name, markers):
    for marker in markers:
        if marker not in texts.get(name, ''):
            errors.append(f'{name}: missing marker {marker!r}')


try:
    contract = json.loads(texts['contract'])
    command = json.loads(texts['command_contract'])
except Exception as exc:
    contract, command = {}, {}
    errors.append(f'Invalid JSON: {exc}')

for key, value in {
    'contract': 'crm-staging-installation-read-edge',
    'version': 1,
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
    'migration_version': '20260722050355',
    'migration_name': 'staging_installation_job_read_rpc_20260722',
    'rpc': 'public.leader_read_installation_job_rpc(uuid,uuid)',
    'rpc_md5': READ_RPC_MD5,
    'rpc_bytes': 5378,
    'security_invoker': True,
    'empty_search_path': True,
}.items():
    if database.get(key) != value:
        errors.append(f'contract.database: {key} drifted')

action = contract.get('action', {})
if action.get('name') != 'installation_job.read' or action.get('permission') != 'installation.read':
    errors.append('contract.action: read action or permission drifted')
for key in ('edge_permission_check', 'rpc_permission_recheck'):
    if action.get(key) is not True:
        errors.append(f'contract.action: {key} must be true')

projection = contract.get('projection', {})
for key in ('internal_comments_excluded','client_contacts_excluded','financial_fields_excluded','order_data_excluded','server_owned_actor_fields_excluded'):
    if projection.get(key) is not True:
        errors.append(f'contract.projection: {key} must be true')
if projection.get('items_limit') != 120 or projection.get('events_limit') != 30 or projection.get('comments_limit') != 20:
    errors.append('contract.projection: limits drifted')

for key, value in {
    'public_execute': False,
    'anon_execute': False,
    'authenticated_execute': False,
    'service_role_execute': True,
    'manager_acceptance': 'success',
    'accountant_acceptance': 'forbidden',
    'inactive_profile_acceptance': 'forbidden',
    'unknown_job_acceptance': 'not_found',
}.items():
    if contract.get('authorization', {}).get(key) != value:
        errors.append(f'contract.authorization: {key} drifted')

acceptance = contract.get('acceptance', {})
for key in ('privacy_sensitive_markers_absent','internal_comment_filtered','safe_child_counts_checked','transaction_rollback'):
    if acceptance.get(key) is not True:
        errors.append(f'contract.acceptance: {key} must be true')
if acceptance.get('persistent_fixture') is not False or acceptance.get('working_data_changed') is not False:
    errors.append('contract.acceptance: persistent data must remain false')

write = contract.get('write_regression', {})
if write.get('write_rpc_md5') != '0ed4669197dac1f2695e763d0eec54e1' or write.get('write_rpc_bytes') != 19061:
    errors.append('contract.write_regression: write fingerprint drifted')
for key in ('success','linked_order_sync','idempotent_replay'):
    if write.get(key) is not True:
        errors.append(f'contract.write_regression: {key} must be true')
if write.get('duplicate_event') is not False:
    errors.append('contract.write_regression: duplicate_event must be false')

postflight = contract.get('staging_postflight', {})
for key in ('installation_jobs','installation_job_items','installation_events','installation_comments','command_receipts','auth_users','active_profiles'):
    if postflight.get(key) != 0:
        errors.append(f'contract.postflight: {key} must be zero')
if postflight.get('edge_logs_empty') is not True or postflight.get('security_error_or_warn') is not False:
    errors.append('contract.postflight: logs/security evidence drifted')

runtime = contract.get('runtime_gate', {})
if runtime.get('user_jwt_smoke_completed') is not False:
    errors.append('contract.runtime: user JWT smoke must remain false')
if runtime.get('reason') != 'staging_has_no_auth_users_or_active_profiles':
    errors.append('contract.runtime: missing zero-auth reason')
for key in ('auth_mutation_performed','frontend_read_wired','frontend_write_wired'):
    if runtime.get(key) is not False:
        errors.append(f'contract.runtime: {key} must be false')

production = contract.get('production_boundary', {})
if production.get('production_project_ref') != PRODUCTION:
    errors.append('contract.production: wrong production ref')
for key in ('production_rpc_exists','production_migration_exists','production_edge_deploy','production_frontend_switch','production_data_changed'):
    if production.get(key) is not False:
        errors.append(f'contract.production: {key} must be false')

require('edge_contract', [
    "INSTALLATION_EDGE_CONTRACT_VERSION = 'leader-crm-installation-edge-v2'",
    "INSTALLATION_READ_ACTION = 'installation_job.read'",
    "INSTALLATION_READ_PERMISSION = 'installation.read'",
    "INSTALLATION_UPDATE_ACTION = 'installation_job.update'",
    "INSTALLATION_UPDATE_PERMISSION = 'installation.write'",
    "STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'",
    "kind: 'read' | 'update'",
])
require('edge', [
    'projectRefFromUrl(supabaseUrl) !== STAGING_PROJECT_REF',
    'authenticatedUser(req, supabaseUrl, publicKey)',
    'for (const permission of validation.permissions)',
    "validation.kind === 'read'",
    '/rest/v1/rpc/leader_read_installation_job_rpc',
    '/rest/v1/rpc/leader_update_installation_job_rpc',
    'actor_id: checked.user.id',
    'result.idempotent_replay === true ? 200 : 201',
])
require('migration', [
    '-- STAGING ONLY.',
    "project_ref = 'otulfnouybahfnsycxqn'",
    'create or replace function public.leader_read_installation_job_rpc',
    "'installation.read'",
    "'installation_job.read'",
    "lower(btrim(coalesce(c.comment_type, ''))) <> 'internal'",
    'limit 120', 'limit 30', 'limit 20',
    'security invoker', "set search_path = ''",
    'revoke all on function public.leader_read_installation_job_rpc(uuid, uuid) from public, anon, authenticated',
    'grant execute on function public.leader_read_installation_job_rpc(uuid, uuid) to service_role',
])
require('acceptance', [
    'SENSITIVE_ORDER_CLIENT', 'SENSITIVE_JOB_PHONE', 'SENSITIVE_INTERNAL_COMMENT',
    'installation_read_sensitive_marker_leaked',
    'installation_read_forbidden_role_failed',
    'installation_read_inactive_profile_failed',
    'installation_read_not_found_failed',
    'installation_read_browser_execute_must_be_closed',
    'rollback;',
])
if not texts['acceptance'].lower().rstrip().endswith('rollback;'):
    errors.append('acceptance must end with ROLLBACK')
if 'commit;' in texts['acceptance'].lower():
    errors.append('acceptance must not contain COMMIT')

for forbidden_key in (
    "'client_name', v_job.client_name",
    "'client_phone', v_job.client_phone",
    "'installer_cost', v_job.installer_cost",
    "'client_price', v_job.client_price",
    "'data', o.data",
    "'internal_comment',",
    "'contractor_cost', p.contractor_cost",
):
    if forbidden_key in texts['migration']:
        errors.append(f'migration leaks forbidden projection marker {forbidden_key!r}')

require('docs', [
    'Staging installation read Edge v1',
    '`installation_job.read`',
    '`installation.read`',
    'не содержит ни одного `SENSITIVE_*`',
    'Полный user-JWT smoke не выполнен',
    'Production использован только read-only',
])
require('workflow', [
    'CRM staging installation read Edge check',
    'deno check supabase/staging-functions/leader-crm-installation/index.ts',
    'python3 tools/check_crm_staging_installation_read_edge.py',
])
require('card', [
    "supabaseClient.from('leader_installation_jobs').select(jobFields())",
    "supabaseClient.from('leader_installation_jobs').update(patch)",
])
if 'leader_read_installation_job_rpc' in texts['card'] or "installation_job.read" in texts['card']:
    errors.append('card must not be wired before runtime user-JWT smoke')

if command:
    edge_command = command.get('edge', {})
    if edge_command.get('version') != 2 or edge_command.get('sha256') != EDGE_SHA:
        errors.append('command evidence must reference deployed Edge v2')
    if command.get('readiness', {}).get('user_jwt_smoke_completed') is not False:
        errors.append('command evidence user JWT smoke must remain false')

for name in ('edge','edge_contract','migration','acceptance'):
    if PRODUCTION in texts[name]:
        errors.append(f'{name}: production ref forbidden in staging executable source')
    if re.search(r'sb_secret_[A-Za-z0-9_-]{10,}', texts[name]):
        errors.append(f'{name}: possible secret material')

if errors:
    print('CRM staging installation read Edge checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('CRM staging installation read Edge is privacy-safe, role-gated, write-compatible and production-safe.')
