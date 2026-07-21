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
    'schema_evidence': ROOT / 'contracts/crm-staging-installation-schema-v1.json',
    'edge': ROOT / 'supabase/staging-functions/leader-crm-installation/index.ts',
    'contract': ROOT / 'supabase/staging-functions/leader-crm-installation/contract.ts',
    'schema_migration': ROOT / 'supabase/staging-migrations/20260721_05_installation_schema_install.sql',
    'rpc_migration': ROOT / 'supabase/staging-migrations/20260721_06_installation_job_update_rpc.sql',
    'frontend': ROOT / 'crm/v4/assets/v4/installation-job-card-v2.js',
    'status_registry': ROOT / 'crm/v4/assets/v4/status-transitions-v1.js',
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
        next_position = texts[name].find(marker, position + 1)
        if next_position < 0:
            errors.append(f'{name}: execution order marker missing {marker!r}')
            return
        position = next_position


try:
    evidence = json.loads(texts['evidence']) if texts['evidence'] else {}
except json.JSONDecodeError as exc:
    evidence = {}
    errors.append(f'evidence: invalid JSON: {exc}')

if evidence:
    expected = {
        'contract': 'crm-staging-installation-command-edge',
        'version': 1,
        'project_ref': STAGING,
        'environment': 'staging',
    }
    for key, value in expected.items():
        if evidence.get(key) != value:
            errors.append(f'evidence: {key} must equal {value!r}')

    edge = evidence.get('edge', {})
    edge_expected = {
        'slug': 'leader-crm-installation',
        'version': 1,
        'status': 'ACTIVE',
        'verify_jwt': True,
        'sha256': EDGE_SHA,
        'contract_version': 'leader-crm-installation-edge-v1',
    }
    for key, value in edge_expected.items():
        if edge.get(key) != value:
            errors.append(f'evidence.edge: {key} must equal {value!r}')

    database = evidence.get('database', {})
    if database.get('migration_version') != '20260721191810':
        errors.append('evidence.database: unexpected migration version')
    if database.get('migration_name') != 'staging_installation_job_update_rpc_20260721':
        errors.append('evidence.database: unexpected migration name')

    command = evidence.get('command', {})
    if command.get('action') != 'installation_job.update':
        errors.append('evidence.command: unexpected action')
    if command.get('permission') != 'installation.write':
        errors.append('evidence.command: unexpected permission')
    if command.get('browser_role_parameter') is not False:
        errors.append('evidence.command: browser role parameter must be false')
    if command.get('execution_order') != [
        'validate_environment',
        'authenticate_user',
        'validate_request',
        'check_canonical_permission',
        'execute_transactional_rpc',
    ]:
        errors.append('evidence.command: unexpected execution order')

    authorization = evidence.get('authorization', {})
    for key in ('edge_checks_canonical_permission', 'rpc_rechecks_permission', 'service_role_execute'):
        if authorization.get(key) is not True:
            errors.append(f'evidence.authorization: {key} must be true')
    for key in ('public_execute', 'anon_execute', 'authenticated_execute'):
        if authorization.get(key) is not False:
            errors.append(f'evidence.authorization: {key} must be false')

    postflight = evidence.get('staging_postflight', {})
    for key in ('installation_jobs', 'installation_events', 'installation_comments', 'command_receipts'):
        if postflight.get(key) != 0:
            errors.append(f'evidence.staging_postflight: {key} must be zero')
    for key in ('edge_logs_empty', 'service_role_only'):
        if postflight.get(key) is not True:
            errors.append(f'evidence.staging_postflight: {key} must be true')
    for key in ('browser_table_access', 'browser_rpc_execute'):
        if postflight.get(key) is not False:
            errors.append(f'evidence.staging_postflight: {key} must be false')

    frontend = evidence.get('frontend', {})
    if frontend.get('switch_performed') is not False:
        errors.append('evidence.frontend: switch_performed must remain false')
    if frontend.get('current_write_path') != 'three_direct_browser_writes':
        errors.append('evidence.frontend: current write path must remain explicit')

    current_cycle = evidence.get('current_cycle', {})
    for key in ('new_database_migration_applied', 'new_edge_deploy_performed', 'working_data_changed'):
        if current_cycle.get(key) is not False:
            errors.append(f'evidence.current_cycle: {key} must be false')
    if current_cycle.get('source_and_evidence_sync_only') is not True:
        errors.append('evidence.current_cycle: source_and_evidence_sync_only must be true')

    production = evidence.get('production_boundary', {})
    if production.get('production_project_ref') != PRODUCTION:
        errors.append('evidence.production_boundary: wrong production project ref')
    for key in ('production_migration', 'production_edge_deploy', 'production_frontend_switch', 'production_data_changed'):
        if production.get(key) is not False:
            errors.append(f'evidence.production_boundary: {key} must be false')
    if production.get('explicit_approval_required') is not True:
        errors.append('evidence.production_boundary: explicit approval must be required')

    expected_fingerprints = {
        'leader_installation_command_error': ('d263ee000b817642f549016be44d80de', 365),
        'leader_installation_status_key': ('12243bd5d50a49a8bf7e281d715bba03', 894),
        'leader_installation_status_label': ('3a1082636d166768f2b3334d76e1743d', 555),
        'leader_installation_transition_allowed': ('2463ec1b87fa4cf46a04590ac7e97d60', 600),
        'leader_update_installation_job_rpc': ('0ed4669197dac1f2695e763d0eec54e1', 19061),
    }
    fingerprints = evidence.get('rpc_fingerprints', {})
    for name, (md5, size) in expected_fingerprints.items():
        item = fingerprints.get(name, {})
        if item.get('md5') != md5 or item.get('bytes') != size:
            errors.append(f'evidence.rpc_fingerprints: unexpected {name} fingerprint')

