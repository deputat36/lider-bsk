#!/usr/bin/env python3
from pathlib import Path
import json
import re
import sys

root = Path(__file__).resolve().parents[1]
contract_path = root / 'contracts/crm-v4-role-action-matrix-v1.json'
action_source_path = root / 'crm/v4/assets/v4/action-permissions-v1.js'
migration_path = root / 'supabase/staging-migrations/20260721_01_canonical_action_rbac.sql'
policy_path = root / 'supabase/staging-migrations/20260721_02_role_action_matrix_policy.sql'
test_path = root / 'supabase/staging-tests/20260721_canonical_action_rbac.sql'
node_test_path = root / 'tools/test_crm_role_action_matrix.mjs'
doc_path = root / 'docs/SUPABASE_STAGING_CANONICAL_ACTION_RBAC_2026-07-21.md'
workflow_path = root / '.github/workflows/crm-staging-action-rbac-check.yml'

errors = []
required_paths = [
    contract_path,
    action_source_path,
    migration_path,
    policy_path,
    test_path,
    node_test_path,
    doc_path,
    workflow_path,
]
for path in required_paths:
    if not path.exists():
        errors.append(f'Missing action RBAC artifact: {path.relative_to(root)}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

contract = json.loads(contract_path.read_text(encoding='utf-8'))
action_source = action_source_path.read_text(encoding='utf-8')
migration = migration_path.read_text(encoding='utf-8')
policy = policy_path.read_text(encoding='utf-8')
test_sql = test_path.read_text(encoding='utf-8')
node_test = node_test_path.read_text(encoding='utf-8')
doc = doc_path.read_text(encoding='utf-8')
workflow = workflow_path.read_text(encoding='utf-8')

canonical_roles = ['owner', 'admin', 'manager', 'accountant', 'designer', 'installer', 'contractor']
expected_counts = {
    'owner': 39,
    'admin': 39,
    'manager': 30,
    'accountant': 8,
    'designer': 4,
    'installer': 2,
    'contractor': 2,
}

if contract.get('version') != 1:
    errors.append('Role/action contract version must be 1')
if contract.get('canonical_roles') != canonical_roles:
    errors.append('Canonical role order drift')
if list((contract.get('roles') or {}).keys()) != canonical_roles:
    errors.append('Contract role map order drift')
if len(contract.get('all_actions') or []) != 39:
    errors.append('Canonical action count must be 39')
if len(set(contract.get('all_actions') or [])) != 39:
    errors.append('Canonical actions must be unique')
for role, count in expected_counts.items():
    if len((contract.get('roles') or {}).get(role, [])) != count:
        errors.append(f'Unexpected action count for {role}')
for marker in ['"unknown_role": "deny"', '"unknown_action": "deny"', '"inactive_profile": "deny"', '"production_deployment": "requires_explicit_approval"']:
    if marker not in contract_path.read_text(encoding='utf-8'):
        errors.append(f'Missing fail-closed contract marker: {marker}')

matrix_match = re.search(r'\$matrix\$\s*(\{.*?\})\s*\$matrix\$::jsonb', migration, re.S)
if not matrix_match:
    errors.append('Migration MATRIX JSON seed is missing')
else:
    try:
        migration_matrix = json.loads(matrix_match.group(1))
    except json.JSONDecodeError as exc:
        errors.append(f'Migration MATRIX JSON is invalid: {exc}')
        migration_matrix = None
    if migration_matrix is not None and migration_matrix != contract.get('roles'):
        errors.append('Migration role/action seed differs from JSON contract')

for marker in [
    'STAGING ONLY',
    'otulfnouybahfnsycxqn',
    "raise exception 'staging_environment_guard_failed'",
    'leader_private.leader_role_action_matrix_v1',
    'leader_private.leader_actor_has_crm_action',
    'leader_private.leader_has_crm_action',
    'profile.is_active = true',
    'btrim(p_action) = any (matrix.allowed_actions)',
    "revoke all on function leader_private.leader_actor_has_crm_action(uuid, text) from public, anon, authenticated",
    'grant execute on function leader_private.leader_actor_has_crm_action(uuid, text) to service_role',
    "revoke all on function leader_private.leader_has_crm_action(text) from public, anon, authenticated",
    'grant execute on function leader_private.leader_has_crm_action(text) to authenticated',
    'leader_create_design_task_from_order_impl_rpc',
    "leader_actor_has_crm_action(v_actor_id, 'design.write')",
    "'code', 'forbidden'",
    'return public.leader_create_design_task_from_order_impl_rpc(p_payload)',
]:
    if marker not in migration:
        errors.append(f'Missing staging migration marker: {marker}')

if 'grant execute on function leader_private.leader_actor_has_crm_action(uuid, text) to authenticated' in migration:
    errors.append('Actor-aware helper must not be executable by authenticated')
if migration.find("leader_actor_has_crm_action(v_actor_id, 'design.write')") > migration.find('return public.leader_create_design_task_from_order_impl_rpc(p_payload)'):
    errors.append('Authorization gate must run before the business implementation')

for marker in [
    'STAGING ONLY',
    'leader_role_action_matrix_v1_deny_client',
    'to anon, authenticated',
    'using (false)',
    'with check (false)',
    'revoke all on table leader_private.leader_role_action_matrix_v1 from public, anon, authenticated',
]:
    if marker not in policy:
        errors.append(f'Missing private matrix policy marker: {marker}')

for marker in [
    'begin;',
    'rollback;',
    'rbac_unknown_role_not_denied',
    'rbac_unknown_action_not_denied',
    'rbac_inactive_profile_not_denied',
    'rbac_design_rpc_accountant_not_denied',
    'rbac_design_rpc_designer_did_not_pass_gate',
    "set_config('request.jwt.claim.sub'",
]:
    if marker not in test_sql:
        errors.append(f'Missing staging test marker: {marker}')

for marker in [
    'CRM_V4_ROLE_ACTIONS',
    'crm-v4-role-action-matrix-v1.json',
    'Role/action drift for ${role}',
    "contract.roles.manager.length, 30",
    'CRM v4 browser and canonical role/action contract are identical.',
]:
    if marker not in node_test:
        errors.append(f'Missing Node parity-test marker: {marker}')

for marker in [
    'Production baseline — только чтение',
    '39 canonical action keys',
    'unknown role/action',
    'forbidden до business reads',
    'synthetic profiles = 0',
    'Production boundary',
    'production DDL/DML',
]:
    if marker.lower() not in doc.lower():
        errors.append(f'Missing staging RBAC documentation marker: {marker}')

for marker in [
    'node tools/test_crm_role_action_matrix.mjs',
    'python3 tools/check_crm_staging_action_rbac.py',
    'supabase/staging-migrations/20260721_01_canonical_action_rbac.sql',
    'supabase/staging-tests/20260721_canonical_action_rbac.sql',
]:
    if marker not in workflow:
        errors.append(f'Missing action RBAC workflow marker: {marker}')

for action in contract.get('all_actions') or []:
    if repr(action).replace('"', "'") not in action_source and f"'{action}'" not in action_source:
        errors.append(f'Browser action source is missing contract action: {action}')

production_candidates = []
for path in (root / 'supabase/migrations').glob('*.sql'):
    lowered = path.name.lower()
    if 'canonical_action_rbac' in lowered or 'role_action_matrix' in lowered:
        production_candidates.append(path.name)
if production_candidates:
    errors.append('Staging RBAC SQL must not appear in production migrations: ' + ', '.join(production_candidates))

if 'serverEnforcement: false' not in action_source:
    errors.append('Browser source must continue to report no production server enforcement')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM staging canonical action RBAC contract is valid and production remains untouched.')
