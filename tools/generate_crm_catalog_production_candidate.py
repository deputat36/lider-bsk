#!/usr/bin/env python3
"""Generate source-only production catalog RPC/Edge/rollback candidates.

This generator never connects to Supabase and never mutates production. It derives the
business command from the staging-proven implementation while replacing only the
environment-specific Edge gate and adding the staging-proven narrow receipt cleanup helper.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGING_MIGRATION = ROOT / 'supabase/staging-migrations/20260904_02_catalog_management_write_harness.sql'
STAGING_RECEIPT_FIX = ROOT / 'supabase/staging-migrations/20260904_04_catalog_receipt_cleanup_helper.sql'
STAGING_EDGE_DIR = ROOT / 'supabase/functions/leader-crm-catalog'
OUT = ROOT / 'build/crm-catalog-production-candidate'
PRODUCTION_REF = 'ofewxuqfjhamgerwzull'
STAGING_REF = 'otulfnouybahfnsycxqn'

PLAIN_RECEIPT_DELETE = 'delete from leader_private.leader_command_receipts where id = v_receipt.id;'
GUARDED_RECEIPT_DELETE = "delete from leader_private.leader_command_receipts where id = v_receipt.id and state = 'in_progress';"
HELPER_RECEIPT_CALL = 'perform leader_private.leader_discard_catalog_command_receipt(v_receipt.id, v_actor_id);'


def extract_rpc(sql: str) -> str:
    start = sql.index('create or replace function public.leader_manage_catalog_rpc(p_payload jsonb)')
    end_marker = 'grant execute on function public.leader_manage_catalog_rpc(jsonb) to service_role;'
    end = sql.index(end_marker, start) + len(end_marker)
    block = sql[start:end]
    if PLAIN_RECEIPT_DELETE not in block or GUARDED_RECEIPT_DELETE not in block:
        raise RuntimeError('Expected staging receipt cleanup statements are missing')
    block = block.replace(PLAIN_RECEIPT_DELETE, HELPER_RECEIPT_CALL)
    block = block.replace(GUARDED_RECEIPT_DELETE, HELPER_RECEIPT_CALL)
    if 'delete from leader_private.leader_command_receipts where id = v_receipt.id' in block:
        raise RuntimeError('Direct receipt cleanup remained in production RPC candidate')
    block = block.replace(
        "'STAGING ONLY. Service-role catalog.manage command. Atomic catalog mutation, price audit and idempotency receipt; production rollout requires explicit approval.'",
        "'Production catalog.manage command candidate. SECURITY INVOKER service-role command with narrow private in-progress receipt cleanup helper.'",
    )
    return block


def receipt_helper_sql() -> str:
    source = STAGING_RECEIPT_FIX.read_text(encoding='utf-8')
    start = source.index('create or replace function leader_private.leader_discard_catalog_command_receipt(')
    end_marker = 'grant execute on function leader_private.leader_discard_catalog_command_receipt(uuid, uuid)\n  to service_role;'
    end = source.index(end_marker, start) + len(end_marker)
    block = source[start:end]
    block = block.replace(
        "'STAGING ONLY. Narrow service-role helper that discards only an in-progress catalog.manage receipt owned by the supplied actor. Browser roles cannot execute it.'",
        "'Production candidate private helper. Discards only an in-progress catalog.manage receipt owned by the supplied actor; browser roles cannot execute it.'",
    )
    return block


def production_preflight() -> str:
    return f"""-- SOURCE-ONLY PRODUCTION CANDIDATE.
-- Target project: lider-bsk production / {PRODUCTION_REF}.
-- DO NOT APPLY without explicit production database approval.
-- Prerequisite: supabase/production-candidates/20260723_01_installation_rbac_receipts_candidate.sql

begin;

