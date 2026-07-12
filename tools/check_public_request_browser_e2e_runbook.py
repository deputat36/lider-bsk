#!/usr/bin/env python3
"""Validate the controlled production browser E2E runbook and source contracts."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
RUNBOOK = ROOT / "docs" / "PUBLIC_REQUEST_BROWSER_E2E_RUNBOOK_2026-07-12.md"
REQUEST_PAGE = ROOT / "request.html"
FORM = ROOT / "assets" / "public-lead-form.js"
REFERENCE = ROOT / "assets" / "public-lead-reference-v1.js"
EDGE = ROOT / "supabase" / "functions" / "leader-public-lead" / "index.ts"


def read(path: Path) -> str:
    if not path.is_file():
        raise SystemExit(f"Missing required file: {path.relative_to(ROOT)}")
    return path.read_text(encoding="utf-8")


def require(text: str, marker: str, label: str, errors: list[str]) -> None:
    if marker not in text:
        errors.append(f"Missing {marker!r} in {label}")


def main() -> int:
    errors: list[str] = []
    runbook = read(RUNBOOK)
    request_page = read(REQUEST_PAGE)
    form = read(FORM)
    reference = read(REFERENCE)
    edge = read(EDGE)

    runbook_markers = (
        "Runbook подготовлен, но production E2E ещё не выполнен",
        "Не выполнять отправку без явного подтверждения владельца",
        "https://www.lider-bsk.ru/request.html?utm_source=manual_e2e",
        "utm_medium=browser",
        "utm_campaign=public_request_chain_20260712",
        "https://ofewxuqfjhamgerwzull.supabase.co/functions/v1/leader-public-lead",
        "where request_id = '<REQUEST_ID>'",
        "from public.leader_leads",
        "from public.leader_public_lead_audit",
        "source_page_path = '/request.html'",
        "consent_version = 'privacy-2026-07-12-v1'",
        "form_version = 'site_public_form_v7'",
        "result = 'accepted'",
        "reason = 'lead_insert_created'",
        "result = 'duplicate'",
        "reason = 'request_id_conflict'",
        "Не удалять и не изменять production-запись через SQL",
        "Runbook содержит только read-only SQL",
        "leader-public-lead`: ACTIVE v10",
        "`leader_leads`: 12 строк",
    )
    for marker in runbook_markers:
        require(runbook, marker, str(RUNBOOK.relative_to(ROOT)), errors)

    destructive_sql = (
        "delete from public.leader_leads",
        "delete from public.leader_public_lead_audit",
        "update public.leader_leads",
        "update public.leader_public_lead_audit",
        "insert into public.leader_leads",
        "insert into public.leader_public_lead_audit",
        "truncate ",
        "drop table",
    )
    runbook_lower = runbook.lower()
    for marker in destructive_sql:
        if marker in runbook_lower:
            errors.append(f"Destructive SQL marker {marker!r} is forbidden in the runbook")

    helper = "assets/public-lead-reference-v1.js?v=1"
    form_script = "assets/public-lead-form.js?v=5"
    require(request_page, helper, "request.html", errors)
    require(request_page, form_script, "request.html", errors)
    if helper in request_page and form_script in request_page:
        if request_page.index(helper) > request_page.index(form_script):
            errors.append("request.html: reference helper must load before the public form")

    for marker in (
        "const CONSENT_VERSION='privacy-2026-07-12-v1'",
        "page_path:location.pathname",
        "payload.request_id=rid",
        "Номер обращения:",
    ):
        require(form, marker, str(FORM.relative_to(ROOT)), errors)

    for marker in (
        "const STORAGE_KEY='leader_public_lead_pending_v1'",
        "payload.request_id=pending.request_id",
        "if(data&&data.ok===true)clearPending()",
        "params.duplicate===true",
    ):
        require(reference, marker, str(REFERENCE.relative_to(ROOT)), errors)

    for marker in (
        "result: 'accepted'",
        "reason: 'lead_insert_created'",
        "result: 'duplicate'",
        "reason: 'request_id_conflict'",
        "source_page_path: pagePath",
        "consent_version: cleanText(body.consent_version, 120)",
        "return json(req, 200, { ok: true, request_id: requestId })",
    ):
        require(edge, marker, str(EDGE.relative_to(ROOT)), errors)

    if errors:
        print("\n".join(errors))
        return 1

    print("Public request browser E2E runbook and source contracts are valid.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
