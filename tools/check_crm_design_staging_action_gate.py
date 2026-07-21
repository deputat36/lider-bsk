#!/usr/bin/env python3
from pathlib import Path
import json
import sys

root = Path(__file__).resolve().parents[1]
paths = {
    'matrix': root / 'contracts/crm-v4-role-action-matrix-v1.json',
    'deployment': root / 'contracts/crm-staging-edge-action-gate-deployment-v1.json',
    'map': root / 'supabase/staging-functions/_shared/crm-canonical-action-map-v1.js',
    'shared_wrapper': root / 'supabase/staging-functions/_shared/canonical-edge-wrapper-v1.js',
    'design_wrapper': root / 'supabase/staging-functions/leader-crm-design/index.ts',
    'design_impl': root / 'supabase/staging-functions/leader-crm-design-impl/index.ts',
    'design_contract': root / 'supabase/staging-functions/leader-crm-design-impl/contract.ts',
    'test': root / 'tools/test_crm_edge_action_gate.mjs',
    'doc': root / 'docs/SUPABASE_STAGING_DESIGN_ACTION_GATE_2026-07-21.md',
    'workflow': root / '.github/workflows/crm-design-staging-action-gate-check.yml',
}

errors = []
for name, path in paths.items():
    if not path.exists():
        errors.append(f'Missing design action gate artifact: {name} -> {path.relative_to(root)}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

matrix = json.loads(paths['matrix'].read_text(encoding='utf-8'))
deployment = json.loads(paths['deployment'].read_text(encoding='utf-8'))
texts = {name: path.read_text(encoding='utf-8') for name, path in paths.items() if name not in {'matrix', 'deployment'}}

if 'design.write' not in set(matrix.get('all_actions', [])):
    errors.append('Canonical role/action matrix is missing design.write')

expected = {
    'leader-crm-design': (2, 'ea64030d36026762694ae1608fce61a1a58e86569e3cb2fb245b610243b9f91d'),
    'leader-crm-design-impl': (1, '1fe2ad2a48d8f2d9870fdcb0c8a7fb7dfde2c6e12cf0ac274e0511f65e48d8ac'),
}
for slug, (version, digest) in expected.items():
    entry = deployment.get('functions', {}).get(slug, {})
    if entry.get('version') != version or entry.get('sha256') != digest:
        errors.append(f'Deployed version/hash drift for {slug}')
    if entry.get('status') != 'ACTIVE' or entry.get('verify_jwt') is not True:
        errors.append(f'{slug} must remain ACTIVE with verify_jwt=true')

if deployment.get('design_mapping') != {'design_task.create_from_order': ['design.write']}:
    errors.append('Design deployment mapping drift')
if deployment.get('production_deployment') != 'not_performed_requires_explicit_approval':
    errors.append('Production deployment boundary drift')

for marker in [
    "'design_task.create_from_order': Object.freeze(['design.write'])",
    'export function designActionPlan',
    'known: Array.isArray(permissions)',
]:
    if marker not in texts['map']:
        errors.append(f'Missing design canonical map marker: {marker}')

wrapper = texts['design_wrapper']
for marker in [
    "req.method !== 'POST'",
    "implementationSlug: 'leader-crm-design-impl'",
    'designActionPlan(body)',
    'runCanonicalEdgeWrapper',
]:
    if marker not in wrapper:
        errors.append(f'Missing design wrapper marker: {marker}')
if wrapper.find("req.method !== 'POST'") > wrapper.find('runCanonicalEdgeWrapper(req'):
    errors.append('Design method guard must run before the shared canonical wrapper')
for forbidden in ['DESIGN_WRITE_ROLES', 'canWriteDesign(', 'profile.role', 'body.role', 'p_role']:
    if forbidden in wrapper:
        errors.append(f'Design wrapper must not contain local/browser role authorization: {forbidden}')

shared = texts['shared_wrapper']
positions = {
    'auth': shared.find('const auth = await authenticatedUser'),
    'plan': shared.find('const plan = options.plan'),
    'permission': shared.find('const decision = await hasCanonicalPermission'),
    'forward': shared.find('return await forwardToImplementation'),
}
if not (0 <= positions['auth'] < positions['plan'] < positions['permission'] < positions['forward']):
    errors.append(f'Shared JWT/action/permission/forward order drift: {positions}')

impl = texts['design_impl']
for marker in [
    "DESIGN_EDGE_CONTRACT_VERSION",
    "validateDesignRequest(input)",
    "'/rest/v1/rpc/leader_create_design_task_from_order_rpc'",
    'idempotent_replay',
    'canWriteDesign(profileResult.profile.role)',
]:
    if marker not in impl:
        errors.append(f'Preserved design implementation marker missing: {marker}')

contract = texts['design_contract']
for marker in [
    "DESIGN_ACTION = 'design_task.create_from_order'",
    "DESIGN_PERMISSION = 'design.write'",
    "STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'",
    "'owner'",
    "'designer'",
]:
    if marker not in contract:
        errors.append(f'Preserved design contract marker missing: {marker}')

for marker in [
    'DESIGN_ACTION_PERMISSION',
    "designActionPlan({ action: 'design_task.create_from_order' })",
    "permissions: ['design.write']",
    "designActionPlan({ action: 'design_task.read_everything' })",
]:
    if marker not in texts['test']:
        errors.append(f'Missing design pure mapping test marker: {marker}')

for marker in [
    'leader-crm-design v2',
    'leader-crm-design-impl v1',
    'design.write',
    'JWT-first',
    'synthetic profiles after rollback = 0',
    'Production boundary',
]:
    if marker.lower() not in texts['doc'].lower():
        errors.append(f'Missing design deployment documentation marker: {marker}')

for marker in [
    'node tools/test_crm_edge_action_gate.mjs',
    'python3 tools/check_crm_design_staging_action_gate.py',
    'supabase/staging-functions/leader-crm-design/index.ts',
    'supabase/staging-functions/leader-crm-design-impl/index.ts',
]:
    if marker not in texts['workflow']:
        errors.append(f'Missing design workflow marker: {marker}')

production_candidates = []
for base in [root / 'supabase/migrations', root / 'supabase/functions']:
    if not base.exists():
        continue
    for path in base.rglob('*'):
        if path.is_file() and 'crm-design-action-gate' in path.name.lower():
            production_candidates.append(str(path.relative_to(root)))
if production_candidates:
    errors.append('Design staging action gate leaked into production paths: ' + ', '.join(production_candidates))

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM staging design Edge action gate is canonical, JWT-first and production-safe.')
