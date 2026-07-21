#!/usr/bin/env python3
from pathlib import Path
import json
import sys

root = Path(__file__).resolve().parents[1]
paths = {
    'matrix': root / 'contracts/crm-v4-role-action-matrix-v1.json',
    'deployment': root / 'contracts/crm-staging-offers-edge-deployment-v1.json',
    'source': root / 'supabase/staging-functions/leader-crm-offers/index.ts',
    'contract': root / 'supabase/staging-functions/leader-crm-offers/contract.ts',
    'doc': root / 'docs/SUPABASE_STAGING_OFFERS_EDGE_V4_2026-07-21.md',
    'workflow': root / '.github/workflows/crm-staging-offers-edge-check.yml',
}

errors = []
for name, path in paths.items():
    if not path.exists():
        errors.append(f'Missing staging offers artifact: {name} -> {path.relative_to(root)}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

matrix = json.loads(paths['matrix'].read_text(encoding='utf-8'))
deployment = json.loads(paths['deployment'].read_text(encoding='utf-8'))
source = paths['source'].read_text(encoding='utf-8')
contract = paths['contract'].read_text(encoding='utf-8')
doc = paths['doc'].read_text(encoding='utf-8')
workflow = paths['workflow'].read_text(encoding='utf-8')

if deployment.get('project_ref') != 'otulfnouybahfnsycxqn':
    errors.append('Offers deployment contract must target isolated staging project')
if deployment.get('environment') != 'staging':
    errors.append('Offers deployment environment must remain staging')
if deployment.get('production_deployment') != 'not_performed_requires_explicit_approval':
    errors.append('Production deployment boundary drift')

function = deployment.get('function', {})
expected = {
    'slug': 'leader-crm-offers',
    'version': 4,
    'status': 'ACTIVE',
    'verify_jwt': True,
    'sha256': '25b2ff8b11ede3351f95c8f29315b5e43230e5cea153526f75039dc8ff99455e',
}
for key, value in expected.items():
    if function.get(key) != value:
        errors.append(f'Deployed offers {key} drift: {function.get(key)!r}')

if deployment.get('action') != 'offer.create_from_calculation':
    errors.append('Canonical offer action drift')
if deployment.get('permission') != 'offers.write':
    errors.append('Canonical offer permission drift')
if 'offers.write' not in matrix.get('all_actions', []):
    errors.append('offers.write is missing from canonical role/action matrix')
for role in ('owner', 'admin', 'manager'):
    if 'offers.write' not in matrix.get('roles', {}).get(role, []):
        errors.append(f'{role} lost offers.write in canonical matrix')
for role in ('accountant', 'designer', 'installer', 'contractor'):
    if 'offers.write' in matrix.get('roles', {}).get(role, []):
        errors.append(f'{role} unexpectedly gained offers.write')

if deployment.get('execution_order') != [
    'validate_environment',
    'authenticate_user',
    'validate_request',
    'check_canonical_permission',
    'execute_transactional_rpc',
]:
    errors.append('Offers authorization/execution order drift')

source_markers = [
    "req.method !== 'POST'",
    "projectRef !== STAGING_PROJECT_REF",
    'authenticatedUser(req, supabaseUrl, publicKey)',
    'validateOfferRequest(input)',
    'canonicalPermission(',
    "'/rest/v1/rpc/leader_actor_has_crm_action_rpc'",
    'OFFER_PERMISSION',
    "'/rest/v1/rpc/leader_create_offer_from_calculation_rpc'",
    'idempotent_replay === true ? 200 : 201',
    "error: 'permission_check_failed'",
]
for marker in source_markers:
    if marker not in source:
        errors.append(f'Missing offers source marker: {marker}')

positions = {
    'environment': source.find('projectRef !== STAGING_PROJECT_REF'),
    'auth': source.find('const checked = await authenticatedUser'),
    'validation': source.find('const validation = validateOfferRequest'),
    'permission': source.find('const permissionResult = await canonicalPermission'),
    'rpc': source.find("'/rest/v1/rpc/leader_create_offer_from_calculation_rpc'"),
}
if not (0 <= positions['environment'] < positions['auth'] < positions['validation'] < positions['permission'] < positions['rpc']):
    errors.append(f'Offers execution order is unsafe: {positions}')

for forbidden in ('body.role', 'input.role', 'payload.role', 'p_role'):
    if forbidden in source:
        errors.append(f'Offers Edge must not trust browser role: {forbidden}')

contract_markers = [
    "OFFER_ACTION = 'offer.create_from_calculation'",
    "OFFER_PERMISSION = 'offers.write'",
    "STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'",
    "'request_id'",
    "'expected_updated_at'",
    "'idempotency_key'",
    "'calculation_id'",
    "'valid_until'",
    'hasOnlyFields(request, REQUEST_FIELDS)',
    'hasOnlyFields(payload, PAYLOAD_FIELDS)',
]
for marker in contract_markers:
    if marker not in contract:
        errors.append(f'Missing offers contract marker: {marker}')

for marker in (
    'leader-crm-offers v4',
    'offers.write',
    '25b2ff8b',
    'Production boundary',
    'production Edge deploy',
    'rollback',
):
    if marker.lower() not in doc.lower():
        errors.append(f'Missing offers documentation marker: {marker}')

for marker in (
    'python3 tools/check_crm_staging_offers_edge_deployment.py',
    'supabase/staging-functions/leader-crm-offers/index.ts',
    'contracts/crm-staging-offers-edge-deployment-v1.json',
):
    if marker not in workflow:
        errors.append(f'Missing offers workflow marker: {marker}')

production_candidates = []
for path in (root / 'supabase/migrations').glob('*.sql'):
    lowered = path.name.lower()
    if 'offers_edge' in lowered or 'crm_offers' in lowered:
        production_candidates.append(path.name)
if production_candidates:
    errors.append('Staging offers artifacts appeared in production migrations: ' + ', '.join(production_candidates))

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM staging offers Edge v4 source, canonical permission and deployment contract are synchronized.')
