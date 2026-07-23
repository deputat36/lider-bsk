#!/usr/bin/env python3
"""Generate a non-mutating production rollout plan for CRM installation.

The generator reads only versioned repository contracts and writes build artifacts.
It never connects to Supabase, never executes SQL, never deploys Edge Functions and
never edits the working CRM loader.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "build" / "installation-production-rollout-plan"

CONTRACT_PATHS = {
    "readiness": ROOT / "contracts" / "crm-installation-production-rollout-readiness-v1.json",
    "rbac": ROOT / "contracts" / "crm-installation-production-rbac-receipts-candidate-v1.json",
    "rpc": ROOT / "contracts" / "crm-installation-production-rpc-candidate-v1.json",
    "edge": ROOT / "contracts" / "crm-installation-production-edge-candidate-v1.json",
    "frontend": ROOT / "contracts" / "crm-installation-production-frontend-candidate-v1.json",
}

EXPECTED_PROJECT_REF = "ofewxuqfjhamgerwzull"
EXPECTED_EDGE_SLUG = "leader-crm-installation"
EXPECTED_CURRENT_LOADER = "assets/v4/installation-job-card-v2.js?v=20260622-1"
EXPECTED_CANDIDATE_LOADER = "assets/v4/installation-job-card-v3.js?v=20260723-production-edge-candidate-1"


def load_json(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise SystemExit(f"missing_contract:{path.relative_to(ROOT)}")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"invalid_json:{path.relative_to(ROOT)}:{exc}") from exc
    if not isinstance(value, dict):
        raise SystemExit(f"contract_not_object:{path.relative_to(ROOT)}")
    return value


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require(condition: bool, code: str) -> None:
    if not condition:
        raise SystemExit(code)


def validate_contracts(contracts: dict[str, dict[str, Any]]) -> None:
    readiness = contracts["readiness"]
    rbac = contracts["rbac"]
    rpc = contracts["rpc"]
    edge = contracts["edge"]
    frontend = contracts["frontend"]

    require(readiness.get("contract") == "crm-installation-production-rollout-readiness", "readiness_contract_mismatch")
    require(rbac.get("contract") == "crm-installation-production-rbac-receipts-candidate", "rbac_contract_mismatch")
    require(rpc.get("contract") == "crm-installation-production-rpc-candidate", "rpc_contract_mismatch")
    require(edge.get("contract") == "crm-installation-production-edge-candidate", "edge_contract_mismatch")
    require(frontend.get("contract") == "crm-installation-production-frontend-candidate", "frontend_contract_mismatch")

    for name, contract in contracts.items():
        production = contract.get("production", {})
        require(production.get("project_ref") == EXPECTED_PROJECT_REF, f"{name}_project_ref_mismatch")
        for field in ["database_changed", "edge_deployed", "frontend_switched", "auth_changed", "data_changed", "nav_changed"]:
            if field in production:
                require(production.get(field) is False, f"{name}_{field}_must_be_false")

    require(rbac.get("status") == "source_only_not_applied", "rbac_status_mismatch")
    require(rpc.get("status") == "source_only_generator_ready_not_applied", "rpc_status_mismatch")
    require(edge.get("status") == "source_only_generator_ready_not_deployed", "edge_status_mismatch")
    require(frontend.get("status") == "source_only_not_switched", "frontend_status_mismatch")

    require(edge.get("production", {}).get("function_slug") == EXPECTED_EDGE_SLUG, "edge_slug_mismatch")
    require(edge.get("deployment", {}).get("verify_jwt") is True, "edge_verify_jwt_must_be_true")
    require(edge.get("deployment", {}).get("deploy_approved") is False, "edge_deploy_must_remain_unapproved")
    require(frontend.get("approval_gate", {}).get("approved") is False, "frontend_switch_must_remain_unapproved")

    require(rpc.get("dependency", {}).get("rbac_receipts_contract") == "contracts/crm-installation-production-rbac-receipts-candidate-v1.json", "rpc_dependency_mismatch")
    require(edge.get("database_dependencies", {}).get("rpc_candidate") == "contracts/crm-installation-production-rpc-candidate-v1.json", "edge_rpc_dependency_mismatch")
    require(frontend.get("dependencies", {}).get("edge_contract") == "contracts/crm-installation-production-edge-candidate-v1.json", "frontend_edge_dependency_mismatch")

    require(frontend.get("loader", {}).get("current_script") == EXPECTED_CURRENT_LOADER, "frontend_current_loader_mismatch")
    require(frontend.get("loader", {}).get("candidate_script") == EXPECTED_CANDIDATE_LOADER, "frontend_candidate_loader_mismatch")


def source_inventory(contracts: dict[str, dict[str, Any]]) -> dict[str, Any]:
    rbac = contracts["rbac"]
    rpc = contracts["rpc"]
    edge = contracts["edge"]
    frontend = contracts["frontend"]
    return {
        "rbac_receipts": {
            "migration": rbac["source"]["migration"],
            "rollback": rbac["source"]["rollback"],
            "contract_sha256": sha256_file(CONTRACT_PATHS["rbac"]),
        },
        "rpc": {
            "generator": rpc["generator"]["source"],
            "outputs": rpc["generator"]["outputs"],
            "rollback": rpc["rollback"]["source"],
            "read_runtime_md5": rpc["validated_staging_runtime"]["read_rpc"]["md5"],
            "update_runtime_md5": rpc["validated_staging_runtime"]["update_rpc"]["md5"],
            "contract_sha256": sha256_file(CONTRACT_PATHS["rpc"]),
        },
        "edge": {
            "generator": edge["generator"]["source"],
            "slug": edge["deployment"]["slug"],
            "verify_jwt": edge["deployment"]["verify_jwt"],
            "rollback": edge["rollback"]["source"],
            "validated_staging_sha256": edge["validated_staging_baseline"]["sha256"],
            "contract_sha256": sha256_file(CONTRACT_PATHS["edge"]),
        },
        "frontend": {
            "generator": frontend["generator"]["source"],
            "outputs": frontend["generated_outputs"],
            "current_loader": frontend["loader"]["current_script"],
            "candidate_loader": frontend["loader"]["candidate_script"],
            "rollback": frontend["rollback"]["loader_switch_only"],
            "contract_sha256": sha256_file(CONTRACT_PATHS["frontend"]),
        },
    }


def build_plan(contracts: dict[str, dict[str, Any]]) -> dict[str, Any]:
    readiness = contracts["readiness"]
    phases = [
        {
            "id": "P0",
            "name": "repeat_read_only_preflight",
            "mutating": False,
            "approval_required": False,
            "approved": True,
            "success": "production baseline still matches expected missing components and row counts",
            "stop": ["nonzero unexpected business rows", "unknown roles", "source contract drift", "installation-specific advisor regression"],
        },
        {
            "id": "P1",
            "name": "apply_rbac_receipts",
            "mutating": True,
            "approval_required": True,
            "approved": False,
            "success": "matrix, permission bridge and empty durable receipts exist with browser access denied",
            "rollback": contracts["rbac"]["source"]["rollback"],
        },
        {
            "id": "P2",
            "name": "apply_read_rpc",
            "mutating": True,
            "approval_required": True,
            "approved": False,
            "success": "read RPC fingerprint matches validated staging baseline and browser EXECUTE is denied",
        },
        {
            "id": "P3",
            "name": "apply_update_rpc",
            "mutating": True,
            "approval_required": True,
            "approved": False,
            "success": "update RPC fingerprint matches validated staging baseline and receipts remain empty",
            "rollback": contracts["rpc"]["rollback"]["source"],
        },
        {
            "id": "P4",
            "name": "deploy_edge",
            "mutating": True,
            "approval_required": True,
            "approved": False,
            "success": "leader-crm-installation is ACTIVE with verify_jwt=true and expected environment identity",
            "rollback": contracts["edge"]["rollback"]["source"],
        },
        {
            "id": "P5",
            "name": "api_jwt_smoke",
            "mutating": False,
            "approval_required": False,
            "approved": False,
            "success": "401 missing, 401 invalid, 403 forbidden and authenticated not_found/read paths match contract",
        },
        {
            "id": "P6",
            "name": "temporary_authenticated_browser_smoke",
            "mutating": True,
            "approval_required": True,
            "approved": False,
            "success": "one browser mutation succeeds and all Auth/data/receipt fixtures are removed",
        },
        {
            "id": "P7",
            "name": "frontend_loader_switch",
            "mutating": True,
            "approval_required": True,
            "approved": False,
            "success": "production loads card v3 and no direct browser table persistence remains",
            "rollback": contracts["frontend"]["rollback"]["loader_switch_only"],
        },
        {
            "id": "P8",
            "name": "observation_and_final_postflight",
            "mutating": False,
            "approval_required": False,
            "approved": False,
            "success": "logs, advisors, ACL, fingerprints and business row counts remain healthy",
        },
    ]

    return {
        "plan": "crm-installation-production-rollout",
        "version": 1,
        "generated_from_repository": "deputat36/lider-bsk",
        "issue": 456,
        "status": "source_only_plan_ready_not_executed",
        "production_project_ref": EXPECTED_PROJECT_REF,
        "current_state": {
            "database_layers_applied": False,
            "edge_deployed": False,
            "frontend_switched": False,
            "auth_or_fixture_mutation": False,
            "data_changed": False,
            "nav_changed": False,
            "expected_current_loader": EXPECTED_CURRENT_LOADER,
            "expected_missing_components": readiness.get("missing_components", {}),
            "expected_row_counts": {
                "orders": readiness["production_snapshot"]["orders_rows"],
                "installation_jobs": readiness["production_snapshot"]["installation_jobs_rows"],
                "installation_items": readiness["production_snapshot"]["installation_items_rows"],
                "installation_events": readiness["production_snapshot"]["installation_events_rows"],
                "installation_comments": readiness["production_snapshot"]["installation_comments_rows"],
            },
        },
        "source_inventory": source_inventory(contracts),
        "phases": phases,
        "global_stop_conditions": [
            "production project_ref mismatch",
            "working loader differs before approved cutover",
            "unknown role or inactive profile assumptions",
            "browser EXECUTE granted on installation business RPC",
            "Edge verify_jwt is not true",
            "cleanup leaves Auth users, profiles, fixtures or receipts",
            "new installation-specific security WARN or ERROR",
            "any required nav_* change",
        ],
        "advisor_boundary": {
            "known_nav_warnings_are_out_of_scope": True,
            "nav_changes_allowed": False,
            "leaked_password_protection_warning_is_separate_auth_hardening": True,
        },
        "execution": {
            "commands_executed": False,
            "supabase_credentials_required_to_generate": False,
            "production_approval_required_for_mutating_phases": True,
        },
    }


def checklist_markdown(plan: dict[str, Any]) -> str:
    lines = [
        "# Production rollout checklist — монтаж",
        "",
        f"Issue: #{plan['issue']}",
        "",
        "Этот файл сгенерирован без подключения к Supabase и без выполнения production-команд.",
        "",
    ]
    for phase in plan["phases"]:
        gate = "требуется отдельное разрешение" if phase["approval_required"] else "отдельное разрешение не требуется"
        lines.extend([
            f"## {phase['id']} — {phase['name']}",
            "",
            f"- [ ] Gate: {gate}",
            f"- [ ] Критерий успеха: {phase['success']}",
        ])
        if phase.get("rollback"):
            lines.append(f"- [ ] Rollback готов: `{phase['rollback']}`")
        lines.append("")
    lines.extend([
        "## Общие stop conditions",
        "",
    ])
    for item in plan["global_stop_conditions"]:
        lines.append(f"- [ ] Не выявлено: {item}")
    lines.extend([
        "",
        "Production не изменён генерацией этого checklist.",
    ])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    contracts = {name: load_json(path) for name, path in CONTRACT_PATHS.items()}
    validate_contracts(contracts)
    plan = build_plan(contracts)

    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    (output / "rollout-plan.json").write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (output / "rollout-checklist.md").write_text(checklist_markdown(plan), encoding="utf-8")

    print(json.dumps({
        "ok": True,
        "status": plan["status"],
        "output": str(output),
        "phases": len(plan["phases"]),
        "mutating_phases_approved": 0,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
