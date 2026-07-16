#!/usr/bin/env python3
"""Validate the reusable public-site logo contract."""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOGO = ROOT / "assets/brand/logo-lider-mark.svg"
LEGACY_LOGO = ROOT / "assets/brand/logo-lider-light.svg"
CSS = ROOT / "assets/public-lead-form.css"
DOC = ROOT / "docs/PUBLIC_LOGO_DISPLAY_AUDIT_2026-07-16.md"
WORKFLOW = ROOT / ".github/workflows/public-logo-display-check.yml"
CORE_PAGES = (
    ROOT / "index.html",
    ROOT / "request.html",
    ROOT / "uslugi.html",
    ROOT / "primery-rabot-kejsy.html",
)


def require(text: str, marker: str, label: str) -> None:
    if marker not in text:
        raise AssertionError(f"{label}: missing marker {marker!r}")


def main() -> int:
    for path in (LOGO, LEGACY_LOGO, CSS, DOC, WORKFLOW, *CORE_PAGES):
        if not path.is_file():
            raise AssertionError(f"missing file: {path.relative_to(ROOT)}")

    logo_text = LOGO.read_text(encoding="utf-8")
    logo_root = ET.fromstring(logo_text)
    if logo_root.tag != "{http://www.w3.org/2000/svg}svg":
        raise AssertionError("logo: root element must be svg")
    if logo_root.attrib.get("viewBox") != "0 0 50 44":
        raise AssertionError("logo: unexpected viewBox")
    if logo_root.attrib.get("width") != "50" or logo_root.attrib.get("height") != "44":
        raise AssertionError("logo: intrinsic dimensions must be 50x44")
    require(logo_text.lower(), "#ff6a00", "logo")
    require(logo_text.lower(), "#1a1a1a", "logo")
    if re.search(r"<(?:image|script|foreignObject)\b", logo_text, re.IGNORECASE):
        raise AssertionError("logo: embedded raster/script/foreignObject is forbidden")
    if "base64" in logo_text.lower() or "http://" in logo_text.replace("http://www.w3.org/2000/svg", ""):
        raise AssertionError("logo: external or base64 resources are forbidden")

    legacy_text = LEGACY_LOGO.read_text(encoding="utf-8")
    if '<image href="data:image/png;base64,' not in legacy_text:
        raise AssertionError("legacy logo evidence changed; review migration decision")

    css = CSS.read_text(encoding="utf-8")
    require(css, "leader-public-logo-v1", "css")
    require(css, 'background:url("brand/logo-lider-mark.svg")', "css")
    require(css, "width:50px!important;height:44px!important;flex:0 0 50px!important", "css desktop")
    require(css, "width:40px!important;height:36px!important;flex-basis:40px!important", "css mobile")
    require(css, ".header .brand .mark{display:none!important}", "css duplicate prevention")
    if "logo-lider-light.svg" in css:
        raise AssertionError("css: legacy square raster-in-svg must not be used in headers")

    root_html = tuple(ROOT.glob("*.html"))
    if not root_html:
        raise AssertionError("no root public html found")
    for page in root_html:
        text = page.read_text(encoding="utf-8")
        if "logo-lider-light.svg" in text:
            raise AssertionError(f"{page.name}: legacy logo reference is forbidden")

    for page in CORE_PAGES:
        text = page.read_text(encoding="utf-8")
        require(text, 'class="brand"', page.name)
        require(text, "Лидер", page.name)
        require(text, "assets/public-lead-form.css", page.name)

    doc = DOC.read_text(encoding="utf-8")
    require(doc, "50 × 44", "doc desktop dimensions")
    require(doc, "40 × 36", "doc mobile dimensions")
    require(doc, "logo-lider-mark.svg", "doc asset")
    require(doc, "logo-lider-light.svg", "doc legacy evidence")

    workflow = WORKFLOW.read_text(encoding="utf-8")
    require(workflow, "python3 tools/check_public_logo_contract.py", "workflow")
    require(workflow, "assets/brand/logo-lider-mark.svg", "workflow path")

    print(f"public logo contract OK: {len(root_html)} root HTML files checked")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
