#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGING = 'otulfnouybahfnsycxqn'
PRODUCTION = 'ofewxuqfjhamgerwzull'
EDGE_SHA = '24183605aad2c5cfcc84ebe14c348dcfce1b68de41a43dcfb973f65cef8cb369'

FILES = {
    'evidence': ROOT / 'contracts/crm-staging-installation-command-edge-v1.json',
    'schema': ROOT / 'contracts/crm-staging-installation-schema-v1.json',
    'edge': ROOT / 'supabase/staging-functions/leader-crm-installation/index.ts',
    'edge_contract': ROOT / 'supabase/staging-functions/leader-crm-installation/contract.ts',
    'update_rpc': ROOT / 'supabase/staging-migrations/20260721_06_installation_job_update_rpc.sql',
    'read_rpc': ROOT / 'supabase/staging-migrations/20260722_01_installation_job_read_rpc.sql',
    'read_contract': ROOT / 'contracts/crm-staging-installation-read-edge-v1.json',
    'frontend': ROOT / 'crm/v4/assets/v4/installation-job-card-v2.js',
    'docs': ROOT / 'docs/SUPABASE_STAGING_INSTALLATION_COMMAND_EDGE_V1_2026-07-21.md',
    'workflow': ROOT / '.github/workflows/crm-staging-installation-command-edge-check.yml',
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
    evidence = json.loads(texts['evidence'])
    schema = json.loads(texts['schema'])
    read_contract = json.loads(texts['read_contract'])
except Exception as exc:
    evidence, schema, read_contract = {}, {}, {}
    errors.append(f'Invalid JSON evidence: {exc}')

for key, value in {
    'contract': 'crm-staging-installation-command-edge',
    'version': 5,
    'project_ref': STAGING,
    'environment': 'staging',
}.items():
    if evidence.get(key) != value:
        errors.append(f'evidence: {key} must equal {value!r}')

edge = evidence.get('edge', {})
for key, value in {
    'slug': 'leader-crm-installation',
    'version': 2,
    'status': 'ACTIVE',
    'verify_jwt': True,
    'sha256': EDGE_SHA,
    'contract_version': 'leader-crm-installation-edge-v2',
}.items():
    if edge.get(key) != value:
        errors.append(f'evidence.edge: {key} drifted')
if set(edge.get('actions', [])) != {'installation_job.read', 'installation_job.update'}:
    errors.append('evidence.edge: action inventory drifted')

database = evidence.get('database', {})
for key, value in {
    'command_migration_version': '20260721191810',
    'read_migration_version': '20260722050355',
    'schema_contract_version': 5,
    'schema_reconciliation_required': False,
}.items():
    if database.get(key) != value:
        errors.append(f'evidence.database: {key} drifted')

update = evidence.get('update_command', {})
if update.get('action') != 'installation_job.update' or update.get('permission') != 'installation.write':
    errors.append('evidence.update: action or permission drifted')
for key in ('request_id_required','idempotency_key_required','expected_updated_at_required'):
    if update.get(key) is not True:
        errors.append(f'evidence.update: {key} must be true')
for key, value in (update.get('atomicity') or {}).items():
    if value is not True:
        errors.append(f'evidence.update.atomicity: {key} must be true')

read = evidence.get('read_command', {})
if read.get('action') != 'installation_job.read' or read.get('permission') != 'installation.read':
    errors.append('evidence.read: action or permission drifted')
for key in ('privacy_safe_projection','client_contacts_excluded','financial_fields_excluded','internal_comments_excluded','order_data_excluded'):
    if read.get(key) is not True:
        errors.append(f'evidence.read: {key} must be true')

if evidence.get('execution_order') != [
    'validate_environment','authenticate_user','validate_request','check_canonical_permission','execute_action_rpc'
]:
    errors.append('evidence: execution order drifted')

auth = evidence.get('authorization', {})
for key in ('edge_checks_canonical_permission','rpc_rechecks_permission','service_role_execute'):
    if auth.get(key) is not True:
        errors.append(f'evidence.authorization: {key} must be true')
for key in ('public_execute','anon_execute','authenticated_execute'):
    if auth.get(key) is not False:
        errors.append(f'evidence.authorization: {key} must be false')

fingerprints = evidence.get('rpc_fingerprints', {})
if (fingerprints.get('leader_update_installation_job_rpc') or {}).get('md5') != '0ed4669197dac1f2695e763d0eec54e1':
    errors.append('evidence: write RPC fingerprint drifted')
if (fingerprints.get('leader_update_installation_job_rpc') or {}).get('bytes') != 19061:
    errors.append('evidence: write RPC size drifted')
if (fingerprints.get('leader_read_installation_job_rpc') or {}).get('md5') != '98fc1e36b2ed8202e6580d7734088df1':
    errors.append('evidence: read RPC fingerprint drifted')
if (fingerprints.get('leader_read_installation_job_rpc') or {}).get('bytes') != 5378:
    errors.append('evidence: read RPC size drifted')

postflight = evidence.get('staging_postflight', {})
for key in ('installation_jobs','installation_job_items','installation_events','installation_comments','command_receipts','auth_users','active_profiles'):
    if postflight.get(key) != 0:
        errors.append(f'evidence.postflight: {key} must be zero')
for key in ('edge_logs_empty','service_role_only','write_regression_passed','write_idempotent_replay','read_privacy_acceptance_passed'):
    if postflight.get(key) is not True:
        errors.append(f'evidence.postflight: {key} must be true')
if postflight.get('security_advisors_new_error_or_warn') is not False:
    errors.append('evidence.postflight: security ERROR/WARN must be false')

readiness = evidence.get('readiness', {})
for key in ('edge_source_synced','update_rpc_source_synced','read_rpc_source_synced','authorization_ready','atomic_update_ready','privacy_safe_read_ready','schema_reconciliation_ready'):
    if readiness.get(key) is not True:
        errors.append(f'evidence.readiness: {key} must be true')
for key in ('user_jwt_smoke_completed','frontend_switch_ready','production_ready'):
    if readiness.get(key) is not False:
        errors.append(f'evidence.readiness: {key} must be false')

frontend = evidence.get('frontend', {})
if frontend.get('switch_performed') is not False or frontend.get('staging_transport_wired') is not False:
    errors.append('evidence.frontend: transport must remain unwired')
if frontend.get('current_read_path') != 'direct_browser_reads' or frontend.get('current_write_path') != 'three_direct_browser_writes':
    errors.append('evidence.frontend: current path inventory drifted')

production = evidence.get('production_boundary', {})
if production.get('production_project_ref') != PRODUCTION:
    errors.append('evidence.production: wrong ref')
for key in ('production_read_rpc_exists','production_read_migration_exists','production_edge_deploy','production_frontend_switch','production_data_changed'):
    if production.get(key) is not False:
        errors.append(f'evidence.production: {key} must be false')

if schema.get('version') != 5 or (schema.get('deployed_staging_schema_drift') or {}).get('reconciliation_completed') is not True:
    errors.append('schema evidence must remain reconciled v5')
if read_contract.get('version') != 1 or read_contract.get('edge', {}).get('sha256') != EDGE_SHA:
    errors.append('read contract must reference deployed Edge v2')

require('edge_contract', [
    "INSTALLATION_EDGE_CONTRACT_VERSION = 'leader-crm-installation-edge-v2'",
    "INSTALLATION_READ_ACTION = 'installation_job.read'",
    "INSTALLATION_READ_PERMISSION = 'installation.read'",
    "INSTALLATION_UPDATE_ACTION = 'installation_job.update'",
    "INSTALLATION_UPDATE_PERMISSION = 'installation.write'",
])
require('edge', [
    'projectRefFromUrl(supabaseUrl) !== STAGING_PROJECT_REF',
    'authenticatedUser(req, supabaseUrl, publicKey)',
    'for (const permission of validation.permissions)',
    '/rest/v1/rpc/leader_read_installation_job_rpc',
    '/rest/v1/rpc/leader_update_installation_job_rpc',
    'actor_id: checked.user.id',
    'result.idempotent_replay === true ? 200 : 201',
])
require('update_rpc', [
    'create or replace function public.leader_update_installation_job_rpc',
    "'installation_job.update'", "'installation.write'",
    'for update', 'pg_advisory_xact_lock', 'security invoker', "set search_path = ''",
])
require('read_rpc', [
    'create or replace function public.leader_read_installation_job_rpc',
    "'installation_job.read'", "'installation.read'",
    "lower(btrim(coalesce(c.comment_type, ''))) <> 'internal'",
    'security invoker', "set search_path = ''",
])
require('frontend', [
    "supabaseClient.from('leader_installation_jobs').select(jobFields())",
    "supabaseClient.from('leader_installation_jobs').update(patch)",
    "supabaseClient.from('leader_orders').update(",
    "supabaseClient.from('leader_installation_events').insert(",
])
if 'leader_read_installation_job_rpc' in texts['frontend'] or "functions.invoke('leader-crm-installation'" in texts['frontend']:
    errors.append('frontend card must remain unwired before user-JWT smoke')
require('docs', [
    'Staging installation command Edge v5',
    '`installation_job.read`', '`installation_job.update`',
    'User-JWT smoke не выполнен',
    'Production `ofewxuqfjhamgerwzull` использован только read-only',
])
require('workflow', [
    'CRM staging installation command Edge check',
    'deno check supabase/staging-functions/leader-crm-installation/index.ts',
    'python3 tools/check_crm_staging_installation_command_edge.py',
])

for name in ('edge','edge_contract','update_rpc','read_rpc'):
    if PRODUCTION in texts[name]:
        errors.append(f'{name}: production ref forbidden in staging executable source')
    if re.search(r'sb_secret_[A-Za-z0-9_-]{10,}', texts[name]):
        errors.append(f'{name}: possible secret material')

if errors:
    print('CRM staging installation command Edge v5 checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('CRM staging installation Edge v2 read/update contracts are coherent and production-safe.')
