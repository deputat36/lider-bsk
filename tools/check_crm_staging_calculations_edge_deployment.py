#!/usr/bin/env python3
from pathlib import Path
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
DEPLOYMENT_PATH = ROOT / 'contracts/crm-staging-calculations-edge-deployment-v1.json'
EDGE_PATH = ROOT / 'supabase/functions/leader-crm-calculations/index.ts'
CONTRACT_PATH = ROOT / 'supabase/functions/leader-crm-calculations/contract.ts'
MATRIX_PATH = ROOT / 'contracts/crm-v4-role-action-matrix-v1.json'
DOC_PATH = ROOT / 'docs/SUPABASE_STAGING_CALCULATIONS_EDGE_V5_2026-07-21.md'
WORKFLOW_PATH = ROOT / '.github/workflows/crm-staging-calculations-edge-check.yml'

EXPECTED_PROJECT = 'otulfnouybahfnsycxqn'
EXPECTED_HASH = '4cd0bde123d6f6c052e0c5337ca01f17a0f76edfb5adf2eed1975e25e39357a4'
EXPECTED_ACTION = 'calculation.create_version'
EXPECTED_PERMISSION = 'calculations.write'

errors = []
paths = [DEPLOYMENT_PATH, EDGE_PATH, CONTRACT_PATH, MATRIX_PATH, DOC_PATH, WORKFLOW_PATH]
for path in paths:
    if not path.is_file():
        errors.append(f'Missing artifact: {path.relative_to(ROOT)}')

if errors:
    print('\n'.join(errors), file=sys.stderr)
    raise SystemExit(1)

deployment = json.loads(DEPLOYMENT_PATH.read_text(encoding='utf-8'))
matrix = json.loads(MATRIX_PATH.read_text(encoding='utf-8'))
edge = EDGE_PATH.read_text(encoding='utf-8')
contract = CONTRACT_PATH.read_text(encoding='utf-8')
doc = DOC_PATH.read_text(encoding='utf-8')
workflow = WORKFLOW_PATH.read_text(encoding='utf-8')

function = deployment.get('function', {})
if deployment.get('project_ref') != EXPECTED_PROJECT or deployment.get('environment') != 'staging':
    errors.append('Deployment contract must target the isolated staging project')
if function.get('slug') != 'leader-crm-calculations':
    errors.append('Unexpected Edge slug')
if function.get('version') != 5 or function.get('status') != 'ACTIVE' or function.get('verify_jwt') is not True:
    errors.append('Deployed Edge version/status/JWT contract drift')
if function.get('sha256') != EXPECTED_HASH:
    errors.append('Deployed Edge SHA drift')
if deployment.get('action') != EXPECTED_ACTION or deployment.get('permission') != EXPECTED_PERMISSION:
    errors.append('Action or permission contract drift')
if deployment.get('permission_rpc') != 'leader_actor_has_crm_action_rpc':
    errors.append('Canonical permission RPC drift')
if deployment.get('transaction_rpc') != 'leader_create_calculation_version_rpc':
    errors.append('Transactional RPC drift')
if deployment.get('execution_order') != [
    'environment_guard',
    'jwt_authentication',
    'payload_validation',
    'canonical_permission_check',
    'transactional_rpc',
]:
    errors.append('Execution order drift')
if deployment.get('deployment_action_performed_by_this_change') is not False:
    errors.append('This synchronization change must not claim a new deploy')
if deployment.get('production_deployment') != 'not_performed_requires_explicit_approval':
    errors.append('Production boundary drift')

if EXPECTED_PERMISSION not in matrix.get('all_actions', []):
    errors.append('Canonical matrix does not contain calculations.write')
for role in ('owner', 'admin', 'manager'):
    if EXPECTED_PERMISSION not in matrix.get('roles', {}).get(role, []):
        errors.append(f'{role} lost calculations.write')
for role in ('accountant', 'designer', 'installer', 'contractor'):
    if EXPECTED_PERMISSION in matrix.get('roles', {}).get(role, []):
        errors.append(f'{role} unexpectedly gained calculations.write')

required_contract_markers = [
    "CALCULATION_EDGE_CONTRACT_VERSION = 'leader-crm-calculations-edge-v1'",
    "CALCULATION_ACTION = 'calculation.create_version'",
    "CALCULATION_PERMISSION = 'calculations.write'",
    "STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'",
    'MAX_CALCULATION_ITEMS = 200',
    "'request_id'",
    "'expected_updated_at'",
    "'idempotency_key'",
    "'source_calculation_id'",
]
for marker in required_contract_markers:
    if marker not in contract:
        errors.append(f'Contract missing marker: {marker}')

required_edge_markers = [
    "if (projectRef !== STAGING_PROJECT_REF)",
    "if (!token)",
    '/auth/v1/user',
    'validateCalculationRequest(input)',
    '/rest/v1/rpc/leader_actor_has_crm_action_rpc',
    'CALCULATION_PERMISSION',
    '/rest/v1/rpc/leader_create_calculation_version_rpc',
    'idempotent_replay === true ? 200 : 201',
]
for marker in required_edge_markers:
    if marker not in edge:
        errors.append(f'Edge source missing marker: {marker}')

positions = {
    'environment': edge.find('if (projectRef !== STAGING_PROJECT_REF)'),
    'auth': edge.find('const checked = await authenticatedUser'),
    'validation': edge.find('const validation = validateCalculationRequest'),
    'permission': edge.find('const permissionResult = await canonicalPermission'),
    'rpc': edge.find("'/rest/v1/rpc/leader_create_calculation_version_rpc'"),
}
if not (0 <= positions['environment'] < positions['auth'] < positions['validation'] < positions['permission'] < positions['rpc']):
    errors.append(f'Unsafe Edge execution order: {positions}')

for forbidden in ('body.role', 'input.role', 'p_role', 'profile?.role'):
    if forbidden in edge:
        errors.append(f'Browser-supplied role marker is forbidden: {forbidden}')

for marker in [
    'leader-crm-calculations v5',
    EXPECTED_HASH,
    EXPECTED_ACTION,
    EXPECTED_PERMISSION,
    'новый deploy не выполнялся',
    'Production',
]:
    if marker.lower() not in doc.lower():
        errors.append(f'Documentation missing marker: {marker}')

for marker in [
    'python3 -m py_compile tools/check_crm_staging_calculations_edge_deployment.py',
    'python3 tools/check_crm_staging_calculations_edge_deployment.py',
    'contracts/crm-staging-calculations-edge-deployment-v1.json',
]:
    if marker not in workflow:
        errors.append(f'Workflow missing marker: {marker}')

for name, text in [('edge', edge), ('contract', contract), ('deployment', json.dumps(deployment))]:
    if re.search(r'sb_secret_[A-Za-z0-9_-]{10,}', text):
        errors.append(f'{name}: possible secret material')
    if re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}', text):
        errors.append(f'{name}: possible JWT material')

if errors:
    print('Staging calculations Edge deployment checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('Staging calculations Edge v5 source, permissions, deployment evidence and production boundary are coherent.')
