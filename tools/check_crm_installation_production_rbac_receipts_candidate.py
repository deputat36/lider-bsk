#!/usr/bin/env python3

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    "migration": ROOT / "supabase/production-candidates/20260723_01_installation_rbac_receipts_candidate.sql",
    "rollback": ROOT / "supabase/production-candidates/rollback/20260723_01_installation_rbac_receipts_candidate_rollback.sql",
    "contract": ROOT / "contracts/crm-installation-production-rbac-receipts-candidate-v1.json",
    "canonical": ROOT / "contracts/crm-v4-role-action-matrix-v1.json",
    "readiness": ROOT / "contracts/crm-installation-production-rollout-readiness-v1.json",
    "runbook": ROOT / "docs/CRM_INSTALLATION_PRODUCTION_RBAC_RECEIPTS_CANDIDATE_V1_2026-07-23.md",
    "route": ROOT / "crm/v4/assets/v4/installation-job-save-route-v1.js",
    "workflow": ROOT / ".github/workflows/crm-installation-production-rbac-receipts-candidate-check.yml",
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


def load_json(name):
    try:
        return json.loads(texts.get(name, "{}"))
    except json.JSONDecodeError as exc:
        errors.append(f"Invalid JSON in {name}: {exc}")
        return {}


contract = load_json("contract")
canonical = load_json("canonical")
readiness = load_json("readiness")

if contract.get("version") != 1:
    errors.append("candidate contract version must be 1")
if contract.get("status") != "source_only_not_applied":
    errors.append("candidate must remain source_only_not_applied")
if contract.get("approval_gate", {}).get("approved") is not False:
    errors.append("production database approval must remain false")

production = contract.get("production", {})
if production.get("project_ref") != "ofewxuqfjhamgerwzull":
    errors.append("production project ref drifted")
for key in ["database_changed", "edge_deployed", "frontend_switched", "auth_changed", "data_changed", "nav_changed"]:
    if production.get(key) is not False:
        errors.append(f"production.{key} must remain false")

if readiness.get("status") != "read_only_audit_complete_source_package_required":
    errors.append("readiness contract must remain at source-package gate")

migration = texts.get("migration", "")
rollback = texts.get("rollback", "")
runbook = texts.get("runbook", "")
route = texts.get("route", "")

require("migration", [
    "SOURCE-ONLY PRODUCTION CANDIDATE",
    "Target project: lider-bsk production / ofewxuqfjhamgerwzull",
    "production_candidate_rejected_on_staging",
    "production_rbac_or_receipts_already_present",
    "unknown_production_roles",
    "create table leader_private.leader_role_action_matrix_v1",
    "create or replace function leader_private.leader_actor_has_crm_action(",
    "create or replace function public.leader_actor_has_crm_action_rpc(",
    "create table leader_private.leader_command_receipts",
    "alter table leader_private.leader_role_action_matrix_v1 enable row level security",
    "alter table leader_private.leader_command_receipts enable row level security",
    "revoke all on table leader_private.leader_role_action_matrix_v1 from public, anon, authenticated",
    "revoke all on table leader_private.leader_command_receipts from public, anon, authenticated",
    "revoke all on function public.leader_actor_has_crm_action_rpc(uuid, text)",
    "grant execute on function public.leader_actor_has_crm_action_rpc(uuid, text)",
    "to service_role",
    "unique (action, idempotency_key)",
    "unique (action, request_id)",
    "request_hash ~ '^[0-9a-f]{64}$'",
    "-- MATRIX_JSON_BEGIN",
    "-- MATRIX_JSON_END",
])

for forbidden in [
    "otulfnouybahfnsycxqn",
    "leader_create_design_task",
    "leader_create_calculation",
    "leader_create_offer",
    "leader_read_installation_job_rpc",
    "leader_update_installation_job_rpc",
    "leader-crm-installation",
    "pg_net",
    "leader-staging-installation-smoke-bootstrap",
]:
    if forbidden in migration:
        errors.append(f"migration contains excluded dependency: {forbidden}")

if re.search(r"\bnav_[a-zA-Z0-9_]*", migration):
    errors.append("migration must not contain nav_* objects")
if "drop schema" in migration.lower():
    errors.append("migration must not drop schemas")
if re.search(r"grant\s+.*\s+to\s+(anon|authenticated)\b", migration, re.I):
    errors.append("migration must not grant candidate objects to browser roles")
if re.search(r"alter\s+table\s+public\.", migration, re.I):
    errors.append("candidate must not alter existing public tables")

matrix_match = re.search(r"-- MATRIX_JSON_BEGIN.*?v_matrix jsonb := \$matrix\$\s*(\{.*?\})\s*\$matrix\$::jsonb;.*?-- MATRIX_JSON_END", migration, re.S)
if not matrix_match:
    errors.append("canonical matrix JSON block was not found")
else:
    try:
        migration_matrix = json.loads(matrix_match.group(1))
        if migration_matrix != canonical.get("roles"):
            errors.append("migration matrix differs from contracts/crm-v4-role-action-matrix-v1.json")
    except json.JSONDecodeError as exc:
        errors.append(f"migration matrix JSON is invalid: {exc}")

require("rollback", [
    "SOURCE-ONLY PRODUCTION ROLLBACK CANDIDATE",
    "production_rollback_rejected_on_staging",
    "installation_rpc_dependency_present",
    "command_receipts_not_empty",
    "drop function if exists public.leader_actor_has_crm_action_rpc(uuid, text)",
    "drop function if exists leader_private.leader_actor_has_crm_action(uuid, text)",
    "drop table if exists leader_private.leader_command_receipts",
    "drop table if exists leader_private.leader_role_action_matrix_v1",
    "Deliberately preserve leader_private schema",
])
if "drop schema" in rollback.lower():
    errors.append("rollback must preserve leader_private schema")
if re.search(r"\bnav_[a-zA-Z0-9_]*", rollback):
    errors.append("rollback must not contain nav_* objects")

require("runbook", [
    "Production не изменялся во время подготовки кандидата.",
    "source_only_not_applied",
    "Approval gate",
    "Gate 1 — production database",
    "production_candidate_rejected_on_staging",
    "command_receipts_not_empty",
    "не выполнять broad schema drop",
    "Production database migration не применялась.",
    "`nav_*` не изменялся.",
])
runbook_lower = runbook.lower()
for false_claim in [
    "production migration применена",
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
if "mode: 'production_edge'" in route:
    errors.append("production frontend route must remain locked")

require("workflow", [
    "python3 -m py_compile tools/check_crm_installation_production_rbac_receipts_candidate.py",
    "python3 tools/check_crm_installation_production_rbac_receipts_candidate.py",
    "installation-production-rbac-receipts-candidate-diagnostics",
])

secret_patterns = [
    re.compile(r"sb_secret_[A-Za-z0-9_-]{20,}"),
    re.compile(r"eyJ[a-zA-Z0-9_-]{30,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}"),
]
for name in ["migration", "rollback", "contract", "runbook", "workflow"]:
    for pattern in secret_patterns:
        if pattern.search(texts.get(name, "")):
            errors.append(f"{name} contains a value resembling a secret")

if errors:
    print("\n".join(errors), file=sys.stderr)
    raise SystemExit(1)

print("Installation production RBAC/receipts candidate is source-only, canonical, service-role-only, rollback-guarded, and production remains unchanged.")
