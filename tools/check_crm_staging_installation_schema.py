#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGING = 'otulfnouybahfnsycxqn'
PRODUCTION = 'ofewxuqfjhamgerwzull'

FILES = {
    'schema': ROOT / 'supabase/staging-migrations/20260721_05_installation_schema_install.sql',
    'rpc': ROOT / 'supabase/staging-migrations/20260721_06_installation_job_update_rpc.sql',
    'compat': ROOT / 'supabase/staging-migrations/20260721_07_installation_command_compat.sql',
    'index': ROOT / 'supabase/staging-migrations/20260721_09_installation_schema_indexes_reconcile.sql',
    'acceptance': ROOT / 'supabase/staging-tests/20260721_installation_schema_acceptance.sql',
    'contract': ROOT / 'contracts/crm-staging-installation-schema-v1.json',
    'docs': ROOT / 'docs/SUPABASE_STAGING_INSTALLATION_SCHEMA_V1_2026-07-21.md',
    'workflow': ROOT / '.github/workflows/crm-staging-installation-schema-check.yml',
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


for name in ('schema', 'rpc', 'compat', 'index', 'acceptance'):
    require(name, "project_ref = 'otulfnouybahfnsycxqn'", "environment_name = 'staging'", "repository = 'deputat36/lider-bsk'")
    if PRODUCTION in texts[name]:
        errors.append(f'{name}: production ref forbidden in staging SQL')

require('schema',
    'installation_completed_at timestamptz',
    'leader_installation_job_items_order_id_idx',
    'leader_installation_events_order_id_idx',
    'create table if not exists public.leader_installation_job_items')
require('compat',
    '20260721195259',
    'staging_installation_command_compat_20260721',
    'on delete set null',
    'leader_installation_events_order_id_idx')
require('index',
    '20260721200142',
    'staging_installation_schema_indexes_reconcile_20260721',
    'create index if not exists leader_installation_job_items_order_id_idx')
require('acceptance', 'leader_installation_job_items', 'installation_item_insert_failed', 'rollback;')
if not texts['acceptance'].lower().rstrip().endswith('rollback;'):
    errors.append('acceptance must end with ROLLBACK')

try:
    contract = json.loads(texts['contract'])
except Exception as exc:
    contract = {}
    errors.append(f'contract JSON error: {exc}')

if contract:
    for key, value in {
        'contract': 'crm-staging-installation-schema',
        'version': 5,
        'staging_project_ref': STAGING,
        'production_project_ref_read_only': PRODUCTION,
        'environment': 'staging',
    }.items():
        if contract.get(key) != value:
            errors.append(f'contract: {key} must equal {value!r}')

    deployment = contract.get('staging_deployment', {})
    if deployment.get('state') != 'deployed_active_schema_aligned':
        errors.append('contract: schema must be aligned')
    expected_migrations = {
        'command_migration': ('20260721191810', 'staging_installation_job_update_rpc_20260721'),
        'compat_migration': ('20260721195259', 'staging_installation_command_compat_20260721'),
        'index_reconcile_migration': ('20260721200142', 'staging_installation_schema_indexes_reconcile_20260721'),
    }
    for key, expected in expected_migrations.items():
        item = deployment.get(key, {})
        if (item.get('version'), item.get('name')) != expected:
            errors.append(f'contract: {key} identity drift')
    if deployment.get('foreign_keys_aligned_with_production') is not True:
        errors.append('contract: FK alignment missing')
    if deployment.get('covering_indexes_aligned_with_production') is not True:
        errors.append('contract: index alignment missing')
    if any(value != 0 for value in deployment.get('fixture_rows', {}).values()):
        errors.append('contract: fixture rows must be zero')
    if deployment.get('installation_command_receipts') != 0:
        errors.append('contract: receipts must be zero')

    drift = contract.get('deployed_staging_schema_drift', {})
    if drift.get('reconciliation_required') is not False:
        errors.append('contract: reconciliation must be complete')
    if drift.get('foreign_keys') != [] or drift.get('missing_covering_indexes') != []:
        errors.append('contract: remaining schema drift must be empty')
    if drift.get('foreign_keys_aligned_with_production') is not True:
        errors.append('contract: FK final evidence missing')
    if drift.get('covering_indexes_aligned_with_production') is not True:
        errors.append('contract: index final evidence missing')
    if set(drift.get('present_covering_indexes', [])) != {
        'leader_installation_job_items_order_id_idx',
        'leader_installation_events_order_id_idx',
    }:
        errors.append('contract: both order indexes must be present')
    if drift.get('current_cycle_ddl_applied') is not False:
        errors.append('contract: current cycle must remain source-only')

require('docs',
    'Staging installation schema v5',
    '`20260721200142 / staging_installation_schema_indexes_reconcile_20260721`',
    '`leader_installation_job_items_order_id_idx`',
    'missing-FK-index предупреждения',
    'Production не изменялся')
require('workflow',
    'CRM staging installation schema check',
    'python3 -m py_compile tools/check_crm_staging_installation_schema.py',
    'python3 tools/check_crm_staging_installation_schema.py')

for name, text in texts.items():
    if re.search(r'sb_secret_[A-Za-z0-9_-]{10,}', text):
        errors.append(f'{name}: possible secret')
    if re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}', text):
        errors.append(f'{name}: possible JWT')

if errors:
    print('Installation schema v5 checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('Installation schema v5 is aligned, source-synced and production-locked.')
