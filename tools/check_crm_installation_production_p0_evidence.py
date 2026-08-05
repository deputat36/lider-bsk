#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    "contract": ROOT / "contracts" / "crm-installation-production-p0-evidence-v1.json",
    "doc": ROOT / "docs" / "CRM_INSTALLATION_PRODUCTION_P0_EVIDENCE_V1_2026-07-23.md",
    "sql": ROOT / "supabase" / "production-preflight" / "20260723_installation_p0_readonly.sql",
    "workflow": ROOT / ".github" / "workflows" / "crm-installation-production-p0-evidence-check.yml",
    "index": ROOT / "crm" / "v4" / "index.html",
    "loader": ROOT / "crm" / "v4" / "assets" / "v4" / "crm-v4-tab-loader-v1.js",
    "rollout": ROOT / "contracts" / "crm-installation-production-rollout-plan-v1.json",
    "rbac": ROOT / "contracts" / "crm-installation-production-rbac-receipts-candidate-v1.json",
    "rpc": ROOT / "contracts" / "crm-installation-production-rpc-candidate-v1.json",
    "edge": ROOT / "contracts" / "crm-installation-production-edge-candidate-v1.json",
    "frontend": ROOT / "contracts" / "crm-installation-production-frontend-candidate-v1.json",
}

errors: list[str] = []
texts: dict[str, str] = {}
for name, path in FILES.items():
    if not path.is_file():
        errors.append(f"missing_file:{path.relative_to(ROOT)}")
        texts[name] = ""
    else:
        texts[name] = path.read_text(encoding="utf-8")


def load_json(name: str) -> dict:
    try:
        value = json.loads(texts.get(name, "{}"))
    except json.JSONDecodeError as exc:
        errors.append(f"invalid_json:{name}:{exc}")
        return {}
    if not isinstance(value, dict):
        errors.append(f"json_object_required:{name}")
        return {}
    return value


contract = load_json("contract")
rollout = load_json("rollout")
rbac = load_json("rbac")
rpc = load_json("rpc")
edge = load_json("edge")
frontend = load_json("frontend")

if contract.get("contract") != "crm-installation-production-p0-evidence":
    errors.append("contract_identity_mismatch")
if contract.get("version") != 1:
    errors.append("contract_version_mismatch")
if contract.get("issue") != 456:
    errors.append("issue_mismatch")
if contract.get("status") != "p0_passed_p1_not_approved":
    errors.append("p0_status_mismatch")

production = contract.get("production", {})
for key in ["database_changed", "edge_deployed", "frontend_switched", "auth_changed", "data_changed", "nav_changed"]:
    if production.get(key) is not False:
        errors.append(f"production_boundary:{key}_must_be_false")
if production.get("project_ref") != "ofewxuqfjhamgerwzull":
    errors.append("production_project_ref_mismatch")

db = contract.get("database_snapshot", {})
if db.get("profiles_rows") != 4:
    errors.append("profiles_row_count_mismatch")
if db.get("roles") != {"owner": 2, "admin": 1, "manager": 1}:
    errors.append("production_roles_mismatch")
if db.get("unknown_roles") != []:
    errors.append("unknown_roles_present")
for key in ["orders_rows", "installation_jobs_rows", "installation_items_rows", "installation_events_rows", "installation_comments_rows"]:
    if db.get(key) != 0:
        errors.append(f"nonzero_baseline:{key}")
if db.get("required_columns_total") != 73:
    errors.append("required_columns_total_mismatch")
if db.get("required_columns_missing") != []:
    errors.append("required_columns_missing")
if db.get("generator_schema_preflight_passed") is not True:
    errors.append("generator_schema_preflight_not_passed")
if db.get("staging_environment_guard_exists") is not False:
    errors.append("staging_guard_present_in_production")

components = contract.get("rollout_components", {})
if not components or any(value is not False for value in components.values()):
    errors.append("rollout_component_already_present")

acl = contract.get("acl", {})
if not acl or any(value is not False for value in acl.values()):
    errors.append("browser_business_rpc_execute_detected")

advisors = contract.get("advisors", {})
if advisors.get("installation_specific_security_warn_or_error") != 0:
    errors.append("installation_security_advisor_blocker")
if advisors.get("installation_specific_performance_warn_or_error") != 0:
    errors.append("installation_performance_advisor_blocker")
