#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / 'supabase/staging-migrations/20260904_02_catalog_management_write_harness.sql'
RECEIPT_FIX = ROOT / 'supabase/staging-migrations/20260904_04_catalog_receipt_cleanup_helper.sql'
TEST = ROOT / 'supabase/staging-tests/20260904_catalog_management_write_acceptance.sql'
EDGE = ROOT / 'supabase/functions/leader-crm-catalog/index.ts'
CONTRACT = ROOT / 'supabase/functions/leader-crm-catalog/contract.ts'
TRANSPORT = ROOT / 'crm/v4/assets/v4/catalog-management-staging-transport-v1.js'
VIEW = ROOT / 'crm/v4/assets/v4/catalog-management-v1.js'

paths = [MIGRATION, RECEIPT_FIX, TEST, EDGE, CONTRACT, TRANSPORT, VIEW]
missing = [str(p.relative_to(ROOT)) for p in paths if not p.exists()]
if missing:
    print('Missing catalog staging write files: ' + ', '.join(missing), file=sys.stderr)
    sys.exit(1)

migration = MIGRATION.read_text(encoding='utf-8')
receipt_fix = RECEIPT_FIX.read_text(encoding='utf-8')
test = TEST.read_text(encoding='utf-8')
edge = EDGE.read_text(encoding='utf-8')
contract = CONTRACT.read_text(encoding='utf-8')
transport = TRANSPORT.read_text(encoding='utf-8')
view = VIEW.read_text(encoding='utf-8')
errors = []

def require(source, marker, label):
    if marker not in source:
        errors.append(f'{label}: missing {marker}')

for marker in [
    "project_ref = 'otulfnouybahfnsycxqn'",
    'create table if not exists public.leader_catalog_price_logs',
    'alter table public.leader_catalog_price_logs enable row level security',
    'revoke all on table public.leader_catalog_price_logs from public, anon, authenticated',
    'grant select on table public.leader_catalog_price_logs to authenticated',
    "leader_private.leader_has_crm_action('catalog.read')",
    'create or replace function public.leader_manage_catalog_rpc(p_payload jsonb)',
    'security invoker',
    "leader_private.leader_actor_has_crm_action(v_actor_id, 'catalog.manage')",
    'leader_private.leader_command_receipts',
    "v_action <> 'catalog.manage'",
    "v_operation not in ('create', 'update')",
    "v_calculation_mode not in ('markup', 'fixed', 'area', 'length', 'quantity')",
    "'source_changed'",
    "'idempotency_conflict'",
    "'catalog_duplicate'",
    'insert into public.leader_catalog_price_logs',
    'revoke all on function public.leader_manage_catalog_rpc(jsonb) from public, anon, authenticated',
    'grant execute on function public.leader_manage_catalog_rpc(jsonb) to service_role',
]: require(migration, marker, 'migration')

for forbidden in ['security definer\nset search_path', 'grant execute on function public.leader_manage_catalog_rpc(jsonb) to authenticated']:
    if forbidden in migration:
        errors.append('migration: forbidden exposed RPC pattern: ' + forbidden)

for marker in [
    "project_ref = 'otulfnouybahfnsycxqn'",
    'create or replace function leader_private.leader_discard_catalog_command_receipt(',
    'security definer',
    "and action = 'catalog.manage'",
    "and state = 'in_progress'",
    'revoke all on function leader_private.leader_discard_catalog_command_receipt(uuid, uuid)',
    'grant execute on function leader_private.leader_discard_catalog_command_receipt(uuid, uuid)',
    'to service_role',
    'pg_get_functiondef',
    'leader_private.leader_discard_catalog_command_receipt(v_receipt.id, v_actor_id)',
    'revoke all on function public.leader_manage_catalog_rpc(jsonb) from public, anon, authenticated',
]: require(receipt_fix, marker, 'receipt fix')
for forbidden in [
    'grant delete on table leader_private.leader_command_receipts',
    'grant execute on function leader_private.leader_discard_catalog_command_receipt(uuid, uuid) to authenticated',
]:
    if forbidden in receipt_fix.lower(): errors.append('receipt fix: forbidden privilege expansion: ' + forbidden)

for marker in [
    'begin;', 'rollback;', 'catalog_create_failed', 'catalog_create_replay_failed',
    'catalog_update_failed', 'catalog_stale_update_not_rejected',
    'catalog_manager_not_rejected', 'catalog_manage_rpc_authenticated_execute_must_be_revoked',
    'catalog_manage_rpc_service_role_execute_missing',
]: require(test, marker, 'acceptance')

for marker in [
    "CATALOG_EDGE_CONTRACT_VERSION", "CATALOG_ACTION", "CATALOG_PERMISSION",
    "projectRefFromUrl(supabaseUrl) !== STAGING_PROJECT_REF",
    'authenticatedUser(req, supabaseUrl, anonKey)',
    "'/rest/v1/rpc/leader_actor_has_crm_action_rpc'",
    "'/rest/v1/rpc/leader_manage_catalog_rpc'",
    'validateCatalogRequest(input)',
    "p_action: CATALOG_PERMISSION",
]: require(edge, marker, 'edge')

for marker in [
    "CATALOG_ACTION = 'catalog.manage'", "CATALOG_PERMISSION = 'catalog.manage'",
    "STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'",
    "new Set(['markup', 'fixed', 'area', 'length', 'quantity'])",
    'validateCatalogRequest', 'expected_updated_at is required for update',
]: require(contract, marker, 'contract')

for marker in [
    "FUNCTION_SLUG = 'leader-crm-catalog'", "ACTION = 'catalog.manage'",
    'isStagingCatalogManagementEnvironment', 'catalogManagementWriteAvailability',
    'catalogManagementIdempotencyKey', 'buildCatalogManagementCommand',
    'client.functions.invoke(FUNCTION_SLUG', 'client.auth.getSession',
]: require(transport, marker, 'transport')
for forbidden in ['.from(', '.insert(', '.update(', '.delete(', '.upsert(', '.rpc(', 'service_role', 'sb_secret_']:
    if forbidden in transport: errors.append('transport: browser write/elevation forbidden: ' + forbidden)

for marker in [
    'catalogManagementCreateBtn', 'catalogManagementEditBtn', 'catalogManagementEditor',
    'invokeStagingCatalogManagement', 'catalogManagementWriteAvailability',
    'V4_CONFIG.supabaseUrl', 'Production read-only',
]: require(view, marker, 'view')
for forbidden in ['.insert(', '.update(', '.delete(', '.upsert(', '.rpc(', 'service_role', 'sb_secret_']:
    if forbidden in view: errors.append('view: direct browser write/elevation forbidden: ' + forbidden)

if errors:
    print('\n'.join(errors), file=sys.stderr)
    sys.exit(1)
print('Catalog staging write path: JWT Edge + SECURITY INVOKER business RPC + private service-only in-progress receipt cleanup helper, authenticated E2E guardrails, no receipt table DELETE grant: PASS')
