#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGING = 'otulfnouybahfnsycxqn'
PRODUCTION = 'ofewxuqfjhamgerwzull'
EDGE_HASH = 'c6b0e1e4081c20872e3fdbdd80bc55b00aecdc063e7656f4a263e8a7f34638aa'
RPC_MD5 = '53380fb1798f4e4ab25c7d9b98ae2562'

FILES = {
    'deployment': ROOT / 'contracts/crm-staging-production-command-edge-v1.json',
    'detail': ROOT / 'contracts/production-job-update-v1.json',
    'migration': ROOT / 'supabase/staging-migrations/20260721_04_production_job_update_rpc.sql',
    'acceptance': ROOT / 'supabase/staging-tests/20260721_production_job_update_acceptance.sql',
    'edge': ROOT / 'supabase/staging-functions/leader-crm-production/index.ts',
    'edge_contract': ROOT / 'supabase/staging-functions/leader-crm-production/contract.ts',
    'edge_test': ROOT / 'supabase/staging-functions/leader-crm-production/contract_test.ts',
    'ui': ROOT / 'crm/v4/assets/v4/production-job-card-v2.js',
    'status': ROOT / 'crm/v4/assets/v4/status-transitions-v1.js',
    'doc': ROOT / 'docs/SUPABASE_STAGING_PRODUCTION_COMMAND_EDGE_V1_2026-07-21.md',
    'workflow': ROOT / '.github/workflows/crm-staging-production-command-edge-check.yml',
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


try:
    deployment = json.loads(texts['deployment'])
    detail = json.loads(texts['detail'])
except json.JSONDecodeError as exc:
    errors.append(f'Invalid JSON contract: {exc}')
    deployment = detail = {}

if deployment.get('project_ref') != STAGING or deployment.get('environment') != 'staging':
    errors.append('Deployment contract staging environment drifted')
edge_meta = deployment.get('edge', {})
if edge_meta.get('deployment_state') != 'deployed_active_production_locked':
    errors.append('Edge deployment state drifted')
if edge_meta.get('slug') != 'leader-crm-production' or edge_meta.get('version') != 2:
    errors.append('Edge slug/version drifted')
if edge_meta.get('sha256') != EDGE_HASH or edge_meta.get('verify_jwt') is not True:
    errors.append('Edge SHA or JWT setting drifted')
if edge_meta.get('action') != 'production_job.update':
    errors.append('Production action drifted')
if edge_meta.get('permissions') != ['production.write']:
    errors.append('Base production permission drifted')
if (edge_meta.get('conditional_permissions') or {}).get('internal_comment') != 'orders.update':
    errors.append('Conditional internal_comment permission drifted')
if deployment.get('frontend_switch') != 'not_performed':
    errors.append('Frontend switch must remain not_performed')
if deployment.get('production_deployment') != 'not_performed_requires_explicit_approval':
    errors.append('Production boundary drifted')

rpc = deployment.get('rpc_baseline', {})
if rpc.get('function_md5') != RPC_MD5 or rpc.get('function_bytes') != 15485:
    errors.append('Staging RPC fingerprint drifted')
if rpc.get('security_definer') is not False or rpc.get('search_path') != '':
    errors.append('RPC must remain SECURITY INVOKER with empty search_path')
if rpc.get('execute') != {'service_role': True, 'authenticated': False, 'anon': False}:
    errors.append('RPC execute privileges drifted')

if detail.get('status') != 'staging_deployed_production_locked':
    errors.append('Detailed contract status drifted')
if detail.get('transport', {}).get('staging_version') != 2:
    errors.append('Detailed contract Edge version drifted')
if detail.get('transport', {}).get('staging_deployment_hash') != EDGE_HASH:
    errors.append('Detailed contract Edge SHA drifted')
if detail.get('transport', {}).get('production_ui_enabled') is not False:
    errors.append('Production UI must remain disabled')
if detail.get('environment', {}).get('production_deployed') is not False:
    errors.append('Production deployment must remain false')
if detail.get('authorization', {}).get('internal_comment_additional_permission') != 'orders.update':
    errors.append('Detailed field permission drifted')
if detail.get('atomicity', {}).get('all_or_nothing') is not True:
    errors.append('Atomicity contract drifted')

require('edge', [
    'projectRefFromUrl(supabaseUrl) !== STAGING_PROJECT_REF',
    'authenticatedUser(req, supabaseUrl, publicKey)',
    'validateProductionRequest(input)',
    'for (const permission of validation.permissions)',
    '/rest/v1/rpc/leader_actor_has_crm_action_rpc',
    '/rest/v1/rpc/leader_update_production_job_rpc',
    'actor_id: checked.user.id',
    'actor_email: checked.user.email',
    'new Headers(init.headers || {})',
    'result.idempotent_replay === true ? 200 : 201',
])
forbid('edge', [
    'body.role', 'input.role', 'payload.role',
    'leader_user_profiles?user_id=', '.from(', '.insert(', '.update(', '.delete(',
])
positions = [texts['edge'].find(marker) for marker in [
    'projectRefFromUrl(supabaseUrl) !== STAGING_PROJECT_REF',
    'const checked = await authenticatedUser',
    'const validation = validateProductionRequest',
    'for (const permission of validation.permissions)',
    '/rest/v1/rpc/leader_update_production_job_rpc',
]]
if any(position < 0 for position in positions) or positions != sorted(positions):
    errors.append('Edge order must be environment -> JWT -> validation -> permissions -> RPC')

require('edge_contract', [
    "PRODUCTION_ACTION = 'production_job.update'",
    "PRODUCTION_PERMISSION = 'production.write'",
    "INTERNAL_COMMENT_PERMISSION = 'orders.update'",
    f"STAGING_PROJECT_REF = '{STAGING}'",
    'permissions.push(INTERNAL_COMMENT_PERMISSION)',
    'patch must be a non-empty allowlisted object',
    'deadline must be an ISO datetime or null',
])
forbid('edge_contract', ['WRITE_ROLES', 'normalizeRole', 'actor_id', 'owner_id', 'contractor_cost'])

require('edge_test', [
    'production permissions and staging ref are canonical',
    'ordinary patch requires only production.write',
    'internal comment adds orders.update',
    'browser actor and server-owned fields are rejected',
    'nullable values normalize safely',
    'invalid_transition',
])

require('migration', [
    '-- STAGING ONLY.', STAGING,
    'staging_environment_guard_failed',
    'create table if not exists public.leader_production_events',
    'public.leader_update_production_job_rpc(p_payload jsonb)',
    "leader_private.leader_actor_has_crm_action(v_actor_id, 'production.write')",
    "leader_private.leader_actor_has_crm_action(v_actor_id, 'orders.update')",
    'pg_advisory_xact_lock', 'for update',
    'update public.leader_production_jobs',
    'update public.leader_orders',
    'insert into public.leader_production_events',
    'insert into leader_private.leader_command_receipts',
    'grant execute on function public.leader_update_production_job_rpc(jsonb) to service_role',
])
forbid('migration', [
    PRODUCTION,
    'grant execute on function public.leader_update_production_job_rpc(jsonb) to authenticated',
    'grant execute on function public.leader_update_production_job_rpc(jsonb) to anon',
])

require('acceptance', [
    'begin;', 'rollback;',
    'exact_replay_failed', 'replay_created_duplicate_event',
    'idempotency_conflict_not_detected', 'invalid_transition_not_detected',
    'stale_conflict_not_detected', 'forbidden_case_failed',
    'contractor_positive_failed', 'synthetic_event_failure',
    'job_update_not_rolled_back', 'order_update_not_rolled_back',
    'failed_event_persisted', 'failed_receipt_persisted',
    'private_job_field_leaked', 'private_event_field_leaked',
])
if 'COMMIT;' in texts['acceptance'].upper():
    errors.append('Acceptance fixtures must never commit')

require('status', [
    "not_sent: status({ key: 'not_sent', label: 'Не передано', allowedTo: ['queued', 'in_production', 'not_required']",
    "queued: status({ key: 'queued', label: 'В очереди', allowedTo: ['in_production', 'cancelled']",
    "in_production: status({ key: 'in_production', label: 'В производстве', allowedTo: ['ready', 'stopped', 'cancelled']",
    "ready: status({ key: 'ready', label: 'Готово', allowedTo: ['issued']",
])

for marker in [
    ".from('leader_production_jobs').update(patch)",
    ".from('leader_orders').update({ production_status: status",
    ".from('leader_production_events').insert(",
]:
    if marker not in texts['ui']:
        errors.append(f'Frontend baseline changed without rollout approval: {marker}')
require('ui', [
    'isStagingProductionEnvironment(V4_CONFIG.supabaseUrl)',
    "supabaseClient.functions.invoke('leader-crm-production'",
    "action: 'production_job.update'",
    'expected_updated_at: old.updated_at',
    'idempotent_replay',
])
forbid('ui', ['leader_update_production_job_rpc'])

require('doc', [
    'Staging Production command Edge v2',
    EDGE_HASH, RPC_MD5,
    '`verify_jwt=true`', '`production.write`', '`orders.update`',
    'synthetic profiles, orders, jobs, events и receipts равны `0`',
    'Authenticated HTTP E2E пока не выполнен',
    f'Production project `{PRODUCTION}` не изменён',
])
require('workflow', [
    'denoland/setup-deno@v2',
    'deno check supabase/staging-functions/leader-crm-production/index.ts',
    'deno test supabase/staging-functions/leader-crm-production/contract_test.ts',
    'python3 tools/check_crm_staging_production_command_edge.py',
])

for path in (ROOT / 'supabase/migrations').glob('*.sql'):
    text = path.read_text(encoding='utf-8')
    if 'leader_update_production_job_rpc' in text or 'leader-crm-production' in text:
        errors.append(f'Production migration contains staging command: {path.name}')

for name in ('edge', 'edge_contract', 'edge_test', 'migration', 'acceptance', 'deployment', 'detail', 'doc', 'workflow'):
    text = texts[name]
    if name in ('edge', 'edge_contract', 'edge_test', 'migration', 'acceptance') and PRODUCTION in text:
        errors.append(f'{name}: production ref leaked into staging executable/test source')
    if re.search(r'sb_secret_[A-Za-z0-9_-]{10,}', text):
        errors.append(f'{name}: possible secret material')
    if re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}', text):
        errors.append(f'{name}: possible JWT material')

if errors:
    print('CRM staging production command checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('production_job.update is staging-deployed, JWT-protected, canonical-permission gated, atomic, idempotent, privacy-safe and production-locked.')
