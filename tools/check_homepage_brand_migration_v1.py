#!/usr/bin/env python3
"""Validate the first RA Lider homepage migration onto shared brand foundations."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
HOME = ROOT / "assets" / "public-homepage.css"
MIGRATION = ROOT / "assets" / "public-homepage-brand-v1.css"
TOKENS = ROOT / "assets" / "brand" / "leader-tokens.css"
COMPONENTS = ROOT / "assets" / "brand" / "leader-components-v1.css"

errors: list[str] = []


def require(condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


for path in (INDEX, HOME, MIGRATION, TOKENS, COMPONENTS):
    require(path.exists(), f"missing required file: {path.relative_to(ROOT)}")

if HOME.exists():
    text = HOME.read_text(encoding="utf-8")
    imports = (
        '@import url("brand/leader-tokens.css?v=1");',
        '@import url("brand/leader-components-v1.css?v=1");',
        '@import url("public-homepage-brand-v1.css?v=1");',
    )
    for marker in imports:
        require(marker in text, f"homepage CSS missing brand import: {marker}")
    first_rule = text.find(":root{")
    for marker in imports:
        require(0 <= text.find(marker) < first_rule, f"brand import must stay before legacy rules: {marker}")

if INDEX.exists():
    text = INDEX.read_text(encoding="utf-8")
    require('assets/public-homepage.css?v=2' in text, "homepage CSS cache marker must be v=2")
    require(text.count('assets/public-homepage.css?v=2') == 1, "homepage CSS v=2 link must appear exactly once")

if MIGRATION.exists():
    text = MIGRATION.read_text(encoding="utf-8")
    required = (
        "html:root",
        "--orange: var(--brand-orange);",
        "--radius: var(--radius-lg);",
        "html body .btn--accent",
        "background: var(--brand-orange);",
        "html body h1",
        "text-transform: none;",
        "html body .card::before",
        "display: none;",
        "html body .hero-card",
        "prefers-reduced-motion",
    )
    for marker in required:
        require(marker in text, f"migration layer missing marker: {marker}")
    require("linear-gradient(135deg,var(--orange),#ff8a2a)" not in text, "migration layer must not restore the legacy orange CTA gradient")
    require("border-radius:999px" not in text.replace(" ", ""), "migration layer must not restore mandatory pill radii")

if errors:
    print("Homepage brand migration v1: FAIL")
    for error in errors:
        print(f"- {error}")
    raise SystemExit(1)

print("Homepage brand migration v1: PASS")
