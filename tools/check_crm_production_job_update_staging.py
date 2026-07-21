#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGING = 'otulfnouybahfnsycxqn'
PRODUCTION = 'ofewxuqfjhamgerwzull'
EDGE_VERSION = 1
EDGE_HASH = 'f378dc44bae1c4dd5627d2c0068f28b1c3cebe9d5e9b3e18ac01d55d59af060d'

FILES = {
    'migration': ROOT / 'supabase/staging-migrations/20260721_04_production_job_update_rpc.sql',
    'acceptance': ROOT / 'supabase/staging-tests/20260721_production_job_update_acceptance.sql',
    'edge': ROOT / 'supabase/staging-functions/leader-crm-production/index.ts',
    'edge_contract': ROOT / 'supabase/staging-functions/leader-crm-production/contract.ts',
    'edge_test': ROOT / 'supabase/staging-functions/leader-crm-production/contract_test.ts',
    'detail_contract': ROOT / 'contracts/production-job-update-v1.json',
    'backend_contract': ROOT / 'contracts/crm-v4-backend-command-contract-v1.json',
    'status_registry': ROOT / 'crm/v4/assets/v4/status-transitions-v1.js',
    'production_ui': ROOT / 'crm/v4/assets/v4/production-job-card-v2.js',
    'config': ROOT / 'crm/v4/assets/v4/config.js',
    'supabase_config': ROOT / 'supabase/config.toml',
    'doc': ROOT / 'docs/SUPABASE_STAGING_PRODUCTION_JOB_UPDATE_2026-07-21.md',
    'workflow': ROOT / '.github/workflows/crm-production-job-update-staging-check.yml',
}

errors: list[str] = []
texts: dict[str, str] = {}

for name, path in FILES.items():
    if not path.is_file():
        errors.append(f'Missing file: {path.relative_to(ROOT)}')
        texts[name] = ''
    else:
        texts[name] = path.read_text(encoding='utf-8')


def require(name: str, markers: list[str] | tuple[str, ...]) -> None:
    for marker in markers:
        if marker not in texts[name]:
            errors.append(f'{name}: missing marker {marker!r}')


def forbid(name: str, markers: list[str] | tuple[str, ...]) -> None:
    for marker in markers:
        if marker in texts[name]:
            errors.append(f'{name}: forbidden marker {marker!r}')


migration = texts['migration']
acceptance = texts['acceptance']
edge = texts['edge']
edge_contract = texts['edge_contract']
production_ui = texts['production_ui']

for name in ('migration', 'acceptance', 'edge', 'edge_contract', 'edge_test'):
    if PRODUCTION in texts[name]:
        errors.append(f'{name}: production project ref is forbidden in staging runtime/test source')

require('migration', [
    '-- STAGING ONLY.',
    STAGING,
    'staging_environment_guard_failed',
    "to_regprocedure('leader_private.leader_actor_has_crm_action(uuid,text)')",
    'create table if not exists public.leader_production_events',
    'alter table public.leader_production_events enable row level security',
    'revoke all on table public.leader_production_events from public, anon, authenticated',
    'grant select, insert on table public.leader_production_events to service_role',
    'public.leader_update_production_job_rpc(p_payload jsonb)',
    'security invoker',
    "set search_path = ''",
    "leader_private.leader_actor_has_crm_action(v_actor_id, 'production.write')",
    "leader_private.leader_actor_has_crm_action(v_actor_id, 'orders.update')",
    "v_patch ? 'internal_comment'",
    'pg_advisory_xact_lock',
    'for update',
    'v_job.updated_at <> v_expected_updated_at',
    'leader_private.leader_production_transition_allowed',
    'update public.leader_production_jobs',
    'update public.leader_orders',
    'insert into public.leader_production_events',
    'insert into leader_private.leader_command_receipts',
    "'idempotent_replay', false",
    'Production job update could not be persisted',
    'revoke all on function public.leader_update_production_job_rpc(jsonb) from public, anon, authenticated',
    'grant execute on function public.leader_update_production_job_rpc(jsonb) to service_role',
])
forbid('migration', [
    'security definer\nset search_path',
    'grant execute on function public.leader_update_production_job_rpc(jsonb) to authenticated',
    'grant execute on function public.leader_update_production_job_rpc(jsonb) to anon',
    'auth.uid()',
    'auth.email()',
])

