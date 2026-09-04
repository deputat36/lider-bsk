#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'build/crm-catalog-production-candidate'
GENERATOR = ROOT / 'tools/generate_crm_catalog_production_candidate.py'
DOC = ROOT / 'docs/CRM_CATALOG_PRODUCTION_ROLLOUT_READINESS_2026-09-04.md'
errors = []

for path in [GENERATOR, DOC, OUT / 'manifest.json', OUT / '20260904_01_catalog_management_rpc_candidate.sql', OUT / '20260904_01_catalog_management_rpc_candidate_rollback.sql', OUT / 'edge/leader-crm-catalog/index.ts', OUT / 'edge/leader-crm-catalog/contract.ts']:
    if not path.exists(): errors.append(f'missing: {path.relative_to(ROOT)}')
if errors:
    print('\n'.join(errors), file=sys.stderr); sys.exit(1)

manifest = json.loads((OUT / 'manifest.json').read_text(encoding='utf-8'))
rpc = (OUT / '20260904_01_catalog_management_rpc_candidate.sql').read_text(encoding='utf-8')
rollback = (OUT / '20260904_01_catalog_management_rpc_candidate_rollback.sql').read_text(encoding='utf-8')
edge = (OUT / 'edge/leader-crm-catalog/index.ts').read_text(encoding='utf-8')
contract = (OUT / 'edge/leader-crm-catalog/contract.ts').read_text(encoding='utf-8')
doc = DOC.read_text(encoding='utf-8')

if manifest.get('production_project_ref') != 'ofewxuqfjhamgerwzull': errors.append('manifest production ref mismatch')
if manifest.get('source_only') is not True or manifest.get('production_mutated') is not False: errors.append('manifest must remain source-only')
if manifest.get('frontend_switch_included') is not False: errors.append('frontend switch must remain excluded')

for marker in [
    'SOURCE-ONLY PRODUCTION CANDIDATE',
    'Target project: lider-bsk production / ofewxuqfjhamgerwzull',
    'DO NOT APPLY without explicit production database approval',
    "raise exception 'catalog_production_candidate_rejected_on_staging'",
    "raise exception 'catalog_production_rbac_receipts_missing'",
    'leader_private.leader_role_action_matrix_v1',
    'leader_private.leader_command_receipts',
    "role = 'owner' and 'catalog.manage' = any(allowed_actions)",
    "role = 'admin' and 'catalog.manage' = any(allowed_actions)",
    'create or replace function public.leader_manage_catalog_rpc(p_payload jsonb)',
    'security invoker',
    'revoke all on function public.leader_manage_catalog_rpc(jsonb) from public, anon, authenticated',
    'grant execute on function public.leader_manage_catalog_rpc(jsonb) to service_role',
]:
    if marker not in rpc: errors.append('RPC candidate missing: ' + marker)

for marker in [
    'SOURCE-ONLY PRODUCTION ROLLBACK CANDIDATE',
    'catalog_production_rollback_rejected_on_staging',
    'drop function public.leader_manage_catalog_rpc(jsonb)',
]:
    if marker not in rollback: errors.append('rollback missing: ' + marker)

for marker in [
    "PRODUCTION_PROJECT_REF = 'ofewxuqfjhamgerwzull'",
    'projectRefFromUrl(supabaseUrl) !== PRODUCTION_PROJECT_REF',
    "'/rest/v1/rpc/leader_actor_has_crm_action_rpc'",
    "'/rest/v1/rpc/leader_manage_catalog_rpc'",
    'authenticatedUser(req, supabaseUrl, anonKey)',
]:
    if marker not in edge and marker not in contract: errors.append('production Edge missing: ' + marker)
if 'otulfnouybahfnsycxqn' in edge or 'otulfnouybahfnsycxqn' in contract: errors.append('production Edge still contains staging ref')

for marker in [
    'Production сейчас не готов к catalog write rollout',
    '20260723_01_installation_rbac_receipts_candidate.sql',
    'Production Supabase не изменялся',
    'frontend остаётся read-only',
    'rollback',
]:
    if marker not in doc: errors.append('readiness doc missing: ' + marker)

if errors:
    print('\n'.join(errors), file=sys.stderr); sys.exit(1)
print('CRM catalog production candidate is source-only, prerequisite-gated, rollbackable and excludes frontend cutover: PASS')
