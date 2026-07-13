#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "reklama-dlya-biznesa.html"
CSS = ROOT / "assets" / "public-business-advertising.css"
CSS_LINK = '<link rel="stylesheet" href="assets/public-business-advertising.css?v=1">'
FORM_CSS_LINK = '<link rel="stylesheet" href="assets/public-lead-form.css?v=8">'
FORM_SCRIPT = '<script src="assets/public-lead-form.js?v=9"></script>'


def main() -> None:
    errors: list[str] = []
    page = PAGE.read_text(encoding="utf-8") if PAGE.is_file() else ""
    css = CSS.read_text(encoding="utf-8") if CSS.is_file() else ""

    if not page:
        errors.append("Missing reklama-dlya-biznesa.html")
    if not css:
        errors.append("Missing assets/public-business-advertising.css")

    if re.search(r"<style\b", page, flags=re.IGNORECASE):
        errors.append("Business advertising page must not contain an inline <style> block")
    if page.count(CSS_LINK) != 1:
        errors.append("Business advertising page must load public-business-advertising.css?v=1 exactly once")
    if page.count(FORM_CSS_LINK) != 1:
        errors.append("Business advertising page must retain public-lead-form.css?v=8 exactly once")
    if page.count(FORM_SCRIPT) != 1:
        errors.append("Business advertising page must retain public-lead-form.js?v=9 exactly once")
    if CSS_LINK in page and FORM_CSS_LINK in page and page.index(FORM_CSS_LINK) > page.index(CSS_LINK):
        errors.append("Shared form CSS must load before business advertising page CSS")

    required_page_markers = (
        '<h1>Реклама для вашего бизнеса</h1>',
        '"@type":"Service"',
        '"serviceType":"Комплексная реклама для бизнеса"',
        'id="request"',
        'id="leader-lead-form"',
        'data-scenario="shop"',
        'data-scenario="cafe"',
        'data-scenario="beauty"',
        'data-scenario="service"',
        'data-scenario="construction"',
        'data-scenario="office"',
        'Подобрать рекламу под ваш бизнес',
    )
    for marker in required_page_markers:
        if marker not in page:
            errors.append(f"Business advertising page lost required marker: {marker}")

    if page.count('<article class="card">') != 6:
        errors.append("Business advertising page must retain exactly 6 scenario cards")
    if page.count('<div class="step">') != 4:
        errors.append("Business advertising page must retain exactly 4 process steps")

    required_css_markers = (
        ":root{",
        ".hero{",
        ".grid{",
        ".card{",
        ".steps{",
        ".cta{",
        "@media(max-width:900px)",
    )
    for marker in required_css_markers:
        if marker not in css:
            errors.append(f"public-business-advertising.css is missing required marker: {marker}")

    if len(css.strip()) < 2200:
        errors.append(
            f"public-business-advertising.css is unexpectedly short: {len(css.strip())} characters"
        )
    if re.search(r"url\s*\(\s*['\"]?https?://", css, flags=re.IGNORECASE):
        errors.append("public-business-advertising.css must not add remote CSS resources")

    if errors:
        print("\n".join(errors))
        sys.exit(1)

    print(
        "Public business advertising CSS contract is valid: "
        f"6 scenarios, 4 steps, external CSS {len(css.strip())} characters."
    )


if __name__ == "__main__":
    main()