permission_pos = migration.find("leader_private.leader_actor_has_crm_action(v_actor_id, 'production.write')")
job_read_pos = migration.find('from public.leader_production_jobs', permission_pos)
job_update_pos = migration.find('update public.leader_production_jobs', job_read_pos)
order_update_pos = migration.find('update public.leader_orders', job_update_pos)
event_insert_pos = migration.find('insert into public.leader_production_events', order_update_pos)
receipt_insert_pos = migration.find('insert into leader_private.leader_command_receipts', event_insert_pos)
if not (0 <= permission_pos < job_read_pos < job_update_pos < order_update_pos < event_insert_pos < receipt_insert_pos):
    errors.append('migration: permission/read/write/event/receipt execution order is unsafe')

require('acceptance', [
    '-- STAGING ONLY acceptance test',
    'begin;',
    'rollback;',
    "'success_failed'",
    'exact_replay_failed',
    'replay_created_duplicate_event',
    'replay_created_duplicate_receipt',
    'idempotency_conflict_not_detected',
    'invalid_transition_not_detected',
    'stale_conflict_not_detected',
    'forbidden_case_failed',
    'contractor_positive_failed',
    'synthetic_event_failure',
    'job_update_not_rolled_back',
    'order_update_not_rolled_back',
    'failed_event_persisted',
    'failed_receipt_persisted',
    'private_job_field_leaked',
    'private_event_field_leaked',
    "'profiles'",
    "'receipts'",
])
if 'COMMIT;' in acceptance.upper():
    errors.append('acceptance: synthetic test must not commit fixtures')

require('edge_contract', [
    "PRODUCTION_EDGE_CONTRACT_VERSION = 'leader-crm-production-edge-v1'",
    "PRODUCTION_ACTION = 'production_job.update'",
    "PRODUCTION_PERMISSION = 'production.write'",
    f"STAGING_PROJECT_REF = '{STAGING}'",
    "'job_id'",
    "'idempotency_key'",
    "'patch'",
    "'internal_comment'",
    'patch must be a non-empty allowlisted object',
    'deadline must be an ISO datetime or null',
])
forbid('edge_contract', [
    'WRITE_ROLES',
    'canWrite',
    'normalizeRole',
    'actor_id',
    'owner_id',
    'contractor_cost',
])

require('edge', [
    "import 'jsr:@supabase/functions-js/edge-runtime.d.ts'",
    'projectRefFromUrl(supabaseUrl) !== STAGING_PROJECT_REF',
    '/auth/v1/user',
    'validateProductionJobUpdateRequest(input)',
    "'/rest/v1/rpc/leader_actor_has_crm_action_rpc'",
    'p_action: PRODUCTION_PERMISSION',
    'const permissionResult = await canonicalPermission',
    "'/rest/v1/rpc/leader_update_production_job_rpc'",
    'actor_id: checked.user.id',
    'actor_email: checked.user.email',
    'result.idempotent_replay === true ? 200 : 201',
])
forbid('edge', [
    'body.role',
    'input.role',
    'payload.role',
    'leader_user_profiles?user_id=',
    '.from(',
    '.insert(',
    '.update(',
    '.delete(',
])

environment_pos = edge.find('projectRefFromUrl(supabaseUrl) !== STAGING_PROJECT_REF')
auth_pos = edge.find('const checked = await authenticatedUser')
validation_pos = edge.find('const validation = validateProductionJobUpdateRequest')
edge_permission_pos = edge.find('const permissionResult = await canonicalPermission')
rpc_pos = edge.find("'/rest/v1/rpc/leader_update_production_job_rpc'", edge_permission_pos)
if not (0 <= environment_pos < auth_pos < validation_pos < edge_permission_pos < rpc_pos):
    errors.append('edge: environment/auth/validation/permission/RPC order is unsafe')

require('edge_test', [
    'production permission and staging ref are canonical',
    "PRODUCTION_PERMISSION === 'production.write'",
    'browser actor and server-owned fields are rejected',
    'nullable patch fields are normalized without actor data',
    'unknown action and response statuses are stable',
    'contractor_cost',
    'invalid_transition',
])

try:
    detail = json.loads(texts['detail_contract'])
    backend = json.loads(texts['backend_contract'])
except json.JSONDecodeError as exc:
    errors.append(f'Invalid JSON contract: {exc}')
    detail = backend = {}

if detail.get('status') != 'staging_deployed_production_locked':
    errors.append('detail contract staging deployment status drifted')
if detail.get('action') != 'production_job.update' or detail.get('permission') != 'production.write':
    errors.append('detail contract action/permission drifted')
if detail.get('environment', {}).get('staging_project_ref') != STAGING:
    errors.append('detail contract staging ref drifted')
