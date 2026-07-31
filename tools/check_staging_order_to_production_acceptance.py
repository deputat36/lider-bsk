#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGING = 'otulfnouybahfnsycxqn'
PRODUCTION = 'ofewxuqfjhamgerwzull'

FILES = {
    'migration': ROOT / 'supabase/staging-migrations/20260731_02_production_job_create_from_order_rpc.sql',
    'gate_fix': ROOT / 'supabase/staging-migrations/20260731_03_production_job_create_layout_gate_fix.sql',
    'acceptance': ROOT / 'supabase/staging-tests/20260731_order_to_production_acceptance.sql',
    'edge': ROOT / 'supabase/staging-functions/leader-crm-production-create/index.ts',
    'contract': ROOT / 'supabase/staging-functions/leader-crm-production-create/contract.ts',
    'contract_test': ROOT / 'supabase/staging-functions/leader-crm-production-create/contract_test.ts',
    'doc': ROOT / 'docs/CRM_STAGING_ORDER_TO_PRODUCTION_ACCEPTANCE_2026-07-31.md',
    'workflow': ROOT / '.github/workflows/staging-order-to-production-acceptance-check.yml',
}

errors: list[str] = []
texts: dict[str, str] = {}
for name, path in FILES.items():
    if not path.is_file():
        errors.append(f'Missing file: {path.relative_to(ROOT)}')
        texts[name] = ''
    else:
        texts[name] = path.read_text(encoding='utf-8')


def require(name: str, markers: tuple[str, ...]) -> None:
    for marker in markers:
        if marker not in texts[name]:
            errors.append(f'{name}: missing marker {marker!r}')


def forbid(name: str, markers: tuple[str, ...]) -> None:
    for marker in markers:
        if marker in texts[name]:
            errors.append(f'{name}: forbidden marker {marker!r}')


require('migration', (
    '-- STAGING ONLY.', STAGING,
    'staging_environment_guard_failed',
    'leader_production_jobs_one_active_per_order_uidx',
    'leader_create_production_job_from_order_rpc',
    "leader_actor_has_crm_action(v_actor_id, 'production.write')",
    "'production_job.create_from_order'",
    'pg_advisory_xact_lock',
    'insert into public.leader_production_jobs',
    'insert into public.leader_production_events',
    'update public.leader_orders',
    'update public.leader_design_tasks',
    'insert into leader_private.leader_command_receipts',
    'grant execute on function public.leader_create_production_job_from_order_rpc(jsonb)',
))
require('gate_fix', (
    STAGING,
    'leader_layout_is_approved',
    "value like '%на согласовании%'",
    "value like '%согласование%'",
    "leader_layout_is_approved('На согласовании') is not false",
    'leader_create_production_job_from_order_impl_rpc',
))
require('acceptance', (
    'begin;', 'rollback;',
    'production_idempotent_replay_failed',
    'production_idempotency_conflict_failed',
    'active_production_job_conflict_failed',
    'unapproved_layout_gate_failed',
    'production_job_reopen_failed',
    'order-to-production acceptance: OK; cleanup verified: zero residue',
))
if 'COMMIT;' in texts['acceptance'].upper():
    errors.append('acceptance must never commit fixtures')

require('edge', (
    'projectRefFromUrl(supabaseUrl) !== STAGING_PROJECT_REF',
    'authenticatedUser(req, supabaseUrl, publicKey)',
    'validateProductionCreateRequest(input)',
    '/rest/v1/rpc/leader_actor_has_crm_action_rpc',
    '/rest/v1/rpc/leader_create_production_job_from_order_rpc',
    'actor_id: checked.user.id',
    'actor_email: checked.user.email',
    'result.idempotent_replay === true ? 200 : 201',
))
forbid('edge', (
    'body.role', 'input.role', 'payload.role',
    '.from(', '.insert(', '.update(', '.delete(',
))

require('contract', (
    "PRODUCTION_CREATE_ACTION = 'production_job.create_from_order'",
    "PRODUCTION_CREATE_PERMISSION = 'production.write'",
    f"STAGING_PROJECT_REF = '{STAGING}'",
    'idempotency_key must contain 1 to 180 characters',
    'layout_status must confirm an approved layout',
    'contractor_cost must be a non-negative number or null',
))
require('contract_test', (
    'valid create request normalizes safely',
    'unknown and server-owned fields are rejected',
    'unapproved layout is rejected before transport',
    'negative contractor cost is rejected',
))
require('doc', (
    'order-to-production acceptance: OK; cleanup verified: zero residue',
    '`leader-crm-production-create`',
    '`verify_jwt=true`',
    'Production Supabase не изменялся',
))
require('workflow', (
    'denoland/setup-deno@v2',
    'deno check supabase/staging-functions/leader-crm-production-create/index.ts',
    'deno test supabase/staging-functions/leader-crm-production-create/contract_test.ts',
    'python3 tools/check_staging_order_to_production_acceptance.py',
))

for name in ('migration', 'gate_fix', 'acceptance', 'edge', 'contract', 'contract_test'):
    if PRODUCTION in texts[name]:
        errors.append(f'{name}: production ref leaked into staging executable/test source')

for path in (ROOT / 'supabase/migrations').glob('*.sql'):
    text = path.read_text(encoding='utf-8')
    if 'leader_create_production_job_from_order_rpc' in text or 'leader-crm-production-create' in text:
        errors.append(f'production migration contains staging create command: {path.name}')

if errors:
    print('Staging order-to-production checks failed:')
    for error in errors:
        print(f'- {error}')
    raise SystemExit(1)

print('staging order-to-production acceptance contract: OK')
