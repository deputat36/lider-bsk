#!/usr/bin/env python3

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    "generator": ROOT / "tools/generate_crm_installation_production_edge_candidate.py",
    "contract": ROOT / "contracts/crm-installation-production-edge-candidate-v1.json",
    "rbac_contract": ROOT / "contracts/crm-installation-production-rbac-receipts-candidate-v1.json",
    "rpc_contract": ROOT / "contracts/crm-installation-production-rpc-candidate-v1.json",
    "index_source": ROOT / "supabase/staging-functions/leader-crm-installation/index.ts",
    "contract_source": ROOT / "supabase/staging-functions/leader-crm-installation/contract.ts",
    "rollback": ROOT / "supabase/production-candidates/edge/leader-crm-installation-rollback/index.ts",
    "runbook": ROOT / "docs/CRM_INSTALLATION_PRODUCTION_EDGE_CANDIDATE_V1_2026-07-23.md",
    "route": ROOT / "crm/v4/assets/v4/installation-job-save-route-v1.js",
    "workflow": ROOT / ".github/workflows/crm-installation-production-edge-candidate-check.yml",
}

STAGING_REF = "otulfnouybahfnsycxqn"
PRODUCTION_REF = "ofewxuqfjhamgerwzull"
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
rbac_contract = load_json("rbac_contract")
rpc_contract = load_json("rpc_contract")

if contract.get("version") != 1:
    errors.append("Edge candidate contract version must be 1")
if contract.get("status") != "source_only_generator_ready_not_deployed":
    errors.append("Edge candidate status drifted")

production = contract.get("production", {})
if production.get("project_ref") != PRODUCTION_REF:
    errors.append("production project ref drifted")
if production.get("function_slug") != "leader-crm-installation":
    errors.append("production function slug drifted")
for key in ["database_changed", "edge_deployed", "frontend_switched", "auth_changed", "data_changed", "nav_changed"]:
    if production.get(key) is not False:
        errors.append(f"production.{key} must remain false")

if rbac_contract.get("status") != "source_only_not_applied":
    errors.append("RBAC/receipts dependency must remain source-only")
if rpc_contract.get("status") != "source_only_generator_ready_not_applied":
    errors.append("RPC dependency must remain source-only")

require("generator", [
    "INDEX_SOURCE_BLOB_SHA = \"a603fc11db7dc66435c6fea4c3547775d79feac9\"",
    "CONTRACT_SOURCE_BLOB_SHA = \"940c39edac833417aa1727ca04badd52fb5a415c\"",
    "STAGING_PROJECT_REF = \"otulfnouybahfnsycxqn\"",
    "PRODUCTION_PROJECT_REF = \"ofewxuqfjhamgerwzull\"",
    "expected: 'production'",
    "verify_jwt\": True",
    "deploy-manifest.json",
])

