#!/usr/bin/env python3
"""Validate privacy-safe projection for create_order_from_offer."""

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
EDGE = ROOT / "supabase/functions/leader-crm-leads/index.ts"
CALLER = ROOT / "crm/v4/assets/v4/offer-order-create-v1.js"
MIGRATION = ROOT / "supabase/migrations/20260626_06_leader_order_from_offer_rpc.sql"
DOC = ROOT / "docs/CRM_OFFER_ORDER_SAFE_RESPONSE_PROJECTION_2026-07-16.md"
WORKFLOW = ROOT / ".github/workflows/crm-server-action-rbac-check.yml"

EXPECTED_ORDER_FIELDS = {
    "id",
    "order_number",
    "project_name",
    "status",
    "deadline",
    "layout_status",
    "production_status",
    "installation_status",
    "created_at",
    "updated_at",
}
EXPECTED_RESULT_FIELDS = {
    "ok",
    "already_created",
    "order",
    "items_created",
    "link_errors",
}
SENSITIVE_ORDER_FIELDS = {
    "owner_id",
    "client_id",
    "lead_id",
    "client_name",
    "client_phone",
    "payment_status",
    "contractor_cost",
    "client_total",
    "profit",
    "prepayment",
    "balance",
    "source",
    "layout_link",
    "layout_comment",
    "internal_comment",
    "public_comment",
    "production_comment",
    "contractor_id",
    "contractor_name",
    "installation_address",
    "installer_name",
    "installer_phone",
    "data",
}

errors: list[str] = []


def read(path: Path) -> str:
    if not path.is_file():
        errors.append(f"missing file: {path.relative_to(ROOT)}")
        return ""
    return path.read_text(encoding="utf-8")


def function_block(source: str, name: str, next_marker: str) -> str:
    start = source.find(f"function {name}")
    if start < 0:
        errors.append(f"edge: missing function {name}")
        return ""
    end = source.find(next_marker, start)
    if end < 0:
        errors.append(f"edge: missing boundary after {name}: {next_marker}")
        return ""
    return source[start:end]


def object_fields(block: str) -> set[str]:
    match = re.search(r"return\s+\{(?P<body>.*?)\n\s*\}", block, re.S)
    if not match:
        errors.append("projection: return object not found")
        return set()
    fields: set[str] = set()
    for raw_line in match.group("body").splitlines():
        line = raw_line.strip().rstrip(",")
        if not line or line.startswith("..."):
            continue
        key = line.split(":", 1)[0].strip()
        if re.fullmatch(r"[a-z_][a-z0-9_]*", key):
            fields.add(key)
    return fields


edge = read(EDGE)
caller = read(CALLER)
migration = read(MIGRATION)
doc = read(DOC)
workflow = read(WORKFLOW)

order_projection = function_block(edge, "projectOfferOrder", "function projectOfferOrderResult")
result_projection = function_block(edge, "projectOfferOrderResult", "async function ensureProfile")
handler_start = edge.find("async function createOrderFromOffer")
handler_end = edge.find("Deno.serve", handler_start)
handler = edge[handler_start:handler_end] if handler_start >= 0 and handler_end >= 0 else ""
if not handler:
    errors.append("edge: createOrderFromOffer handler not found")

order_fields = object_fields(order_projection)
if order_fields != EXPECTED_ORDER_FIELDS:
    errors.append(
        "projection: order fields drift: "
        f"expected={sorted(EXPECTED_ORDER_FIELDS)} actual={sorted(order_fields)}"
    )

result_fields = object_fields(result_projection)
if result_fields != EXPECTED_RESULT_FIELDS:
    errors.append(
        "projection: result fields drift: "
        f"expected={sorted(EXPECTED_RESULT_FIELDS)} actual={sorted(result_fields)}"
    )

for field in sorted(SENSITIVE_ORDER_FIELDS):
    if re.search(rf"\b{re.escape(field)}\b", order_projection):
        errors.append(f"projection: sensitive field leaked: {field}")

for marker in (
    "const projected = projectOfferOrderResult(await res.json())",
    "if (!projected) return json(500, { error: 'order_from_offer_projection_failed' })",
    "return json(200, projected)",
):
    if marker not in handler:
        errors.append(f"handler: missing marker {marker!r}")

if "return json(200, await res.json())" in handler:
    errors.append("handler: raw RPC response is returned")

for marker in (
    "if (!result.order?.id)",
    "result.already_created",
    "result.link_errors?.length",
    "detail: { order }",
):
    if marker not in caller:
        errors.append(f"caller: missing compatibility marker {marker!r}")

for marker in (
    "'order', to_jsonb(v_order)",
    "'client', to_jsonb(v_client)",
):
    if marker not in migration:
        errors.append(f"migration: upstream raw-result marker missing {marker!r}")

for marker in (
    "create_order_from_offer",
    "projectOfferOrderResult",
    "order_from_offer_projection_failed",
    "client_phone",
    "contractor_cost",
    "Production Supabase не изменён",
):
    if marker not in doc:
        errors.append(f"doc: missing marker {marker!r}")

for marker in (
    "'tools/check_crm_offer_order_safe_projection.py'",
    "'docs/CRM_OFFER_ORDER_SAFE_RESPONSE_PROJECTION_2026-07-16.md'",
    "python3 tools/check_crm_offer_order_safe_projection.py",
):
    if marker not in workflow:
        errors.append(f"workflow: missing marker {marker!r}")

if errors:
    print("CRM offer-order safe response projection checks failed:", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    raise SystemExit(1)

print("CRM offer-order response is caller-compatible and privacy-minimized.")