do $preflight$
begin
  if to_regclass('leader_staging.environment_guard') is not null then
    raise exception 'catalog_production_candidate_rejected_on_staging';
  end if;
  if to_regclass('public.leader_catalog') is null
     or to_regclass('public.leader_catalog_price_logs') is null
     or to_regclass('public.leader_user_profiles') is null then
    raise exception 'catalog_production_tables_missing';
  end if;
  if to_regclass('leader_private.leader_role_action_matrix_v1') is null
     or to_regclass('leader_private.leader_command_receipts') is null
     or to_regprocedure('leader_private.leader_actor_has_crm_action(uuid,text)') is null
     or to_regprocedure('public.leader_actor_has_crm_action_rpc(uuid,text)') is null then
    raise exception 'catalog_production_rbac_receipts_missing';
  end if;
  if to_regprocedure('public.leader_manage_catalog_rpc(jsonb)') is not null
     or to_regprocedure('leader_private.leader_discard_catalog_command_receipt(uuid,uuid)') is not null then
    raise exception 'catalog_production_rpc_already_present';
  end if;
  if not exists (
    select 1 from leader_private.leader_role_action_matrix_v1
    where role = 'owner' and 'catalog.manage' = any(allowed_actions)
  ) or not exists (
    select 1 from leader_private.leader_role_action_matrix_v1
    where role = 'admin' and 'catalog.manage' = any(allowed_actions)
  ) then
    raise exception 'catalog_manage_missing_from_production_matrix';
  end if;
end
$preflight$;

create extension if not exists pgcrypto with schema extensions;
grant usage on schema leader_private to service_role;

"""


def rollback_sql() -> str:
    return f"""-- SOURCE-ONLY PRODUCTION ROLLBACK CANDIDATE.
-- Target project: lider-bsk production / {PRODUCTION_REF}.
-- DO NOT APPLY without explicit production rollback approval.
-- Removes only catalog RPC/helper. Canonical RBAC/receipts and catalog data remain intact.

begin;

do $preflight$
begin
  if to_regclass('leader_staging.environment_guard') is not null then
    raise exception 'catalog_production_rollback_rejected_on_staging';
  end if;
end
$preflight$;

revoke all on function public.leader_manage_catalog_rpc(jsonb) from public, anon, authenticated, service_role;
drop function public.leader_manage_catalog_rpc(jsonb);
revoke all on function leader_private.leader_discard_catalog_command_receipt(uuid, uuid) from public, anon, authenticated, service_role;
drop function leader_private.leader_discard_catalog_command_receipt(uuid, uuid);

commit;
"""


def production_edge_text(name: str) -> str:
    text = (STAGING_EDGE_DIR / name).read_text(encoding='utf-8')
    text = text.replace(STAGING_REF, PRODUCTION_REF)
    text = text.replace('STAGING_PROJECT_REF', 'PRODUCTION_PROJECT_REF')
    if name == 'index.ts':
        text = text.replace("expected: 'staging'", "expected: 'production'")
    if STAGING_REF in text or 'STAGING_PROJECT_REF' in text or "expected: 'staging'" in text:
        raise RuntimeError(f'Production Edge transform left staging marker in {name}')
    return text


def main() -> None:
    source = STAGING_MIGRATION.read_text(encoding='utf-8')
    rpc = extract_rpc(source)
    helper = receipt_helper_sql()
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / '20260904_01_catalog_management_rpc_candidate.sql').write_text(
        production_preflight() + helper + '\n\n' + rpc + '\n\ncommit;\n', encoding='utf-8'
    )
    (OUT / '20260904_01_catalog_management_rpc_candidate_rollback.sql').write_text(
        rollback_sql(), encoding='utf-8'
    )

    edge_out = OUT / 'edge/leader-crm-catalog'
    edge_out.mkdir(parents=True, exist_ok=True)
    for name in ('index.ts', 'contract.ts'):
        (edge_out / name).write_text(production_edge_text(name), encoding='utf-8')

    manifest = {
        'contract': 'crm-catalog-production-candidate-v1',
        'production_project_ref': PRODUCTION_REF,
        'source_only': True,
        'production_mutated': False,
        'requires_explicit_database_approval': True,
        'requires_explicit_edge_approval': True,
        'edge_verify_jwt_required': True,
        'receipt_cleanup_strategy': 'private_service_only_helper_no_table_delete_grant',
        'staging_authenticated_e2e_required': True,
        'prerequisites': [
            'supabase/production-candidates/20260723_01_installation_rbac_receipts_candidate.sql',
            'production postflight confirms canonical owner/admin catalog.manage',
        ],
        'outputs': [
            '20260904_01_catalog_management_rpc_candidate.sql',
            '20260904_01_catalog_management_rpc_candidate_rollback.sql',
            'edge/leader-crm-catalog/index.ts',
            'edge/leader-crm-catalog/contract.ts',
        ],
        'frontend_switch_included': False,
        'frontend_remains_read_only_until_backend_smoke': True,
    }
    (OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Generated catalog production candidate in {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
