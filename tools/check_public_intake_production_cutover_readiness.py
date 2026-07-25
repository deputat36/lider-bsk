#!/usr/bin/env python3
from pathlib import Path
import json
import re
import sys

root = Path(__file__).resolve().parents[1]
contract_path = root / 'contracts/public-intake-production-cutover-readiness-v1.json'
staging_evidence_path = root / 'docs/PUBLIC_INTAKE_STAGING_RUNTIME_SMOKE_V1_2026-07-25.md'
service_contract_path = root / 'contracts/public-intake-service-role-cutover-candidate-v1.json'
rate_contract_path = root / 'contracts/public-intake-rate-limit-candidate-v1.json'
errors = []

try:
    contract = json.loads(contract_path.read_text(encoding='utf-8'))
except Exception as exc:
    print(f'invalid readiness contract: {exc}')
    sys.exit(1)

if contract.get('status') != 'ready_for_owner_approval':
    errors.append('readiness status must be ready_for_owner_approval')

production = contract.get('production_preflight') or {}
expected_production = {
    'project_ref': 'ofewxuqfjhamgerwzull',
    'edge_function': 'leader-public-lead',
    'edge_version': 10,
    'edge_active': True,
    'verify_jwt': False,
    'edge_uses_anon_database_credential': True,
    'anon_lead_insert': True,
    'anon_audit_insert': True,
    'authenticated_lead_insert': True,
    'service_role_lead_insert': True,
    'service_role_audit_insert': True,
    'public_lead_policy': 'leader_leads_insert_public_safe',
    'public_audit_policy': 'leader_public_lead_audit_insert_public',
    'rate_limit_table_exists': False,
    'rate_limit_rpc_exists': False,
    'database_changed_by_readiness': False,
    'edge_deployed_by_readiness': False,
    'secrets_changed_by_readiness': False,
    'data_changed_by_readiness': False,
}
for key, expected in expected_production.items():
    if production.get(key) != expected:
        errors.append(f'production preflight mismatch: {key}')

staging = contract.get('staging_evidence') or {}
for key in [
    'runtime_smoke_passed',
    'accepted_lead_passed',
    'duplicate_idempotency_passed',
    'validation_passed',
    'honeypot_passed',
    'phone_rate_limit_passed',
    'authenticated_manual_lead_policy_passed',
    'rollback_lock_410_passed',
    'rate_limit_dependency_fail_closed_503_passed',
    'recovery_runtime_smoke_passed',
    'automatic_cleanup_passed',
]:
    if staging.get(key) is not True:
        errors.append(f'staging evidence missing: {key}')
for key in ['final_lead_residue', 'final_audit_residue', 'final_receipt_residue', 'security_critical', 'security_warning']:
    if staging.get(key) != 0:
        errors.append(f'staging zero expectation failed: {key}')

sources = contract.get('source_candidates') or {}
for key, relative in sources.items():
    path = root / relative
    if not path.exists():
        errors.append(f'missing readiness source {key}: {relative}')

for source_contract_path in [service_contract_path, rate_contract_path]:
    try:
        source_contract = json.loads(source_contract_path.read_text(encoding='utf-8'))
    except Exception as exc:
        errors.append(f'invalid source contract {source_contract_path.name}: {exc}')
        continue
    if source_contract.get('status') != 'source_only_not_applied':
        errors.append(f'source contract must remain source_only_not_applied: {source_contract_path.name}')
    gate = source_contract.get('approval_gate') or {}
    if gate.get('approved') is not False:
        errors.append(f'source contract approval must remain false: {source_contract_path.name}')

if not staging_evidence_path.exists():
    errors.append('missing staging runtime evidence document')
else:
    evidence = staging_evidence_path.read_text(encoding='utf-8')
    for marker in [
        'Статус: passed. Production не изменён.',
        'HTTP 200 с `duplicate=true`',
        'HTTP 429 с `retry_after_seconds`',
        'HTTP 410 `staging_rollback_locked`',
        'HTTP 503 `rate_limit_unavailable`',
        'Повторная очистка вернула нули',
        'Production по-прежнему использует прежнюю Edge Function',
    ]:
        if marker not in evidence:
            errors.append(f'staging evidence marker missing: {marker}')

for list_name, minimum in [('execution_order', 10), ('stop_conditions', 8), ('rollback_order', 6)]:
    value = contract.get(list_name)
    if not isinstance(value, list) or len(value) < minimum:
        errors.append(f'{list_name} is incomplete')

approval = contract.get('approval_gate') or {}
if approval.get('approved') is not False:
    errors.append('production approval must remain false')
for key in [
    'production_secret_change_requires_explicit_owner_approval',
    'production_database_migrations_require_explicit_owner_approval',
    'production_edge_deploy_requires_explicit_owner_approval',
    'production_synthetic_post_requires_explicit_owner_approval',
    'production_browser_e2e_requires_explicit_owner_approval',
]:
    if approval.get(key) is not True:
        errors.append(f'approval gate missing: {key}')

all_text = '\n'.join(
    path.read_text(encoding='utf-8')
    for path in [contract_path, staging_evidence_path]
    if path.exists()
)
if re.search(r'(sb_secret_[A-Za-z0-9_-]{12,}|eyJ[A-Za-z0-9_-]{30,})', all_text):
    errors.append('credential-like literal found in readiness evidence')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('Public intake production cutover is source-ready and staging-validated; owner approval remains false.')
