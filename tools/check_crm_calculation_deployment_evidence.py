#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
DOC = ROOT / 'docs/SUPABASE_STAGING_CALCULATION_VERSION_DEPLOYMENT_2026-07-15.md'
CONFIG = ROOT / 'supabase/config.toml'
INDEX = ROOT / 'supabase/functions/leader-crm-calculations/index.ts'
CONTRACT = ROOT / 'supabase/functions/leader-crm-calculations/contract.ts'
INSTALL = ROOT / 'supabase/staging-migrations/20260715_04_calculation_version_install.sql'
GRANTS = ROOT / 'supabase/staging-migrations/20260715_05_calculation_version_grant_hardening.sql'
INDEXES = ROOT / 'supabase/staging-migrations/20260715_06_calculation_version_fk_indexes.sql'
ACCEPTANCE = ROOT / 'supabase/staging-tests/20260715_calculation_version_acceptance.sql'
SAFE_ACCEPTANCE = ROOT / 'supabase/staging-tests/20260715_calculation_version_safe_response.sql'
WORKFLOW = ROOT / '.github/workflows/crm-calculation-deployment-evidence-check.yml'

errors: list[str] = []


def read(path: Path) -> str:
    if not path.is_file():
        errors.append(f'Missing required file: {path.relative_to(ROOT)}')
        return ''
    return path.read_text(encoding='utf-8')


doc = read(DOC)
config = read(CONFIG)
index = read(INDEX)
contract = read(CONTRACT)
install = read(INSTALL)
grants = read(GRANTS)
indexes = read(INDEXES)
acceptance = read(ACCEPTANCE)
safe_acceptance = read(SAFE_ACCEPTANCE)
workflow = read(WORKFLOW)

required_doc_markers = (
    'otulfnouybahfnsycxqn',
    'ofewxuqfjhamgerwzull',
    '20260715153753 staging_calculation_version_install_20260715',
    '20260715153930 staging_calculation_version_grant_hardening_20260715',
    '20260715155505 staging_calculation_version_fk_indexes_20260715',
    '91b4c99c-a03e-4cfb-ad2a-0ca4de29b7ea',
    'version: `3`',
    '`verify_jwt=true`',
    '0df6d23cc6d8b19903babbf711bb1da765111ff1f64eb7f8e970f1bcc9760ee4',
    'canonical permission `calculations.write`',
    'Superseded v2',
    '`normalizeRole(value)`',
    '`normalizeRole(role)`',
    'v2 не считается валидированным deployment',
    'Edge logs за доступный период — пустые',
    'Auth users — 0',
    'WARN/ERROR — 0',
    'authenticated HTTP 201 create',
    'Production rollout остаётся запрещён',
)
for marker in required_doc_markers:
    if marker not in doc:
        errors.append(f'Missing deployment evidence marker: {marker}')

if 'project_id = "ofewxuqfjhamgerwzull"' not in config:
    errors.append('supabase/config.toml must remain pointed at production project ID')
if '[functions.leader-crm-calculations]' not in config or 'verify_jwt = true' not in config:
    errors.append('leader-crm-calculations must remain JWT protected in config.toml')

for marker in (
    "projectRef !== STAGING_PROJECT_REF",
    "'/rest/v1/rpc/leader_create_calculation_version_rpc'",
    "return json(result.idempotent_replay === true ? 200 : 201, result)",
):
    if marker not in index:
        errors.append(f'Missing Edge deployment boundary marker: {marker}')

for marker in (
    "export const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'",
    "export const CALCULATION_ACTION = 'calculation.create_version'",
    "export const CALCULATION_PERMISSION = 'calculations.write'",
    'return CALCULATION_WRITE_ROLES.has(normalizeRole(role))',
    "'owner'",
    "'admin'",
    "'manager'",
):
    if marker not in contract:
        errors.append(f'Missing calculation contract marker: {marker}')

if 'normalizeRole(value)' in contract.split('export function canWriteCalculation', 1)[-1].split('}', 1)[0]:
    errors.append('canWriteCalculation must normalize its role parameter, not a free value identifier')

for source, markers in (
    (install, (
        'leader_create_calculation_version_rpc_internal_v1',
        'security invoker',
        "set search_path = ''",
        'leader_lead_calculations_lead_version_uidx',
        'jsonb_build_object',
    )),
    (grants, (
        'revoke all on table public.leader_lead_calculations from public, anon, authenticated, service_role',
        'revoke all on table public.leader_lead_calculation_items from public, anon, authenticated, service_role',
        'grant select, insert on table public.leader_lead_calculations to service_role',
        "has_table_privilege('service_role', 'public.leader_lead_calculations', 'UPDATE')",
        "has_table_privilege('authenticated', 'public.leader_lead_calculations', 'SELECT')",
    )),
    (indexes, (
        'leader_lead_calculations_need_id_idx',
        'leader_lead_calculation_items_lead_id_idx',
        'staging_environment_guard_failed',
    )),
    (acceptance, (
        'idempotent_replay_failed',
        'idempotency_conflict_not_detected',
        'negative_profit_not_rejected',
        'source_calculation_was_modified',
        'rollback;',
    )),
    (safe_acceptance, (
        'calculation_response_projection_drifted',
        'item_response_projection_drifted',
        'receipt_did_not_store_safe_response',
        'browser_execute_privilege_leaked',
        'rollback;',
    )),
):
    lowered = source.lower()
    for marker in markers:
        if marker.lower() not in lowered:
            errors.append(f'Missing source evidence marker: {marker}')

if 'to_jsonb(v_new_calculation)' in install:
    errors.append('Canonical install must not expose the whole calculation row')
if 'jsonb_agg(to_jsonb(item_row)' in install:
    errors.append('Canonical install must not expose whole item rows')

required_workflow_markers = (
    "'docs/SUPABASE_STAGING_CALCULATION_VERSION_DEPLOYMENT_2026-07-15.md'",
    "'tools/check_crm_calculation_deployment_evidence.py'",
    'python3 tools/check_crm_calculation_deployment_evidence.py',
)
for marker in required_workflow_markers:
    if marker not in workflow:
        errors.append(f'Missing deployment workflow marker: {marker}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('Calculation staging deployment v3 evidence is internally consistent and production remains gated.')
