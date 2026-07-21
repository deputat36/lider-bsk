#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGING = 'otulfnouybahfnsycxqn'
PRODUCTION = 'ofewxuqfjhamgerwzull'

FILES = {
    'migration': ROOT / 'supabase/staging-migrations/20260721_05_installation_schema_install.sql',
    'rpc_migration': ROOT / 'supabase/staging-migrations/20260721_06_installation_job_update_rpc.sql',
    'acceptance': ROOT / 'supabase/staging-tests/20260721_installation_schema_acceptance.sql',
    'contract': ROOT / 'contracts/crm-staging-installation-schema-v1.json',
    'docs': ROOT / 'docs/SUPABASE_STAGING_INSTALLATION_SCHEMA_V1_2026-07-21.md',
    'workflow': ROOT / '.github/workflows/crm-staging-installation-schema-check.yml',
    'status_registry': ROOT / 'crm/v4/assets/v4/status-transitions-v1.js',
    'edge': ROOT / 'supabase/staging-functions/leader-crm-installation/index.ts',
    'edge_contract': ROOT / 'supabase/staging-functions/leader-crm-installation/contract.ts',
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


require('migration', [
    '-- STAGING ONLY.',
    "project_ref = 'otulfnouybahfnsycxqn'",
    "environment_name = 'staging'",
    "repository = 'deputat36/lider-bsk'",
    "raise exception 'staging_environment_guard_failed'",
    'add column if not exists installation_address text',
    'add column if not exists installation_scheduled_at timestamptz',
    'add column if not exists installation_completed_at timestamptz',
    'add column if not exists installer_name text',
    'add column if not exists installer_phone text',
    'create table if not exists public.leader_installation_jobs',
    'create table if not exists public.leader_installation_job_items',
    'create table if not exists public.leader_installation_events',
    'create table if not exists public.leader_installation_comments',
    'foreign key (order_id) references public.leader_orders(id) on delete set null',
    'foreign key (production_job_id) references public.leader_production_jobs(id) on delete set null',
    'foreign key (job_id) references public.leader_installation_jobs(id) on delete cascade',
    'alter table public.leader_installation_jobs enable row level security',
    'alter table public.leader_installation_job_items enable row level security',
    'alter table public.leader_installation_events enable row level security',
    'alter table public.leader_installation_comments enable row level security',
    'revoke all on table public.leader_installation_jobs from public, anon, authenticated',
    'revoke all on table public.leader_installation_job_items from public, anon, authenticated',
    'revoke all on table public.leader_installation_events from public, anon, authenticated',
    'revoke all on table public.leader_installation_comments from public, anon, authenticated',
    'grant select, insert, update on table public.leader_installation_jobs to service_role',
    'grant select, insert on table public.leader_installation_job_items to service_role',
    'grant select, insert on table public.leader_installation_events to service_role',
    'grant select, insert on table public.leader_installation_comments to service_role',
])

production_indexes = [
    'leader_installation_jobs_order_id_idx',
    'leader_installation_jobs_production_job_id_idx',
    'leader_installation_jobs_scheduled_at_idx',
    'leader_installation_jobs_status_idx',
    'leader_installation_items_job_idx',
    'leader_installation_job_items_order_id_idx',
    'leader_installation_events_job_idx',
    'leader_installation_events_order_id_idx',
    'leader_installation_comments_job_idx',
]
require('migration', production_indexes)

for executable in ('migration', 'rpc_migration', 'acceptance', 'edge', 'edge_contract'):
    if PRODUCTION in texts[executable]:
        errors.append(f'{executable}: production ref must not appear in staging executable source')

lowered_migration = texts['migration'].lower()
for forbidden in (
    'grant select on table public.leader_installation_jobs to authenticated',
    'grant update on table public.leader_installation_jobs to authenticated',
    'create policy',
):
    if forbidden in lowered_migration:
        errors.append(f'migration: forbidden scope expansion {forbidden!r}')

require('rpc_migration', [
    '-- STAGING ONLY.',
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

require('acceptance', [
    'begin;',
    "project_ref = 'otulfnouybahfnsycxqn'",
    "environment_name = 'staging'",
    "repository = 'deputat36/lider-bsk'",
    'leader_installation_jobs',
    'leader_installation_job_items',
    'leader_installation_events',
    'leader_installation_comments',
    'installation_item_insert_failed',
    'browser_table_privilege_must_be_closed',
    'service_role_table_privilege_missing',
    'installation_child_cascade_failed',
])
if not texts['acceptance'].lower().rstrip().endswith('rollback;'):
    errors.append('acceptance: script must end with ROLLBACK')
if 'commit;' in texts['acceptance'].lower():
    errors.append('acceptance: COMMIT is forbidden')

try:
    contract = json.loads(texts['contract']) if texts['contract'] else {}
except json.JSONDecodeError as exc:
    contract = {}
    errors.append(f'contract: invalid JSON: {exc}')

if contract:
    expected = {
        'contract': 'crm-staging-installation-schema',
        'version': 3,
        'staging_project_ref': STAGING,
        'production_project_ref_read_only': PRODUCTION,
        'environment': 'staging',
    }
    for key, value in expected.items():
        if contract.get(key) != value:
            errors.append(f'contract: {key} must equal {value!r}')

    deployment = contract.get('staging_deployment', {})
    if deployment.get('state') != 'deployed_active_with_schema_drift':
        errors.append('contract: deployed staging state must expose schema drift')
    if deployment.get('migration_version') != '20260721191810':
        errors.append('contract: unexpected installation migration version')
    if deployment.get('migration_name') != 'staging_installation_job_update_rpc_20260721':
        errors.append('contract: unexpected installation migration name')
    fixture_rows = deployment.get('fixture_rows', {})
    for table in (
        'leader_installation_jobs',
        'leader_installation_job_items',
        'leader_installation_events',
        'leader_installation_comments',
    ):
        if fixture_rows.get(table) != 0:
            errors.append(f'contract: {table} fixture count must be zero')
    if deployment.get('installation_command_receipts') != 0:
        errors.append('contract: installation receipts must be zero')

    baseline = contract.get('production_baseline', {})
    tables = baseline.get('tables', {})
    expected_columns = {
        'leader_installation_jobs': 30,
        'leader_installation_job_items': 12,
        'leader_installation_events': 9,
        'leader_installation_comments': 7,
    }
    for table, count in expected_columns.items():
        if tables.get(table, {}).get('columns') != count:
            errors.append(f'contract: {table} column count must equal {count}')
    if 'installation_completed_at' not in baseline.get('order_columns', []):
        errors.append('contract: production order columns must include installation_completed_at')

    historical = contract.get('historical_staging_gap_before_deployment', {})
    if sorted(historical.get('missing_tables', [])) != sorted(expected_columns):
        errors.append('contract: historical missing table inventory is incomplete')
    if 'installation_completed_at' not in historical.get('missing_order_columns', []):
        errors.append('contract: historical gap must include installation_completed_at')

    drift = contract.get('deployed_staging_schema_drift', {})
    if drift.get('reconciliation_required') is not True:
        errors.append('contract: schema reconciliation must remain required')
    if drift.get('current_cycle_ddl_applied') is not False:
        errors.append('contract: current cycle must not claim reconciliation DDL')
    foreign_key_drift = drift.get('foreign_keys', [])
    expected_drift_tables = {
        'leader_installation_jobs',
        'leader_installation_job_items',
        'leader_installation_events',
    }
    if {item.get('table') for item in foreign_key_drift} != expected_drift_tables:
        errors.append('contract: deployed FK drift inventory is incomplete')
    for item in foreign_key_drift:
        if item.get('deployed') != 'ON DELETE CASCADE' or item.get('production_baseline') != 'ON DELETE SET NULL':
            errors.append('contract: unexpected FK drift semantics')
    if set(drift.get('missing_covering_indexes', [])) != {
        'leader_installation_job_items_order_id_idx',
        'leader_installation_events_order_id_idx',
    }:
        errors.append('contract: missing covering index inventory is incomplete')

    access = contract.get('staging_access_model', {})
    for key in ('browser_policies', 'public_privileges', 'anon_privileges', 'authenticated_privileges'):
        if access.get(key) is not False:
            errors.append(f'contract: {key} must be false')
    if 'leader_installation_job_items' not in access.get('service_role', {}):
        errors.append('contract: service_role access for installation job items is missing')

    functions = contract.get('staging_functions', {})
    expected_fingerprints = {
        'leader_installation_command_error': ('d263ee000b817642f549016be44d80de', 365),
        'leader_installation_status_key': ('12243bd5d50a49a8bf7e281d715bba03', 894),
        'leader_installation_status_label': ('3a1082636d166768f2b3334d76e1743d', 555),
        'leader_installation_transition_allowed': ('2463ec1b87fa4cf46a04590ac7e97d60', 600),
        'leader_update_installation_job_rpc': ('0ed4669197dac1f2695e763d0eec54e1', 19061),
    }
    for name, (md5, size) in expected_fingerprints.items():
        item = functions.get(name, {})
        if item.get('md5') != md5 or item.get('bytes') != size or item.get('service_role_only') is not True:
            errors.append(f'contract: unexpected fingerprint or ACL evidence for {name}')

    not_in_scope = set(contract.get('not_in_scope', []))
    for marker in ('staging schema reconciliation DDL', 'frontend switch', 'production migration', 'nav_*'):
        if marker not in not_in_scope:
            errors.append(f'contract: missing not_in_scope marker {marker!r}')

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

require('edge', [
    'projectRefFromUrl(supabaseUrl) !== STAGING_PROJECT_REF',
    'authenticatedUser(req, supabaseUrl, publicKey)',
    'validateInstallationRequest(input)',
    '/rest/v1/rpc/leader_update_installation_job_rpc',
])
require('edge_contract', [
    "INSTALLATION_EDGE_CONTRACT_VERSION = 'leader-crm-installation-edge-v1'",
    "INSTALLATION_ACTION = 'installation_job.update'",
    "INSTALLATION_PERMISSION = 'installation.write'",
    "STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'",
])

require('docs', [
    'Staging installation schema v3',
    '`leader_installation_job_items`: 12 полей',
    '`installation_completed_at`',
    '`20260721191810`',
    '`staging_installation_job_update_rpc_20260721`',
    'deployed schema drift',
    '`leader_installation_job_items_order_id_idx`',
    '`leader_installation_events_order_id_idx`',
    'Reconciliation требуется',
    'новые миграции и Edge Functions не применялись',
    'Production не изменялся',
])

require('workflow', [
    'CRM staging installation schema check',
    'python3 -m py_compile tools/check_crm_staging_installation_schema.py',
    'python3 tools/check_crm_staging_installation_schema.py',
])

for name, text in texts.items():
    if re.search(r'sb_secret_[A-Za-z0-9_-]{10,}', text):
        errors.append(f'{name}: possible secret material')
    if re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}', text):
        errors.append(f'{name}: possible JWT material')

if errors:
    print('Staging installation schema checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('Full installation schema target, deployed drift, RPC prerequisites, grants and production boundary are coherent.')
