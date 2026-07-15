#!/usr/bin/env python3
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRODUCTION = 'ofewxuqfjhamgerwzull'
STAGING = 'otulfnouybahfnsycxqn'

MIGRATION = ROOT / 'supabase/staging-migrations/20260715_06_calculation_version_fk_indexes.sql'
DOC = ROOT / 'docs/SUPABASE_STAGING_CALCULATION_VERSION_FK_INDEXES_2026-07-15.md'
WORKFLOW = ROOT / '.github/workflows/crm-calculation-fk-indexes-check.yml'

errors = []

def read(path: Path) -> str:
    if not path.is_file():
        errors.append(f'Missing file: {path.relative_to(ROOT)}')
        return ''
    return path.read_text(encoding='utf-8')

migration = read(MIGRATION)
doc = read(DOC)
workflow = read(WORKFLOW)

if PRODUCTION in migration:
    errors.append('Staging migration must not contain production ref')
if STAGING not in migration:
    errors.append('Staging migration must contain exact staging ref')

for marker in (
    '-- STAGING ONLY.',
    'leader_staging.environment_guard',
    "project_ref = 'otulfnouybahfnsycxqn'",
    "repository = 'deputat36/lider-bsk'",
    "to_regclass('public.leader_lead_calculations')",
    "to_regclass('public.leader_lead_calculation_items')",
    'create index if not exists leader_lead_calculations_need_id_idx',
    'on public.leader_lead_calculations (need_id)',
    'create index if not exists leader_lead_calculation_items_lead_id_idx',
    'on public.leader_lead_calculation_items (lead_id)',
    "raise exception 'calculation_need_index_missing'",
    "raise exception 'calculation_item_lead_index_missing'",
):
    if marker not in migration:
        errors.append(f'Migration missing marker: {marker}')

for forbidden in ('drop index', 'alter table', 'grant ', 'revoke ', 'create policy', 'security definer'):
    if forbidden in migration.lower():
        errors.append(f'Migration contains out-of-scope marker: {forbidden}')

for marker in (
    'unindexed_foreign_keys',
    'public.leader_lead_calculations.need_id',
    'public.leader_lead_calculation_items.lead_id',
    'leader_lead_calculations_need_id_idx',
    'leader_lead_calculation_items_lead_id_idx',
    'Read-only проверка production',
    'Edge Function разворачивается только',
    'Production не изменяется',
):
    if marker not in doc:
        errors.append(f'Documentation missing marker: {marker}')

for marker in (
    'python3 -m py_compile tools/check_crm_calculation_fk_indexes.py',
    'python3 tools/check_crm_calculation_fk_indexes.py',
):
    if marker not in workflow:
        errors.append(f'Workflow missing marker: {marker}')

for label, text in (('migration', migration), ('doc', doc), ('workflow', workflow)):
    if re.search(r'sb_secret_[A-Za-z0-9_-]{10,}', text):
        errors.append(f'{label} contains possible secret material')
    if re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}', text):
        errors.append(f'{label} contains possible JWT material')

for forbidden_prefix in ('nav_', 'parket_', 'broker_'):
    if forbidden_prefix in migration:
        errors.append(f'Migration entered forbidden scope: {forbidden_prefix}')

if errors:
    print('CRM calculation FK index checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('Calculation staging foreign keys have focused covering indexes and exact environment guard.')
