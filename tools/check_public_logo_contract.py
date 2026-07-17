#!/usr/bin/env python3
"""Validate the official public-site logo contract."""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HEADER_LOGO = ROOT / "assets/brand/logo-lider-header.svg"
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
    for path in (HEADER_LOGO, CSS, DOC, WORKFLOW, *CORE_PAGES):
        if not path.is_file():
            raise AssertionError(f"missing file: {path.relative_to(ROOT)}")

    logo_text = HEADER_LOGO.read_text(encoding="utf-8")
    logo_root = ET.fromstring(logo_text)
    if logo_root.tag != "{http://www.w3.org/2000/svg}svg":
        raise AssertionError("official header logo: root element must be svg")
    if logo_root.attrib.get("viewBox") != "0 0 900 260":
        raise AssertionError("official header logo: unexpected viewBox")
    if logo_root.attrib.get("width") != "900" or logo_root.attrib.get("height") != "260":
        raise AssertionError("official header logo: intrinsic dimensions must be 900x260")

    require(logo_text.lower(), "#ff4d00", "official header logo")
    require(logo_text.lower(), "#ff7200", "official header logo")
    require(logo_text.lower(), "#090a0c", "official header logo")
    require(logo_text, "Лидер — рекламное агентство", "official header logo title")
    require(logo_text, "fill-rule=\"evenodd\"", "official header logo compound paths")
    if len(re.findall(r"<path\b", logo_text)) < 3:
        raise AssertionError("official header logo: expected mark and wordmark paths")
    if re.search(r"<(?:image|script|foreignObject)\b", logo_text, re.IGNORECASE):
        raise AssertionError("official header logo: raster/script/foreignObject is forbidden")
    if "base64" in logo_text.lower():
        raise AssertionError("official header logo: embedded raster is forbidden")
    if re.search(r"(?:href|src)=", logo_text, re.IGNORECASE):
        raise AssertionError("official header logo: external dependencies are forbidden")

    css = CSS.read_text(encoding="utf-8")
    require(css, "leader-public-logo-v2", "css")
    require(css, 'background:url("brand/logo-lider-header.svg")', "css official asset")
    require(css, "width:250px!important;height:66px!important;flex:0 0 250px!important", "css desktop")
    require(css, "width:225px!important;height:60px!important;flex-basis:225px!important", "css laptop")
    require(css, "width:184px!important;height:49px!important;flex-basis:184px!important", "css mobile")
    require(css, "clip:rect(0,0,0,0)!important", "css accessible div fallback")
    require(css, ".header .brand,.header .brand *{font-size:0!important;color:transparent!important", "css text-node fallback")
    if css.rfind("leader-public-logo-v2") <= css.rfind("leader-public-logo-v1"):
        raise AssertionError("css: official logo override must follow the superseded approximation")

    root_html = tuple(ROOT.glob("*.html"))
    if not root_html:
        raise AssertionError("no root public html found")
    for page in root_html:
        text = page.read_text(encoding="utf-8")
        if "logo-lider-light.svg" in text:
            raise AssertionError(f"{page.name}: obsolete logo reference is forbidden")

    for page in CORE_PAGES:
        text = page.read_text(encoding="utf-8")
        require(text, 'class="brand"', page.name)
        require(text, "Лидер", page.name)
        require(text, "assets/public-lead-form.css", page.name)

    doc = DOC.read_text(encoding="utf-8")
    require(doc, "официальный логотип", "doc correction")
    require(doc, "250 × 66", "doc desktop dimensions")
    require(doc, "225 × 60", "doc laptop dimensions")
    require(doc, "184 × 49", "doc mobile dimensions")
    require(doc, "logo-lider-header.svg", "doc asset")
    require(doc, "предыдущая аппроксимация", "doc superseded asset")

    workflow = WORKFLOW.read_text(encoding="utf-8")
    require(workflow, "python3 tools/check_public_logo_contract.py", "workflow")
    require(workflow, "assets/brand/logo-lider-header.svg", "workflow path")

    print(f"official public logo contract OK: {len(root_html)} root HTML files checked")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
