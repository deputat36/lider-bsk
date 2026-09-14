#!/usr/bin/env python3
"""Validate unified RA Lider line icons on the public homepage."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
SPRITE = ROOT / "assets" / "brand" / "leader-icons.svg"

errors: list[str] = []


def require(condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


require(INDEX.exists(), "missing index.html")
require(SPRITE.exists(), "missing assets/brand/leader-icons.svg")

if SPRITE.exists():
    svg = SPRITE.read_text(encoding="utf-8")
    for icon_id in (
        "icon-outdoor",
        "icon-print",
        "icon-cut",
        "icon-design",
        "icon-social",
        "icon-pin",
        "icon-phone",
        "icon-mail",
        "icon-globe",
        "icon-menu",
    ):
        require(f'id="{icon_id}"' in svg, f"missing sprite symbol: {icon_id}")
    require('stroke-width="2"' in svg, "line icon sprite must use the shared 2px stroke")
    require('stroke-linecap="round"' in svg, "line icon sprite must use rounded line caps")

if INDEX.exists():
    html = INDEX.read_text(encoding="utf-8")
    for icon_id in (
        "icon-outdoor",
        "icon-print",
        "icon-cut",
        "icon-design",
        "icon-social",
        "icon-pin",
        "icon-phone",
        "icon-mail",
        "icon-globe",
        "icon-menu",
    ):
        require(f"assets/brand/leader-icons.svg#{icon_id}" in html, f"homepage does not use {icon_id}")

    for legacy in (
        '<div class="icon">↗</div>',
        '<div class="icon">▰</div>',
        '<div class="icon">✦</div>',
        '<div class="icon">АА</div>',
        '<div class="icon">VK</div>',
        '<div class="icon">📍</div>',
        '📞',
        '✉️',
        '🌐',
        '>☰</button>',
    ):
        require(legacy not in html, f"legacy mixed icon remains: {legacy}")

    require(html.count('class="leader-icon"') == 11, "homepage must use exactly 11 branded line-icon instances")
    require(html.count('aria-hidden="true"') >= 11, "decorative icons must be hidden from assistive technology")
    require('aria-label="Открыть меню"' in html, "menu icon button must keep an accessible name")

if errors:
    print("Homepage brand icons v1: FAIL")
    for error in errors:
        print(f"- {error}")
    raise SystemExit(1)

print("Homepage brand icons v1: PASS")
