#!/usr/bin/env python3
from pathlib import Path
import json
import re
import sys

root = Path(__file__).resolve().parents[1]
edge = root / 'supabase/functions/leader-public-lead/index.ts'
migration = root / 'supabase/production-candidates/20260724_01_public_intake_service_role_cutover_candidate.sql'
rollback = root / 'supabase/production-candidates/rollback/20260724_01_public_intake_service_role_cutover_candidate_rollback.sql'
contract_path = root / 'contracts/public-intake-service-role-cutover-candidate-v1.json'
runbook = root / 'docs/PUBLIC_INTAKE_SERVICE_ROLE_CUTOVER_CANDIDATE_V1_2026-07-24.md'
errors = []

required_files = [edge, migration, rollback, contract_path, runbook]
for path in required_files:
    if not path.exists():
        errors.append(f'missing candidate file: {path.relative_to(root)}')

if edge.exists():
    text = edge.read_text(encoding='utf-8')
    required = [
        "Deno.env.get('SUPABASE_SECRET_KEYS')",
        "Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')",
        "headers: { apikey: secretKey }",
        "Authorization: 'Bearer ' + legacyServiceRole",
        'Ignore malformed modern key configuration and try the explicit legacy transition key.',
        'backendHeaders: credential.headers',
        '...params.backendHeaders',
        '...credential.headers',
        "error: 'server_not_configured'",
        'isAllowedOrigin(req)',
        'honeypot_filled',
        'request_id_conflict',
    ]
    for marker in required:
        if marker not in text:
            errors.append(f'edge candidate missing: {marker}')
    singleton_markers = [
        'type BackendCredential = {',
        'function backendCredential(): BackendCredential | null',
        "Deno.env.get('SUPABASE_SECRET_KEYS')",
    ]
    for marker in singleton_markers:
        count = text.count(marker)
        if count != 1:
            errors.append(f'edge candidate singleton violation ({count}): {marker}')
    forbidden = [
        "Deno.env.get('SUPABASE_ANON_KEY')",
        "'apikey': anonKey",
        "params.anonKey",
        "Authorization: 'Bearer ' + secretKey",
    ]
    for marker in forbidden:
        if marker in text:
            errors.append(f'edge candidate forbidden marker: {marker}')
    if re.search(r'sb_secret_[A-Za-z0-9_-]{12,}', text):
        errors.append('literal secret key found in Edge source')

if migration.exists():
    text = migration.read_text(encoding='utf-8')
    required = [
        'revoke insert on table public.leader_leads from anon',
        'revoke insert on table public.leader_public_lead_audit from anon',
        'drop policy leader_leads_insert_public_safe on public.leader_leads',
        'drop policy leader_public_lead_audit_insert_public on public.leader_public_lead_audit',
        'create policy leader_leads_insert_app',
        'to authenticated',
        'with check (leader_private.leader_has_access())',
        'grant insert on table public.leader_leads to authenticated',
        'grant insert on table public.leader_leads to service_role',
        'grant insert on table public.leader_public_lead_audit to service_role',
        'anon can still insert leader_leads',
        'CRM manual lead INSERT lost',
    ]
    for marker in required:
        if marker not in text:
            errors.append(f'migration candidate missing: {marker}')
    if 'delete from' in text.lower() or 'truncate ' in text.lower():
        errors.append('candidate must not delete production data')

if rollback.exists():
    text = rollback.read_text(encoding='utf-8')
    for marker in [
        'leader_leads_insert_public_safe',
        'leader_public_lead_audit_insert_public',
        'grant insert on table public.leader_leads to anon, authenticated',
        'grant insert on table public.leader_public_lead_audit to anon',
    ]:
        if marker not in text:
            errors.append(f'rollback candidate missing: {marker}')

if contract_path.exists():
    try:
        contract = json.loads(contract_path.read_text(encoding='utf-8'))
    except Exception as exc:
        errors.append(f'invalid candidate contract: {exc}')
        contract = {}
    if contract.get('status') != 'source_only_not_applied':
        errors.append('contract must remain source_only_not_applied')
    production = contract.get('production') or {}
    if any(production.get(key) is not False for key in ['database_changed', 'edge_deployed', 'data_changed', 'auth_changed', 'nav_changed']):
        errors.append('contract incorrectly claims a production change')
    gate = contract.get('approval_gate') or {}
    if gate.get('approved') is not False:
        errors.append('production approval must remain false')
    if gate.get('edge_deploy_requires_explicit_owner_approval') is not True or gate.get('database_migration_requires_explicit_owner_approval') is not True:
        errors.append('explicit owner approval gates missing')

if runbook.exists():
    text = runbook.read_text(encoding='utf-8')
    for marker in [
        'Статус: source-only. Production не изменён.',
        'ручное создание заявки',
        'Stop conditions',
        'Rollback order',
        'merge source candidate не означает разрешение на deploy или migration',
    ]:
        if marker not in text:
            errors.append(f'runbook missing: {marker}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('Public intake service-role cutover candidate is complete; production remains unchanged.')
