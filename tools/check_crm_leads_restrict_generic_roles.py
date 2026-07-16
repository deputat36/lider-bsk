#!/usr/bin/env python3
"""Validate the source-only office-role gate in leader-crm-leads."""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "supabase/functions/leader-crm-leads/index.ts"
DOC = ROOT / "docs/CRM_LEADS_RESTRICT_GENERIC_ROLES_2026-07-16.md"
WORKFLOW = ROOT / ".github/workflows/crm-server-action-rbac-check.yml"

EXPECTED_CANONICAL = [
    "owner",
    "admin",
    "manager",
    "accountant",
    "designer",
    "installer",
    "contractor",
]
EXPECTED_GENERIC = ["owner", "admin", "manager"]


def extract_set(source: str, name: str) -> list[str]:
    match = re.search(
        rf"const {re.escape(name)} = new Set\(\[\s*(.*?)\s*\]\)",
        source,
        flags=re.DOTALL,
    )
    if not match:
        raise AssertionError(f"missing set: {name}")
    return re.findall(r"'([^']+)'", match.group(1))


def require(text: str, marker: str, label: str) -> None:
    if marker not in text:
        raise AssertionError(f"{label}: missing marker {marker!r}")


def main() -> int:
    source = SOURCE.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")

    canonical = extract_set(source, "CANONICAL_ROLES")
    generic = extract_set(source, "GENERIC_LEADS_ROLES")
    if canonical != EXPECTED_CANONICAL:
        raise AssertionError(f"canonical roles drift: {canonical}")
    if generic != EXPECTED_GENERIC:
        raise AssertionError(f"generic leads roles drift: {generic}")

    required_source_markers = [
        "function profileRole(profile:",
        "function canUseGenericLeads(profile:",
        "CANONICAL_ROLES.has(currentRole) && GENERIC_LEADS_ROLES.has(currentRole)",
        "return json(403, { error: 'forbidden', action, role: profileRole(profile) })",
        "if (action === 'ensure_profile') return await ensureProfile(req, supabaseUrl, anonKey, serviceRole)",
        "const checked = await checkUser(req, supabaseUrl, anonKey, serviceRole)",
        "if (checked.error) return checked.error",
        "if (!canUseGenericLeads(checked.profile)) return forbidden(action, checked.profile)",
        "&is_active=eq.true&select=user_id,email,role,is_active&limit=1",
        "body: JSON.stringify({ user_id: userId, email, role: 'manager', is_active: false })",
        "return json(400, { error: 'unknown_action' })",
    ]
    for marker in required_source_markers:
        require(source, marker, "source")

    ensure_profile = source.index("if (action === 'ensure_profile')")
    check_user = source.index("const checked = await checkUser")
    checked_error = source.index("if (checked.error) return checked.error")
    role_guard = source.index("if (!canUseGenericLeads(checked.profile))")
    owner_id = source.index("const ownerId = checked.user.id as string")
    dashboard_dispatch = source.index("if (action === 'dashboard')")
    if not ensure_profile < check_user < checked_error < role_guard < owner_id < dashboard_dispatch:
        raise AssertionError("generic role guard ordering drift")

    for role in ("accountant", "designer", "installer", "contractor"):
        if role in generic:
            raise AssertionError(f"restricted role entered generic endpoint: {role}")

    required_doc_markers = [
        "owner/admin/manager",
        "ensure_profile",
        "is_active=false",
        "403 forbidden",
        "leader-crm-leads v12",
        "Source-only",
        "Production Supabase не изменяется",
    ]
    for marker in required_doc_markers:
        require(doc, marker, "documentation")

    required_workflow_markers = [
        "docs/CRM_LEADS_RESTRICT_GENERIC_ROLES_2026-07-16.md",
        "tools/check_crm_leads_restrict_generic_roles.py",
        "python3 tools/check_crm_leads_restrict_generic_roles.py",
    ]
    for marker in required_workflow_markers:
        require(workflow, marker, "workflow")

    print("CRM leads generic Edge endpoint is restricted to owner/admin/manager before business calls.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
