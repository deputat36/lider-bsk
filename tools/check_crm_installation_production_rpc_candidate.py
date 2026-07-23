#!/usr/bin/env python3

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    "generator": ROOT / "tools/generate_crm_installation_production_rpc_candidate.py",
    "contract": ROOT / "contracts/crm-installation-production-rpc-candidate-v1.json",
    "rbac_contract": ROOT / "contracts/crm-installation-production-rbac-receipts-candidate-v1.json",
    "runtime": ROOT / "contracts/crm-staging-installation-runtime-smoke-v1.json",
    "transport": ROOT / "contracts/crm-staging-installation-frontend-transport-v1.json",
    "read_source": ROOT / "supabase/staging-migrations/20260722_06_installation_read_rpc_main_reconcile.sql",
    "update_source": ROOT / "supabase/staging-migrations/20260721_06_installation_job_update_rpc.sql",
    "rollback": ROOT / "supabase/production-candidates/rollback/20260723_02_03_installation_rpc_candidate_rollback.sql",
    "runbook": ROOT / "docs/CRM_INSTALLATION_PRODUCTION_RPC_CANDIDATE_V1_2026-07-23.md",
    "route": ROOT / "crm/v4/assets/v4/installation-job-save-route-v1.js",
    "workflow": ROOT / ".github/workflows/crm-installation-production-rpc-candidate-check.yml",
}

READ_MARKER = "create or replace function public.leader_read_installation_job_rpc("
UPDATE_MARKER = "create or replace function leader_private.leader_installation_command_error("

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


def load_json(name):
    try:
        return json.loads(texts.get(name, "{}"))
    except json.JSONDecodeError as exc:
        errors.append(f"Invalid JSON in {name}: {exc}")
        return {}


def source_body(text, marker, label):
    index = text.find(marker)
    if index < 0:
        errors.append(f"{label}: source marker missing")
        return ""
    return text[index:].strip()


def generated_body(text, marker, label):
    index = text.find(marker)
    if index < 0:
        errors.append(f"{label}: generated marker missing")
        return ""
    body_with_commit = text[index:]
    suffix = "\ncommit;\n"
    if not body_with_commit.endswith(suffix):
        errors.append(f"{label}: generated output must end with commit")
        return body_with_commit.strip()
    return body_with_commit[: -len(suffix)].strip()


contract = load_json("contract")
rbac_contract = load_json("rbac_contract")
runtime = load_json("runtime")
transport = load_json("transport")

if contract.get("version") != 1:
    errors.append("RPC candidate contract version must be 1")
if contract.get("status") != "source_only_generator_ready_not_applied":
    errors.append("RPC candidate must remain source_only_generator_ready_not_applied")

production = contract.get("production", {})
if production.get("project_ref") != "ofewxuqfjhamgerwzull":
    errors.append("production project ref drifted")
for key in ["database_changed", "edge_deployed", "frontend_switched", "auth_changed", "data_changed", "nav_changed"]:
    if production.get(key) is not False:
        errors.append(f"production.{key} must remain false")

if rbac_contract.get("status") != "source_only_not_applied":
    errors.append("RBAC/receipts dependency must remain source_only_not_applied")
if rbac_contract.get("production", {}).get("database_changed") is not False:
    errors.append("RBAC/receipts contract must not claim production apply")

if runtime.get("status") != "completed_clean":
    errors.append("staging runtime smoke must remain completed_clean")
if transport.get("authenticated_ui_smoke", {}).get("completed") is not True:
    errors.append("authenticated staging UI smoke must remain completed")
if transport.get("production_boundary", {}).get("production_frontend_switch") is not False:
    errors.append("staging transport must preserve production frontend boundary")

require("generator", [
    "READ_SOURCE_BLOB_SHA = \"f001cec60245f1f48b8a0b71b8651fa84c6c4a6a\"",
    "UPDATE_SOURCE_BLOB_SHA = \"700728bbead1fb9270390aafb50cfe26816767cd\"",
    "production_rpc_candidate_rejected_on_staging",
    "production_rbac_receipts_dependency_missing",
    "production_installation_columns_missing",
    "installation_read_rpc_dependency_missing",
    "extensions_digest_dependency_missing",
    "20260723_02_installation_read_rpc_candidate.sql",
    "20260723_03_installation_update_rpc_candidate.sql",
])

