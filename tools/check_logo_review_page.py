#!/usr/bin/env python3
"""Validate the isolated public logo review page."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "logo-review.html"
LOGO = ROOT / "assets" / "brand" / "logo-lider-header.svg"


def require(text: str, marker: str, label: str) -> None:
    if marker not in text:
        raise AssertionError(f"{label}: missing marker {marker!r}")


def main() -> int:
    if not PAGE.is_file():
        raise AssertionError("logo-review.html is missing")
    if not LOGO.is_file():
        raise AssertionError("logo asset is missing")

    html = PAGE.read_text(encoding="utf-8")
    require(html, 'name="robots" content="noindex,nofollow"', "robots")
    require(html, "assets/brand/logo-lider-header.svg?v=3", "versioned logo")
    require(html, "250 × 66", "desktop review size")
    require(html, "184 × 49", "mobile review size")
    require(html, "Критерии принятия", "manual visual checklist")

    logo = LOGO.read_text(encoding="utf-8")
    require(logo, 'viewBox="0 0 900 260"', "logo viewBox")
    require(logo, "Лидер — рекламное агентство", "accessible title")

    print("logo review page contract OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