try:
    schema_evidence = json.loads(texts['schema_evidence']) if texts['schema_evidence'] else {}
except json.JSONDecodeError as exc:
    schema_evidence = {}
    errors.append(f'schema_evidence: invalid JSON: {exc}')

if schema_evidence:
    if schema_evidence.get('version') != 2:
        errors.append('schema_evidence: version must be 2')
    if 'installation_completed_at' not in schema_evidence.get('production_baseline', {}).get('order_columns', []):
        errors.append('schema_evidence: installation_completed_at missing')
    deployment = schema_evidence.get('staging_deployment', {})
    if deployment.get('migration_version') != '20260721191810':
        errors.append('schema_evidence: migration version drift')

require('contract', [
    "INSTALLATION_EDGE_CONTRACT_VERSION = 'leader-crm-installation-edge-v1'",
    "INSTALLATION_ACTION = 'installation_job.update'",
    "INSTALLATION_PERMISSION = 'installation.write'",
    "STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'",
    'MAX_BODY_BYTES = 64 * 1024',
    "'request_id'",
    "'expected_updated_at'",
    "'idempotency_key'",
    "'patch'",
    "'install_status'",
    "'scheduled_at'",
])

require('edge', [
    'projectRefFromUrl(supabaseUrl) !== STAGING_PROJECT_REF',
    'authenticatedUser(req, supabaseUrl, publicKey)',
    'validateInstallationRequest(input)',
    'canonicalPermission(',
    'p_action: INSTALLATION_PERMISSION',
    '/rest/v1/rpc/leader_update_installation_job_rpc',
    'actor_id: checked.user.id',
    'actor_email: checked.user.email',
    "result.idempotent_replay === true ? 200 : 201",
])
ordered('edge', [
    'projectRefFromUrl(supabaseUrl) !== STAGING_PROJECT_REF',
    'authenticatedUser(req, supabaseUrl, publicKey)',
    'validateInstallationRequest(input)',
    'canonicalPermission(',
    '/rest/v1/rpc/leader_update_installation_job_rpc',
])

for forbidden in ('payload.role', 'input.role', 'request.role', 'user_metadata.role'):
    if forbidden in texts['edge'] or forbidden in texts['contract']:
        errors.append(f'edge: browser-supplied role marker is forbidden: {forbidden}')

require('schema_migration', [
    'add column if not exists installation_completed_at timestamptz',
    'revoke all on table public.leader_installation_jobs from public, anon, authenticated',
    'grant select, insert, update on table public.leader_installation_jobs to service_role',
])

require('rpc_migration', [
    "project_ref = 'otulfnouybahfnsycxqn'",
    'installation_completed_at_missing',
    'create or replace function public.leader_update_installation_job_rpc',
    "'installation_job.update'",
    "'installation.write'",
    'for update',
    'pg_advisory_xact_lock',
    'installation_completed_at = v_completed_at',
    'insert into public.leader_installation_events',
    'insert into leader_private.leader_command_receipts',
    'update leader_private.leader_command_receipts',
    'security invoker',
    "set search_path = ''",
    'revoke execute on function public.leader_update_installation_job_rpc(jsonb)',
    'grant execute on function public.leader_update_installation_job_rpc(jsonb)',
    'to service_role',
])

if PRODUCTION in texts['edge'] or PRODUCTION in texts['contract'] or PRODUCTION in texts['rpc_migration']:
    errors.append('staging executable source must not contain production project ref')

require('frontend', [
    "supabaseClient.from('leader_installation_jobs').update(patch)",
    "supabaseClient.from('leader_orders').update(",
    "supabaseClient.from('leader_installation_events').insert(",
])
if "functions.invoke('leader-crm-installation'" in texts['frontend']:
    errors.append('frontend: evidence says switch is pending but Edge invocation is already present')

require('status_registry', [
    "installation: domain({",
    "label: 'Не назначен'",
    "label: 'Запланирован'",
    "label: 'Перенесён'",
    "label: 'В работе'",
    "label: 'Выполнен'",
    "label: 'Не требуется'",
    "label: 'Отменён'",
])

require('docs', [
    'Staging installation command Edge v1',
    '`leader-crm-installation`',
    '`1`',
    '`ACTIVE`',
    '`verify_jwt=true`',
    f'`{EDGE_SHA}`',
    '`20260721191810`',
    '`staging_installation_job_update_rpc_20260721`',
    '`installation_job.update`',
    '`installation.write`',
    '`installation_completed_at`',
    'новый Edge deploy и новый migration apply не выполнялись',
    'Frontend switch не выполнен',
    'Production rollout требует отдельного явного согласования',
])

require('workflow', [
    'CRM staging installation command Edge check',
    'deno check supabase/staging-functions/leader-crm-installation/index.ts',
    'python3 -m py_compile tools/check_crm_staging_installation_command_edge.py',
    'python3 tools/check_crm_staging_installation_command_edge.py',
])

for name, text in texts.items():
    if re.search(r'sb_secret_[A-Za-z0-9_-]{10,}', text):
        errors.append(f'{name}: possible secret material')
    if re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}', text):
        errors.append(f'{name}: possible JWT material')

if errors:
    print('Staging installation command Edge checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('Staging installation Edge, RPC, ACL, atomicity, deployment evidence and production boundary are coherent.')
