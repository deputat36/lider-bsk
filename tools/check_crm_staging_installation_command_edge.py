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
    'contract': ROOT / 'supabase/staging-functions/leader-crm-installation/contract.ts',
    'rpc': ROOT / 'supabase/staging-migrations/20260721_06_installation_job_update_rpc.sql',
    'compat': ROOT / 'supabase/staging-migrations/20260721_07_installation_command_compat.sql',
    'index': ROOT / 'supabase/staging-migrations/20260721_09_installation_schema_indexes_reconcile.sql',
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


def require(name, *markers):
    for marker in markers:
        if marker not in texts[name]:
            errors.append(f'{name}: missing marker {marker!r}')


def ordered(name, *markers):
    pos = -1
    for marker in markers:
        pos = texts[name].find(marker, pos + 1)
        if pos < 0:
            errors.append(f'{name}: order marker missing {marker!r}')
            return


try:
    evidence = json.loads(texts['evidence'])
    schema = json.loads(texts['schema'])
except Exception as exc:
    evidence = {}
    schema = {}
    errors.append(f'evidence JSON error: {exc}')

if evidence:
    for key, value in {
        'contract': 'crm-staging-installation-command-edge',
        'version': 4,
        'project_ref': STAGING,
        'environment': 'staging',
    }.items():
        if evidence.get(key) != value:
            errors.append(f'evidence: {key} must equal {value!r}')

    edge = evidence.get('edge', {})
    for key, value in {
        'slug': 'leader-crm-installation',
        'version': 1,
        'status': 'ACTIVE',
        'verify_jwt': True,
        'sha256': EDGE_SHA,
    }.items():
        if edge.get(key) != value:
            errors.append(f'evidence.edge: {key} drift')

    db = evidence.get('database', {})
    expected = {
        'command_migration': ('20260721191810', 'staging_installation_job_update_rpc_20260721'),
        'compat_migration': ('20260721195259', 'staging_installation_command_compat_20260721'),
        'index_reconcile_migration': ('20260721200142', 'staging_installation_schema_indexes_reconcile_20260721'),
    }
    for key, identity in expected.items():
        item = db.get(key, {})
        if (item.get('version'), item.get('name')) != identity:
            errors.append(f'evidence.database: {key} identity drift')
    if db.get('schema_contract_version') != 5:
        errors.append('evidence.database: schema contract must be v5')
    if db.get('foreign_keys_aligned_with_production') is not True:
        errors.append('evidence.database: FK alignment missing')
    if db.get('covering_indexes_aligned_with_production') is not True:
        errors.append('evidence.database: index alignment missing')
    if db.get('schema_reconciliation_required') is not False:
        errors.append('evidence.database: schema reconciliation must be complete')

    command = evidence.get('command', {})
    if command.get('action') != 'installation_job.update' or command.get('permission') != 'installation.write':
        errors.append('evidence.command: action/permission drift')
    if command.get('browser_role_parameter') is not False:
        errors.append('evidence.command: browser role must be forbidden')
    if command.get('execution_order') != [
        'validate_environment', 'authenticate_user', 'validate_request',
        'check_canonical_permission', 'execute_transactional_rpc'
    ]:
        errors.append('evidence.command: execution order drift')

    auth = evidence.get('authorization', {})
    for key in ('edge_checks_canonical_permission', 'rpc_rechecks_permission', 'service_role_execute'):
        if auth.get(key) is not True:
            errors.append(f'evidence.authorization: {key} must be true')
    for key in ('public_execute', 'anon_execute', 'authenticated_execute'):
        if auth.get(key) is not False:
            errors.append(f'evidence.authorization: {key} must be false')

    postflight = evidence.get('staging_postflight', {})
    for key in ('installation_jobs', 'installation_job_items', 'installation_events', 'installation_comments', 'command_receipts'):
        if postflight.get(key) != 0:
            errors.append(f'evidence.postflight: {key} must be zero')
    if postflight.get('foreign_key_semantics_drift') != []:
        errors.append('evidence.postflight: FK drift must be empty')
    if postflight.get('missing_covering_indexes') != []:
        errors.append('evidence.postflight: missing indexes must be empty')
    if postflight.get('foreign_keys_aligned_with_production') is not True:
        errors.append('evidence.postflight: FK alignment missing')
    if postflight.get('covering_indexes_aligned_with_production') is not True:
        errors.append('evidence.postflight: index alignment missing')
    if set(postflight.get('present_covering_indexes', [])) != {
        'leader_installation_job_items_order_id_idx',
        'leader_installation_events_order_id_idx',
    }:
        errors.append('evidence.postflight: both covering indexes required')
    if postflight.get('performance_missing_fk_index_warnings') != 0:
        errors.append('evidence.postflight: missing FK index warnings must be zero')

    readiness = evidence.get('readiness', {})
    for key in (
        'edge_source_synced', 'rpc_source_synced', 'compat_source_synced',
        'index_reconcile_source_synced', 'authorization_ready',
        'atomic_command_ready', 'foreign_keys_ready', 'schema_reconciliation_ready'
    ):
        if readiness.get(key) is not True:
            errors.append(f'evidence.readiness: {key} must be true')
    for key in ('user_jwt_smoke_completed', 'frontend_switch_ready', 'production_ready'):
        if readiness.get(key) is not False:
            errors.append(f'evidence.readiness: {key} must be false')

    cycle = evidence.get('current_cycle', {})
    for key in ('new_database_migration_applied', 'new_edge_deploy_performed', 'working_data_changed'):
        if cycle.get(key) is not False:
            errors.append(f'evidence.current_cycle: {key} must be false')
    if cycle.get('source_and_evidence_sync_only') is not True:
        errors.append('evidence.current_cycle: source-only flag must be true')

    production = evidence.get('production_boundary', {})
    if production.get('production_project_ref') != PRODUCTION:
        errors.append('evidence.production: wrong project ref')
    for key in ('production_migration', 'production_edge_deploy', 'production_frontend_switch', 'production_data_changed'):
        if production.get(key) is not False:
            errors.append(f'evidence.production: {key} must be false')

