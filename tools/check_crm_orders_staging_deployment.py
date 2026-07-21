#!/usr/bin/env python3
"""Validate historical orders evidence plus the current JWT-first wrapper deployment."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "supabase/functions/leader-crm-orders/index.ts"
WRAPPER = ROOT / "supabase/staging-functions/leader-crm-orders/index.ts"
IMPLEMENTATION = ROOT / "supabase/staging-functions/leader-crm-orders-impl/index.ts"
MIGRATION = ROOT / "supabase/staging-migrations/20260716_01_crm_orders_edge_projection_compat.sql"
RUNNER = ROOT / "tools/run_crm_orders_staging_auth_e2e.mjs"
HISTORICAL_CONTRACT = ROOT / "contracts/crm-orders-staging-deployment-v1.json"
CURRENT_CONTRACT = ROOT / "contracts/crm-staging-edge-action-gate-deployment-v1.json"
DOC = ROOT / "docs/SUPABASE_STAGING_CRM_ORDERS_RBAC_2026-07-16.md"
WORKFLOW = ROOT / ".github/workflows/crm-orders-staging-transport-check.yml"

STAGING_REF = "otulfnouybahfnsycxqn"
PRODUCTION_REF = "ofewxuqfjhamgerwzull"
SOURCE_COMMIT = "4dafa2723c1018574572d9a91441cf382ac25b34"
MIGRATION_NAME = "staging_orders_edge_projection_compat_20260716"
CURRENT_VERSION = 3
CURRENT_SHA256 = "dccbd8ec3c57cdd58db269e6808f86cdc99f4416ae41eca8b6df24a284649646"

MANAGER_FIELDS = {
    "id", "order_number", "created_at", "updated_at", "project_name", "client_name",
    "client_phone", "status", "deadline", "source", "layout_status", "production_status",
    "installation_status", "priority", "current_stage", "next_action", "progress_percent",
}
ACCOUNTANT_FIELDS = {
    "id", "order_number", "created_at", "updated_at", "project_name", "status",
    "payment_status", "deadline", "client_total", "contractor_cost", "prepayment", "balance",
}
COMPATIBILITY_COLUMNS = {
    "client_id", "source", "layout_comment", "current_stage", "next_action",
    "progress_percent", "installation_status",
}
SCENARIOS = {
    "manager_list_projection", "manager_allowed_update", "manager_finance_update_forbidden",
    "accountant_list_projection", "accountant_payment_update", "accountant_mixed_update_forbidden",
    "restricted_role_list_forbidden", "inactive_profile_forbidden",
}


def require(text: str, marker: str, label: str) -> None:
    if marker not in text:
        raise AssertionError(f"{label}: missing marker {marker!r}")


def quoted_fields(text: str, const_name: str) -> set[str]:
    match = re.search(rf"{re.escape(const_name)}\s*=\s*Object\.freeze\(\[(.*?)\]\.sort\(\)\);", text, re.DOTALL)
    if not match:
        raise AssertionError(f"runner: missing {const_name}")
    return set(re.findall(r"'([^']+)'", match.group(1)))


def source_projection(text: str, role: str) -> set[str]:
    match = re.search(rf"{role}:\s*'([^']+)'", text)
    if not match:
        raise AssertionError(f"source: missing {role} projection")
    return set(match.group(1).split(","))


def main() -> int:
    required = [SOURCE, WRAPPER, IMPLEMENTATION, MIGRATION, RUNNER, HISTORICAL_CONTRACT, CURRENT_CONTRACT, DOC, WORKFLOW]
    for path in required:
        if not path.is_file():
            raise AssertionError(f"missing file: {path.relative_to(ROOT)}")

    source = SOURCE.read_text(encoding="utf-8")
    wrapper = WRAPPER.read_text(encoding="utf-8")
    implementation = IMPLEMENTATION.read_text(encoding="utf-8")
    migration = MIGRATION.read_text(encoding="utf-8")
    runner = RUNNER.read_text(encoding="utf-8")
    historical = json.loads(HISTORICAL_CONTRACT.read_text(encoding="utf-8"))
    current = json.loads(CURRENT_CONTRACT.read_text(encoding="utf-8"))
    doc = DOC.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")

    expected_import = f"https://raw.githubusercontent.com/deputat36/lider-bsk/{SOURCE_COMMIT}/supabase/functions/leader-crm-orders/index.ts"
    require(implementation, expected_import, "implementation")
    if implementation.count("import ") != 1:
        raise AssertionError("orders implementation must contain exactly one pinned import")
    for marker in ("runCanonicalEdgeWrapper", "orderActionPlan", "leader-crm-orders-impl"):
        require(wrapper, marker, "wrapper")
    if PRODUCTION_REF in wrapper or PRODUCTION_REF in implementation:
        raise AssertionError("staging transport must not reference production")

    for marker in (STAGING_REF, "leader_staging.environment_guard", "staging_environment_guard_failed", "progress_percent integer not null default 0"):
        require(migration, marker, "migration")
    for column in COMPATIBILITY_COLUMNS:
        require(migration, column, "migration")

    if historical.get("contract_version") != "leader-crm-orders-staging-deployment-v1":
        raise AssertionError("historical contract version drift")
    if historical["environment"]["project_id"] != STAGING_REF:
        raise AssertionError("historical staging project drift")
    if historical["migration"]["applied_name"] != MIGRATION_NAME:
        raise AssertionError("historical migration name drift")
    if historical["production"]["mutated"] is not False:
        raise AssertionError("historical contract must record production unchanged")

    active = current["functions"]["leader-crm-orders"]
    if active.get("version") != CURRENT_VERSION or active.get("sha256") != CURRENT_SHA256:
        raise AssertionError("current orders wrapper deployment drift")
    if active.get("verify_jwt") is not True or active.get("implementation_slug") != "leader-crm-orders-impl":
        raise AssertionError("current orders wrapper security drift")
    impl = current["functions"]["leader-crm-orders-impl"]
    if impl.get("version") != 1 or impl.get("pinned_commit") != SOURCE_COMMIT or impl.get("verify_jwt") is not True:
        raise AssertionError("current orders implementation drift")

    if source_projection(source, "manager") != MANAGER_FIELDS:
        raise AssertionError("source manager projection drift")
    if source_projection(source, "accountant") != ACCOUNTANT_FIELDS:
        raise AssertionError("source accountant projection drift")
    for marker in ("'update:payment_status'", "if (!canUpdateOrder(checked.profile, body)) return unauthorized(action, checked.profile)"):
        require(source, marker, "source")

    if quoted_fields(runner, "MANAGER_FIELDS") != MANAGER_FIELDS or quoted_fields(runner, "ACCOUNTANT_FIELDS") != ACCOUNTANT_FIELDS:
        raise AssertionError("runner projections drift")
    scenario_match = re.search(r"const SCENARIOS = new Set\(\[(.*?)\]\);", runner, re.DOTALL)
    if not scenario_match or set(re.findall(r"'([^']+)'", scenario_match.group(1))) != SCENARIOS:
        raise AssertionError("runner scenarios drift")
    for marker in (STAGING_REF, "/auth/v1/token?grant_type=password", "/functions/v1/${FUNCTION_SLUG}", "LIDER_STAGING_ORDER_ID"):
        require(runner, marker, "runner")
    lowered_runner = runner.lower()
    for marker in (PRODUCTION_REF, "SUPABASE_SERVICE_ROLE_KEY", "service_role", "sb_secret_", "eyJhbGciOi"):
        if marker.lower() in lowered_runner:
            raise AssertionError(f"runner contains forbidden marker: {marker}")

    for marker in ("leader-crm-orders", "version: `1`", SOURCE_COMMIT, MIGRATION_NAME, "production DDL не выполнялся"):
        require(doc, marker, "historical documentation")
    for marker in ("tools/check_crm_orders_staging_deployment.py", "supabase/staging-functions/leader-crm-orders/index.ts"):
        require(workflow, marker, "workflow")

    print("CRM orders historical evidence and current JWT-first wrapper deployment are synchronized.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
