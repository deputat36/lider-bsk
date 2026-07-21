#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
STAGING = 'otulfnouybahfnsycxqn'
PRODUCTION = 'ofewxuqfjhamgerwzull'

paths = {
    'calc_index': ROOT / 'supabase/functions/leader-crm-calculations/index.ts',
    'calc_contract': ROOT / 'supabase/functions/leader-crm-calculations/contract.ts',
    'calc_test': ROOT / 'supabase/functions/leader-crm-calculations/contract_test.ts',
    'offer_index': ROOT / 'supabase/staging-functions/leader-crm-offers/index.ts',
    'offer_contract': ROOT / 'supabase/staging-functions/leader-crm-offers/contract.ts',
    'offer_test': ROOT / 'supabase/staging-functions/leader-crm-offers/contract_test.ts',
    'deployment': ROOT / 'contracts/crm-staging-calc-offer-canonical-permissions-v1.json',
    'calc_server': ROOT / 'contracts/calculation-create-version-server-contract-v1.json',
    'offer_deployment': ROOT / 'contracts/crm-staging-offers-edge-deployment-v1.json',
    'doc': ROOT / 'docs/SUPABASE_STAGING_CALCULATION_OFFER_CANONICAL_PERMISSIONS_2026-07-21.md',
    'workflow': ROOT / '.github/workflows/crm-staging-calc-offer-canonical-permissions-check.yml',
}

errors: list[str] = []
texts: dict[str, str] = {}
for name, path in paths.items():
    if not path.is_file():
        errors.append(f'Missing file: {path.relative_to(ROOT)}')
        texts[name] = ''
    else:
        texts[name] = path.read_text(encoding='utf-8')


def require(name: str, markers: tuple[str, ...]) -> None:
    for marker in markers:
        if marker not in texts[name]:
            errors.append(f'{name}: missing marker {marker!r}')


def forbid(name: str, markers: tuple[str, ...]) -> None:
    for marker in markers:
        if marker in texts[name]:
            errors.append(f'{name}: forbidden marker {marker!r}')


require('calc_index', (
    '/auth/v1/user',
    'validateCalculationRequest(input)',
    "'/rest/v1/rpc/leader_actor_has_crm_action_rpc'",
    'body: JSON.stringify({ p_actor_id: actorId, p_action: permission })',
    'const permissionResult = await canonicalPermission(',
    "'/rest/v1/rpc/leader_create_calculation_version_rpc'",
))
forbid('calc_index', ('canWriteCalculation', 'CALCULATION_WRITE_ROLES', 'leader_user_profiles?user_id=', 'activeProfile('))
forbid('calc_contract', ('canWriteCalculation', 'CALCULATION_WRITE_ROLES', 'normalizeRole'))
forbid('calc_test', ('canWriteCalculation', 'canonical calculation-write roles are allowed'))
require('calc_contract', ("CALCULATION_PERMISSION = 'calculations.write'", f"STAGING_PROJECT_REF = '{STAGING}'"))
require('calc_test', ('canonical permission matches CRM action registry', 'server-owned envelope and payload fields are rejected'))

require('offer_index', (
    '/auth/v1/user',
    'validateOfferRequest(input)',
    "'/rest/v1/rpc/leader_actor_has_crm_action_rpc'",
    'body: JSON.stringify({ p_actor_id: actorId, p_action: permission })',
    'const permissionResult = await canonicalPermission(',
    "'/rest/v1/rpc/leader_create_offer_from_calculation_rpc'",
    'const headers = new Headers(init.headers || {})',
    "headers.set('apikey', adminKey)",
))
forbid('offer_index', ('canWriteOffer', 'OFFER_WRITE_ROLES', 'leader_user_profiles?user_id=', 'activeProfile('))
forbid('offer_contract', ('canWriteOffer', 'OFFER_WRITE_ROLES', 'normalizeRole'))
require('offer_contract', ("OFFER_PERMISSION = 'offers.write'", f"STAGING_PROJECT_REF = '{STAGING}'"))
require('offer_test', ('offer permission and staging ref are canonical', 'browser actor and server fields are rejected'))

for name, auth_marker, validation_marker, permission_marker, rpc_marker in (
    ('calc_index', 'const checked = await authenticatedUser', 'const validation = validateCalculationRequest', 'const permissionResult = await canonicalPermission', "'/rest/v1/rpc/leader_create_calculation_version_rpc'"),
    ('offer_index', 'const checked = await authenticatedUser', 'const validation = validateOfferRequest', 'const permissionResult = await canonicalPermission', "'/rest/v1/rpc/leader_create_offer_from_calculation_rpc'"),
):
    source = texts[name]
    positions = [source.find(auth_marker), source.find(validation_marker), source.find(permission_marker), source.find(rpc_marker)]
    if not (0 <= positions[0] < positions[1] < positions[2] < positions[3]):
        errors.append(f'{name}: unsafe execution order {positions}')

