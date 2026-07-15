#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "prices.html"
CSS = ROOT / "assets" / "public-prices.css"
CSS_LINK = '<link rel="stylesheet" href="assets/public-prices.css?v=1">'
FORM_CSS_LINK = '<link rel="stylesheet" href="assets/public-lead-form.css?v=14">'
FORM_SCRIPT = '<script src="assets/public-lead-form.js?v=23"></script>'


def main() -> None:
    errors: list[str] = []
    page = PAGE.read_text(encoding="utf-8") if PAGE.is_file() else ""
    css = CSS.read_text(encoding="utf-8") if CSS.is_file() else ""

    if not page:
        errors.append("Missing prices.html")
    if not css:
        errors.append("Missing assets/public-prices.css")

    if re.search(r"<style\b", page, flags=re.IGNORECASE):
        errors.append("prices.html must not contain an inline <style> block after migration")

    if page.count(CSS_LINK) != 1:
        errors.append(f"prices.html must contain exactly one {CSS_LINK!r}")
    if page.count(FORM_CSS_LINK) != 1:
        errors.append("prices.html must retain public-lead-form.css?v=14 exactly once")
    if page.count(FORM_SCRIPT) != 1:
        errors.append("prices.html must load public-lead-form.js?v=23 exactly once")
    if CSS_LINK in page and FORM_CSS_LINK in page and page.index(FORM_CSS_LINK) > page.index(CSS_LINK):
        errors.append("Shared form CSS must load before the page-specific prices CSS")

    required_page_markers = (
        '<h1>Цены и ориентиры на рекламу</h1>',
        'Ориентиры по направлениям',
        'Короткая таблица для расчёта',
        'Как получить нормальный расчёт',
        'id="request"',
        'id="leader-lead-form"',
        'data-service="Баннер"',
    )
    for marker in required_page_markers:
        if marker not in page:
            errors.append(f"prices.html lost required marker: {marker}")

    required_css_markers = (
        ":root{",
        ".grid{",
        ".price{",
        ".table{",
        ".steps{",
        ".cta{",
        "@media(max-width:900px)",
    )
    for marker in required_css_markers:
        if marker not in css:
            errors.append(f"public-prices.css is missing required marker: {marker}")

    if len(css.strip()) < 3000:
        errors.append(f"public-prices.css is unexpectedly short: {len(css.strip())} characters")

    if re.search(r"url\s*\(\s*['\"]?https?://", css, flags=re.IGNORECASE):
        errors.append("public-prices.css must not add remote CSS resources")

    if errors:
        print("\n".join(errors))
        sys.exit(1)

    print(
        "Public prices CSS contract is valid: "
        f"external CSS {len(css.strip())} characters, no inline style block."
    )


if __name__ == "__main__":
    main()
