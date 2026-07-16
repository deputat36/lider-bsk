#!/usr/bin/env python3
"""Validate the staging-only leader-crm-leads list_orders probe contract."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "supabase/functions/leader-crm-leads/index.ts"
WRAPPER = ROOT / "supabase/staging-functions/leader-crm-leads-staging/index.ts"
RUNNER = ROOT / "tools/run_crm_leads_orders_staging_auth_e2e.mjs"
CONTRACT = ROOT / "contracts/crm-leads-orders-staging-deployment-v1.json"
DOC = ROOT / "docs/SUPABASE_STAGING_CRM_LEADS_ORDERS_PROBE_2026-07-16.md"
WORKFLOW = ROOT / ".github/workflows/crm-leads-orders-staging-transport-check.yml"

STAGING_REF = "otulfnouybahfnsycxqn"
PRODUCTION_REF = "ofewxuqfjhamgerwzull"
SOURCE_COMMIT = "17524ea9ef08c11b18b385b9469778d5b1084ddb"
SOURCE_BLOB = "259538acebd2966e39de22a61a3023aecd26d6f6"
DEPLOYED_SHA256 = "89934adc7e53b63189b9629875f8a9e8ac2055b1c7663a49d5c0d4e58e48bdcc"

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
SCENARIOS = {
    "manager_list_orders_projection",
    "accountant_list_orders_projection",
    "accountant_dashboard_forbidden",
    "restricted_list_orders_forbidden",
    "inactive_profile_forbidden",
}
OUT_OF_SCOPE_ACTIONS = {
    "dashboard_for_office_roles",
    "list",
    "create",
    "update",
    "ensure_client",
    "create_order",
    "create_order_from_offer",
    "ensure_profile",
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
    match = re.search(
        rf"const {re.escape(const_name)} = Object\.freeze\(\[(.*?)\]\.sort\(\)\);",
        text,
        flags=re.DOTALL,
    )
    if not match:
        raise AssertionError(f"runner: missing {const_name}")
    return set(re.findall(r"'([^']+)'", match.group(1)))


def main() -> int:
    for path in (SOURCE, WRAPPER, RUNNER, CONTRACT, DOC, WORKFLOW):
        if not path.is_file():
            raise AssertionError(f"missing file: {path.relative_to(ROOT)}")

    source = SOURCE.read_text(encoding="utf-8")
    wrapper = WRAPPER.read_text(encoding="utf-8")
    runner = RUNNER.read_text(encoding="utf-8")
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    doc = DOC.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")

    expected_import = (
        "https://raw.githubusercontent.com/deputat36/lider-bsk/"
        f"{SOURCE_COMMIT}/supabase/functions/leader-crm-leads/index.ts"
    )
    require(wrapper, expected_import, "wrapper")
    if wrapper.count("import ") != 1:
        raise AssertionError("wrapper must contain exactly one pinned import")
    if PRODUCTION_REF in wrapper:
        raise AssertionError("wrapper must not reference production")

    if contract.get("contract_version") != "leader-crm-leads-orders-staging-deployment-v1":
        raise AssertionError("contract version drift")
    if contract["environment"]["project_id"] != STAGING_REF:
        raise AssertionError("contract staging project drift")
    function = contract["edge_function"]
    expected_function = {
        "slug": "leader-crm-leads-staging",
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

    scope = contract["validation_scope"]
    if scope.get("allowed_actions") != ["list_orders"]:
        raise AssertionError("contract must allow only list_orders")
    if scope.get("negative_actions") != ["dashboard_for_accountant"]:
        raise AssertionError("contract negative action drift")
    if set(scope.get("out_of_scope_actions", [])) != OUT_OF_SCOPE_ACTIONS:
        raise AssertionError("contract out-of-scope action drift")
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
    required_source_markers = (
        "const ACCOUNTANT_GENERIC_ACTIONS = new Set([",
        "'list_orders'",
        "accountant: new Set(['orders.read'])",
        "currentRole === 'accountant' && ACCOUNTANT_GENERIC_ACTIONS.has(action)",
        "const permission = ACTION_PERMISSION[action]",
        "if (!canRunGenericAction(checked.profile, permission)) return forbidden(action, checked.profile)",
        "if (action === 'list_orders') return await listOrders(supabaseUrl, serviceRole, checked.profile)",
    )
    for marker in required_source_markers:
        require(source, marker, "source")

    if runner_projection(runner, "MANAGER_FIELDS") != MANAGER_FIELDS:
        raise AssertionError("runner manager projection drift")
    if runner_projection(runner, "ACCOUNTANT_FIELDS") != ACCOUNTANT_FIELDS:
        raise AssertionError("runner accountant projection drift")
    scenario_match = re.search(
        r"const SCENARIOS = new Set\(\[(.*?)\]\);",
        runner,
        flags=re.DOTALL,
    )
    if not scenario_match:
        raise AssertionError("runner scenarios missing")
    if set(re.findall(r"'([^']+)'", scenario_match.group(1))) != SCENARIOS:
        raise AssertionError("runner scenarios drift")
    required_runner_markers = (
        STAGING_REF,
        "leader-crm-leads-staging",
        "Only the exact lider-bsk-staging URL is allowed",
        "/auth/v1/token?grant_type=password",
        "? { action: 'dashboard' }",
        ": { action: 'list_orders' }",
        "projection mismatch",
        "Best effort only",
    )
    for marker in required_runner_markers:
        require(runner, marker, "runner")
    forbidden_runner_markers = (
        PRODUCTION_REF,
        "SUPABASE_SERVICE_ROLE_KEY",
        "service_role",
        "sb_secret_",
        "eyJhbGciOi",
        "create_order_from_offer",
        "ensure_client",
    )
    lowered_runner = runner.lower()
    for marker in forbidden_runner_markers:
        if marker.lower() in lowered_runner:
            raise AssertionError(f"runner contains forbidden marker: {marker}")

    required_doc_markers = (
        "leader-crm-leads:list_orders",
        "version: `1`",
        "verify_jwt=true",
        SOURCE_COMMIT,
        "Вне scope",
        "Authenticated HTTP E2E пока не запущен",
        "Production Supabase не изменялся",
    )
    for marker in required_doc_markers:
        require(doc, marker, "documentation")

    required_workflow_markers = (
        "tools/check_crm_leads_orders_staging_deployment.py",
        "node --check tools/run_crm_leads_orders_staging_auth_e2e.mjs",
        "python3 tools/check_crm_leads_orders_staging_deployment.py",
        "supabase/staging-functions/leader-crm-leads-staging/index.ts",
        "contracts/crm-leads-orders-staging-deployment-v1.json",
    )
    for marker in required_workflow_markers:
        require(workflow, marker, "workflow")

    print("CRM leads staging list_orders probe, source pin, scope and auth runner are synchronized.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
