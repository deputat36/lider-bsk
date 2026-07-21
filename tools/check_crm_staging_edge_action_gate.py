#!/usr/bin/env python3
from pathlib import Path
import json
import sys

root = Path(__file__).resolve().parents[1]
paths = {
    'matrix_contract': root / 'contracts/crm-v4-role-action-matrix-v1.json',
    'deployment': root / 'contracts/crm-staging-edge-action-gate-deployment-v1.json',
    'migration': root / 'supabase/staging-migrations/20260721_03_actor_action_permission_rpc.sql',
    'map': root / 'supabase/staging-functions/_shared/crm-canonical-action-map-v1.js',
    'wrapper': root / 'supabase/staging-functions/_shared/canonical-edge-wrapper-v1.js',
    'leads': root / 'supabase/staging-functions/leader-crm-leads-staging/index.ts',
    'leads_impl': root / 'supabase/staging-functions/leader-crm-leads-staging-impl/index.ts',
    'orders': root / 'supabase/staging-functions/leader-crm-orders/index.ts',
    'orders_impl': root / 'supabase/staging-functions/leader-crm-orders-impl/index.ts',
    'test': root / 'tools/test_crm_edge_action_gate.mjs',
    'doc': root / 'docs/SUPABASE_STAGING_EDGE_ACTION_GATE_2026-07-21.md',
    'workflow': root / '.github/workflows/crm-staging-edge-action-gate-check.yml',
}
errors = []
for name, path in paths.items():
    if not path.exists():
        errors.append(f'Missing staging Edge gate artifact: {name} -> {path.relative_to(root)}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

matrix = json.loads(paths['matrix_contract'].read_text(encoding='utf-8'))
deployment = json.loads(paths['deployment'].read_text(encoding='utf-8'))
texts = {name: path.read_text(encoding='utf-8') for name, path in paths.items() if name not in {'matrix_contract', 'deployment'}}
all_actions = set(matrix['all_actions'])

if deployment.get('project_ref') != 'otulfnouybahfnsycxqn' or deployment.get('environment') != 'staging':
    errors.append('Deployment contract must target the isolated staging project')
if deployment.get('execution_order') != ['parse_body', 'authenticate_user', 'resolve_action', 'check_permissions', 'forward_to_implementation']:
    errors.append('JWT-first execution order drift')
if deployment.get('production_deployment') != 'not_performed_requires_explicit_approval':
    errors.append('Production deployment boundary drift')

expected_functions = {
    'leader-crm-leads-staging': (3, 'e64036306fefff72bcb457f0f64756bcf40f27cc406e695e3f3d4c76d2b1b4d1'),
    'leader-crm-leads-staging-impl': (1, 'b3e864d49e4529d6c112ce70185337e71484bfa833676031dfa28e1fb21fe1bd'),
    'leader-crm-orders': (3, 'dccbd8ec3c57cdd58db269e6808f86cdc99f4416ae41eca8b6df24a284649646'),
    'leader-crm-orders-impl': (1, '7ba9f9b59790b0c683a7d3cc64ccfc27fc42c9ea24c9f009a8b064554c5831d7'),
}
for slug, (version, digest) in expected_functions.items():
    entry = deployment.get('functions', {}).get(slug, {})
    if entry.get('version') != version or entry.get('sha256') != digest:
        errors.append(f'Deployed version/hash drift for {slug}')
    if entry.get('verify_jwt') is not True or entry.get('status') != 'ACTIVE':
        errors.append(f'{slug} must remain ACTIVE with verify_jwt=true')

for action, permissions in deployment.get('leads_mapping', {}).items():
    if action != 'ensure_profile':
        for permission in permissions:
            if permission not in all_actions:
                errors.append(f'Leads mapping references unknown permission: {permission}')
for permission in deployment.get('orders_update_mapping', {}).values():
    if permission not in all_actions:
        errors.append(f'Orders mapping references unknown permission: {permission}')

for marker in [
    'STAGING ONLY',
    'otulfnouybahfnsycxqn',
    'leader_actor_has_crm_action_rpc',
    'leader_private.leader_actor_has_crm_action',
    'from public, anon, authenticated',
    'to service_role',
]:
    if marker not in texts['migration']:
        errors.append(f'Missing permission RPC migration marker: {marker}')
if 'to authenticated' in texts['migration']:
    errors.append('Permission RPC must not be executable by authenticated')

for marker in [
    "dashboard: Object.freeze(['leads.read'])",
    "list_orders: Object.freeze(['orders.read'])",
    "payment_status: 'finance.write'",
    "status: 'orders.update'",
    "action === 'ensure_profile'",
    "['orders.update']",
]:
    if marker not in texts['map']:
        errors.append(f'Missing canonical action map marker: {marker}')

wrapper = texts['wrapper']
for marker in [
    "error: 'missing_token'",
    '/auth/v1/user',
    '/rest/v1/rpc/leader_actor_has_crm_action_rpc',
    "error: 'unknown_action'",
    "error: 'forbidden'",
    'forwardToImplementation(',
    'X-CRM-Implementation',
]:
    if marker not in wrapper:
        errors.append(f'Missing Edge wrapper marker: {marker}')
positions = {
    'auth': wrapper.find('const auth = await authenticatedUser'),
    'plan': wrapper.find('const plan = options.plan'),
    'permission': wrapper.find('const decision = await hasCanonicalPermission'),
    'forward': wrapper.find('return await forwardToImplementation'),
}
if not (0 <= positions['auth'] < positions['plan'] < positions['permission'] < positions['forward']):
    errors.append(f'Edge authorization order is unsafe: {positions}')
if 'profile?.role' in wrapper or 'body.role' in wrapper or 'p_role' in wrapper:
    errors.append('Wrapper must never trust a browser-supplied role')

for name, slug in [('leads', 'leader-crm-leads-staging-impl'), ('orders', 'leader-crm-orders-impl')]:
    if slug not in texts[name] or 'runCanonicalEdgeWrapper' not in texts[name]:
        errors.append(f'{name} wrapper does not target the preserved implementation')

if '17524ea9ef08c11b18b385b9469778d5b1084ddb' not in texts['leads_impl']:
    errors.append('Leads implementation pin drift')
if '4dafa2723c1018574572d9a91441cf382ac25b34' not in texts['orders_impl']:
    errors.append('Orders implementation pin drift')

for marker in [
    'CRM staging Edge action mapping is canonical and fail-closed.',
    "permissions: ['orders.update', 'finance.write']",
    "leadsActionPlan({ action: 'ensure_profile' })",
    "orderActionPlan({ action: 'remove' }).known, false",
]:
    if marker not in texts['test']:
        errors.append(f'Missing pure Edge mapping test marker: {marker}')

for marker in [
    'JWT-first',
    'leader-crm-leads-staging v3',
    'leader-crm-orders v3',
    'synthetic profiles после rollback = 0',
    'реальный user-JWT запрос не выполнялся',
    'Production boundary',
    'production Edge deploy',
]:
    if marker.lower() not in texts['doc'].lower():
        errors.append(f'Missing staging Edge documentation marker: {marker}')

for marker in [
    'node tools/test_crm_edge_action_gate.mjs',
    'python3 tools/check_crm_staging_edge_action_gate.py',
    'supabase/staging-functions/_shared/canonical-edge-wrapper-v1.js',
    'supabase/staging-migrations/20260721_03_actor_action_permission_rpc.sql',
]:
    if marker not in texts['workflow']:
        errors.append(f'Missing staging Edge workflow marker: {marker}')

production_candidates = []
for path in (root / 'supabase/migrations').glob('*.sql'):
    lowered = path.name.lower()
    if 'actor_action_permission_rpc' in lowered or 'edge_action_gate' in lowered:
        production_candidates.append(path.name)
if production_candidates:
    errors.append('Staging Edge gate SQL appeared in production migrations: ' + ', '.join(production_candidates))

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM staging leads/orders Edge action gate is canonical, JWT-first and production-safe.')
