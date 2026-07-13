#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "srochnaya-reklama-borisoglebsk.html"
CSS = ROOT / "assets" / "public-urgent-advertising.css"
JS = ROOT / "assets" / "public-urgent-advertising.js"
CSS_LINK = '<link rel="stylesheet" href="assets/public-urgent-advertising.css?v=1">'
FORM_CSS_LINK = '<link rel="stylesheet" href="assets/public-lead-form.css?v=19">'
FORM_SCRIPT = '<script src="assets/public-lead-form.js?v=19"></script>'
STICKY_SCRIPT = '<script src="assets/mobile-sticky-cta.js?v=1"></script>'
PAGE_SCRIPT = '<script src="assets/public-urgent-advertising.js?v=1"></script>'
PRESET = "Срочная заявка: нужно быстро рассчитать рекламу. Срок: "


def main() -> None:
    errors: list[str] = []
    page = PAGE.read_text(encoding="utf-8") if PAGE.is_file() else ""
    css = CSS.read_text(encoding="utf-8") if CSS.is_file() else ""
    js = JS.read_text(encoding="utf-8") if JS.is_file() else ""

    if not page:
        errors.append("Missing srochnaya-reklama-borisoglebsk.html")
    if not css:
        errors.append("Missing assets/public-urgent-advertising.css")
    if not js:
        errors.append("Missing assets/public-urgent-advertising.js")

    if re.search(r"<style\b", page, flags=re.IGNORECASE):
        errors.append("Urgent advertising page must not contain inline <style>")
    executable_inline = re.findall(r"<script(?![^>]*type=[\"']application/ld\+json[\"'])[^>]*>(.*?)</script>", page, flags=re.IGNORECASE | re.DOTALL)
    if any(block.strip() for block in executable_inline):
        errors.append("Urgent advertising page must not contain executable inline JavaScript")

    for marker, label in (
        (CSS_LINK, "page CSS"),
        (FORM_CSS_LINK, "form CSS"),
        (FORM_SCRIPT, "form script"),
        (STICKY_SCRIPT, "mobile sticky CTA script"),
        (PAGE_SCRIPT, "page preset script"),
    ):
        if page.count(marker) != 1:
            errors.append(f"Urgent advertising page must load {label} exactly once")

    if CSS_LINK in page and FORM_CSS_LINK in page and page.index(FORM_CSS_LINK) > page.index(CSS_LINK):
        errors.append("Shared form CSS must load before urgent advertising page CSS")
    if FORM_SCRIPT in page and STICKY_SCRIPT in page and PAGE_SCRIPT in page:
        if not (page.index(FORM_SCRIPT) < page.index(STICKY_SCRIPT) < page.index(PAGE_SCRIPT)):
            errors.append("Script order must be form -> sticky CTA -> urgent page preset")

    required_page_markers = (
        '<h1>Срочная реклама в Борисоглебске</h1>',
        '"@type":"Service"',
        'id="request"',
        'id="leader-lead-form"',
        'data-service="Комплексная реклама"',
        'data-service="Соцсети и контент"',
        'data-service="Баннер"',
        'data-service="Дизайн макета"',
        'data-service="Наклейки"',
        'data-service="Табличка"',
        'Оставить срочную заявку',
        'Важно: срочно не всегда значит «можно всё».',
    )
    for marker in required_page_markers:
        if marker not in page:
            errors.append(f"Urgent advertising page lost required marker: {marker}")

    if page.count('<article class="card">') != 14:
        errors.append("Urgent advertising page must retain exactly 14 cards")
    if page.count('<div class="step">') != 4:
        errors.append("Urgent advertising page must retain exactly 4 process steps")

    for marker in (
        ":root{",
        ".hero{",
        ".grid{",
        ".grid2{",
        ".danger{",
        ".steps{",
        ".cta{",
        "@media(max-width:900px)",
    ):
        if marker not in css:
            errors.append(f"public-urgent-advertising.css is missing required marker: {marker}")

    if len(css.strip()) < 2800:
        errors.append(f"public-urgent-advertising.css is unexpectedly short: {len(css.strip())} characters")
    if re.search(r"url\s*\(\s*['\"]?https?://", css, flags=re.IGNORECASE):
        errors.append("public-urgent-advertising.css must not add remote resources")

    for marker in ("DOMContentLoaded", "setTimeout", "querySelectorAll", '[name="message"]', PRESET):
        if marker not in js:
            errors.append(f"public-urgent-advertising.js is missing required marker: {marker}")
    if "fetch(" in js or "XMLHttpRequest" in js:
        errors.append("Urgent page preset must not submit data directly")

    if errors:
        print("\n".join(errors))
        sys.exit(1)

    print(
        "Public urgent advertising asset contract is valid: "
        f"14 cards, 4 steps, CSS {len(css.strip())} characters."
    )


if __name__ == "__main__":
    main()
