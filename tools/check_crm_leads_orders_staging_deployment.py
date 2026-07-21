#!/usr/bin/env python3
"""Validate historical leads list_orders evidence plus the current JWT-first wrapper deployment."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "supabase/functions/leader-crm-leads/index.ts"
WRAPPER = ROOT / "supabase/staging-functions/leader-crm-leads-staging/index.ts"
IMPLEMENTATION = ROOT / "supabase/staging-functions/leader-crm-leads-staging-impl/index.ts"
RUNNER = ROOT / "tools/run_crm_leads_orders_staging_auth_e2e.mjs"
HISTORICAL_CONTRACT = ROOT / "contracts/crm-leads-orders-staging-deployment-v1.json"
CURRENT_CONTRACT = ROOT / "contracts/crm-staging-edge-action-gate-deployment-v1.json"
DOC = ROOT / "docs/SUPABASE_STAGING_CRM_LEADS_ORDERS_PROBE_2026-07-16.md"
WORKFLOW = ROOT / ".github/workflows/crm-leads-orders-staging-transport-check.yml"

STAGING_REF = "otulfnouybahfnsycxqn"
PRODUCTION_REF = "ofewxuqfjhamgerwzull"
SOURCE_COMMIT = "17524ea9ef08c11b18b385b9469778d5b1084ddb"
CURRENT_VERSION = 3
CURRENT_SHA256 = "e64036306fefff72bcb457f0f64756bcf40f27cc406e695e3f3d4c76d2b1b4d1"

MANAGER_FIELDS = {
    "id", "order_number", "created_at", "updated_at", "project_name", "client_name",
    "client_phone", "status", "deadline", "source", "layout_status", "production_status",
    "installation_status", "priority", "current_stage", "next_action", "progress_percent",
}
ACCOUNTANT_FIELDS = {
    "id", "order_number", "created_at", "updated_at", "project_name", "status",
    "payment_status", "deadline", "client_total", "contractor_cost", "prepayment", "balance",
}
SCENARIOS = {
    "manager_list_orders_projection", "accountant_list_orders_projection",
    "accountant_dashboard_forbidden", "restricted_list_orders_forbidden", "inactive_profile_forbidden",
}
OUT_OF_SCOPE_ACTIONS = {
    "dashboard_for_office_roles", "list", "create", "update", "ensure_client",
    "create_order", "create_order_from_offer", "ensure_profile",
}


def require(text: str, marker: str, label: str) -> None:
    if marker not in text:
        raise AssertionError(f"{label}: missing marker {marker!r}")


def source_projection(text: str, role: str) -> set[str]:
    match = re.search(rf"{role}:\s*'([^']+)'", text)
    if not match:
        raise AssertionError(f"source: missing {role} projection")
    return set(match.group(1).split(","))


def runner_projection(text: str, const_name: str) -> set[str]:
    match = re.search(rf"const {re.escape(const_name)} = Object\.freeze\(\[(.*?)\]\.sort\(\)\);", text, re.DOTALL)
    if not match:
        raise AssertionError(f"runner: missing {const_name}")
    return set(re.findall(r"'([^']+)'", match.group(1)))


def main() -> int:
    required = [SOURCE, WRAPPER, IMPLEMENTATION, RUNNER, HISTORICAL_CONTRACT, CURRENT_CONTRACT, DOC, WORKFLOW]
    for path in required:
        if not path.is_file():
            raise AssertionError(f"missing file: {path.relative_to(ROOT)}")

    source = SOURCE.read_text(encoding="utf-8")
    wrapper = WRAPPER.read_text(encoding="utf-8")
    implementation = IMPLEMENTATION.read_text(encoding="utf-8")
    runner = RUNNER.read_text(encoding="utf-8")
    historical = json.loads(HISTORICAL_CONTRACT.read_text(encoding="utf-8"))
    current = json.loads(CURRENT_CONTRACT.read_text(encoding="utf-8"))
    doc = DOC.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")

    expected_import = f"https://raw.githubusercontent.com/deputat36/lider-bsk/{SOURCE_COMMIT}/supabase/functions/leader-crm-leads/index.ts"
    require(implementation, expected_import, "implementation")
    if implementation.count("import ") != 1:
        raise AssertionError("leads implementation must contain exactly one pinned import")
    for marker in ("runCanonicalEdgeWrapper", "leadsActionPlan", "leader-crm-leads-staging-impl"):
        require(wrapper, marker, "wrapper")
    if PRODUCTION_REF in wrapper or PRODUCTION_REF in implementation:
        raise AssertionError("staging transport must not reference production")

    if historical.get("contract_version") != "leader-crm-leads-orders-staging-deployment-v1":
        raise AssertionError("historical contract version drift")
    if historical["environment"]["project_id"] != STAGING_REF:
        raise AssertionError("historical staging project drift")
    scope = historical["validation_scope"]
    if scope.get("allowed_actions") != ["list_orders"] or set(scope.get("out_of_scope_actions", [])) != OUT_OF_SCOPE_ACTIONS:
        raise AssertionError("historical validation scope drift")
    if historical["production"]["mutated"] is not False:
        raise AssertionError("historical contract must record production unchanged")

    active = current["functions"]["leader-crm-leads-staging"]
    if active.get("version") != CURRENT_VERSION or active.get("sha256") != CURRENT_SHA256:
        raise AssertionError("current leads wrapper deployment drift")
    if active.get("verify_jwt") is not True or active.get("implementation_slug") != "leader-crm-leads-staging-impl":
        raise AssertionError("current leads wrapper security drift")
    impl = current["functions"]["leader-crm-leads-staging-impl"]
    if impl.get("version") != 1 or impl.get("pinned_commit") != SOURCE_COMMIT or impl.get("verify_jwt") is not True:
        raise AssertionError("current leads implementation drift")

    if source_projection(source, "manager") != MANAGER_FIELDS:
        raise AssertionError("source manager projection drift")
    if source_projection(source, "accountant") != ACCOUNTANT_FIELDS:
        raise AssertionError("source accountant projection drift")
    for marker in ("'list_orders'", "accountant: new Set(['orders.read'])", "if (action === 'list_orders') return await listOrders"):
        require(source, marker, "source")

    if runner_projection(runner, "MANAGER_FIELDS") != MANAGER_FIELDS or runner_projection(runner, "ACCOUNTANT_FIELDS") != ACCOUNTANT_FIELDS:
        raise AssertionError("runner projections drift")
    scenario_match = re.search(r"const SCENARIOS = new Set\(\[(.*?)\]\);", runner, re.DOTALL)
    if not scenario_match or set(re.findall(r"'([^']+)'", scenario_match.group(1))) != SCENARIOS:
        raise AssertionError("runner scenarios drift")
    for marker in (STAGING_REF, "leader-crm-leads-staging", "/auth/v1/token?grant_type=password", "projection mismatch"):
        require(runner, marker, "runner")
    lowered_runner = runner.lower()
    for marker in (PRODUCTION_REF, "SUPABASE_SERVICE_ROLE_KEY", "service_role", "sb_secret_", "eyJhbGciOi"):
        if marker.lower() in lowered_runner:
            raise AssertionError(f"runner contains forbidden marker: {marker}")

    for marker in ("leader-crm-leads:list_orders", "version: `1`", SOURCE_COMMIT, "Production Supabase не изменялся"):
        require(doc, marker, "historical documentation")
    for marker in ("tools/check_crm_leads_orders_staging_deployment.py", "supabase/staging-functions/leader-crm-leads-staging/index.ts"):
        require(workflow, marker, "workflow")

    print("CRM leads historical probe and current JWT-first wrapper deployment are synchronized.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
