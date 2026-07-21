#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGING = 'otulfnouybahfnsycxqn'
PRODUCTION = 'ofewxuqfjhamgerwzull'
EDGE_SHA = '4be533387e91a4d91a025a8c7c0ea9516563a4cba7e236c270cdd23097cb6bdc'
FILES = {
    'evidence': ROOT / 'contracts/crm-staging-installation-command-edge-v1.json',
    'schema': ROOT / 'contracts/crm-staging-installation-schema-v1.json',
    'edge': ROOT / 'supabase/staging-functions/leader-crm-installation/index.ts',
    'edge_contract': ROOT / 'supabase/staging-functions/leader-crm-installation/contract.ts',
    'rpc': ROOT / 'supabase/staging-migrations/20260721_06_installation_job_update_rpc.sql',
    'compat': ROOT / 'supabase/staging-migrations/20260721_07_installation_command_compat.sql',
    'final': ROOT / 'supabase/staging-migrations/20260721_08_installation_items_order_index_candidate.sql',
    'frontend': ROOT / 'crm/v4/assets/v4/installation-job-card-v2.js',
    'status': ROOT / 'crm/v4/assets/v4/status-transitions-v1.js',
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
        if marker not in texts[name]:
            errors.append(f'{name}: missing marker {marker!r}')


def ordered(name, markers):
    position = -1
    for marker in markers:
        position = texts[name].find(marker, position + 1)
        if position < 0:
            errors.append(f'{name}: execution order marker missing {marker!r}')
            return


try:
    evidence = json.loads(texts['evidence']) if texts['evidence'] else {}
    schema = json.loads(texts['schema']) if texts['schema'] else {}
except json.JSONDecodeError as exc:
    evidence, schema = {}, {}
    errors.append(f'JSON evidence invalid: {exc}')

for key, value in {
    'contract': 'crm-staging-installation-command-edge',
    'version': 4,
    'project_ref': STAGING,
    'environment': 'staging',
}.items():
    if evidence.get(key) != value:
        errors.append(f'evidence: {key} drifted')
edge = evidence.get('edge', {})
for key, value in {'slug':'leader-crm-installation','version':1,'status':'ACTIVE','verify_jwt':True,'sha256':EDGE_SHA}.items():
    if edge.get(key) != value:
        errors.append(f'evidence.edge: {key} drifted')

database = evidence.get('database', {})
if database.get('schema_contract_version') != 5:
    errors.append('evidence.database: schema contract version must be 5')
if database.get('schema_reconciliation_required') is not False:
    errors.append('evidence.database: reconciliation must be complete')
if database.get('final_index_migration_version') != '20260721200142':
    errors.append('evidence.database: final migration version drifted')
if database.get('final_index_migration_name') != 'staging_installation_schema_indexes_reconcile_20260721':
    errors.append('evidence.database: final migration name drifted')

command = evidence.get('command', {})
if command.get('action') != 'installation_job.update' or command.get('permission') != 'installation.write':
    errors.append('evidence.command: action or permission drifted')
if command.get('browser_role_parameter') is not False:
    errors.append('evidence.command: browser role parameter must be false')
if command.get('execution_order') != [
    'validate_environment','authenticate_user','validate_request','check_canonical_permission','execute_transactional_rpc'
]:
    errors.append('evidence.command: execution order drifted')

auth = evidence.get('authorization', {})
for key in ('edge_checks_canonical_permission','rpc_rechecks_permission','service_role_execute'):
    if auth.get(key) is not True:
        errors.append(f'evidence.authorization: {key} must be true')
for key in ('public_execute','anon_execute','authenticated_execute'):
    if auth.get(key) is not False:
        errors.append(f'evidence.authorization: {key} must be false')

postflight = evidence.get('staging_postflight', {})
for key in ('installation_jobs','installation_job_items','installation_events','installation_comments','command_receipts'):
    if postflight.get(key) != 0:
        errors.append(f'evidence.postflight: {key} must be zero')
for key in ('edge_logs_empty','service_role_only','foreign_keys_aligned_with_production','post_reconcile_command_smoke','idempotent_replay'):
    if postflight.get(key) is not True:
        errors.append(f'evidence.postflight: {key} must be true')
if postflight.get('canonical_index_count') != 9:
    errors.append('evidence.postflight: canonical index count must be 9')
if postflight.get('missing_covering_indexes') != [] or postflight.get('foreign_key_semantics_drift') != []:
    errors.append('evidence.postflight: schema drift must be empty')

readiness = evidence.get('readiness', {})
for key in ('edge_source_synced','rpc_source_synced','compat_source_synced','final_index_source_synced','authorization_ready','atomic_command_ready','foreign_keys_ready','schema_reconciliation_ready'):
    if readiness.get(key) is not True:
        errors.append(f'evidence.readiness: {key} must be true')
for key in ('user_jwt_smoke_completed','frontend_switch_ready','production_ready'):
    if readiness.get(key) is not False:
        errors.append(f'evidence.readiness: {key} must be false')

current = evidence.get('current_cycle', {})
if current.get('new_database_migration_applied') is not True or current.get('remaining_index_ddl_applied') is not True:
    errors.append('evidence.current_cycle: applied DDL evidence missing')
if current.get('new_edge_deploy_performed') is not False or current.get('working_data_changed') is not False:
    errors.append('evidence.current_cycle: Edge/data boundary drifted')

production = evidence.get('production_boundary', {})
if production.get('production_project_ref') != PRODUCTION:
    errors.append('evidence.production: wrong ref')
for key in ('production_rpc_exists','production_reconciliation_migrations','production_edge_deploy','production_frontend_switch','production_data_changed'):
    if production.get(key) is not False:
        errors.append(f'evidence.production: {key} must be false')

if schema.get('version') != 5 or (schema.get('deployed_staging_schema_drift') or {}).get('reconciliation_completed') is not True:
    errors.append('schema evidence must be reconciled version 5')

require('edge_contract', [
    "INSTALLATION_ACTION = 'installation_job.update'",
    "INSTALLATION_PERMISSION = 'installation.write'",
    "STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'",
])
require('edge', [
    'projectRefFromUrl(supabaseUrl) !== STAGING_PROJECT_REF',
    'authenticatedUser(req, supabaseUrl, publicKey)',
    'validateInstallationRequest(input)',
    'p_action: INSTALLATION_PERMISSION',
    '/rest/v1/rpc/leader_update_installation_job_rpc',
    'actor_id: checked.user.id',
    'result.idempotent_replay === true ? 200 : 201',
])
ordered('edge', [
    'projectRefFromUrl(supabaseUrl) !== STAGING_PROJECT_REF',
    'const checked = await authenticatedUser(req, supabaseUrl, publicKey)',
    'const validation = validateInstallationRequest(input)',
    'const permissionResult = await canonicalPermission(',
    '/rest/v1/rpc/leader_update_installation_job_rpc',
])
require('rpc', [
    'create or replace function public.leader_update_installation_job_rpc',
    "'installation_job.update'", "'installation.write'",
    'for update', 'pg_advisory_xact_lock', 'security invoker', "set search_path = ''",
])
require('compat', ['20260721195259','on delete set null','leader_installation_events_order_id_idx'])
require('final', ['APPLIED RECONCILIATION SOURCE','20260721200142','leader_installation_job_items_order_id_idx'])
require('frontend', [
    "supabaseClient.from('leader_installation_jobs').update(patch)",
    "supabaseClient.from('leader_orders').update(",
    "supabaseClient.from('leader_installation_events').insert(",
])
if "functions.invoke('leader-crm-installation'" in texts['frontend']:
    errors.append('frontend: switch is pending but Edge invocation is already present')
require('status', ["installation: domain({", "label: 'Не назначен'", "label: 'Выполнен'"])
require('docs', ['Staging installation command Edge v4','schema reconciliation ready: да','Production проект'])
require('workflow', ['20260721_08_installation_items_order_index_candidate.sql','check_crm_staging_installation_command_edge.py'])

for name in ('edge','edge_contract','rpc','compat','final'):
    if PRODUCTION in texts[name]:
        errors.append(f'{name}: production ref forbidden in staging executable source')
    if re.search(r'sb_secret_[A-Za-z0-9_-]{10,}', texts[name]):
        errors.append(f'{name}: possible secret material')

if errors:
    print('CRM staging installation command v4 checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)
print('CRM staging installation command v4 is reconciled, atomic and production-safe.')
