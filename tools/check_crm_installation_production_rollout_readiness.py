#!/usr/bin/env python3

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    "contract": ROOT / "contracts/crm-installation-production-rollout-readiness-v1.json",
    "preflight": ROOT / "docs/PREFLIGHT_INSTALLATION_PRODUCTION_ROLLOUT_2026-07-23.sql",
    "runbook": ROOT / "docs/CRM_INSTALLATION_PRODUCTION_ROLLOUT_READINESS_V1_2026-07-23.md",
    "route": ROOT / "crm/v4/assets/v4/installation-job-save-route-v1.js",
    "runtime": ROOT / "contracts/crm-staging-installation-runtime-smoke-v1.json",
    "transport": ROOT / "contracts/crm-staging-installation-frontend-transport-v1.json",
    "workflow": ROOT / ".github/workflows/crm-installation-production-rollout-readiness-check.yml",
}

errors = []
texts = {}
for name, path in FILES.items():
    if not path.is_file():
        errors.append(f"Missing file: {path.relative_to(ROOT)}")
        texts[name] = ""
    else:
        texts[name] = path.read_text(encoding="utf-8")


def require(name, markers):
    for marker in markers:
        if marker not in texts.get(name, ""):
            errors.append(f"{name}: missing marker {marker!r}")


try:
    contract = json.loads(texts.get("contract", "{}"))
except json.JSONDecodeError as exc:
    errors.append(f"Invalid readiness contract JSON: {exc}")
    contract = {}

if contract.get("version") != 1:
    errors.append("readiness contract version must be 1")
if contract.get("status") != "read_only_audit_complete_source_package_required":
    errors.append("readiness status drifted")

production = contract.get("production", {})
if production.get("project_ref") != "ofewxuqfjhamgerwzull":
    errors.append("production project ref drifted")
for key in ["database_changed", "edge_deployed", "frontend_switched", "auth_changed", "data_changed", "nav_changed"]:
    if production.get(key) is not False:
        errors.append(f"production.{key} must remain false in readiness package")

snapshot = contract.get("production_snapshot", {})
for key in [
    "leader_private_schema", "pgcrypto_digest", "profiles_table", "orders_table",
    "production_jobs_table", "installation_jobs_table", "installation_items_table",
    "installation_events_table", "installation_comments_table",
    "required_order_columns_present", "required_installation_columns_present",
    "required_relationship_indexes_present",
]:
    if snapshot.get(key) is not True:
        errors.append(f"production snapshot {key} must be true")
for key in ["orders_rows", "installation_jobs_rows", "installation_items_rows", "installation_events_rows", "installation_comments_rows"]:
    if snapshot.get(key) != 0:
        errors.append(f"production snapshot {key} must equal audited zero")

missing = contract.get("missing_components", {})
for key in [
    "role_action_matrix_table", "actor_permission_function", "actor_permission_rpc",
    "command_receipts_table", "installation_read_rpc", "installation_update_rpc",
    "installation_edge_function",
]:
    if missing.get(key) is not True:
        errors.append(f"missing component {key} must be recorded")

baseline = contract.get("validated_staging_baseline", {})
edge = baseline.get("edge", {})
read_rpc = baseline.get("read_rpc", {})
update_rpc = baseline.get("update_rpc", {})
if edge.get("sha256") != "24183605aad2c5cfcc84ebe14c348dcfce1b68de41a43dcfb973f65cef8cb369":
    errors.append("installation Edge SHA drifted")
if edge.get("verify_jwt") is not True or edge.get("version") != 2:
    errors.append("installation Edge v2 verify_jwt baseline drifted")
if read_rpc.get("md5") != "5a353818606012d0e657a83f133723b6" or read_rpc.get("bytes") != 5432:
    errors.append("installation read RPC baseline drifted")
if update_rpc.get("md5") != "0ed4669197dac1f2695e763d0eec54e1" or update_rpc.get("bytes") != 19061:
    errors.append("installation update RPC baseline drifted")

required_extraction = contract.get("required_extraction", {})
for key in [
    "canonical_rbac_core_only", "exclude_design_wrappers", "exclude_calculation_and_offer_logic",
    "exclude_staging_environment_guard", "exclude_smoke_bootstrap", "exclude_pg_net_transport", "exclude_nav",
]:
    if required_extraction.get(key) is not True:
        errors.append(f"required extraction guard {key} must be true")

approvals = contract.get("approval_gates", {})
for key in ["production_database_migration", "production_edge_deploy", "production_frontend_switch", "production_auth_or_fixture_mutation"]:
    if approvals.get(key) is not True:
        errors.append(f"approval gate {key} must remain required")

require("preflight", [
    "-- READ ONLY: production installation rollout preflight.",
    "Expected project ref: ofewxuqfjhamgerwzull",
    "leader_role_action_matrix_v1",
    "leader_command_receipts",
    "leader_actor_has_crm_action_rpc(uuid,text)",
    "leader_read_installation_job_rpc(uuid,uuid)",
    "leader_update_installation_job_rpc(jsonb)",
    "has_function_privilege('anon'",
    "has_function_privilege('authenticated'",
    "has_function_privilege('service_role'",
])
preflight = texts.get("preflight", "").lower()
for forbidden in ["insert ", "update ", "delete ", "truncate ", "drop ", "alter ", "create ", "grant ", "revoke ", "do $", "begin;"]:
    if forbidden in preflight:
        errors.append(f"preflight contains non-read-only marker: {forbidden.strip()}")

require("runbook", [
    "Production не изменялся во время аудита.",
    "Gate 1 — production database",
    "Gate 2 — production Edge",
    "Gate 3 — production frontend switch",
    "Gate 4 — authenticated production browser smoke",
    "frontend route в `production_locked`",
    "Не выполнять broad schema drop",
    "production migration source ещё не подготовлен",
    "`nav_*` не изменялся",
])
runbook_lower = texts.get("runbook", "").lower()
for forbidden in ["production rollout завершён", "production edge развёрнут", "frontend production переключён"]:
    if forbidden in runbook_lower:
        errors.append(f"runbook contains false completion claim: {forbidden}")

require("route", [
    "mode: 'production_locked'",
    "enabled: false",
    "reason: 'production_backend_not_deployed'",
])
if "mode: 'production_edge'" in texts.get("route", ""):
    errors.append("production Edge route must not be enabled in readiness package")

try:
    runtime = json.loads(texts.get("runtime", "{}"))
    transport = json.loads(texts.get("transport", "{}"))
except json.JSONDecodeError as exc:
    errors.append(f"Invalid staging evidence JSON: {exc}")
    runtime, transport = {}, {}
if runtime.get("status") != "completed_clean":
    errors.append("staging runtime smoke must remain completed_clean")
if transport.get("version") != 3:
    errors.append("staging frontend transport contract must remain version 3")
if transport.get("authenticated_ui_smoke", {}).get("completed") is not True:
    errors.append("authenticated staging UI smoke must remain completed")
if transport.get("production_boundary", {}).get("production_frontend_switch") is not False:
    errors.append("staging transport must preserve production frontend boundary")

require("workflow", [
    "python3 -m py_compile tools/check_crm_installation_production_rollout_readiness.py",
    "python3 tools/check_crm_installation_production_rollout_readiness.py",
    "installation-production-rollout-readiness-diagnostics",
])

if errors:
    print("\n".join(errors), file=sys.stderr)
    raise SystemExit(1)

print("Installation production rollout readiness is read-only, evidence-based, approval-gated, and production remains locked.")
