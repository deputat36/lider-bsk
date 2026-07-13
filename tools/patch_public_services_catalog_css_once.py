#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "uslugi.html"
CSS = ROOT / "assets" / "public-services.css"
CSS_LINK = '<link rel="stylesheet" href="assets/public-services.css?v=1">'
STYLE_RE = re.compile(r"\s*<style>\s*(.*?)\s*</style>", re.IGNORECASE | re.DOTALL)
REQUIRED_MARKERS = (
    ":root{",
    ".catalog{",
    ".service-list{",
    ".cta{",
    "@media(max-width:920px)",
    "@media(max-width:620px)",
)


def main() -> None:
    page = PAGE.read_text(encoding="utf-8")

    if CSS_LINK in page:
        if page.count(CSS_LINK) != 1:
            raise SystemExit("uslugi.html contains an unexpected number of services CSS links")
        if STYLE_RE.search(page):
            raise SystemExit("uslugi.html contains both external services CSS and an inline style block")
        if not CSS.is_file():
            raise SystemExit("services CSS link exists but assets/public-services.css is missing")
        print("Services catalog CSS migration already applied; no changes needed.")
        return

    matches = list(STYLE_RE.finditer(page))
    if len(matches) != 1:
        raise SystemExit(f"Expected exactly one inline style block in uslugi.html, found {len(matches)}")

    css = matches[0].group(1).strip() + "\n"
    for marker in REQUIRED_MARKERS:
        if marker not in css:
            raise SystemExit(f"Inline services CSS is missing required marker: {marker}")

    if len(css) < 3500:
        raise SystemExit(f"Inline services CSS is unexpectedly short: {len(css)} characters")

    if CSS.exists():
        existing = CSS.read_text(encoding="utf-8")
        if existing != css:
            raise SystemExit("assets/public-services.css already exists with different content")
    else:
        CSS.write_text(css, encoding="utf-8")

    replacement = "\n  " + CSS_LINK
    updated = page[: matches[0].start()] + replacement + page[matches[0].end() :]

    if updated.count(CSS_LINK) != 1:
        raise SystemExit("Failed to insert the services CSS link exactly once")
    if STYLE_RE.search(updated):
        raise SystemExit("Inline style block remained after migration")
    if updated.lower().count("<!doctype html>") != page.lower().count("<!doctype html>"):
        raise SystemExit("Document count changed unexpectedly")

    PAGE.write_text(updated, encoding="utf-8")
    print(f"Migrated services catalog CSS: {len(css)} characters extracted.")


if __name__ == "__main__":
    main()
