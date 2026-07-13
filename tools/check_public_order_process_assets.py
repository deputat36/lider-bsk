#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "kak-prohodit-zakaz.html"
CSS = ROOT / "assets" / "public-order-process.css"
JS = ROOT / "assets" / "public-order-process.js"
LANDING_CSS = '<link rel="stylesheet" href="assets/public-landing.css?v=1">'
FORM_CSS = '<link rel="stylesheet" href="assets/public-lead-form.css?v=4">'
PAGE_CSS = '<link rel="stylesheet" href="assets/public-order-process.css?v=1">'
FORM_JS = '<script src="assets/public-lead-form.js?v=5"></script>'
PAGE_JS = '<script src="assets/public-order-process.js?v=1"></script>'
PRESET = 'Страница «Как проходит заказ». Нужна консультация и расчёт рекламной задачи.'


def main() -> None:
    errors: list[str] = []
    page = PAGE.read_text(encoding="utf-8") if PAGE.is_file() else ""
    css = CSS.read_text(encoding="utf-8") if CSS.is_file() else ""
    js = JS.read_text(encoding="utf-8") if JS.is_file() else ""

    if not page:
        errors.append("Missing kak-prohodit-zakaz.html")
    if not css:
        errors.append("Missing assets/public-order-process.css")
    if not js:
        errors.append("Missing assets/public-order-process.js")

    if re.search(r"<style\b", page, flags=re.IGNORECASE):
        errors.append("Order process page must not contain an inline <style> block")
    if re.search(r"<script(?![^>]*\btype=[\"']application/ld\+json[\"'])(?![^>]*\bsrc=)[^>]*>", page, flags=re.IGNORECASE):
        errors.append("Order process page must not contain executable inline scripts")

    for marker, label in (
        (LANDING_CSS, "public-landing.css?v=1"),
        (FORM_CSS, "public-lead-form.css?v=4"),
        (PAGE_CSS, "public-order-process.css?v=1"),
        (FORM_JS, "public-lead-form.js?v=5"),
        (PAGE_JS, "public-order-process.js?v=1"),
    ):
        if page.count(marker) != 1:
            errors.append(f"Order process page must load {label} exactly once")

    if all(marker in page for marker in (LANDING_CSS, FORM_CSS, PAGE_CSS)):
        if not page.index(LANDING_CSS) < page.index(FORM_CSS) < page.index(PAGE_CSS):
            errors.append("CSS order must be landing, form, then order-process styles")
    if FORM_JS in page and PAGE_JS in page and page.index(FORM_JS) > page.index(PAGE_JS):
        errors.append("Order process preset JS must load after the shared form JS")

    required_page_markers = (
        '<h1>Как проходит заказ</h1>',
        '"@type":"HowTo"',
        'id="request"',
        'id="leader-lead-form"',
        'data-leader-lead-form',
        'process-number">8<',
        'После отправки появляется номер обращения',
    )
    for marker in required_page_markers:
        if marker not in page:
            errors.append(f"Order process page lost required marker: {marker}")

    required_css_markers = (
        ".process-hero .back{",
        ".process-timeline{",
        ".process-step{",
        ".process-number{",
        ".process-note{",
        ".process-tags{",
        "@media(max-width:920px)",
    )
    for marker in required_css_markers:
        if marker not in css:
            errors.append(f"public-order-process.css is missing required marker: {marker}")

    required_js_markers = (
        "DOMContentLoaded",
        "[data-leader-lead-widget]",
        "[name=\"message\"]",
        PRESET,
        "if(message&&!message.value)",
    )
    for marker in required_js_markers:
        if marker not in js:
            errors.append(f"public-order-process.js is missing required marker: {marker}")

    if PRESET in page:
        errors.append("Order process preset text must live in the external JS asset, not inline HTML")
    if len(css.strip()) < 1000:
        errors.append(f"public-order-process.css is unexpectedly short: {len(css.strip())} characters")
    if len(js.strip()) < 250:
        errors.append(f"public-order-process.js is unexpectedly short: {len(js.strip())} characters")

    if errors:
        print("\n".join(errors))
        sys.exit(1)

    print(
        "Public order process assets contract is valid: "
        f"CSS {len(css.strip())} characters, JS {len(js.strip())} characters, no executable inline blocks."
    )


if __name__ == "__main__":
    main()
