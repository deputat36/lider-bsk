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
    'acceptance': ROOT / 'supabase/staging-tests/20260721_installation_schema_acceptance.sql',
    'contract': ROOT / 'contracts/crm-staging-installation-schema-v1.json',
    'docs': ROOT / 'docs/SUPABASE_STAGING_INSTALLATION_SCHEMA_V1_2026-07-21.md',
    'workflow': ROOT / '.github/workflows/crm-staging-installation-schema-check.yml',
    'status_registry': ROOT / 'crm/v4/assets/v4/status-transitions-v1.js',
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
    'add column if not exists installer_name text',
    'add column if not exists installer_phone text',
    'create table if not exists public.leader_installation_jobs',
    'create table if not exists public.leader_installation_events',
    'create table if not exists public.leader_installation_comments',
    'foreign key (order_id) references public.leader_orders(id) on delete set null',
    'foreign key (production_job_id) references public.leader_production_jobs(id) on delete set null',
    'foreign key (job_id) references public.leader_installation_jobs(id) on delete cascade',
    'alter table public.leader_installation_jobs enable row level security',
    'alter table public.leader_installation_events enable row level security',
    'alter table public.leader_installation_comments enable row level security',
    'revoke all on table public.leader_installation_jobs from public, anon, authenticated',
    'revoke all on table public.leader_installation_events from public, anon, authenticated',
    'revoke all on table public.leader_installation_comments from public, anon, authenticated',
    'grant select, insert, update on table public.leader_installation_jobs to service_role',
    'grant select, insert on table public.leader_installation_events to service_role',
    'grant select, insert on table public.leader_installation_comments to service_role',
])

required_indexes = [
    'leader_installation_jobs_order_id_idx',
    'leader_installation_jobs_production_job_id_idx',
    'leader_installation_jobs_scheduled_at_idx',
    'leader_installation_jobs_status_idx',
    'leader_installation_events_job_idx',
    'leader_installation_events_order_id_idx',
    'leader_installation_comments_job_idx',
]
require('migration', required_indexes)

if PRODUCTION in texts['migration'] or PRODUCTION in texts['acceptance']:
    errors.append('staging executable SQL must not contain production project ref')

lowered_migration = texts['migration'].lower()
for forbidden in (
    'grant select on table public.leader_installation_jobs to authenticated',
    'grant update on table public.leader_installation_jobs to authenticated',
    'create policy',
    'leader_update_installation_job_rpc',
):
    if forbidden in lowered_migration:
        errors.append(f'migration: forbidden scope expansion {forbidden!r}')

require('acceptance', [
    'begin;',
    "project_ref = 'otulfnouybahfnsycxqn'",
    "environment_name = 'staging'",
    "repository = 'deputat36/lider-bsk'",
    'installation_schema_missing',
    'leader_installation_jobs',
    'leader_installation_events',
    'leader_installation_comments',
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
        'version': 1,
        'staging_project_ref': STAGING,
        'production_project_ref_read_only': PRODUCTION,
        'environment': 'staging',
    }
    for key, value in expected.items():
        if contract.get(key) != value:
            errors.append(f'contract: {key} must equal {value!r}')

    baseline = contract.get('production_baseline', {}).get('tables', {})
    expected_columns = {
        'leader_installation_jobs': 30,
        'leader_installation_events': 9,
        'leader_installation_comments': 7,
    }
    for table, count in expected_columns.items():
        if baseline.get(table, {}).get('columns') != count:
            errors.append(f'contract: {table} column count must equal {count}')

    gap = contract.get('staging_gap_before_migration', {})
    if sorted(gap.get('missing_tables', [])) != sorted(expected_columns):
        errors.append('contract: missing_tables does not match audited staging gap')

    access = contract.get('staging_access_model', {})
    for key in ('browser_policies', 'public_privileges', 'anon_privileges', 'authenticated_privileges'):
        if access.get(key) is not False:
            errors.append(f'contract: {key} must be false')

    not_in_scope = set(contract.get('not_in_scope', []))
    for marker in ('leader_update_installation_job_rpc', 'installation Edge deploy', 'frontend switch', 'production migration', 'nav_*'):
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

require('docs', [
    'Staging installation schema v1',
    '`otulfnouybahfnsycxqn`',
    '`ofewxuqfjhamgerwzull`',
    '`20260721_05_installation_schema_install.sql`',
    '`20260721_installation_schema_acceptance.sql`',
    'не применялась',
    'Production не изменялся',
    'leader_update_installation_job_rpc',
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

print('Staging installation schema, grants, acceptance, status registry and production boundary are coherent.')
