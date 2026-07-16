#!/usr/bin/env python3
"""Validate the reproducible staging deployment contract for leader-crm-orders."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "supabase/functions/leader-crm-orders/index.ts"
WRAPPER = ROOT / "supabase/staging-functions/leader-crm-orders/index.ts"
MIGRATION = ROOT / "supabase/staging-migrations/20260716_01_crm_orders_edge_projection_compat.sql"
RUNNER = ROOT / "tools/run_crm_orders_staging_auth_e2e.mjs"
CONTRACT = ROOT / "contracts/crm-orders-staging-deployment-v1.json"
DOC = ROOT / "docs/SUPABASE_STAGING_CRM_ORDERS_RBAC_2026-07-16.md"
WORKFLOW = ROOT / ".github/workflows/crm-orders-staging-transport-check.yml"

STAGING_REF = "otulfnouybahfnsycxqn"
PRODUCTION_REF = "ofewxuqfjhamgerwzull"
SOURCE_COMMIT = "4dafa2723c1018574572d9a91441cf382ac25b34"
SOURCE_BLOB = "ed37560c0ac920e3d1b460fdf7247c12902f9c82"
DEPLOYED_SHA256 = "597b692c4ced7904b627fdb9949d8b394f835d4c529b56f506149358fd6ea1f3"
MIGRATION_NAME = "staging_orders_edge_projection_compat_20260716"

MANAGER_FIELDS = {
    "id",
    "order_number",
    "created_at",
    "updated_at",
    "project_name",
    "client_name",
    "client_phone",
    "status",
    "deadline",
    "source",
    "layout_status",
    "production_status",
    "installation_status",
    "priority",
    "current_stage",
    "next_action",
    "progress_percent",
}
ACCOUNTANT_FIELDS = {
    "id",
    "order_number",
    "created_at",
    "updated_at",
    "project_name",
    "status",
    "payment_status",
    "deadline",
    "client_total",
    "contractor_cost",
    "prepayment",
    "balance",
}
COMPATIBILITY_COLUMNS = {
    "client_id",
    "source",
    "layout_comment",
    "current_stage",
    "next_action",
    "progress_percent",
    "installation_status",
}
SCENARIOS = {
    "manager_list_projection",
    "manager_allowed_update",
    "manager_finance_update_forbidden",
    "accountant_list_projection",
    "accountant_payment_update",
    "accountant_mixed_update_forbidden",
    "restricted_role_list_forbidden",
    "inactive_profile_forbidden",
}


def require(text: str, marker: str, label: str) -> None:
    if marker not in text:
        raise AssertionError(f"{label}: missing marker {marker!r}")


def quoted_fields(text: str, const_name: str) -> set[str]:
    match = re.search(
        rf"{re.escape(const_name)}\s*=\s*Object\.freeze\(\[(.*?)\]\.sort\(\)\);",
        text,
        flags=re.DOTALL,
    )
    if not match:
        raise AssertionError(f"runner: missing {const_name}")
    return set(re.findall(r"'([^']+)'", match.group(1)))


def source_projection(text: str, role: str) -> set[str]:
    match = re.search(rf"{role}:\s*'([^']+)'", text)
    if not match:
        raise AssertionError(f"source: missing {role} projection")
    return set(match.group(1).split(","))


def main() -> int:
    for path in (SOURCE, WRAPPER, MIGRATION, RUNNER, CONTRACT, DOC, WORKFLOW):
        if not path.is_file():
            raise AssertionError(f"missing file: {path.relative_to(ROOT)}")

    source = SOURCE.read_text(encoding="utf-8")
    wrapper = WRAPPER.read_text(encoding="utf-8")
    migration = MIGRATION.read_text(encoding="utf-8")
    runner = RUNNER.read_text(encoding="utf-8")
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    doc = DOC.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")

    expected_import = (
        "https://raw.githubusercontent.com/deputat36/lider-bsk/"
        f"{SOURCE_COMMIT}/supabase/functions/leader-crm-orders/index.ts"
    )
    require(wrapper, expected_import, "wrapper")
    if wrapper.count("import ") != 1:
        raise AssertionError("wrapper must contain exactly one pinned import")
    if PRODUCTION_REF in wrapper:
        raise AssertionError("wrapper must not reference production")

    required_migration_markers = [
        STAGING_REF,
        "leader_staging.environment_guard",
        "staging_environment_guard_failed",
        "leader_orders_missing",
        "orders_edge_projection_columns_missing",
        "progress_percent integer not null default 0",
    ]
    for marker in required_migration_markers:
        require(migration, marker, "migration")
    if PRODUCTION_REF in migration:
        raise AssertionError("staging migration references production project")
    for column in COMPATIBILITY_COLUMNS:
        require(migration, column, "migration")

    if contract.get("contract_version") != "leader-crm-orders-staging-deployment-v1":
        raise AssertionError("contract version drift")
    if contract["environment"]["project_id"] != STAGING_REF:
        raise AssertionError("contract staging project drift")
    if contract["migration"]["applied_name"] != MIGRATION_NAME:
        raise AssertionError("contract migration name drift")
    if contract["migration"]["compatibility_columns"] != len(COMPATIBILITY_COLUMNS):
        raise AssertionError("contract compatibility column count drift")
    function = contract["edge_function"]
    expected_function = {
        "slug": "leader-crm-orders",
        "version": 1,
        "status": "ACTIVE",
        "verify_jwt": True,
        "source_commit": SOURCE_COMMIT,
        "source_blob_sha": SOURCE_BLOB,
        "deployed_sha256": DEPLOYED_SHA256,
    }
    for key, expected in expected_function.items():
        if function.get(key) != expected:
            raise AssertionError(f"contract function {key} drift: {function.get(key)!r}")
    observed = contract["observed_post_deploy"]
    for key in ("orders", "profiles", "auth_users", "edge_error_logs"):
        if observed.get(key) != 0:
            raise AssertionError(f"contract post-deploy {key} must remain zero")
    if contract["production"]["mutated"] is not False:
        raise AssertionError("contract must record production as unchanged")

    if source_projection(source, "manager") != MANAGER_FIELDS:
        raise AssertionError("source manager projection drift")
    if source_projection(source, "accountant") != ACCOUNTANT_FIELDS:
        raise AssertionError("source accountant projection drift")
    for marker in (
        "ROLE_MATRIX_VERSION = '20260716-edge-role-matrix-2'",
        "accountant: new Set([",
        "'update:payment_status'",
        "if (!canUpdateOrder(checked.profile, body)) return unauthorized(action, checked.profile)",
        "return await listOrders(url, serviceRole, checked.profile)",
        "return await updateOrder(url, serviceRole, checked.profile, body)",
    ):
        require(source, marker, "source")

    if quoted_fields(runner, "MANAGER_FIELDS") != MANAGER_FIELDS:
        raise AssertionError("runner manager projection drift")
    if quoted_fields(runner, "ACCOUNTANT_FIELDS") != ACCOUNTANT_FIELDS:
        raise AssertionError("runner accountant projection drift")
    runner_scenarios_match = re.search(
        r"const SCENARIOS = new Set\(\[(.*?)\]\);",
        runner,
        flags=re.DOTALL,
    )
    if not runner_scenarios_match:
        raise AssertionError("runner scenarios missing")
    if set(re.findall(r"'([^']+)'", runner_scenarios_match.group(1))) != SCENARIOS:
        raise AssertionError("runner scenarios drift")
    for marker in (
        STAGING_REF,
        "Only the exact lider-bsk-staging URL is allowed",
        "/auth/v1/token?grant_type=password",
        "/functions/v1/${FUNCTION_SLUG}",
        "projection mismatch",
        "Best effort only",
        "LIDER_STAGING_ORDER_ID",
    ):
        require(runner, marker, "runner")
    forbidden_runner_markers = (
        PRODUCTION_REF,
        "SUPABASE_SERVICE_ROLE_KEY",
        "service_role",
        "sb_secret_",
        "eyJhbGciOi",
    )
    lowered_runner = runner.lower()
    for marker in forbidden_runner_markers:
        if marker.lower() in lowered_runner:
            raise AssertionError(f"runner contains forbidden marker: {marker}")

    required_doc_markers = (
        "leader-crm-orders",
        "version: `1`",
        "verify_jwt=true",
        SOURCE_COMMIT,
        MIGRATION_NAME,
        "Auth users: `0`",
        "production DDL не выполнялся",
        "HTTP E2E пока не запущен",
    )
    for marker in required_doc_markers:
        require(doc, marker, "documentation")

    required_workflow_markers = (
        "tools/check_crm_orders_staging_deployment.py",
        "node --check tools/run_crm_orders_staging_auth_e2e.mjs",
        "python3 tools/check_crm_orders_staging_deployment.py",
        "supabase/staging-functions/leader-crm-orders/index.ts",
        "contracts/crm-orders-staging-deployment-v1.json",
    )
    for marker in required_workflow_markers:
        require(workflow, marker, "workflow")

    print("CRM orders staging deployment contract, migration, source pin and auth runner are synchronized.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