if detail.get('environment', {}).get('production_project_ref') != PRODUCTION:
    errors.append('detail contract production ref drifted')
if detail.get('environment', {}).get('production_deployed') is not False:
    errors.append('detail contract must keep production undeployed')
transport = detail.get('transport', {})
if transport.get('edge_function') != 'leader-crm-production':
    errors.append('detail contract Edge slug drifted')
if transport.get('verify_jwt') is not True:
    errors.append('detail contract verify_jwt drifted')
if transport.get('staging_version') != EDGE_VERSION:
    errors.append('detail contract staging version drifted')
if transport.get('staging_deployment_hash') != EDGE_HASH:
    errors.append('detail contract deployment hash drifted')
if transport.get('browser_direct_write') is not False or transport.get('production_ui_enabled') is not False:
    errors.append('detail contract must keep browser/production writes disabled')
if detail.get('authorization', {}).get('internal_comment_additional_permission') != 'orders.update':
    errors.append('internal comment field-level permission drifted')
if detail.get('atomicity', {}).get('all_or_nothing') is not True:
    errors.append('atomicity contract drifted')
if detail.get('safe_response', {}).get('forbidden_response_fields') != [
    'internal_comment', 'contractor_cost', 'client_total', 'created_by', 'created_by_email', 'owner_id'
]:
    errors.append('safe-response forbidden field list drifted')

command = backend.get('commands', {}).get('production_job.update', {})
if command.get('permission') != 'production.write':
    errors.append('backend command permission drifted')
if command.get('transaction_required') is not True or command.get('optimistic_concurrency') != 'required':
    errors.append('backend command transaction/concurrency drifted')
if command.get('audit_target') != 'leader_production_events':
    errors.append('backend command audit target drifted')

require('status_registry', [
    'production: domain({',
    "not_sent: status({ key: 'not_sent', label: 'Не передано', allowedTo: ['queued', 'in_production', 'not_required']",
    "queued: status({ key: 'queued', label: 'В очереди', allowedTo: ['in_production', 'cancelled']",
    "in_production: status({ key: 'in_production', label: 'В производстве', allowedTo: ['ready', 'stopped', 'cancelled']",
    "stopped: status({ key: 'stopped', label: 'Приостановлено', allowedTo: ['queued', 'in_production', 'cancelled']",
    "ready: status({ key: 'ready', label: 'Готово', allowedTo: ['issued']",
    "issued: status({ key: 'issued', label: 'Выдано', terminal: true",
])

require('production_ui', [
    "supabaseClient.from('leader_production_jobs').update(patch)",
    "supabaseClient.from('leader_orders').update",
    "supabaseClient.from('leader_production_events').insert",
])
forbid('production_ui', [
    'leader-crm-production',
    'leader_update_production_job_rpc',
    'production-job-staging-transport',
])

require('config', [f"supabaseUrl: 'https://{PRODUCTION}.supabase.co'"])
if f'project_id = "{PRODUCTION}"' not in texts['supabase_config']:
    errors.append('supabase/config.toml must remain bound to production')
if STAGING in texts['supabase_config']:
    errors.append('staging project ref must not replace standard Supabase config')

require('doc', [
    STAGING,
    PRODUCTION,
    '`leader-crm-production v1`',
    EDGE_HASH,
    '`verify_jwt=true`',
    '`production.write`',
    '`orders.update`',
    'synthetic profiles, orders, jobs, events и receipts — `0`',
    'Authenticated HTTP E2E пока не выполнен',
    'Production rollout требует отдельного explicit approval',
])
require('workflow', [
    'denoland/setup-deno@v2',
    'deno check supabase/staging-functions/leader-crm-production/index.ts',
    'deno test supabase/staging-functions/leader-crm-production/contract_test.ts',
    'python3 tools/check_crm_production_job_update_staging.py',
])

for path in (ROOT / 'supabase/migrations').glob('*.sql'):
    text = path.read_text(encoding='utf-8')
    if 'leader_update_production_job_rpc' in text or 'leader-crm-production' in text:
        errors.append(f'Production migration contains staging production command: {path.name}')

secret_patterns = (
    r'sb_secret_[A-Za-z0-9_-]{10,}',
    r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}',
)
for name, text in texts.items():
    for pattern in secret_patterns:
        if re.search(pattern, text):
            errors.append(f'{name}: possible secret material')

if errors:
    print('CRM production job staging checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('production_job.update is staging-deployed, canonical-permission gated, atomic, idempotent, privacy-safe and production-locked.')