with tempfile.TemporaryDirectory(prefix="installation-rpc-candidate-") as tmp:
    command = [sys.executable, str(FILES["generator"]), "--output-dir", tmp]
    completed = subprocess.run(command, cwd=ROOT, text=True, capture_output=True)
    if completed.returncode != 0:
        errors.append("generator failed: " + (completed.stderr or completed.stdout).strip())
        read_generated = ""
        update_generated = ""
    else:
        read_generated = (Path(tmp) / "20260723_02_installation_read_rpc_candidate.sql").read_text(encoding="utf-8")
        update_generated = (Path(tmp) / "20260723_03_installation_update_rpc_candidate.sql").read_text(encoding="utf-8")

    if read_generated:
        if source_body(texts["read_source"], READ_MARKER, "read") != generated_body(read_generated, READ_MARKER, "read"):
            errors.append("generated read RPC body differs from exact staging source body")
    if update_generated:
        if source_body(texts["update_source"], UPDATE_MARKER, "update") != generated_body(update_generated, UPDATE_MARKER, "update"):
            errors.append("generated update RPC body differs from exact staging source body")

    generated_outputs = {"read": read_generated, "update": update_generated}
    for name, output in generated_outputs.items():
        if not output:
            continue
        for marker in [
            "GENERATED SOURCE-ONLY PRODUCTION CANDIDATE",
            "Target project: lider-bsk production / ofewxuqfjhamgerwzull",
            "production_rpc_candidate_rejected_on_staging",
            "production_rbac_receipts_dependency_missing",
            "production_installation_columns_missing",
            "begin;",
            "commit;",
        ]:
            if marker not in output:
                errors.append(f"generated {name}: missing marker {marker!r}")
        if "otulfnouybahfnsycxqn" in output:
            errors.append(f"generated {name}: staging project ref leaked into production candidate")
        if output.count("leader_staging.environment_guard") != 1:
            errors.append(f"generated {name}: staging guard reference must occur exactly once in rejection preflight")
        if re.search(r"\bnav_[a-zA-Z0-9_]*", output):
            errors.append(f"generated {name}: nav_* objects are forbidden")
        if re.search(r"grant\s+execute\s+.*\s+to\s+(anon|authenticated)\b", output, re.I | re.S):
            errors.append(f"generated {name}: browser execute grant is forbidden")
        if "security invoker" not in output.lower():
            errors.append(f"generated {name}: SECURITY INVOKER marker missing")
        if "set search_path = ''" not in output:
            errors.append(f"generated {name}: empty search_path marker missing")

    for marker in [
        "installation.read permission is required",
        "client_name",
        "client_phone",
        "contractor_cost",
        "internal_comment",
        "limit 120",
        "limit 30",
        "limit 20",
        "revoke all on function public.leader_read_installation_job_rpc(uuid, uuid) from public, anon, authenticated",
        "grant execute on function public.leader_read_installation_job_rpc(uuid, uuid) to service_role",
    ]:
        if marker in ["client_name", "client_phone", "contractor_cost", "internal_comment"]:
            if marker in read_generated:
                errors.append(f"generated read output leaks forbidden field marker: {marker}")
        elif marker not in read_generated:
            errors.append(f"generated read output missing marker: {marker}")

    for marker in [
        "installation.write permission is required",
        "expected_updated_at",
        "idempotency_key",
        "extensions.digest",
        "pg_advisory_xact_lock",
        "for update",
        "Patch contains unknown or server-owned fields",
        "insert into public.leader_installation_events",
        "revoke execute on function public.leader_update_installation_job_rpc(jsonb)",
        "grant execute on function public.leader_update_installation_job_rpc(jsonb)",
        "installation_read_rpc_dependency_missing",
    ]:
        if marker not in update_generated:
            errors.append(f"generated update output missing marker: {marker}")

require("rollback", [
    "SOURCE-ONLY PRODUCTION RPC ROLLBACK CANDIDATE",
    "production_rpc_rollback_rejected_on_staging",
    "installation_command_receipts_present",
    "drop function if exists public.leader_update_installation_job_rpc(jsonb)",
    "drop function if exists public.leader_read_installation_job_rpc(uuid, uuid)",
    "leader_private.leader_role_action_matrix_v1",
    "leader_private.leader_command_receipts",
])
rollback_lower = texts.get("rollback", "").lower()
if "drop schema" in rollback_lower:
    errors.append("rollback must not drop schemas")
if "drop table" in rollback_lower:
    errors.append("RPC rollback must not drop tables")
if re.search(r"\bnav_[a-zA-Z0-9_]*", texts.get("rollback", "")):
    errors.append("rollback must not contain nav_* objects")

require("runbook", [
    "source_only_generator_ready_not_applied",
    "Production не изменялся во время подготовки RPC-кандидата.",
    "Git blob SHA",
    "production_rpc_candidate_rejected_on_staging",
    "installation_read_rpc_dependency_missing",
    "installation_command_receipts_present",
    "не выполнять broad schema drop",
    "Production database migration не применялась.",
    "`nav_*` не изменялся.",
])
runbook_lower = texts.get("runbook", "").lower()
for false_claim in [
    "production rpc применён",
    "production edge развёрнут",
    "production frontend переключён",
]:
    if false_claim in runbook_lower:
        errors.append(f"runbook contains false completion claim: {false_claim}")

require("route", [
    "mode: 'production_locked'",
    "enabled: false",
    "reason: 'production_backend_not_deployed'",
])
if "mode: 'production_edge'" in texts.get("route", ""):
    errors.append("production frontend route must remain locked")

require("workflow", [
    "python3 -m py_compile tools/generate_crm_installation_production_rpc_candidate.py",
    "python3 -m py_compile tools/check_crm_installation_production_rpc_candidate.py",
    "python3 tools/generate_crm_installation_production_rpc_candidate.py",
    "python3 tools/check_crm_installation_production_rpc_candidate.py",
    "installation-production-rpc-candidate-sql",
    "installation-production-rpc-candidate-diagnostics",
])

secret_patterns = [
    re.compile(r"sb_secret_[A-Za-z0-9_-]{20,}"),
    re.compile(r"eyJ[a-zA-Z0-9_-]{30,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}"),
]
for name in ["generator", "contract", "rollback", "runbook", "workflow"]:
    for pattern in secret_patterns:
        if pattern.search(texts.get(name, "")):
            errors.append(f"{name} contains a value resembling a secret")

if errors:
    print("\n".join(errors), file=sys.stderr)
    raise SystemExit(1)

print("Installation production RPC candidate is deterministic, source-identical after markers, service-role-only, rollback-guarded, and production remains unchanged.")
