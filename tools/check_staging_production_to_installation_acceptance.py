#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRODUCTION_REF = 'ofewxuqfjhamgerwzull'
FILES = {
    'migration': ROOT / 'supabase/staging-migrations/20260731_04_installation_job_create_from_order_rpc.sql',
    'acceptance': ROOT / 'supabase/staging-tests/20260731_production_to_installation_acceptance.sql',
    'edge': ROOT / 'supabase/staging-functions/leader-crm-installation-create/index.ts',
    'contract': ROOT / 'supabase/staging-functions/leader-crm-installation-create/contract.ts',
    'test': ROOT / 'supabase/staging-functions/leader-crm-installation-create/contract_test.ts',
    'doc': ROOT / 'docs/CRM_STAGING_PRODUCTION_TO_INSTALLATION_ACCEPTANCE_2026-07-31.md',
    'workflow': ROOT / '.github/workflows/staging-production-to-installation-acceptance-check.yml',
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
        if marker not in texts[name]: errors.append(f'{name}: missing marker {marker!r}')

def forbid(name: str, markers: tuple[str, ...]) -> None:
    for marker in markers:
        if marker in texts[name]: errors.append(f'{name}: forbidden marker {marker!r}')

require('migration', (
    '-- STAGING ONLY.','otulfnouybahfnsycxqn','leader_installation_jobs_one_active_per_order_uidx',
    'leader_production_is_installation_ready','leader_create_installation_job_from_order_rpc',
    "leader_actor_has_crm_action(v_actor_id, 'installation.write')",
    "'installation_job.create_from_order'",'pg_advisory_xact_lock',
    'insert into public.leader_installation_jobs','insert into public.leader_installation_events',
    'update public.leader_orders','insert into leader_private.leader_command_receipts',
))
require('acceptance', (
    'begin;','rollback;','installation_idempotent_replay_failed',
    'installation_idempotency_conflict_failed','active_installation_job_conflict_failed',
    'unready_production_gate_failed','installation_job_reopen_failed',
    'production-to-installation acceptance: OK; cleanup verified: zero residue',
))
if 'COMMIT;' in texts['acceptance'].upper(): errors.append('acceptance must never commit fixtures')
require('edge', (
    'projectRefFromUrl(supabaseUrl) !== STAGING_PROJECT_REF','authenticatedUser(req, supabaseUrl, publicKey)',
    'validateInstallationCreateRequest(input)','/rest/v1/rpc/leader_actor_has_crm_action_rpc',
    '/rest/v1/rpc/leader_create_installation_job_from_order_rpc','actor_id: checked.user.id',
    'result.idempotent_replay === true ? 200 : 201',
))
forbid('edge', ('body.role','input.role','payload.role','.from(','.insert(','.update(','.delete('))
require('contract', (
    "INSTALLATION_CREATE_ACTION = 'installation_job.create_from_order'",
    "INSTALLATION_CREATE_PERMISSION = 'installation.write'",
    "STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'",
    'address is required','scheduled_at must be ISO datetime','must be a non-negative number or null',
))
require('test', (
    'valid installation create request normalizes safely','server-owned fields are rejected',
    'missing address is rejected','missing schedule is rejected','negative cost is rejected',
))
require('doc', (
    'production-to-installation acceptance: OK; cleanup verified: zero residue',
    '`leader-crm-installation-create`','`verify_jwt=true`','Production Supabase не изменялся',
))
require('workflow', (
    'denoland/setup-deno@v2','deno check supabase/staging-functions/leader-crm-installation-create/index.ts',
    'deno test supabase/staging-functions/leader-crm-installation-create/contract_test.ts',
    'python3 tools/check_staging_production_to_installation_acceptance.py',
))
for name in ('migration','acceptance','edge','contract','test'):
    if PRODUCTION_REF in texts[name]: errors.append(f'{name}: production ref leaked into executable/test source')
for path in (ROOT / 'supabase/migrations').glob('*.sql'):
    text = path.read_text(encoding='utf-8')
    if 'leader_create_installation_job_from_order_rpc' in text or 'leader-crm-installation-create' in text:
        errors.append(f'production migration contains staging installation create command: {path.name}')
if errors:
    print('Staging production-to-installation checks failed:')
    for error in errors: print(f'- {error}')
    raise SystemExit(1)
print('staging production-to-installation acceptance contract: OK')
