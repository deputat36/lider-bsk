#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGING = 'otulfnouybahfnsycxqn'
PRODUCTION = 'ofewxuqfjhamgerwzull'

PATHS = {
    'calc_index': ROOT / 'supabase/functions/leader-crm-calculations/index.ts',
    'calc_contract': ROOT / 'supabase/functions/leader-crm-calculations/contract.ts',
    'calc_test': ROOT / 'supabase/functions/leader-crm-calculations/contract_test.ts',
    'offer_index': ROOT / 'supabase/staging-functions/leader-crm-offers/index.ts',
    'offer_contract': ROOT / 'supabase/staging-functions/leader-crm-offers/contract.ts',
    'offer_test': ROOT / 'supabase/staging-functions/leader-crm-offers/contract_test.ts',
    'deployment': ROOT / 'contracts/crm-staging-calc-offer-canonical-permissions-v1.json',
    'legacy_calc_contract': ROOT / 'contracts/calculation-create-version-server-contract-v1.json',
    'doc': ROOT / 'docs/SUPABASE_STAGING_CALCULATION_OFFER_CANONICAL_PERMISSIONS_2026-07-21.md',
    'workflow': ROOT / '.github/workflows/crm-staging-calc-offer-canonical-permissions-check.yml',
}


def read(name: str) -> str:
    path = PATHS[name]
    if not path.is_file():
        raise AssertionError(f'missing file: {path.relative_to(ROOT)}')
    return path.read_text(encoding='utf-8')


def require(text: str, markers: list[str] | tuple[str, ...], label: str) -> None:
    for marker in markers:
        if marker not in text:
            raise AssertionError(f'{label}: missing marker {marker!r}')


def forbid(text: str, markers: list[str] | tuple[str, ...], label: str) -> None:
    for marker in markers:
        if marker in text:
            raise AssertionError(f'{label}: forbidden marker {marker!r}')


def ordered(text: str, markers: list[str], label: str) -> None:
    positions = []
    start = 0
    for marker in markers:
        position = text.find(marker, start)
        if position < 0:
            raise AssertionError(f'{label}: order marker missing {marker!r}')
        positions.append(position)
        start = position + len(marker)
    if positions != sorted(positions):
        raise AssertionError(f'{label}: call order drifted')


