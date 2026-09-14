#!/usr/bin/env python3
"""Static contract for RA Lider brand system foundation."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOKENS = ROOT / "assets" / "brand" / "leader-tokens.css"
COMPONENTS = ROOT / "assets" / "brand" / "leader-components-v1.css"
REVIEW = ROOT / "brand-system-review.html"
DOC = ROOT / "docs" / "BRAND_SYSTEM_RA_LIDER.md"
LOGO = ROOT / "assets" / "brand" / "logo-lider-header.svg"

errors: list[str] = []


def require(condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


for path in (TOKENS, COMPONENTS, REVIEW, DOC, LOGO):
    require(path.exists(), f"missing required brand asset: {path.relative_to(ROOT)}")

if TOKENS.exists():
    text = TOKENS.read_text(encoding="utf-8")
    required_tokens = (
        "--brand-orange: #ff6a00;",
        "--brand-orange-hover: #e85f00;",
        "--brand-900: #171717;",
        "--brand-950: #0d0f12;",
        "--surface-page: var(--brand-050);",
        "--surface-card: var(--brand-white);",
        "--border-default: var(--brand-200);",
        "--text-primary: var(--brand-900);",
        "--text-secondary: var(--brand-500);",
        "--radius-md: 12px;",
        "--radius-lg: 16px;",
        "--container: 1180px;",
        "--focus-ring: 0 0 0 4px rgba(255, 106, 0, 0.22);",
    )
    for token in required_tokens:
        require(token in text, f"missing token contract: {token}")

if COMPONENTS.exists():
    text = COMPONENTS.read_text(encoding="utf-8")
    for marker in (
        ".brand-button--primary",
        ".brand-button--dark",
        ".brand-button--outline",
        ".brand-button--ghost",
        ".brand-card",
        "prefers-reduced-motion",
        "var(--brand-orange)",
        "var(--radius-md)",
    ):
        require(marker in text, f"missing shared component marker: {marker}")
    require("border-radius: 999px" not in text, "shared brand components must not restore mandatory pill buttons")

if REVIEW.exists():
    text = REVIEW.read_text(encoding="utf-8")
    for marker in (
        'meta name="robots" content="noindex,nofollow"',
        'assets/brand/leader-tokens.css',
        'assets/brand/leader-components-v1.css',
        'assets/brand/logo-lider-header.svg',
        'Делаем бизнес заметнее.',
        'Brand Orange',
        'Типографическая иерархия',
        'Фотографии',
        'Фирменный мотив',
    ):
        require(marker in text, f"review page missing marker: {marker}")

if DOC.exists():
    text = DOC.read_text(encoding="utf-8")
    for marker in (
        "# Фирменная система РА «Лидер»",
        "assets/brand/logo-lider-header.svg",
        "assets/brand/leader-tokens.css",
        "#FF6A00",
        "Tone of Voice",
        "CRM",
        "Портфолио",
    ):
        require(marker in text, f"brand specification missing marker: {marker}")

if errors:
    print("Brand system foundation contract: FAIL")
    for error in errors:
        print(f"- {error}")
    raise SystemExit(1)

print("Brand system foundation contract: PASS")