try:
    deployment = json.loads(texts['deployment'])
    calc_server = json.loads(texts['calc_server'])
    offer_deployment = json.loads(texts['offer_deployment'])
except json.JSONDecodeError as exc:
    errors.append(f'Invalid JSON: {exc}')
    deployment = calc_server = offer_deployment = {}

if deployment.get('project_ref') != STAGING or deployment.get('environment') != 'staging':
    errors.append('Unified deployment staging target drifted')
db_auth = deployment.get('database_authorization', {})
if db_auth.get('edge_bridge') != 'public.leader_actor_has_crm_action_rpc(uuid,text)':
    errors.append('Canonical permission bridge drifted')
if db_auth.get('bridge_execute_grantees') != ['postgres', 'service_role']:
    errors.append('Permission bridge grants drifted')
if db_auth.get('browser_role_parameter') is not False:
    errors.append('Browser role parameter returned')

expected = {
    'leader-crm-calculations': (5, 'calculations.write', '4cd0bde123d6f6c052e0c5337ca01f17a0f76edfb5adf2eed1975e25e39357a4'),
    'leader-crm-offers': (5, 'offers.write', 'b20ffa860121826b265bc01bda3757277573a2e87a2604c0c4764bf4add627a7'),
}
for slug, (version, permission, sha256) in expected.items():
    function = deployment.get('functions', {}).get(slug, {})
    if function.get('version') != version or function.get('permission') != permission or function.get('sha256') != sha256:
        errors.append(f'{slug}: unified deployment drift')
    if function.get('status') != 'ACTIVE' or function.get('verify_jwt') is not True:
        errors.append(f'{slug}: status/JWT drift')
    if function.get('local_role_allowlist') is not False or function.get('direct_profile_read_for_authorization') is not False:
        errors.append(f'{slug}: local authorization returned')

if calc_server.get('transport', {}).get('staging_version') != 5:
    errors.append('Calculation server contract version drift')
if calc_server.get('authorization', {}).get('database_permission_rpc') != 'public.leader_actor_has_crm_action_rpc':
    errors.append('Calculation server permission bridge drift')
if calc_server.get('authorization', {}).get('local_role_allowlist') is not False:
    errors.append('Calculation local allowlist returned')
if offer_deployment.get('function', {}).get('version') != 5:
    errors.append('Offer deployment version drift')
if offer_deployment.get('function', {}).get('sha256') != expected['leader-crm-offers'][2]:
    errors.append('Offer deployment hash drift')
if offer_deployment.get('typed_headers') is not True:
    errors.append('Offer typed headers evidence missing')

production = deployment.get('production', {})
if production.get('project_ref') != PRODUCTION:
    errors.append('Production ref drift')
for field in ('edge_deployed', 'database_mutated', 'auth_mutated'):
    if production.get(field) is not False:
        errors.append(f'Production boundary drift: {field}')

require('doc', (
    'active version: `5`',
    '4cd0bde123d6f6c052e0c5337ca01f17a0f76edfb5adf2eed1975e25e39357a4',
    'b20ffa860121826b265bc01bda3757277573a2e87a2604c0c4764bf4add627a7',
    'synthetic profiles = 0',
    'Production rollout требует отдельного explicit approval',
))
require('workflow', (
    'deno check supabase/functions/leader-crm-calculations/index.ts',
    'deno test supabase/functions/leader-crm-calculations/contract_test.ts',
    'deno check supabase/staging-functions/leader-crm-offers/index.ts',
    'deno test supabase/staging-functions/leader-crm-offers/contract_test.ts',
    'python3 tools/check_crm_staging_calc_offer_canonical_permissions.py',
))

if PRODUCTION in texts['calc_index'] or PRODUCTION in texts['calc_contract'] or PRODUCTION in texts['offer_index'] or PRODUCTION in texts['offer_contract']:
    errors.append('Staging source references production project')
for path in (ROOT / 'supabase/migrations').glob('*.sql'):
    lowered = path.name.lower()
    if 'calc_offer' in lowered or 'canonical_permissions' in lowered:
        errors.append(f'Staging rollout leaked into production migrations: {path.name}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('Staging calculations and offers use canonical database permissions, typed offer headers, exact JWT deployments and production remains locked.')
