#!/usr/bin/env python3
"""Validate public lead attribution, accessibility and consent markers.

Source-only check. It does not contact Supabase or the public site.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FORM = ROOT / "assets" / "public-lead-form.js"
FORM_CSS = ROOT / "assets" / "public-lead-form.css"
EDGE = ROOT / "supabase" / "functions" / "leader-public-lead" / "index.ts"
AUDIT = ROOT / "docs" / "PUBLIC_SITE_COMMERCIAL_AUDIT_2026-07-12.md"


def read(path: Path) -> str:
    if not path.is_file():
        raise SystemExit(f"Missing required file: {path.relative_to(ROOT)}")
    return path.read_text(encoding="utf-8")


def require(text: str, marker: str, label: str, errors: list[str]) -> None:
    if marker not in text:
        errors.append(f"Missing {marker!r} in {label}")


def forbid(text: str, marker: str, label: str, errors: list[str]) -> None:
    if marker in text:
        errors.append(f"Forbidden stale marker {marker!r} in {label}")


def main() -> int:
    errors: list[str] = []
    form = read(FORM)
    css = read(FORM_CSS)
    edge = read(EDGE)
    audit = read(AUDIT)

    form_markers = (
        "const CONSENT_VERSION='privacy-2026-07-12-v1'",
        "source:'Сайт'",
        "goal('form_view'",
        "goal('form_start'",
        'type="tel"',
        'inputmode="tel"',
        'autocomplete="tel"',
        'autocomplete="name"',
        'name="contact_detail"',
        'href="privacy.html"',
        'role="status"',
        'aria-live="polite"',
        'consent_version:CONSENT_VERSION',
        'page_path:location.pathname',
        'Позвоните по номеру 8 980 245-74-71',
        '.leader-mobile-sticky-cta__lead{background:#ff6a00;color:#fff}',
    )
    for marker in form_markers:
        require(form, marker, str(FORM.relative_to(ROOT)), errors)

    edge_markers = (
        "source: 'Сайт'",
        'contact_detail: cleanText(body.contact_detail, 300)',
        'consent_version: cleanText(body.consent_version, 120)',
        'source_page_path: pagePath',
        'utm_source: utmSource',
    )
    for marker in edge_markers:
        require(edge, marker, str(EDGE.relative_to(ROOT)), errors)

    for marker in (
        'sourceGuess()',
        "source: cleanText(body.source, 120) || 'Сайт'",
        '.leader-mobile-sticky-cta__lead{background:#f6c343',
    ):
        forbid(form + "\n" + edge, marker, "public lead sources", errors)

    for marker in (
        'коммерческий аудит публичного сайта',
        'Фактическая измеримость заявок',
        'Контактный способ без контактных данных',
        'Неверная классификация источника',
        'Production Supabase в ходе аудита не изменялся',
    ):
        require(audit, marker, str(AUDIT.relative_to(ROOT)), errors)

    require(css, '.leader-lead-note', str(FORM_CSS.relative_to(ROOT)), errors)

    if errors:
        print("\n".join(errors))
        return 1

    print("Public lead commercial attribution and accessibility contract is valid.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
