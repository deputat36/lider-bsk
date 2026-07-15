#!/usr/bin/env python3
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGING = 'otulfnouybahfnsycxqn'
PRODUCTION = 'ofewxuqfjhamgerwzull'

FILES = {
    'install': ROOT / 'supabase/staging-migrations/20260715_04_calculation_version_install.sql',
    'grants': ROOT / 'supabase/staging-migrations/20260715_05_calculation_version_grant_hardening.sql',
    'indexes': ROOT / 'supabase/staging-migrations/20260715_06_calculation_version_fk_indexes.sql',
    'acceptance': ROOT / 'supabase/staging-tests/20260715_calculation_version_acceptance.sql',
    'safe_acceptance': ROOT / 'supabase/staging-tests/20260715_calculation_version_safe_response.sql',
    'readme': ROOT / 'supabase/staging-tests/README.md',
    'report': ROOT / 'docs/SUPABASE_STAGING_CALCULATION_VERSION_VERIFICATION_2026-07-15.md',
    'edge': ROOT / 'supabase/functions/leader-crm-calculations/index.ts',
    'contract': ROOT / 'supabase/functions/leader-crm-calculations/contract.ts',
    'workflow': ROOT / '.github/workflows/crm-calculation-staging-install-check.yml',
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
    text = texts[name]
    for marker in markers:
        if marker not in text:
            errors.append(f'{name}: missing marker {marker!r}')


for name in ('install', 'grants', 'indexes', 'acceptance', 'safe_acceptance', 'readme', 'contract'):
    if STAGING not in texts[name]:
        errors.append(f'{name}: exact staging ref is missing')

for name in ('install', 'grants', 'indexes', 'acceptance', 'safe_acceptance', 'edge', 'contract'):
    if PRODUCTION in texts[name]:
        errors.append(f'{name}: production ref must not appear in staging executable source')

require('indexes', [
    'leader_lead_calculations_need_id_idx',
    'leader_lead_calculation_items_lead_id_idx',
    'leader_staging.environment_guard',
])

for name in ('acceptance', 'safe_acceptance'):
    lowered = texts[name].lower()
    if 'begin;' not in lowered:
        errors.append(f'{name}: transaction BEGIN is missing')
    if not lowered.rstrip().endswith('rollback;'):
        errors.append(f'{name}: script must end with ROLLBACK')
    require(name, [
        'leader_staging.environment_guard',
        "project_ref = 'otulfnouybahfnsycxqn'",
        "environment_name = 'staging'",
        "repository = 'deputat36/lider-bsk'",
    ])

require('readme', [
    'Canonical clean-staging order',
    '20260715_04_calculation_version_install.sql',
    '20260715_05_calculation_version_grant_hardening.sql',
    '20260715_06_calculation_version_fk_indexes.sql',
    '20260715_calculation_version_acceptance.sql',
    '20260715_calculation_version_safe_response.sql',
    'Migrations `20260715_02` and `20260715_03` are retained as design and patch history',
    'still mention 02/03',
    'end with `ROLLBACK`',
    'must leave zero fixture profiles, leads, needs, calculations and receipts',
    'Production rollout remains a separate explicit approval gate',
])

require('report', [
    'Staging project: `otulfnouybahfnsycxqn`',
    'Production project: `ofewxuqfjhamgerwzull` — read-only',
    '`20260715153753` — `staging_calculation_version_install_20260715`',
    '`20260715153930` — `staging_calculation_version_grant_hardening_20260715`',
    '`20260715155505` — `staging_calculation_version_fk_indexes_20260715`',
    '`leader-crm-calculations`',
    'version `1`',
    '`verify_jwt=true`',
    'fixture profiles: `0`',
    'fixture leads: `0`',
    'fixture needs: `0`',
    'fixture calculations: `0`',
    'fixture receipts: `0`',
    '`service_role SELECT`: `true`',
    '`service_role INSERT`: `true`',
    '`service_role UPDATE`: `false`',
    '`service_role DELETE`: `false`',
    '`authenticated` can execute the wrapper: `false`',
    '`leader_lead_calculations_need_id_idx`: present',
    '`leader_lead_calculation_items_lead_id_idx`: present',
    'INFO-only `rls_enabled_no_policy`',
    'INFO-only `unused_index`',
    'authenticated staging Edge integration',
    'No production migration, data change, RLS change or Edge deployment was performed',
])

require('edge', [
    'STAGING_PROJECT_REF',
    '/rest/v1/rpc/leader_create_calculation_version_rpc',
    'validateCalculationRequest(input)',
])
require('contract', [
    "export const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'",
    "export const CALCULATION_EDGE_CONTRACT_VERSION = 'leader-crm-calculations-edge-v1'",
    "export const CALCULATION_ACTION = 'calculation.create_version'",
    "export const CALCULATION_PERMISSION = 'calculations.write'",
])

require('workflow', [
    "- 'supabase/staging-migrations/20260715_06_calculation_version_fk_indexes.sql'",
    "- 'supabase/staging-tests/README.md'",
    "- 'docs/SUPABASE_STAGING_CALCULATION_VERSION_VERIFICATION_2026-07-15.md'",
    "- 'tools/check_crm_calculation_staging_verification.py'",
    'python3 -m py_compile tools/check_crm_calculation_staging_verification.py',
    'python3 tools/check_crm_calculation_staging_verification.py',
])

for name, text in texts.items():
    if re.search(r'sb_secret_[A-Za-z0-9_-]{10,}', text):
        errors.append(f'{name}: possible secret material')
    if re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}', text):
        errors.append(f'{name}: possible JWT material')

if errors:
    print('Calculation staging verification checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('Calculation staging migrations, rollback acceptance, safe response, grants, indexes and evidence are coherent.')
