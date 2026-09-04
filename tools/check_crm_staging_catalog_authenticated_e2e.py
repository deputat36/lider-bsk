#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
RUNNER = ROOT / 'tools/run_crm_staging_catalog_authenticated_e2e.mjs'
BOOTSTRAP = ROOT / 'supabase/staging-functions/leader-staging-authenticated-e2e-bootstrap/index.ts'
MIGRATION = ROOT / 'supabase/staging-migrations/20260904_03_authenticated_e2e_catalog_cleanup.sql'
WORKFLOW = ROOT / '.github/workflows/crm-staging-catalog-authenticated-e2e.yml'
errors = []

for path in [RUNNER, BOOTSTRAP, MIGRATION]:
    if not path.exists():
        errors.append(f'missing: {path.relative_to(ROOT)}')

if errors:
    print('\n'.join(errors), file=sys.stderr)
    sys.exit(1)

runner = RUNNER.read_text(encoding='utf-8')
bootstrap = BOOTSTRAP.read_text(encoding='utf-8')
migration = MIGRATION.read_text(encoding='utf-8')
workflow = WORKFLOW.read_text(encoding='utf-8') if WORKFLOW.exists() else ''

for marker in [
    "const STAGING_REF = 'otulfnouybahfnsycxqn'",
    "const FUNCTION_SLUG = 'leader-crm-catalog'",
    "const ACTION = 'catalog.manage'",
    "--mode=",
    "manager-forbidden",
    "owner-full",
    "staging_login_failed",
    "catalog_replay_failed",
    "catalog_stale_guard_failed",
    "catalog_authenticated_readback_mismatch",
    "catalog_log_count_or_type_mismatch",
    "/functions/v1/${FUNCTION_SLUG}",
    "/rest/v1/leader_catalog?",
    "/rest/v1/leader_catalog_price_logs?",
]:
    if marker not in runner:
        errors.append('runner missing: ' + marker)

for forbidden in [
    'SUPABASE_SERVICE_ROLE_KEY',
    'sb_secret_',
    'service_role',
    'ofewxuqfjhamgerwzull',
]:
    if forbidden in runner:
        errors.append('runner contains forbidden browser/runtime marker: ' + forbidden)

for marker in [
    "const CATALOG_BRANCH_REF='refs/heads/agent/152-catalog-authenticated-e2e-v1'",
    "crm-staging-catalog-authenticated-e2e.yml@${CATALOG_BRANCH_REF}",
    'TRUSTED_CONTEXTS',
    "github_claim_rejected:ref",
    "github_claim_rejected:workflow_ref",
    "repo:${REPOSITORY}:ref:${ref}",
]:
    if marker not in bootstrap:
        errors.append('bootstrap missing: ' + marker)

for forbidden in ['refs/heads/*', "eventName:'pull_request'", 'ofewxuqfjhamgerwzull']:
    if forbidden in bootstrap:
        errors.append('bootstrap trust boundary is too broad: ' + forbidden)

for marker in [
    'STAGING ONLY',
    "project_ref = 'otulfnouybahfnsycxqn'",
    'leader_catalog_price_logs',
    "action = 'catalog.manage'",
    'delete from public.leader_catalog_price_logs',
    'delete from public.leader_catalog where id = any(v_catalog)',
    'delete from leader_private.leader_command_receipts where actor_id = v_user',
    "'catalog_receipts'",
    'security definer',
    'revoke all on function public.leader_cleanup_authenticated_e2e_rpc(text) from public, anon, authenticated',
    'grant execute on function public.leader_cleanup_authenticated_e2e_rpc(text) to service_role',
]:
    if marker not in migration:
        errors.append('cleanup migration missing: ' + marker)

if workflow:
    for marker in [
        'agent/152-catalog-authenticated-e2e-v1',
        'id-token: write',
        'leader-staging-authenticated-e2e-bootstrap',
        '--mode=manager-forbidden',
        '--mode=owner-full',
        'Cleanup all synthetic rows and Auth user',
        'catalog_logs == 2',
        'catalog_receipts == 2',
    ]:
        if marker not in workflow:
            errors.append('runtime workflow missing: ' + marker)

if errors:
    print('\n'.join(errors), file=sys.stderr)
    sys.exit(1)

print('Staging catalog authenticated E2E uses exact GitHub OIDC trust, user JWT Edge calls, manager deny, owner create/replay/update/stale checks, and zero-residue cleanup: PASS')
