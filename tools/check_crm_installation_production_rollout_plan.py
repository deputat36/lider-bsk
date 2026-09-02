#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    "generator": ROOT / "tools" / "generate_crm_installation_production_rollout_plan.py",
    "contract": ROOT / "contracts" / "crm-installation-production-rollout-plan-v1.json",
    "doc": ROOT / "docs" / "CRM_INSTALLATION_PRODUCTION_ROLLOUT_PLAN_V1_2026-07-23.md",
    "workflow": ROOT / ".github" / "workflows" / "crm-installation-production-rollout-plan-check.yml",
    "index": ROOT / "crm" / "v4" / "index.html",
    "loader": ROOT / "crm" / "v4" / "assets" / "v4" / "crm-v4-tab-loader-v1.js",
}

errors: list[str] = []
texts: dict[str, str] = {}
for name, path in FILES.items():
    if not path.is_file():
        errors.append(f"missing_file:{path.relative_to(ROOT)}")
        texts[name] = ""
    else:
        texts[name] = path.read_text(encoding="utf-8")


def require_text(name: str, markers: list[str]) -> None:
    for marker in markers:
        if marker not in texts.get(name, ""):
            errors.append(f"{name}:missing_marker:{marker}")


require_text("generator", [
    "EXPECTED_PROJECT_REF = \"ofewxuqfjhamgerwzull\"",
    "EXPECTED_EDGE_SLUG = \"leader-crm-installation\"",
    "source_only_plan_ready_not_executed",
    "mutating_phases_approved\": 0",
    "known_nav_warnings_are_out_of_scope",
    "Production не изменён генерацией этого checklist.",
])
require_text("contract", [
    '"issue": 456',
    '"status": "source_only_plan_ready_not_executed"',
    '"any_candidate_applied_to_production": false',
    '"P1_apply_rbac_receipts": false',
    '"P7_frontend_loader_switch": false',
    '"nav_changes_allowed": false',
    '"next_gate": "explicit production approval for P1 only"',
])
require_text("doc", [
    "Issue #456",
    "P0 → P1 → P2 → P3 → P4 → P5 → P6 → P7 → P8",
    "production approval for P1",
    "verify_jwt=true",
    "card v2",
    "card v3",
    "`nav_*` не менять",
    "Production не изменён",
])
require_text("workflow", [
    "python3 tools/generate_crm_installation_production_rollout_plan.py",
    "python3 tools/check_crm_installation_production_rollout_plan.py",
    "installation-production-rollout-plan-package",
    "installation-production-rollout-plan-diagnostics",
])
require_text("index", ['assets/v4/crm-v4-tab-loader-v1.js?v=20260816-direct-card-1'])
if re.search(r'<script\b[^>]*\bsrc=["\'][^"\']*installation-job-card-[^"\']*["\']', texts["index"], re.I):
    errors.append("working_index_eager_installation_script")
require_text("loader", ["() => import('./installation-job-card-v2.js?v=20260805-tab-loader-1')"])
if "() => import('./installation-job-card-v3.js?v=20260723-production-edge-candidate-1')" in texts["loader"]:
    errors.append("working_lazy_loader_already_switched")

for name in ["generator", "workflow"]:
    for forbidden in [
        "Supabase.apply_migration",
        "Supabase.deploy_edge_function",
        "SUPABASE_SERVICE_ROLE_KEY",
        "sb_secret_",
        "service_role_key",
        "psql ",
        "supabase functions deploy",
        "supabase db push",
    ]:
        if forbidden in texts.get(name, ""):
            errors.append(f"{name}:forbidden_runtime_marker:{forbidden}")

try:
    contract = json.loads(texts.get("contract", "{}"))
except json.JSONDecodeError as exc:
    errors.append(f"invalid_contract_json:{exc}")
    contract = {}

if contract.get("contract") != "crm-installation-production-rollout-plan":
    errors.append("contract_identity_mismatch")
if contract.get("version") != 1:
    errors.append("contract_version_mismatch")
if contract.get("status") != "source_only_plan_ready_not_executed":
    errors.append("contract_status_mismatch")
production = contract.get("production", {})
for key in ["database_changed", "edge_deployed", "frontend_switched", "auth_changed", "data_changed", "nav_changed"]:
    if production.get(key) is not False:
        errors.append(f"production_boundary:{key}_must_be_false")
if contract.get("dependencies", {}).get("all_source_candidates_merged") is not True:
    errors.append("source_candidates_must_be_merged")
if contract.get("dependencies", {}).get("any_candidate_applied_to_production") is not False:
    errors.append("production_candidates_must_remain_unapplied")
if any(value is not False for value in contract.get("approval_gates", {}).values()):
    errors.append("all_mutating_approval_gates_must_be_false")
if contract.get("expected_current_state", {}).get("current_loader") != "assets/v4/installation-job-card-v2.js?v=20260805-tab-loader-1":
    errors.append("expected_current_loader_mismatch")
if contract.get("security", {}).get("nav_changes_allowed") is not False:
    errors.append("nav_changes_must_be_forbidden")

if not errors:
    with tempfile.TemporaryDirectory(prefix="installation-rollout-plan-") as tmp:
        result = subprocess.run(
            [sys.executable, str(FILES["generator"]), "--output", tmp],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        if result.returncode != 0:
            errors.append(f"generator_failed:{result.stderr.strip() or result.stdout.strip()}")
        else:
            plan_path = Path(tmp) / "rollout-plan.json"
            checklist_path = Path(tmp) / "rollout-checklist.md"
            if not plan_path.is_file() or not checklist_path.is_file():
                errors.append("generator_outputs_missing")
            else:
                plan = json.loads(plan_path.read_text(encoding="utf-8"))
                checklist = checklist_path.read_text(encoding="utf-8")
                if plan.get("status") != "source_only_plan_ready_not_executed":
                    errors.append("generated_plan_status_mismatch")
                phases = plan.get("phases", [])
                if len(phases) != 9:
                    errors.append(f"generated_phase_count:{len(phases)}")
                expected_ids = [f"P{i}" for i in range(9)]
                if [phase.get("id") for phase in phases] != expected_ids:
                    errors.append("generated_phase_order_mismatch")
                mutating = [phase for phase in phases if phase.get("mutating") is True]
                if any(phase.get("approved") is not False for phase in mutating):
                    errors.append("generated_mutating_phase_approved")
                if plan.get("execution", {}).get("commands_executed") is not False:
                    errors.append("generated_plan_claims_commands_executed")
                if plan.get("current_state", {}).get("expected_current_loader") != "assets/v4/installation-job-card-v2.js?v=20260805-tab-loader-1":
                    errors.append("generated_current_loader_mismatch")
                if "Production не изменён генерацией этого checklist." not in checklist:
                    errors.append("generated_checklist_boundary_missing")
                if "P7 — frontend_loader_switch" not in checklist:
                    errors.append("generated_checklist_frontend_phase_missing")

if errors:
    print("\n".join(errors), file=sys.stderr)
    raise SystemExit(1)

print("Production installation rollout plan is deterministic, non-mutating, approval-gated and keeps the working loader on card v2.")