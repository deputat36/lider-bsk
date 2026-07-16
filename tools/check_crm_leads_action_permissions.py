#!/usr/bin/env python3
"""Validate the fail-closed action permission registry in leader-crm-leads."""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "supabase/functions/leader-crm-leads/index.ts"
UI_REGISTRY = ROOT / "crm/v4/assets/v4/action-permissions-v1.js"
DOC = ROOT / "docs/CRM_LEADS_ACTION_PERMISSION_REGISTRY_2026-07-16.md"
WORKFLOW = ROOT / ".github/workflows/crm-server-action-rbac-check.yml"

EXPECTED = {
    "dashboard": "leads.read",
    "list": "leads.read",
    "list_orders": "orders.read",
    "create": "leads.create",
    "update": "leads.update",
    "ensure_client": "clients.write",
    "create_order": "orders.create",
    "create_order_from_offer": "orders.create",
}


def require(text: str, marker: str, label: str) -> None:
    if marker not in text:
        raise AssertionError(f"{label}: missing marker {marker!r}")


def extract_action_map(source: str) -> dict[str, str]:
    match = re.search(
        r"const ACTION_PERMISSION: Record<string, string> = \{\s*(.*?)\s*\}",
        source,
        flags=re.DOTALL,
    )
    if not match:
        raise AssertionError("ACTION_PERMISSION registry missing")
    pairs = re.findall(r"^\s*([a-z_]+):\s*'([^']+)',?\s*$", match.group(1), flags=re.MULTILINE)
    return dict(pairs)


def main() -> int:
    source = SOURCE.read_text(encoding="utf-8")
    ui_registry = UI_REGISTRY.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")

    action_map = extract_action_map(source)
    if action_map != EXPECTED:
        raise AssertionError(f"action permission drift: {action_map}")

    dispatched = set(re.findall(r"if \(action === '([^']+)'\) return await", source))
    business_dispatch = dispatched - {"ensure_profile"}
    if business_dispatch != set(EXPECTED):
        raise AssertionError(f"dispatch/action registry mismatch: {sorted(business_dispatch)}")

    for permission in sorted(set(EXPECTED.values())):
        require(ui_registry, f"'{permission}'", "UI action registry")

    required_source_markers = [
        "const ROLE_PERMISSIONS: Record<string, Set<string>> = {",
        "owner: new Set(['*'])",
        "admin: new Set(['*'])",
        "manager: new Set(Object.values(ACTION_PERMISSION))",
        "function canRunGenericAction(profile:",
        "const permissions = ROLE_PERMISSIONS[profileRole(profile)]",
        "permissions?.has('*') || permissions?.has(permission)",
        "const permission = ACTION_PERMISSION[action]",
        "if (!permission) return json(400, { error: 'unknown_action' })",
        "if (!canRunGenericAction(checked.profile, permission)) return forbidden(action, checked.profile)",
    ]
    for marker in required_source_markers:
        require(source, marker, "source")

    checked_error = source.index("if (checked.error) return checked.error")
    role_guard = source.index("if (!canUseGenericLeads(checked.profile))")
    permission_lookup = source.index("const permission = ACTION_PERMISSION[action]")
    unknown_guard = source.index("if (!permission) return json(400, { error: 'unknown_action' })")
    permission_guard = source.index("if (!canRunGenericAction(checked.profile, permission))")
    owner_id = source.index("const ownerId = checked.user.id as string")
    first_dispatch = source.index("if (action === 'dashboard')")
    if not checked_error < role_guard < permission_lookup < unknown_guard < permission_guard < owner_id < first_dispatch:
        raise AssertionError("action permission guard ordering drift")

    if source.count("return json(400, { error: 'unknown_action' })") != 2:
        raise AssertionError("unknown_action guard/fallback count drift")

    required_doc_markers = [
        "ACTION_PERMISSION",
        "dashboard → leads.read",
        "create_order_from_offer → orders.create",
        "fail closed",
        "leader-crm-leads v12",
        "Production Supabase не изменяется",
    ]
    for marker in required_doc_markers:
        require(doc, marker, "documentation")

    required_workflow_markers = [
        "docs/CRM_LEADS_ACTION_PERMISSION_REGISTRY_2026-07-16.md",
        "tools/check_crm_leads_action_permissions.py",
        "python3 tools/check_crm_leads_action_permissions.py",
    ]
    for marker in required_workflow_markers:
        require(workflow, marker, "workflow")

    print("CRM leads actions and canonical permission keys are synchronized and fail closed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