if schema:
    if schema.get('version') != 5:
        errors.append('schema evidence must be v5')
    deployment = schema.get('staging_deployment', {})
    if deployment.get('state') != 'deployed_active_schema_aligned':
        errors.append('schema deployment state is not aligned')
    if deployment.get('covering_indexes_aligned_with_production') is not True:
        errors.append('schema index alignment missing')

require('contract',
    "INSTALLATION_ACTION = 'installation_job.update'",
    "INSTALLATION_PERMISSION = 'installation.write'",
    "STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'",
    'MAX_BODY_BYTES = 64 * 1024')
require('edge',
    'projectRefFromUrl(supabaseUrl) !== STAGING_PROJECT_REF',
    'authenticatedUser(req, supabaseUrl, publicKey)',
    'validateInstallationRequest(input)',
    'p_action: INSTALLATION_PERMISSION',
    '/rest/v1/rpc/leader_update_installation_job_rpc')
ordered('edge',
    'projectRefFromUrl(supabaseUrl) !== STAGING_PROJECT_REF',
    'const checked = await authenticatedUser(req, supabaseUrl, publicKey)',
    'const validation = validateInstallationRequest(input)',
    'const permissionResult = await canonicalPermission(',
    '/rest/v1/rpc/leader_update_installation_job_rpc')

require('rpc', "'installation_job.update'", "'installation.write'", 'installation_completed_at = v_completed_at')
require('compat', '20260721195259', 'on delete set null', 'leader_installation_events_order_id_idx')
require('index', '20260721200142', 'leader_installation_job_items_order_id_idx')

require('frontend',
    "supabaseClient.from('leader_installation_jobs').update(patch)",
    "supabaseClient.from('leader_orders').update(",
    "supabaseClient.from('leader_installation_events').insert(")
if "functions.invoke('leader-crm-installation'" in texts['frontend']:
    errors.append('frontend switch is still declared pending')

require('docs',
    'Staging installation command Edge v4',
    '`20260721200142 / staging_installation_schema_indexes_reconcile_20260721`',
    'missing-FK-index warnings: 0',
    'Frontend switch не выполнен',
    'Production не изменялся')
require('workflow',
    'CRM staging installation command Edge check',
    'deno check supabase/staging-functions/leader-crm-installation/index.ts',
    'python3 tools/check_crm_staging_installation_command_edge.py')

for name, text in texts.items():
    if re.search(r'sb_secret_[A-Za-z0-9_-]{10,}', text):
        errors.append(f'{name}: possible secret')
    if re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}', text):
        errors.append(f'{name}: possible JWT')

if errors:
    print('Installation command v4 checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('Installation command v4 is schema-ready, source-synced and production-locked.')
