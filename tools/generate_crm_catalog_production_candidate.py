#!/usr/bin/env python3
"""Generate source-only production catalog RPC/Edge/rollback candidates.

This generator never connects to Supabase and never mutates production. It derives the
business command from the staging-proven implementation while replacing only the
environment-specific Edge gate and user-facing environment marker.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGING_MIGRATION = ROOT / 'supabase/staging-migrations/20260904_02_catalog_management_write_harness.sql'
STAGING_EDGE_DIR = ROOT / 'supabase/functions/leader-crm-catalog'
OUT = ROOT / 'build/crm-catalog-production-candidate'
PRODUCTION_REF = 'ofewxuqfjhamgerwzull'
STAGING_REF = 'otulfnouybahfnsycxqn'


def extract_rpc(sql: str) -> str:
    start = sql.index('create or replace function public.leader_manage_catalog_rpc(p_payload jsonb)')
    end_marker = 'grant execute on function public.leader_manage_catalog_rpc(jsonb) to service_role;'
    end = sql.index(end_marker, start) + len(end_marker)
    block = sql[start:end]
    block = block.replace(
        "'STAGING ONLY. Service-role catalog.manage command. Atomic catalog mutation, price audit and idempotency receipt; production rollout requires explicit approval.'",
        "'Production catalog.manage command candidate. Service-role-only, atomic catalog mutation, price audit and idempotency receipt.'",
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
  if to_regprocedure('public.leader_manage_catalog_rpc(jsonb)') is not null then
    raise exception 'catalog_production_rpc_already_present';
  end if;
  if not exists (
    select 1
    from leader_private.leader_role_action_matrix_v1
    where role = 'owner' and 'catalog.manage' = any(allowed_actions)
  ) or not exists (
    select 1
    from leader_private.leader_role_action_matrix_v1
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
-- Removes only the catalog business RPC. Canonical RBAC/receipts and catalog data remain intact.

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
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / '20260904_01_catalog_management_rpc_candidate.sql').write_text(
        production_preflight() + rpc + '\n\ncommit;\n', encoding='utf-8'
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
