#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "chto-nuzhno-dlya-rascheta.html"
CSS = ROOT / "assets" / "public-calculation-checklist.css"
CSS_LINK = '<link rel="stylesheet" href="assets/public-calculation-checklist.css?v=1">'
FORM_CSS_LINK = '<link rel="stylesheet" href="assets/public-lead-form.css?v=13">'
FORM_SCRIPT = '<script src="assets/public-lead-form.js?v=13"></script>'


def main() -> None:
    errors: list[str] = []

    page = PAGE.read_text(encoding="utf-8") if PAGE.is_file() else ""
    css = CSS.read_text(encoding="utf-8") if CSS.is_file() else ""

    if not page:
        errors.append("Missing chto-nuzhno-dlya-rascheta.html")
    if not css:
        errors.append("Missing assets/public-calculation-checklist.css")

    if re.search(r"<style\b", page, flags=re.IGNORECASE):
        errors.append("Calculation checklist page must not contain an inline <style> block")

    if page.count(CSS_LINK) != 1:
        errors.append("Calculation checklist page must load public-calculation-checklist.css?v=1 exactly once")
    if page.count(FORM_CSS_LINK) != 1:
        errors.append("Calculation checklist page must retain public-lead-form.css?v=13 exactly once")
    if page.count(FORM_SCRIPT) != 1:
        errors.append("Calculation checklist page must retain public-lead-form.js?v=13 exactly once")

    if CSS_LINK in page and FORM_CSS_LINK in page and page.index(FORM_CSS_LINK) > page.index(CSS_LINK):
        errors.append("Shared form CSS must load before page-specific calculation checklist CSS")

    required_page_markers = (
        '<h1>Что нужно для расчёта рекламы</h1>',
        '"@type":"HowTo"',
        'id="request"',
        'id="leader-lead-form"',
        'data-service="Баннер"',
        'data-service="Наклейки"',
        'data-service="Табличка"',
        'data-service="Вывеска / наружная реклама"',
        'data-service="Яндекс Карты и 2ГИС"',
    )
    for marker in required_page_markers:
        if marker not in page:
            errors.append(f"Calculation checklist page lost required marker: {marker}")

    required_css_markers = (
        ":root{",
        ".grid{",
        ".grid3{",
        ".card{",
        ".hint{",
        ".cta{",
        ".steps{",
        "@media(max-width:900px)",
    )
    for marker in required_css_markers:
        if marker not in css:
            errors.append(f"public-calculation-checklist.css is missing required marker: {marker}")

    if len(css.strip()) < 3000:
        errors.append(f"public-calculation-checklist.css is unexpectedly short: {len(css.strip())} characters")
    if re.search(r"url\s*\(\s*['\"]?https?://", css, flags=re.IGNORECASE):
        errors.append("public-calculation-checklist.css must not add remote CSS resources")

    if errors:
        print("\n".join(errors))
        sys.exit(1)

    print(
        "Public calculation checklist CSS contract is valid: "
        f"external CSS {len(css.strip())} characters, no inline style block."
    )


if __name__ == "__main__":
    main()
