#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGING = 'otulfnouybahfnsycxqn'
PRODUCTION = 'ofewxuqfjhamgerwzull'

PATHS = {
    'schema': ROOT / 'supabase/staging-migrations/20260721_05_installation_schema_install.sql',
    'rpc': ROOT / 'supabase/staging-migrations/20260721_06_installation_job_update_rpc.sql',
    'compat': ROOT / 'supabase/staging-migrations/20260721_07_installation_command_compat.sql',
    'candidate': ROOT / 'supabase/staging-migrations/20260721_08_installation_items_order_index_candidate.sql',
    'rollback': ROOT / 'supabase/staging-rollbacks/20260721_08_installation_items_order_index_rollback.sql',
    'acceptance': ROOT / 'supabase/staging-tests/20260721_installation_schema_acceptance.sql',
    'contract': ROOT / 'contracts/crm-staging-installation-schema-v1.json',
    'docs': ROOT / 'docs/SUPABASE_STAGING_INSTALLATION_SCHEMA_V1_2026-07-21.md',
    'workflow': ROOT / '.github/workflows/crm-staging-installation-schema-check.yml',
    'registry': ROOT / 'crm/v4/assets/v4/status-transitions-v1.js',
}

errors = []
texts = {}
for name, path in PATHS.items():
    if not path.is_file():
        errors.append(f'Missing file: {path.relative_to(ROOT)}')
        texts[name] = ''
    else:
        texts[name] = path.read_text(encoding='utf-8')


def require(name, *markers):
    for marker in markers:
        if marker not in texts[name]:
            errors.append(f'{name}: missing marker {marker!r}')


for name in ('schema', 'rpc', 'compat', 'candidate', 'rollback', 'acceptance'):
    require(name, "project_ref = 'otulfnouybahfnsycxqn'", "environment_name = 'staging'", "repository = 'deputat36/lider-bsk'")
    if PRODUCTION in texts[name]:
        errors.append(f'{name}: production ref is forbidden in staging executable SQL')

require('schema',
    'installation_completed_at timestamptz',
    'create table if not exists public.leader_installation_jobs',
    'create table if not exists public.leader_installation_job_items',
    'create table if not exists public.leader_installation_events',
    'create table if not exists public.leader_installation_comments',
    'leader_installation_job_items_order_id_idx',
    'leader_installation_events_order_id_idx',
    'revoke all on table public.leader_installation_job_items from public, anon, authenticated',
    'grant select, insert on table public.leader_installation_job_items to service_role')

require('compat',
    '20260721195259',
    'staging_installation_command_compat_20260721',
    'leader_installation_jobs_order_id_fkey',
    'leader_installation_job_items_order_id_fkey',
    'leader_installation_events_order_id_fkey',
    'on delete set null',
    'leader_installation_events_order_id_idx')

require('candidate',
    'SOURCE-ONLY CANDIDATE, NOT APPLIED',
    'installation_items_order_index_already_exists',
    'create index leader_installation_job_items_order_id_idx')
require('rollback', 'drop index if exists public.leader_installation_job_items_order_id_idx')

require('acceptance',
    'begin;',
    'leader_installation_job_items',
    'installation_item_insert_failed',
    'browser_table_privilege_must_be_closed',
    'service_role_table_privilege_missing',
    'installation_child_cascade_failed')
if not texts['acceptance'].lower().rstrip().endswith('rollback;'):
    errors.append('acceptance: script must end with ROLLBACK')
if 'commit;' in texts['acceptance'].lower():
    errors.append('acceptance: COMMIT is forbidden')

try:
    contract = json.loads(texts['contract'])
except Exception as exc:
    contract = {}
    errors.append(f'contract: invalid JSON: {exc}')

if contract:
    expected = {
        'contract': 'crm-staging-installation-schema',
        'version': 4,
        'staging_project_ref': STAGING,
        'production_project_ref_read_only': PRODUCTION,
        'environment': 'staging',
    }
    for key, value in expected.items():
        if contract.get(key) != value:
            errors.append(f'contract: {key} must equal {value!r}')

    deployment = contract.get('staging_deployment', {})
    if deployment.get('state') != 'deployed_active_with_one_missing_index':
        errors.append('contract: unexpected deployment state')
    command = deployment.get('command_migration', {})
    compat = deployment.get('compat_migration', {})
    if (command.get('version'), command.get('name')) != ('20260721191810', 'staging_installation_job_update_rpc_20260721'):
        errors.append('contract: command migration identity drift')
    if (compat.get('version'), compat.get('name')) != ('20260721195259', 'staging_installation_command_compat_20260721'):
        errors.append('contract: compat migration identity drift')
    if deployment.get('foreign_keys_aligned_with_production') is not True:
        errors.append('contract: foreign keys must be aligned')
    if deployment.get('events_order_index_present') is not True:
        errors.append('contract: events order index must be present')
    for count in deployment.get('fixture_rows', {}).values():
        if count != 0:
            errors.append('contract: fixture row counts must be zero')
    if deployment.get('installation_command_receipts') != 0:
        errors.append('contract: installation receipts must be zero')

    drift = contract.get('deployed_staging_schema_drift', {})
    if drift.get('reconciliation_required') is not True:
        errors.append('contract: one-index reconciliation must remain required')
    if drift.get('foreign_keys') != [] or drift.get('foreign_keys_aligned_with_production') is not True:
        errors.append('contract: FK drift must be empty and aligned')
    if drift.get('missing_covering_indexes') != ['leader_installation_job_items_order_id_idx']:
        errors.append('contract: exactly one missing covering index is expected')
    if drift.get('present_covering_indexes') != ['leader_installation_events_order_id_idx']:
        errors.append('contract: events order index evidence is missing')
    if drift.get('current_cycle_ddl_applied') is not False:
        errors.append('contract: current cycle must not claim index DDL')

    baseline = contract.get('production_baseline', {}).get('tables', {})
    expected_columns = {
        'leader_installation_jobs': 30,
        'leader_installation_job_items': 12,
        'leader_installation_events': 9,
        'leader_installation_comments': 7,
    }
    for table, count in expected_columns.items():
        if baseline.get(table, {}).get('columns') != count:
            errors.append(f'contract: {table} must have {count} baseline columns')

require('registry',
    "installation: domain({",
    "label: 'Не назначен'",
    "label: 'Запланирован'",
    "label: 'Перенесён'",
    "label: 'В работе'",
    "label: 'Выполнен'",
    "label: 'Не требуется'",
    "label: 'Отменён'")

require('docs',
    'Staging installation schema v4',
    '`20260721195259`',
    '`staging_installation_command_compat_20260721`',
    '`leader_installation_job_items_order_id_idx`',
    'Кандидат в текущем цикле не применялся',
    'Production не изменялся')
require('workflow',
    'CRM staging installation schema check',
    'python3 -m py_compile tools/check_crm_staging_installation_schema.py',
    'python3 tools/check_crm_staging_installation_schema.py')

for name, text in texts.items():
    if re.search(r'sb_secret_[A-Za-z0-9_-]{10,}', text):
        errors.append(f'{name}: possible secret material')
    if re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}', text):
        errors.append(f'{name}: possible JWT material')

if errors:
    print('Staging installation schema v4 checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('Installation schema v4, compat migration, one-index candidate, rollback and production boundary are coherent.')
