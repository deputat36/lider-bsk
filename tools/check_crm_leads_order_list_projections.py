#!/usr/bin/env python3
"""Validate role-specific list_orders projections in leader-crm-leads."""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "supabase/functions/leader-crm-leads/index.ts"
SPEC = ROOT / "docs/CRM_SERVER_ACTION_RBAC_SPEC_2026-07-10.md"
DOC = ROOT / "docs/CRM_LEADS_ORDER_LIST_ROLE_PROJECTIONS_2026-07-16.md"
WORKFLOW = ROOT / ".github/workflows/crm-server-action-rbac-check.yml"

EXPECTED_MANAGER = [
    "id",
    "order_number",
    "created_at",
    "updated_at",
    "project_name",
    "client_name",
    "client_phone",
    "status",
    "deadline",
    "source",
    "layout_status",
    "production_status",
    "installation_status",
    "priority",
    "current_stage",
    "next_action",
    "progress_percent",
]
EXPECTED_ACCOUNTANT = [
    "id",
    "order_number",
    "created_at",
    "updated_at",
    "project_name",
    "status",
    "payment_status",
    "deadline",
    "client_total",
    "contractor_cost",
    "prepayment",
    "balance",
]

errors: list[str] = []


def read(path: Path) -> str:
    if not path.is_file():
        errors.append(f"missing file: {path.relative_to(ROOT)}")
        return ""
    return path.read_text(encoding="utf-8")


def require(text: str, marker: str, label: str) -> None:
    if marker not in text:
        errors.append(f"{label}: missing marker {marker!r}")


def projection(source: str, role: str) -> list[str]:
    match = re.search(
        rf"^\s*{re.escape(role)}:\s*'([^']+)'",
        source,
        flags=re.MULTILINE,
    )
    if not match:
        errors.append(f"source: missing {role} projection")
        return []
    return match.group(1).split(",")


source = read(SOURCE)
spec = read(SPEC)
doc = read(DOC)
workflow = read(WORKFLOW)

manager = projection(source, "manager")
accountant = projection(source, "accountant")
if manager != EXPECTED_MANAGER:
    errors.append(f"manager projection drift: {manager}")
if accountant != EXPECTED_ACCOUNTANT:
    errors.append(f"accountant projection drift: {accountant}")

for marker in (
    "const ORDER_LIST_FIELDS_BY_ROLE: Record<string, string> = {",
    "owner: orderFields",
    "admin: orderFields",
    "const ACCOUNTANT_GENERIC_ACTIONS = new Set([",
    "'list_orders'",
    "accountant: new Set(['orders.read'])",
    "function orderListFields(profile:",
    "return ORDER_LIST_FIELDS_BY_ROLE[profileRole(profile)] || ''",
    "const fields = orderListFields(profile)",
    "if (!fields) return forbidden('list_orders', profile)",
    "encodeURIComponent(fields)",
    "if (!canUseGenericLeads(checked.profile, action)) return forbidden(action, checked.profile)",
    "if (action === 'list_orders') return await listOrders(supabaseUrl, serviceRole, checked.profile)",
):
    require(source, marker, "source")

list_start = source.find("async function listOrders")
list_end = source.find("async function createLead", list_start)
list_block = source[list_start:list_end] if list_start >= 0 and list_end >= 0 else ""
if not list_block:
    errors.append("source: listOrders block missing")
else:
    projection_lookup = list_block.find("const fields = orderListFields(profile)")
    empty_guard = list_block.find("if (!fields) return forbidden('list_orders', profile)")
    rest_call = list_block.find("const res = await rest")
    if not 0 <= projection_lookup < empty_guard < rest_call:
        errors.append("source: projection must be selected and validated before REST")
    if "encodeURIComponent(orderFields)" in list_block:
        errors.append("source: listOrders still uses broad orderFields directly")

for field in ("payment_status", "client_total", "contractor_cost", "profit", "prepayment", "balance"):
    if field in manager:
        errors.append(f"manager projection leaked finance field: {field}")

for field in (
    "client_name",
    "client_phone",
    "lead_id",
    "client_id",
    "source",
    "layout_status",
    "production_status",
    "installation_status",
    "profit",
):
    if field in accountant:
        errors.append(f"accountant projection leaked non-required field: {field}")

for marker in (
    "`list_orders` обязан использовать role-specific field projection",
    "Для `manager` запрещены `contractor_cost`, `profit`",
    "Для `accountant` разрешены необходимые финансовые поля",
):
    require(spec, marker, "RBAC spec")

for marker in (
    "manager",
    "accountant",
    "orders.read",
    "client_phone",
    "contractor_cost",
    "Production Supabase не изменён",
):
    require(doc, marker, "documentation")

for marker in (
    "'tools/check_crm_leads_order_list_projections.py'",
    "'docs/CRM_LEADS_ORDER_LIST_ROLE_PROJECTIONS_2026-07-16.md'",
    "python3 tools/check_crm_leads_order_list_projections.py",
):
    require(workflow, marker, "workflow")

if errors:
    print("CRM leads order-list projection checks failed:", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    raise SystemExit(1)

print("CRM list_orders uses exact owner/admin, manager and accountant projections before REST.")