def main() -> int:
    texts = {name: read(name) for name in PATHS}
    calc_index = texts['calc_index']
    calc_contract = texts['calc_contract']
    calc_test = texts['calc_test']
    offer_index = texts['offer_index']
    offer_contract = texts['offer_contract']
    offer_test = texts['offer_test']
    doc = texts['doc']
    workflow = texts['workflow']

    require(calc_index, [
        "CALCULATION_PERMISSION",
        "'/rest/v1/rpc/leader_actor_has_crm_action_rpc'",
        "body: JSON.stringify({ p_actor_id: actorId, p_action: permission })",
        "const permissionResult = await canonicalPermission(",
        "if (!permissionResult.allowed)",
        "'/rest/v1/rpc/leader_create_calculation_version_rpc'",
        "permission_check_failed",
    ], 'calculation Edge')
    forbid(calc_index, [
        'canWriteCalculation',
        'CALCULATION_WRITE_ROLES',
        'leader_user_profiles?user_id=',
        'activeProfile(',
        'profileResult.profile.role',
    ], 'calculation Edge')
    forbid(calc_contract + calc_test, [
        'CALCULATION_WRITE_ROLES',
        'canWriteCalculation',
        'canonical calculation-write roles are allowed',
    ], 'calculation contract')
    ordered(calc_index, [
        'const checked = await authenticatedUser',
        'const validation = validateCalculationRequest',
        'const permissionResult = await canonicalPermission(',
        "'/rest/v1/rpc/leader_create_calculation_version_rpc'",
    ], 'calculation Edge')

    require(offer_index, [
        "OFFER_PERMISSION",
        "'/rest/v1/rpc/leader_actor_has_crm_action_rpc'",
        "body: JSON.stringify({ p_actor_id: actorId, p_action: permission })",
        "const permissionResult = await canonicalPermission(",
        "if (!permissionResult.allowed)",
        "'/rest/v1/rpc/leader_create_offer_from_calculation_rpc'",
        "permission_check_failed",
    ], 'offer Edge')
    forbid(offer_index + offer_contract + offer_test, [
        'canWriteOffer',
        'OFFER_WRITE_ROLES',
        'leader_user_profiles?user_id=',
        'activeProfile(',
        'profileResult.profile.role',
    ], 'offer contract')
    ordered(offer_index, [
        'const checked = await authenticatedUser',
        'const validation = validateOfferRequest',
        'const permissionResult = await canonicalPermission(',
        "'/rest/v1/rpc/leader_create_offer_from_calculation_rpc'",
    ], 'offer Edge')

    require(calc_contract, [
        "CALCULATION_PERMISSION = 'calculations.write'",
        f"STAGING_PROJECT_REF = '{STAGING}'",
        'MAX_CALCULATION_ITEMS = 200',
    ], 'calculation contract')
    require(offer_contract, [
        "OFFER_PERMISSION = 'offers.write'",
        f"STAGING_PROJECT_REF = '{STAGING}'",
        'validateOfferRequest',
    ], 'offer contract')
    require(calc_test, [
        'canonical permission matches CRM action registry',
        'server-owned envelope and payload fields are rejected',
        'RPC error codes map to stable HTTP statuses',
    ], 'calculation test')
    require(offer_test, [
        'offer permission and staging ref are canonical',
        'browser actor and server fields are rejected',
        'unknown action and response statuses are stable',
    ], 'offer test')

    deployment = json.loads(texts['deployment'])
    if deployment.get('project_ref') != STAGING:
        raise AssertionError('deployment staging project drifted')
    if deployment.get('environment') != 'staging':
        raise AssertionError('deployment environment drifted')
    db_auth = deployment.get('database_authorization', {})
    if db_auth.get('edge_bridge') != 'public.leader_actor_has_crm_action_rpc(uuid,text)':
        raise AssertionError('permission bridge drifted')
    if db_auth.get('bridge_execute_grantees') != ['postgres', 'service_role']:
        raise AssertionError('permission bridge grants drifted')
    if db_auth.get('browser_role_parameter') is not False:
        raise AssertionError('browser role parameter must remain forbidden')

    functions = deployment.get('functions', {})
    expected = {
        'leader-crm-calculations': (5, 'calculations.write', '4cd0bde123d6f6c052e0c5337ca01f17a0f76edfb5adf2eed1975e25e39357a4'),
        'leader-crm-offers': (4, 'offers.write', '25b2ff8b11ede3351f95c8f29315b5e43230e5cea153526f75039dc8ff99455e'),
    }
    for slug, (version, permission, sha256) in expected.items():
        function = functions.get(slug, {})
        if function.get('version') != version:
            raise AssertionError(f'{slug}: version drifted')
        if function.get('permission') != permission:
            raise AssertionError(f'{slug}: permission drifted')
        if function.get('sha256') != sha256:
            raise AssertionError(f'{slug}: deployment hash drifted')
        if function.get('verify_jwt') is not True or function.get('status') != 'ACTIVE':
            raise AssertionError(f'{slug}: JWT/status drifted')
        if function.get('local_role_allowlist') is not False:
            raise AssertionError(f'{slug}: local role allowlist returned')
        if function.get('direct_profile_read_for_authorization') is not False:
            raise AssertionError(f'{slug}: direct profile authorization returned')

    production = deployment.get('production', {})
    if production.get('project_ref') != PRODUCTION:
        raise AssertionError('production ref drifted')
    for key in ('edge_deployed', 'database_mutated', 'auth_mutated'):
        if production.get(key) is not False:
            raise AssertionError(f'production boundary drifted: {key}')

    legacy = json.loads(texts['legacy_calc_contract'])
    transport = legacy.get('transport', {})
    if transport.get('staging_version') != 5:
        raise AssertionError('legacy calculation contract active version drifted')
    if transport.get('staging_deployment_hash') != expected['leader-crm-calculations'][2]:
        raise AssertionError('legacy calculation contract active hash drifted')
    authorization = legacy.get('authorization', {})
    if authorization.get('database_permission_rpc') != 'public.leader_actor_has_crm_action_rpc':
        raise AssertionError('legacy calculation authorization bridge drifted')
    if authorization.get('local_role_allowlist') is not False:
        raise AssertionError('legacy calculation local allowlist returned')

    require(doc, [
        'active version: `5`',
        expected['leader-crm-calculations'][2],
        'active version: `4`',
        expected['leader-crm-offers'][2],
        'synthetic profiles = 0',
        'Production rollout требует отдельного explicit approval',
    ], 'documentation')
    require(workflow, [
        'deno check supabase/functions/leader-crm-calculations/index.ts',
        'deno test supabase/functions/leader-crm-calculations/contract_test.ts',
        'deno check supabase/staging-functions/leader-crm-offers/index.ts',
        'deno test supabase/staging-functions/leader-crm-offers/contract_test.ts',
        'python3 tools/check_crm_staging_calc_offer_canonical_permissions.py',
    ], 'workflow')

    if PRODUCTION in calc_index or PRODUCTION in calc_contract or PRODUCTION in offer_index or PRODUCTION in offer_contract:
        raise AssertionError('staging Edge source references production project')
    if any(path.name.startswith('20260721') and 'calc_offer' in path.name for path in (ROOT / 'supabase/migrations').glob('*.sql')):
        raise AssertionError('canonical permission rollout leaked into production migrations')

    secret_patterns = (
        r'sb_secret_[A-Za-z0-9_-]{10,}',
        r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}',
    )
    for name, text in texts.items():
        for pattern in secret_patterns:
            if re.search(pattern, text):
                raise AssertionError(f'{name}: possible secret material')

    print('Staging calculations and offers use canonical database permissions, exact JWT-protected deployments, and production remains gated.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
