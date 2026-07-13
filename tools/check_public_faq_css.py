#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "faq.html"
CSS = ROOT / "assets" / "public-faq.css"
CSS_LINK = '<link rel="stylesheet" href="assets/public-faq.css?v=1">'
FORM_CSS_LINK = '<link rel="stylesheet" href="assets/public-lead-form.css?v=6">'
FORM_SCRIPT = '<script src="assets/public-lead-form.js?v=7"></script>'


def main() -> None:
    errors: list[str] = []
    page = PAGE.read_text(encoding="utf-8") if PAGE.is_file() else ""
    css = CSS.read_text(encoding="utf-8") if CSS.is_file() else ""

    if not page:
        errors.append("Missing faq.html")
    if not css:
        errors.append("Missing assets/public-faq.css")

    if re.search(r"<style\b", page, flags=re.IGNORECASE):
        errors.append("FAQ page must not contain an inline <style> block")
    if page.count(CSS_LINK) != 1:
        errors.append("FAQ page must load public-faq.css?v=1 exactly once")
    if page.count(FORM_CSS_LINK) != 1:
        errors.append("FAQ page must retain public-lead-form.css?v=6 exactly once")
    if page.count(FORM_SCRIPT) != 1:
        errors.append("FAQ page must retain public-lead-form.js?v=7 exactly once")
    if CSS_LINK in page and FORM_CSS_LINK in page and page.index(FORM_CSS_LINK) > page.index(CSS_LINK):
        errors.append("Shared form CSS must load before FAQ page CSS")

    required_page_markers = (
        '<h1>Вопросы и ответы</h1>',
        '"@type":"FAQPage"',
        'id="request"',
        'id="leader-lead-form"',
        'Куда попадёт моя заявка?',
        'После отправки заявка фиксируется как обращение и получает номер.',
    )
    for marker in required_page_markers:
        if marker not in page:
            errors.append(f"FAQ page lost required marker: {marker}")

    if page.count('<article class="item">') != 12:
        errors.append("FAQ page must retain exactly 12 visible question cards")
    if page.count('"@type":"Question"') != 12:
        errors.append("FAQPage JSON-LD must retain exactly 12 questions")

    required_css_markers = (
        ":root{",
        ".hero{",
        ".faq{",
        ".item{",
        ".cta{",
        "@media(max-width:860px)",
    )
    for marker in required_css_markers:
        if marker not in css:
            errors.append(f"public-faq.css is missing required marker: {marker}")

    if len(css.strip()) < 1800:
        errors.append(f"public-faq.css is unexpectedly short: {len(css.strip())} characters")
    if re.search(r"url\s*\(\s*['\"]?https?://", css, flags=re.IGNORECASE):
        errors.append("public-faq.css must not add remote CSS resources")

    if errors:
        print("\n".join(errors))
        sys.exit(1)

    print(
        "Public FAQ CSS contract is valid: "
        f"12 visible questions, 12 JSON-LD questions, external CSS {len(css.strip())} characters."
    )


if __name__ == "__main__":
    main()
