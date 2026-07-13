#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "uslugi.html"
CSS = ROOT / "assets" / "public-services.css"
CSS_LINK = '<link rel="stylesheet" href="assets/public-services.css?v=1">'
FORM_CSS_LINK = '<link rel="stylesheet" href="assets/public-lead-form.css?v=5">'
FORM_SCRIPT = '<script src="assets/public-lead-form.js?v=5"></script>'


def main() -> None:
    errors: list[str] = []

    if not PAGE.is_file():
        errors.append("Missing uslugi.html")
        page = ""
    else:
        page = PAGE.read_text(encoding="utf-8")

    if not CSS.is_file():
        errors.append("Missing assets/public-services.css")
        css = ""
    else:
        css = CSS.read_text(encoding="utf-8")

    if re.search(r"<style\b", page, flags=re.IGNORECASE):
        errors.append("uslugi.html must not contain an inline <style> block after migration")

    if page.count(CSS_LINK) != 1:
        errors.append(f"uslugi.html must contain exactly one {CSS_LINK!r}")

    if page.count(FORM_CSS_LINK) != 1:
        errors.append("uslugi.html must retain public-lead-form.css?v=5 exactly once")

    if page.count(FORM_SCRIPT) != 1:
        errors.append("uslugi.html must retain public-lead-form.js?v=5 exactly once")

    if CSS_LINK in page and FORM_CSS_LINK in page and page.index(FORM_CSS_LINK) > page.index(CSS_LINK):
        errors.append("Shared form CSS must load before the page-specific services CSS")

    required_page_markers = (
        '<h1>Выберите услугу под свою задачу</h1>',
        'id="outdoor"',
        'id="print"',
        'id="design"',
        'id="online"',
        'id="request"',
        '<div id="leader-lead-form"></div>',
    )
    for marker in required_page_markers:
        if marker not in page:
            errors.append(f"uslugi.html lost required marker: {marker}")

    required_css_markers = (
        ":root{",
        ".catalog{",
        ".service-list{",
        ".cta{",
        "@media(max-width:920px)",
        "@media(max-width:620px)",
    )
    for marker in required_css_markers:
        if marker not in css:
            errors.append(f"public-services.css is missing required marker: {marker}")

    if len(css.strip()) < 3500:
        errors.append(f"public-services.css is unexpectedly short: {len(css.strip())} characters")

    if re.search(r"url\s*\(\s*['\"]?https?://", css, flags=re.IGNORECASE):
        errors.append("public-services.css must not add remote CSS resources")

    if errors:
        print("\n".join(errors))
        sys.exit(1)

    print(
        "Public services catalog CSS contract is valid: "
        f"external CSS {len(css.strip())} characters, no inline style block."
    )


if __name__ == "__main__":
    main()
