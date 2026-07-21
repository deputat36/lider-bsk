#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / 'contracts/crm-staging-production-command-edge-v1.json'
EDGE = ROOT / 'supabase/staging-functions/leader-crm-production/index.ts'
EDGE_CONTRACT = ROOT / 'supabase/staging-functions/leader-crm-production/contract.ts'
UI = ROOT / 'crm/v4/assets/v4/production-job-card-v2.js'
DOC = ROOT / 'docs/SUPABASE_STAGING_PRODUCTION_COMMAND_EDGE_V1_2026-07-21.md'
WORKFLOW = ROOT / '.github/workflows/crm-staging-production-command-edge-check.yml'

errors = []
files = {
    'contract': CONTRACT,
    'edge': EDGE,
    'edge_contract': EDGE_CONTRACT,
    'ui': UI,
    'doc': DOC,
    'workflow': WORKFLOW,
}
texts = {}
for name, path in files.items():
    if not path.is_file():
        errors.append(f'Missing file: {path.relative_to(ROOT)}')
        texts[name] = ''
    else:
        texts[name] = path.read_text(encoding='utf-8')

try:
    contract = json.loads(texts['contract'])
except Exception as exc:
    contract = {}
    errors.append(f'Invalid JSON contract: {exc}')

expected = {
    'project_ref': 'otulfnouybahfnsycxqn',
    'environment': 'staging',
    'action': 'production_job.update',
    'permission': 'production.write',
    'conditional_permission': 'orders.update',
    'rpc': 'leader_update_production_job_rpc',
    'rpc_md5': '53380fb1798f4e4ab25c7d9b98ae2562',
}

if contract.get('project_ref') != expected['project_ref']:
    errors.append('Contract staging project ref mismatch')
if contract.get('environment') != expected['environment']:
    errors.append('Contract environment mismatch')
edge_contract = contract.get('edge') or {}
rpc = contract.get('rpc_baseline') or {}
if edge_contract.get('deployment_state') != 'source_only_not_deployed':
    errors.append('Edge must remain source-only until a separate deployment approval')
if edge_contract.get('action') != expected['action']:
    errors.append('Production action mismatch')
if edge_contract.get('permissions') != [expected['permission']]:
    errors.append('Base production permission mismatch')
if (edge_contract.get('conditional_permissions') or {}).get('internal_comment') != expected['conditional_permission']:
    errors.append('Conditional internal_comment permission mismatch')
if edge_contract.get('business_rpc') != expected['rpc']:
    errors.append('Business RPC mismatch')
if rpc.get('function_md5') != expected['rpc_md5'] or rpc.get('function_bytes') != 15485:
    errors.append('Staging RPC fingerprint mismatch')
if rpc.get('security_definer') is not False or rpc.get('search_path') != '':
    errors.append('RPC must remain SECURITY INVOKER with empty search_path')
if rpc.get('execute') != {'service_role': True, 'authenticated': False, 'anon': False}:
    errors.append('RPC execute privileges mismatch')
if contract.get('frontend_switch') != 'not_performed':
    errors.append('Frontend switch cannot be claimed in this source-only change')
if contract.get('production_deployment') != 'not_performed_requires_explicit_approval':
    errors.append('Production boundary is missing')

required_edge_markers = [
    "projectRefFromUrl(supabaseUrl) !== STAGING_PROJECT_REF",
    'authenticatedUser(req, supabaseUrl, publicKey)',
    'validateProductionRequest(input)',
    'for (const permission of validation.permissions)',
    '/rest/v1/rpc/leader_actor_has_crm_action_rpc',
    '/rest/v1/rpc/leader_update_production_job_rpc',
    'actor_id: checked.user.id',
    'actor_email: checked.user.email',
]
for marker in required_edge_markers:
    if marker not in texts['edge']:
        errors.append(f'Edge missing marker: {marker}')

positions = [texts['edge'].find(marker) for marker in [
    'projectRefFromUrl(supabaseUrl) !== STAGING_PROJECT_REF',
    'authenticatedUser(req, supabaseUrl, publicKey)',
    'validateProductionRequest(input)',
    'for (const permission of validation.permissions)',
    '/rest/v1/rpc/leader_update_production_job_rpc',
]]
if any(position < 0 for position in positions) or positions != sorted(positions):
    errors.append('Edge execution order must be environment -> JWT -> validation -> permissions -> RPC')

required_contract_markers = [
    "export const PRODUCTION_ACTION = 'production_job.update'",
    "export const PRODUCTION_PERMISSION = 'production.write'",
    "export const INTERNAL_COMMENT_PERMISSION = 'orders.update'",
    "export const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'",
    "permissions.push(INTERNAL_COMMENT_PERMISSION)",
    "'idempotency_key'",
    "'expected_updated_at'",
]
for marker in required_contract_markers:
    if marker not in texts['edge_contract']:
        errors.append(f'Edge contract missing marker: {marker}')

# This stage intentionally does not claim the browser has switched yet.
for marker in [
    ".from('leader_production_jobs').update(patch)",
    ".from('leader_orders').update({ production_status: status",
    ".from('leader_production_events').insert(",
]:
    if marker not in texts['ui']:
        errors.append(f'Frontend baseline changed; update the contract and rollout plan: {marker}')

for name in ('edge', 'edge_contract', 'contract', 'doc', 'workflow'):
    text = texts[name]
    if 'ofewxuqfjhamgerwzull' in text and name not in ('doc',):
        errors.append(f'{name}: production ref must not appear in executable or machine-readable staging source')
    if re.search(r'sb_secret_[A-Za-z0-9_-]{10,}', text):
        errors.append(f'{name}: possible secret material')
    if re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}', text):
        errors.append(f'{name}: possible JWT material')

for marker in [
    'source-only',
    'leader_update_production_job_rpc',
    '53380fb1798f4e4ab25c7d9b98ae2562',
    'production_job.update',
    'production.write',
    'orders.update',
    'frontend',
    'Production',
]:
    if marker not in texts['doc']:
        errors.append(f'Documentation missing marker: {marker}')

if errors:
    print('CRM staging production command Edge checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('CRM staging production command Edge source, RPC baseline, permissions, rollout boundary and frontend drift contract are coherent.')
