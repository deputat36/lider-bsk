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
    'final': ROOT / 'supabase/staging-migrations/20260721_08_installation_items_order_index_candidate.sql',
    'rollback': ROOT / 'supabase/staging-rollbacks/20260721_08_installation_items_order_index_rollback.sql',
    'acceptance': ROOT / 'supabase/staging-tests/20260721_installation_schema_acceptance.sql',
    'contract': ROOT / 'contracts/crm-staging-installation-schema-v1.json',
    'docs': ROOT / 'docs/SUPABASE_STAGING_INSTALLATION_SCHEMA_V1_2026-07-21.md',
    'workflow': ROOT / '.github/workflows/crm-staging-installation-schema-check.yml',
    'status': ROOT / 'crm/v4/assets/v4/status-transitions-v1.js',
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


try:
    contract = json.loads(texts['contract']) if texts['contract'] else {}
except json.JSONDecodeError as exc:
    contract = {}
    errors.append(f'contract JSON invalid: {exc}')

for key, value in {
    'contract': 'crm-staging-installation-schema',
    'version': 5,
    'staging_project_ref': STAGING,
    'production_project_ref_read_only': PRODUCTION,
    'environment': 'staging',
}.items():
    if contract.get(key) != value:
        errors.append(f'contract: {key} drifted')

deployment = contract.get('staging_deployment', {})
if deployment.get('state') != 'deployed_active_reconciled':
    errors.append('contract: staging state must be reconciled')
for key, version, name in [
    ('command_migration','20260721191810','staging_installation_job_update_rpc_20260721'),
    ('compat_migration','20260721195259','staging_installation_command_compat_20260721'),
    ('final_index_migration','20260721200142','staging_installation_schema_indexes_reconcile_20260721'),
]:
    item = deployment.get(key, {})
    if item.get('version') != version or item.get('name') != name:
        errors.append(f'contract: {key} evidence drifted')
if deployment.get('canonical_index_count') != 9:
    errors.append('contract: canonical index count must be 9')
if deployment.get('foreign_keys_aligned_with_production') is not True:
    errors.append('contract: foreign keys must be aligned')
if any(value != 0 for value in (deployment.get('fixture_rows') or {}).values()):
    errors.append('contract: fixture rows must remain zero')
if deployment.get('installation_command_receipts') != 0:
    errors.append('contract: receipts must remain zero')

drift = contract.get('deployed_staging_schema_drift', {})
if drift.get('reconciliation_required') is not False or drift.get('reconciliation_completed') is not True:
    errors.append('contract: reconciliation completion drifted')
if drift.get('foreign_keys') != [] or drift.get('missing_covering_indexes') != []:
    errors.append('contract: no FK or index drift may remain')
if drift.get('canonical_index_count') != 9:
    errors.append('contract: reconciled canonical index count must be 9')
for key in ('current_cycle_ddl_applied','post_reconcile_command_smoke','idempotent_replay','synthetic_cleanup_zero'):
    if drift.get(key) is not True:
        errors.append(f'contract: {key} must be true')

access = contract.get('staging_access_model', {})
for key in ('browser_policies','public_privileges','anon_privileges','authenticated_privileges'):
    if access.get(key) is not False:
        errors.append(f'contract access: {key} must be false')
if access.get('service_role_only') is not True:
    errors.append('contract access: service_role_only must be true')

rpc = (contract.get('staging_functions') or {}).get('leader_update_installation_job_rpc', {})
if rpc.get('md5') != '0ed4669197dac1f2695e763d0eec54e1' or rpc.get('bytes') != 19061:
    errors.append('contract: RPC fingerprint drifted')
for key in ('service_role_only','security_invoker','empty_search_path'):
    if rpc.get(key) is not True:
        errors.append(f'contract RPC: {key} must be true')

require('compat', [
    '20260721195259',
    'on delete set null',
    'leader_installation_events_order_id_idx',
])
require('final', [
    'APPLIED RECONCILIATION SOURCE',
    '20260721200142',
    'create index if not exists leader_installation_job_items_order_id_idx',
    'leader_installation_items_job_idx',
    'leader_installation_comments_job_idx',
])
require('rollback', [
    'drop index if exists public.leader_installation_job_items_order_id_idx',
    'drop index if exists public.leader_installation_comments_job_idx',
    'rename to leader_installation_job_items_job_id_idx',
])
require('schema', [
    'create table if not exists public.leader_installation_jobs',
    'create table if not exists public.leader_installation_job_items',
    'create table if not exists public.leader_installation_events',
    'create table if not exists public.leader_installation_comments',
])
require('rpc', [
    'create or replace function public.leader_update_installation_job_rpc',
    "'installation_job.update'", "'installation.write'",
    'security invoker', "set search_path = ''",
])
require('acceptance', ['begin;', 'has_table_privilege', 'rollback;'])
require('status', [
    "installation: domain({", "label: 'Не назначен'", "label: 'Запланирован'",
    "label: 'Перенесён'", "label: 'В работе'", "label: 'Выполнен'",
])
require('docs', [
    'Staging installation schema v5',
    '`20260721200142`',
    'все девять canonical-индексов',
    'Missing FK-index advisory больше не возвращается',
    'Production исследован только read-only',
])
require('workflow', [
    '20260721_08_installation_items_order_index_candidate.sql',
    '20260721_08_installation_items_order_index_rollback.sql',
    'python3 tools/check_crm_staging_installation_schema.py',
])

for name in ('schema','rpc','compat','final','rollback','acceptance'):
    if PRODUCTION in texts[name]:
        errors.append(f'{name}: production ref forbidden in staging SQL')
    if re.search(r'sb_secret_[A-Za-z0-9_-]{10,}', texts[name]):
        errors.append(f'{name}: possible secret material')

production_migrations = ROOT / 'supabase/migrations'
if production_migrations.exists():
    for path in production_migrations.rglob('*.sql'):
        if 'staging_installation_schema_indexes_reconcile_20260721' in path.read_text(encoding='utf-8'):
            errors.append(f'production migration boundary violated: {path.relative_to(ROOT)}')

if errors:
    print('CRM staging installation schema v5 checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)
print('CRM staging installation schema v5 is fully reconciled and production-safe.')
