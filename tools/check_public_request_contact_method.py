#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
REQUEST = ROOT / "request.html"
FORM = ROOT / "assets/public-lead-form.js"
GUARD = ROOT / "assets/public-request-contact-method-v1.js"
STYLE = ROOT / "assets/public-request-contact-method-v1.css"
DOC = ROOT / "docs/PUBLIC_REQUEST_CONTACT_METHOD_GUARD_2026-07-13.md"


def read(path: Path, errors: list[str]) -> str:
    if not path.is_file():
        errors.append(f"Missing file: {path.relative_to(ROOT)}")
        return ""
    return path.read_text(encoding="utf-8")


def require(text: str, marker: str, path: Path, errors: list[str]) -> None:
    if marker not in text:
        errors.append(f"{path.relative_to(ROOT)}: missing marker {marker!r}")


def forbid(text: str, marker: str, path: Path, errors: list[str]) -> None:
    if marker in text:
        errors.append(f"{path.relative_to(ROOT)}: forbidden marker {marker!r}")


def main() -> int:
    errors: list[str] = []
    request = read(REQUEST, errors)
    form = read(FORM, errors)
    guard = read(GUARD, errors)
    style = read(STYLE, errors)
    doc = read(DOC, errors)

    request_markers = (
        'data-request-page-version="20260628-clarity-2"',
        "script.src='assets/public-request-contact-method-v1.js?v=1'",
        "script.async=false",
        'assets/public-lead-reference-v1.js?v=1',
        'assets/public-lead-form.js?v=5',
    )
    for marker in request_markers:
        require(request, marker, REQUEST, errors)

    ordered = (
        'assets/public-lead-reference-v1.js?v=1',
        'assets/public-lead-form.js?v=5',
        "script.src='assets/public-request-contact-method-v1.js?v=1'",
    )
    positions = [request.find(marker) for marker in ordered]
    if any(position < 0 for position in positions) or positions != sorted(positions):
        errors.append("request.html: public request scripts must keep reference → form → contact guard bootstrap order")

    for marker in (
        '<option>Написать ВКонтакте</option>',
        '<option>Написать на email</option>',
        'name="contact_detail"',
        'name="contact_method"',
    ):
        require(form, marker, FORM, errors)

    guard_markers = (
        "const EMAIL_METHOD='Написать на email'",
        "const VK_METHOD='Написать ВКонтакте'",
        "const STYLE_HREF='assets/public-request-contact-method-v1.css?v=1'",
        "document.head.appendChild(link)",
        "detail.required=required",
        "detail.setAttribute('aria-required',required?'true':'false')",
        "details.removeAttribute('hidden')",
        "event.stopImmediatePropagation()",
        "detail.reportValidity()",
        "window.leaderGoal('contact_detail_missing'",
        "form.addEventListener('submit',validateBeforeSubmit,true)",
        "Email для ответа",
        "Ссылка на профиль ВКонтакте",
    )
    for marker in guard_markers:
        require(guard, marker, GUARD, errors)

    for marker in (
        "fetch(",
        "supabase",
        "leader-public-lead",
        "localStorage",
        "sessionStorage",
    ):
        forbid(guard, marker, GUARD, errors)

    for marker in (
        ".leader-contact-hint",
        ".leader-contact-detail-required",
        "#ff6a00",
    ):
        require(style, marker, STYLE, errors)

    for marker in (
        "Email без адреса",
        "ВКонтакте без ссылки",
        "POST в `leader-public-lead` отсутствует",
        "production-заявка не создаётся",
        "bootstrap",
        "общий form JS не меняется",
        "Edge Function и Supabase production не меняются",
    ):
        require(doc, marker, DOC, errors)

    if errors:
        print("\n".join(errors))
        return 1

    print("Public request contact method guard contract is valid.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