if advisors.get("nav_changes_allowed") is not False:
    errors.append("nav_changes_must_remain_forbidden")

logs = contract.get("logs", {})
for key in ["installation_specific_unexpected_5xx", "auth_errors_related_to_installation", "postgres_errors_related_to_installation"]:
    if logs.get(key) != 0:
        errors.append(f"installation_log_blocker:{key}")

p0 = contract.get("p0_decision", {})
if p0.get("passed") is not True or p0.get("stop_condition_triggered") is not False:
    errors.append("p0_decision_invalid")
if p0.get("next_gate") != "P1_apply_rbac_receipts":
    errors.append("next_gate_mismatch")
if p0.get("next_gate_requires_explicit_production_approval") is not True:
    errors.append("p1_explicit_approval_requirement_missing")
if p0.get("next_gate_approved") is not False:
    errors.append("p1_must_not_be_approved")

if rollout.get("status") != "source_only_plan_ready_not_executed":
    errors.append("rollout_plan_status_mismatch")
if rbac.get("status") != "source_only_not_applied":
    errors.append("rbac_candidate_status_mismatch")
if rpc.get("status") != "source_only_generator_ready_not_applied":
    errors.append("rpc_candidate_status_mismatch")
if edge.get("status") != "source_only_generator_ready_not_deployed":
    errors.append("edge_candidate_status_mismatch")
if frontend.get("status") != "source_only_not_switched":
    errors.append("frontend_candidate_status_mismatch")

index_text = texts.get("index", "")
loader_text = texts.get("loader", "")
if 'assets/v4/crm-v4-tab-loader-v1.js?v=20260805-lazy-tabs-1' not in index_text:
    errors.append("working_lazy_loader_entrypoint_missing")
if re.search(r'<script\b[^>]*\bsrc=["\'][^"\']*installation-job-card-[^"\']*["\']', index_text, re.I):
    errors.append("working_index_eager_installation_script")
if "() => import('./installation-job-card-v2.js?v=20260805-tab-loader-1')" not in loader_text:
    errors.append("working_lazy_loader_card_v2_missing")
if "() => import('./installation-job-card-v3.js?v=20260723-production-edge-candidate-1')" in loader_text:
    errors.append("working_lazy_loader_already_switched")

doc_markers = [
    "P0 = passed",
    "P1_apply_rbac_receipts",
    "Generic-команда «продолжай» не считается разрешением",
    "required columns: 73",
    "missing columns: 0",
    "`nav_*` не менять",
    "Production не изменён",
]
for marker in doc_markers:
    if marker not in texts.get("doc", ""):
        errors.append(f"doc_missing_marker:{marker}")

sql_text = texts.get("sql", "")
if "ofewxuqfjhamgerwzull" not in sql_text:
    errors.append("readonly_sql_project_ref_missing")
if "missing_required_columns" not in sql_text or "installation_p0_snapshot" not in sql_text:
    errors.append("readonly_sql_evidence_markers_missing")

# Strip comments and string literals before checking for mutating SQL statements.
sanitized = re.sub(r"/\*.*?\*/", " ", sql_text, flags=re.S)
sanitized = re.sub(r"--[^\n]*", " ", sanitized)
sanitized = re.sub(r"'(?:''|[^'])*'", "''", sanitized)
for keyword in ["insert", "update", "delete", "alter", "create", "drop", "grant", "revoke", "truncate", "merge", "call", "do"]:
    if re.search(rf"\b{keyword}\b", sanitized, flags=re.I):
        errors.append(f"readonly_sql_contains_mutation:{keyword}")

workflow_text = texts.get("workflow", "")
for marker in [
    "python3 tools/check_crm_installation_production_p0_evidence.py",
    "crm-installation-production-p0-evidence-v1.json",
    "20260723_installation_p0_readonly.sql",
]:
    if marker not in workflow_text:
        errors.append(f"workflow_missing_marker:{marker}")
for forbidden in ["Supabase.apply_migration", "Supabase.deploy_edge_function", "supabase db push", "supabase functions deploy", "SUPABASE_SERVICE_ROLE_KEY", "sb_secret_"]:
    if forbidden in workflow_text:
        errors.append(f"workflow_forbidden_runtime_marker:{forbidden}")

if errors:
    print("\n".join(errors), file=sys.stderr)
    raise SystemExit(1)

print("Production installation P0 evidence is read-only, reproducible, passed, and keeps P1 unapproved.")