with tempfile.TemporaryDirectory(prefix="installation-edge-candidate-") as tmp:
    completed = subprocess.run(
        [sys.executable, str(FILES["generator"]), "--output-dir", tmp],
        cwd=ROOT,
        text=True,
        capture_output=True,
    )
    if completed.returncode != 0:
        errors.append("generator failed: " + (completed.stderr or completed.stdout).strip())
        generated_index = ""
        generated_contract = ""
        manifest = {}
    else:
        generated_index = (Path(tmp) / "index.ts").read_text(encoding="utf-8")
        generated_contract = (Path(tmp) / "contract.ts").read_text(encoding="utf-8")
        try:
            manifest = json.loads((Path(tmp) / "deploy-manifest.json").read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            errors.append(f"generated manifest is invalid JSON: {exc}")
            manifest = {}

    expected_index = texts["index_source"].replace("STAGING_PROJECT_REF", "PRODUCTION_PROJECT_REF")
    expected_index = expected_index.replace("expected: 'staging'", "expected: 'production'")
    expected_contract = texts["contract_source"].replace(
        f"export const STAGING_PROJECT_REF = '{STAGING_REF}'",
        f"export const PRODUCTION_PROJECT_REF = '{PRODUCTION_REF}'",
    )

    if generated_index != expected_index:
        errors.append("generated index.ts differs from exact environment-only transform")
    if generated_contract != expected_contract:
        errors.append("generated contract.ts differs from exact environment-only transform")

    for name, output in [("index", generated_index), ("contract", generated_contract)]:
        if STAGING_REF in output or "STAGING_PROJECT_REF" in output:
            errors.append(f"generated {name} still contains staging identity")
        if PRODUCTION_REF not in generated_contract and name == "contract":
            errors.append("generated contract lacks production project ref")

    for marker in [
        "missing_or_invalid_jwt",
        "/auth/v1/user",
        "/rest/v1/rpc/leader_actor_has_crm_action_rpc",
        "/rest/v1/rpc/leader_read_installation_job_rpc",
        "/rest/v1/rpc/leader_update_installation_job_rpc",
        "INSTALLATION_READ_ACTION",
        "INSTALLATION_UPDATE_ACTION",
        "MAX_BODY_BYTES",
        "method_not_allowed",
        "payload_too_large",
        "permission_check_failed",
        "expected: 'production'",
    ]:
        if marker not in generated_index:
            errors.append(f"generated index missing marker: {marker}")

    for marker in [
        "installation_job.read",
        "installation.read",
        "installation_job.update",
        "installation.write",
        "PATCH_FIELDS",
        "idempotency_key",
        "expected_updated_at",
        "MAX_BODY_BYTES = 64 * 1024",
        f"PRODUCTION_PROJECT_REF = '{PRODUCTION_REF}'",
    ]:
        if marker not in generated_contract:
            errors.append(f"generated contract missing marker: {marker}")

    target = manifest.get("target", {})
    if target.get("project_ref") != PRODUCTION_REF:
        errors.append("generated manifest project ref drifted")
    if target.get("function_slug") != "leader-crm-installation":
        errors.append("generated manifest slug drifted")
    if target.get("verify_jwt") is not True:
        errors.append("generated manifest must require JWT")
    if manifest.get("status") != "source_only_not_deployed":
        errors.append("generated manifest status drifted")
    if manifest.get("approval_gates", {}).get("edge_deploy_approved") is not False:
        errors.append("generated manifest must not approve production deploy")
    if manifest.get("production_boundary", {}).get("edge_deployed") is not False:
        errors.append("generated manifest must preserve production Edge boundary")

require("rollback", [
    "production_installation_temporarily_disabled",
    "leader-crm-installation-production-rollback-v1",
    "return json(503",
    "method_not_allowed",
])
rollback = texts.get("rollback", "")
for forbidden in [
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SECRET_KEYS",
    "/auth/v1/user",
    "/rest/v1/rpc/",
    STAGING_REF,
]:
    if forbidden in rollback:
        errors.append(f"rollback function contains forbidden marker: {forbidden}")

require("runbook", [
    "source_only_generator_ready_not_deployed",
    "Production Edge не развёртывался во время подготовки кандидата.",
    "verify_jwt=true",
    "production_locked",
    "production_installation_temporarily_disabled",
    "Production database не изменялась.",
    "`nav_*` не изменялся.",
])
runbook_lower = texts.get("runbook", "").lower()
for false_claim in [
    "production edge развёрнут",
    "production frontend переключён",
    "production database применена",
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
    "python3 -m py_compile tools/generate_crm_installation_production_edge_candidate.py",
    "python3 -m py_compile tools/check_crm_installation_production_edge_candidate.py",
    "python3 tools/generate_crm_installation_production_edge_candidate.py",
    "python3 tools/check_crm_installation_production_edge_candidate.py",
    "installation-production-edge-candidate-package",
    "installation-production-edge-candidate-diagnostics",
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

print("Installation production Edge candidate is deterministic, environment-only, JWT-enforced, rollback-ready, and production remains locked.")
