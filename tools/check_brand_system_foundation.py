#!/usr/bin/env python3
"""Static contract for RA Lider brand system foundation."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOKENS = ROOT / "assets" / "brand" / "leader-tokens.css"
COMPONENTS = ROOT / "assets" / "brand" / "leader-components-v1.css"
REVIEW = ROOT / "brand-system-review.html"
DOC = ROOT / "docs" / "BRAND_SYSTEM_RA_LIDER.md"
ASSET_README = ROOT / "assets" / "brand" / "README.md"
LOGO = ROOT / "assets" / "brand" / "logo-lider-header.svg"
MARK = ROOT / "assets" / "brand" / "logo-lider-mark.svg"
LEGACY_LIGHT = ROOT / "assets" / "brand" / "logo-lider-light.svg"

errors: list[str] = []


def require(condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


for path in (TOKENS, COMPONENTS, REVIEW, DOC, ASSET_README, LOGO, MARK, LEGACY_LIGHT):
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
        "--font-brand: Manrope, Arial, Helvetica, sans-serif;",
        "--weight-extrabold: 800;",
        "--line-body: 1.55;",
        "--radius-md: 12px;",
        "--radius-lg: 16px;",
        "--container: 1180px;",
        "--content-readable: 760px;",
        "--photo-overlay-base: rgba(13, 15, 18, 0.45);",
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
        "# Брендбук РА «Лидер»",
        "Версия: 1.0",
        "assets/brand/logo-lider-header.svg",
        "assets/brand/logo-lider-mark.svg",
        "assets/brand/leader-tokens.css",
        "#FF6A00",
        "**Manrope**",
        "## 20. Композиционные шаблоны",
        "## 25. Система доверия",
        "## 33. Tone of Voice",
        "## 42. Предпечатная проверка",
        "## 44. Чек-лист нового макета",
        "CRM",
        "Портфолио",
    ):
        require(marker in text, f"brand specification missing marker: {marker}")
    require("Pantone/RAL/серии самоклеящихся плёнок не фиксировать" in text,
            "brandbook must keep physical color matching disclaimer")
    require("logo-lider-light.svg` содержит встроенный растр" in text,
            "brandbook must classify raster-in-SVG legacy asset")

if ASSET_README.exists():
    text = ASSET_README.read_text(encoding="utf-8")
    for marker in (
        "единый источник фирменных digital-ассетов",
        "logo-lider-header.svg",
        "logo-lider-mark.svg",
        "reference only",
        "Правило для тёмного фона",
        "встроенный raster image",
    ):
        require(marker in text, f"brand asset registry missing marker: {marker}")

if LOGO.exists():
    text = LOGO.read_text(encoding="utf-8")
    require("<image" not in text, "canonical horizontal logo must remain pure vector SVG")
    require("data:image" not in text, "canonical horizontal logo must not embed raster data")

if MARK.exists():
    text = MARK.read_text(encoding="utf-8")
    require("<image" not in text, "canonical mark must remain pure vector SVG")
    require("data:image" not in text, "canonical mark must not embed raster data")

if LEGACY_LIGHT.exists():
    text = LEGACY_LIGHT.read_text(encoding="utf-8")
    require("data:image/png;base64" in text,
            "legacy light logo classification changed; re-audit asset registry before altering its status")

if errors:
    print("Brand system foundation contract: FAIL")
    for error in errors:
        print(f"- {error}")
    raise SystemExit(1)

print("Brand system foundation contract: PASS")
