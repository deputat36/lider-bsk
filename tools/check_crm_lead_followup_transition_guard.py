#!/usr/bin/env python3

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    "model": ROOT / "crm/v4/assets/v4/lead-followup-transition-guard-model-v1.js",
    "ui": ROOT / "crm/v4/assets/v4/lead-followup-transition-guard-v1.js",
    "loader": ROOT / "crm/v4/assets/v4/lead-analytics-badges-v1.js",
    "test": ROOT / "tools/test_lead_followup_transition_guard.mjs",
    "contract": ROOT / "contracts/crm-lead-followup-transition-guard-v1.json",
    "docs": ROOT / "docs/CRM_LEAD_FOLLOWUP_TRANSITION_GUARD_V1_2026-07-23.md",
    "workflow": ROOT / ".github/workflows/crm-lead-followup-transition-guard-check.yml",
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


required_statuses = ["КП отправлено", "Ждём ответ"]
required_actions = ["mark-offer-sent"]

require("model", [
    "LEAD_FOLLOWUP_REQUIRED_STATUSES",
    "OFFER_FOLLOWUP_REQUIRED_ACTIONS",
    "leadFollowupState",
    "evaluateLeadFollowupTransition",
    "evaluateOfferFollowupAction",
    "key: 'missing'",
    "key: 'invalid'",
    "key: 'overdue'",
    "key: 'scheduled'",
    "code: `followup_${followup.key}`",
    "future_followup_present",
    "Сначала назначьте будущую дату возврата к клиенту",
    *required_statuses,
    *required_actions,
])

require("ui", [
    "data-followup-transition-blocked",
    "data-followup-offer-blocked",
    "aria-disabled",
    "stopImmediatePropagation",
    "leadNextContactDetails",
    "leadNextContactInput",
    "#leadCardSection [data-lead-status]",
    "button[data-action=\"mark-offer-sent\"]",
    "MutationObserver",
    "subscribeState",
    "evaluateLeadFollowupTransition",
    "evaluateOfferFollowupAction",
    "if (note.textContent !== message) note.textContent = message;",
])

require("loader", [
    "./lead-followup-transition-guard-v1.js?v=20260723-1",
])

require("test", [
    "assert.equal(missing.allowed, false)",
    "assert.equal(overdue.code, 'followup_overdue')",
    "assert.equal(scheduled.allowed, true)",
    "assert.equal(offerBlocked.allowed, false)",
    "assert.equal(offerAllowed.allowed, true)",
    "assert.equal(offerUnrelated.allowed, true)",
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
if contract.get("issue") != 449:
    errors.append("contract issue must be 449")
if contract.get("status") != "frontend_guard_ready":
    errors.append("contract status drifted")
if contract.get("required_lead_statuses") != required_statuses:
    errors.append("required lead statuses drifted")
if contract.get("required_offer_actions") != required_actions:
    errors.append("required offer actions drifted")

rule = contract.get("followup_rule", {})
if rule.get("field") != "leader_leads.next_contact_at":
    errors.append("followup field drifted")
for key in [
    "must_parse_as_datetime",
    "must_be_after_current_time",
    "missing_is_blocked",
    "invalid_is_blocked",
    "overdue_is_blocked",
]:
    if rule.get(key) is not True:
        errors.append(f"followup_rule.{key} must be true")

behavior = contract.get("behavior", {})
for key in [
    "pure_model",
    "capture_phase_guard",
    "manual_lead_transition_guarded",
    "offer_sent_action_guarded",
    "visible_explanation",
    "focuses_next_contact_input",
    "other_statuses_unaffected",
    "other_offer_actions_unaffected",
]:
    if behavior.get(key) is not True:
        errors.append(f"behavior.{key} must be true")
if behavior.get("historical_data_backfill") is not False:
    errors.append("historical_data_backfill must remain false")

limitations = contract.get("limitations", {})
for key in [
    "server_side_enforcement",
    "direct_rest_or_edge_bypass_prevented",
    "transactional_status_and_followup_validation",
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
    "Это source-only frontend guard, а не server-side enforcement.",
    "Production Supabase остаётся без изменений.",
    "ручной переход заявки в `КП отправлено`",
    "действие КП `mark-offer-sent`",
    "находиться в будущем относительно момента действия",
])

require("workflow", [
    "node --check crm/v4/assets/v4/lead-followup-transition-guard-model-v1.js",
    "node --check crm/v4/assets/v4/lead-followup-transition-guard-v1.js",
    "node tools/test_lead_followup_transition_guard.mjs",
    "python3 tools/check_crm_lead_followup_transition_guard.py",
])

if errors:
    print("\n".join(errors), file=sys.stderr)
    raise SystemExit(1)

print("CRM lead followup transition guard is source-only, fail-closed, tested, and production-safe.")
