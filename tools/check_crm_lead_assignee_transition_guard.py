#!/usr/bin/env python3

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    "model": ROOT / "crm/v4/assets/v4/lead-assignee-transition-guard-model-v1.js",
    "ui": ROOT / "crm/v4/assets/v4/lead-assignee-transition-guard-v1.js",
    "loader": ROOT / "crm/v4/assets/v4/lead-analytics-badges-v1.js",
    "test": ROOT / "tools/test_lead_assignee_transition_guard.mjs",
    "contract": ROOT / "contracts/crm-lead-assignee-transition-guard-v1.json",
    "docs": ROOT / "docs/CRM_LEAD_ASSIGNEE_TRANSITION_GUARD_V1_2026-07-23.md",
    "workflow": ROOT / ".github/workflows/crm-lead-assignee-transition-guard-check.yml",
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
    text = texts.get(name, "")
    for marker in markers:
        if marker not in text:
            errors.append(f"{name}: missing marker {marker!r}")


required_statuses = [
    "В работе",
    "Уточнение деталей",
    "Расчёт подготовлен",
    "КП отправлено",
    "Ждём ответ",
    "Нужно пересчитать",
    "Согласовано",
]

require("model", [
    "LEAD_ASSIGNEE_REQUIRED_STATUSES",
    "leadStatusRequiresAssignee",
    "leadHasAssignee",
    "evaluateLeadAssigneeTransition",
    "assignee_required",
    "no_change",
    "Сначала назначьте ответственного",
    *required_statuses,
])

require("ui", [
    "leader-v4:lead-card-rendered",
    "data-lead-status",
    "dataset.assigneeTransitionBlocked",
    "aria-disabled",
    "stopImmediatePropagation",
    "focusAssignmentAction",
    "evaluateLeadAssigneeTransition",
    "Статусы отказа и спама доступны без назначения",
])

require("loader", [
    "./lead-assignee-transition-guard-v1.js?v=20260723-1",
])

require("test", [
    "assert.equal(blocked.allowed, false)",
    "assert.equal(assigned.allowed, true)",
    "assert.equal(refusal.allowed, true)",
    "assert.equal(spam.allowed, true)",
    "assert.equal(unchangedHistorical.code, 'no_change')",
])

for name in ["model", "ui"]:
    lowered = texts.get(name, "").lower()
    for forbidden in [
        "supabaseclient",
        ".from(",
        ".insert(",
        ".update(",
        ".delete(",
        ".upsert(",
        ".rpc(",
        "service_role",
        "secret key",
    ]:
        if forbidden in lowered:
            errors.append(f"{name}: forbidden data-access marker {forbidden!r}")

try:
    contract = json.loads(texts.get("contract", "{}"))
except json.JSONDecodeError as exc:
    errors.append(f"Invalid contract JSON: {exc}")
    contract = {}

if contract.get("version") != 1:
    errors.append("contract version must be 1")
if contract.get("issue") != 447:
    errors.append("contract issue must be 447")
if contract.get("status") != "frontend_guard_ready":
    errors.append("contract status drifted")
if contract.get("required_statuses") != required_statuses:
    errors.append("contract required statuses drifted")
if contract.get("allowed_without_assignee") != ["Отказ", "Спам"]:
    errors.append("contract closing statuses drifted")

behavior = contract.get("behavior", {})
for key in [
    "pure_model",
    "buttons_disabled_when_blocked",
    "visible_explanation",
    "capture_phase_fail_closed_guard",
    "focuses_primary_assignment_action",
    "same_status_is_not_treated_as_transition",
]:
    if behavior.get(key) is not True:
        errors.append(f"behavior.{key} must be true")
if behavior.get("historical_data_backfill") is not False:
    errors.append("historical_data_backfill must remain false")

limitations = contract.get("limitations", {})
for key in [
    "server_side_enforcement",
    "direct_rest_or_edge_bypass_prevented",
    "canonical_backend_transition_contract_ready",
]:
    if limitations.get(key) is not False:
        errors.append(f"limitations.{key} must remain false")

boundary = contract.get("production_boundary", {})
for key in [
    "production_ddl",
    "production_dml",
    "edge_deploy",
    "auth_changed",
    "rls_or_grants_changed",
    "storage_changed",
    "nav_changed",
]:
    if boundary.get(key) is not False:
        errors.append(f"production_boundary.{key} must remain false")

require("docs", [
    "Это удобный fail-closed слой интерфейса, но не окончательное server-side enforcement.",
    "Production Supabase остаётся без изменений.",
    "Статусы `Отказ` и `Спам` остаются доступны",
    "Окончательное правило должно войти в canonical backend-контракт",
])

require("workflow", [
    "node --check crm/v4/assets/v4/lead-assignee-transition-guard-model-v1.js",
    "node --check crm/v4/assets/v4/lead-assignee-transition-guard-v1.js",
    "node tools/test_lead_assignee_transition_guard.mjs",
    "python3 tools/check_crm_lead_assignee_transition_guard.py",
])

if errors:
    print("\n".join(errors), file=sys.stderr)
    raise SystemExit(1)

print("CRM lead assignee transition guard is source-only, fail-closed, tested, and production-safe.")
