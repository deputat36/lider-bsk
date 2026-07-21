#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
DOC = ROOT / 'docs/SUPABASE_STAGING_CALCULATION_VERSION_DEPLOYMENT_2026-07-15.md'
CANONICAL_DOC = ROOT / 'docs/SUPABASE_STAGING_CALCULATION_OFFER_CANONICAL_PERMISSIONS_2026-07-21.md'
CONFIG = ROOT / 'supabase/config.toml'
INDEX = ROOT / 'supabase/functions/leader-crm-calculations/index.ts'
CONTRACT = ROOT / 'supabase/functions/leader-crm-calculations/contract.ts'
SERVER_CONTRACT = ROOT / 'contracts/calculation-create-version-server-contract-v1.json'
DEPLOYMENT = ROOT / 'contracts/crm-staging-calc-offer-canonical-permissions-v1.json'
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


def require(text: str, markers: tuple[str, ...], label: str) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f'{label}: missing marker {marker}')


doc = read(DOC)
canonical_doc = read(CANONICAL_DOC)
config = read(CONFIG)
index = read(INDEX)
contract = read(CONTRACT)
install = read(INSTALL)
grants = read(GRANTS)
indexes = read(INDEXES)
acceptance = read(ACCEPTANCE)
safe_acceptance = read(SAFE_ACCEPTANCE)
workflow = read(WORKFLOW)

require(doc, (
    'otulfnouybahfnsycxqn',
    'ofewxuqfjhamgerwzull',
    '20260715153753 staging_calculation_version_install_20260715',
    '20260715153930 staging_calculation_version_grant_hardening_20260715',
    '20260715155505 staging_calculation_version_fk_indexes_20260715',
    'version: `5`',
    '`verify_jwt=true`',
    '4cd0bde123d6f6c052e0c5337ca01f17a0f76edfb5adf2eed1975e25e39357a4',
    'public.leader_actor_has_crm_action_rpc',
    'synthetic profiles after rollback = 0',
    'Production rollout остаётся запрещён',
), 'deployment doc')
require(canonical_doc, (
    'active version: `5`',
    '`calculations.write`',
    'role allowlist',
    'Production rollout требует отдельного explicit approval',
), 'canonical doc')

if 'project_id = "ofewxuqfjhamgerwzull"' not in config:
    errors.append('supabase/config.toml must remain pointed at production project ID')
if '[functions.leader-crm-calculations]' not in config or 'verify_jwt = true' not in config:
    errors.append('leader-crm-calculations must remain JWT protected')

require(index, (
    'projectRef !== STAGING_PROJECT_REF',
    "'/rest/v1/rpc/leader_actor_has_crm_action_rpc'",
    'const permissionResult = await canonicalPermission(',
    "'/rest/v1/rpc/leader_create_calculation_version_rpc'",
    'return json(result.idempotent_replay === true ? 200 : 201, result)',
), 'Edge source')
for forbidden in ('canWriteCalculation', 'CALCULATION_WRITE_ROLES', 'leader_user_profiles?user_id=', 'activeProfile('):
    if forbidden in index:
        errors.append(f'Edge source contains removed local authorization marker: {forbidden}')
for forbidden in ('canWriteCalculation', 'CALCULATION_WRITE_ROLES', 'normalizeRole'):
    if forbidden in contract:
        errors.append(f'Calculation contract contains removed role helper: {forbidden}')

permission_pos = index.find('const permissionResult = await canonicalPermission(')
business_pos = index.find("'/rest/v1/rpc/leader_create_calculation_version_rpc'", permission_pos)
if permission_pos < 0 or business_pos < 0 or permission_pos >= business_pos:
    errors.append('Permission RPC must precede business RPC')

for source, markers, label in (
    (install, (
        'leader_create_calculation_version_rpc_internal_v1',
        'security invoker',
        "set search_path = ''",
        'leader_lead_calculations_lead_version_uidx',
        'jsonb_build_object',
    ), 'install'),
    (grants, (
        'revoke all on table public.leader_lead_calculations from public, anon, authenticated, service_role',
        'grant select, insert on table public.leader_lead_calculations to service_role',
        "has_table_privilege('service_role', 'public.leader_lead_calculations', 'UPDATE')",
    ), 'grants'),
    (indexes, (
        'leader_lead_calculations_need_id_idx',
        'leader_lead_calculation_items_lead_id_idx',
        'staging_environment_guard_failed',
    ), 'indexes'),
    (acceptance, (
        'idempotent_replay_failed',
        'idempotency_conflict_not_detected',
        'negative_profit_not_rejected',
        'source_calculation_was_modified',
        'rollback;',
    ), 'acceptance'),
    (safe_acceptance, (
        'calculation_response_projection_drifted',
        'item_response_projection_drifted',
        'receipt_did_not_store_safe_response',
        'browser_execute_privilege_leaked',
        'rollback;',
    ), 'safe acceptance'),
):
    require(source.lower(), tuple(marker.lower() for marker in markers), label)

if 'to_jsonb(v_new_calculation)' in install or 'jsonb_agg(to_jsonb(item_row)' in install:
    errors.append('Canonical install must not expose whole rows')

try:
    server = json.loads(read(SERVER_CONTRACT))
    deployment = json.loads(read(DEPLOYMENT))
except json.JSONDecodeError as exc:
    errors.append(f'Invalid JSON contract: {exc}')
    server = deployment = {}

if server.get('transport', {}).get('staging_version') != 5:
    errors.append('Server contract active version drifted')
if server.get('transport', {}).get('staging_deployment_hash') != '4cd0bde123d6f6c052e0c5337ca01f17a0f76edfb5adf2eed1975e25e39357a4':
    errors.append('Server contract hash drifted')
auth = server.get('authorization', {})
if auth.get('database_permission_rpc') != 'public.leader_actor_has_crm_action_rpc':
    errors.append('Server contract permission RPC drifted')
if auth.get('local_role_allowlist') is not False:
    errors.append('Server contract local allowlist returned')
if deployment.get('functions', {}).get('leader-crm-calculations', {}).get('version') != 5:
    errors.append('Canonical deployment version drifted')

require(workflow, (
    "'docs/SUPABASE_STAGING_CALCULATION_VERSION_DEPLOYMENT_2026-07-15.md'",
    "'tools/check_crm_calculation_deployment_evidence.py'",
    'python3 tools/check_crm_calculation_deployment_evidence.py',
), 'workflow')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('Calculation staging deployment v5 evidence is canonical-permission gated, internally consistent and production remains locked.')
