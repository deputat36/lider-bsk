#!/usr/bin/env python3
"""Static contract for RA Lider Brandbook 1.0 foundation."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
TOKENS = ROOT / "assets" / "brand" / "leader-tokens.css"
TOKENS_JSON = ROOT / "assets" / "brand" / "leader-tokens.json"
COMPONENTS = ROOT / "assets" / "brand" / "leader-components-v1.css"
REVIEW = ROOT / "brand-system-review.html"
DOC = ROOT / "docs" / "BRAND_SYSTEM_RA_LIDER.md"
WEB_DOC = ROOT / "docs" / "WEB_BRANDBOOK_RA_LIDER.md"
CRM_DOC = ROOT / "docs" / "CRM_BRANDBOOK_RA_LIDER.md"
DEMO_DOC = ROOT / "docs" / "DEMO_MATERIALS_GUIDE_RA_LIDER.md"
QUICK_GUIDE = ROOT / "docs" / "BRAND_QUICK_GUIDE_RA_LIDER.md"
ASSET_README = ROOT / "assets" / "brand" / "README.md"
LOGO = ROOT / "assets" / "brand" / "logo-lider-header.svg"
MARK = ROOT / "assets" / "brand" / "logo-lider-mark.svg"
LEGACY_LIGHT = ROOT / "assets" / "brand" / "logo-lider-light.svg"

errors: list[str] = []


def require(condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


for path in (
    TOKENS, TOKENS_JSON, COMPONENTS, REVIEW, DOC, WEB_DOC, CRM_DOC, DEMO_DOC,
    QUICK_GUIDE, ASSET_README, LOGO, MARK, LEGACY_LIGHT,
):
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

if TOKENS_JSON.exists():
    try:
        token_data = json.loads(TOKENS_JSON.read_text(encoding="utf-8"))
    except Exception as exc:  # pragma: no cover - explicit CI diagnostics
        token_data = {}
        errors.append(f"leader-tokens.json is invalid JSON: {exc}")
    require(token_data.get("meta", {}).get("version") == "1.0", "JSON tokens must declare version 1.0")
    require(token_data.get("color", {}).get("brand", {}).get("orange") == "#FF6A00", "JSON Brand Orange drifted")
    require(token_data.get("color", {}).get("neutral", {}).get("900") == "#171717", "JSON Graphite drifted")
    require(token_data.get("typography", {}).get("fontBrand", "").startswith("Manrope"), "JSON primary font drifted")
    require(token_data.get("radius", {}).get("md") == 12, "JSON button/control radius drifted")
    require(token_data.get("layout", {}).get("container") == 1180, "JSON container drifted")
    require(token_data.get("spacing") == [4, 8, 12, 16, 24, 32, 48, 64, 96], "JSON spacing scale drifted")

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
        'assets/brand/logo-lider-mark.svg',
        'Brandbook 1.0',
        'Делаем бизнес заметнее.',
        'Brand Orange',
        'Типографическая иерархия',
        'Фотографии',
        'Фирменный мотив',
        'Композиционные семейства',
        'Система доверия',
        'Tone of Voice',
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

if WEB_DOC.exists():
    text = WEB_DOC.read_text(encoding="utf-8")
    for marker in (
        "# Брендбук публичного сайта РА «Лидер»",
        "assets/brand/leader-tokens.css",
        "assets/brand/leader-components-v1.css",
        "assets/brand/leader-icons.svg",
        "## 11. Hero",
        "## 16. Портфолио и доказательства",
        "## 17. Trust-system",
        "## 20. Формы заявок",
        "## 24. Responsive",
        "## 25. Accessibility",
        "## 30. Правило безопасной миграции",
        "## 32. Definition of Done для публичной страницы",
    ):
        require(marker in text, f"website brandbook missing marker: {marker}")
    require("фальшивые AI-фотографии" in text,
            "website brandbook must forbid fake AI completed-work photography")

if CRM_DOC.exists():
    text = CRM_DOC.read_text(encoding="utf-8")
    for marker in (
        "# Брендбук CRM РА «Лидер»",
        "crm/v4/assets/v4/brand-foundations-v2.css",
        "## 6. Семантические цвета",
        "## 15. Рабочие списки",
        "## 18. Карточка заказа",
        "## 20. Расчёт стоимости",
        "## 27. Error state",
        "## 31. Destructive actions",
        "## 33. Permissions и роли",
        "## 37. Responsive CRM",
        "## 44. Текущий `brand-foundations-v2.css`",
        "## 46. Definition of Done для CRM-экрана",
    ):
        require(marker in text, f"CRM brandbook missing marker: {marker}")
    require("Orange не означает" in text,
            "CRM brandbook must keep brand-vs-semantic color boundary")
    require("gradient primary button" in text,
            "CRM brandbook must keep target removal of advertising gradients")

if DEMO_DOC.exists():
    text = DEMO_DOC.read_text(encoding="utf-8")
    for marker in (
        "# Демо-материалы РА «Лидер»",
        "Демо-материалы помогают клиенту понять",
        "НЕ являются портфолио",
        "Демонстрационный пример",
        "Визуализация. Не является выполненным объектом.",
        "## 7. Серия демо: типы вывесок",
        "## 9. Серия демо: способы монтажа",
        "## 11. Серия демо: печатная продукция",
        "## 17. AI и генеративная графика",
        "## 23. Каталог демо-ассетов",
        "## 31. Definition of Done для одного демо-материала",
        "Что вы можете для меня сделать и какой вариант мне выбрать?",
        "Что вы уже реально делали?",
    ):
        require(marker in text, f"demo materials guide missing marker: {marker}")
    require("Портфолио хранится отдельно" in text,
            "demo guide must keep portfolio assets separate from demo assets")
    require("AI-рендер не является техническим чертежом" in text,
            "demo guide must keep AI-vs-technical-drawing boundary")

if QUICK_GUIDE.exists():
    text = QUICK_GUIDE.read_text(encoding="utf-8")
    for marker in (
        "# РА «Лидер» — быстрый фирменный гайд",
        "#FF6A00",
        "Основной: Manrope",
        "Рассчитать заказ",
        "реальные работы",
        "Tone of Voice",
        "Перед публикацией",
    ):
        require(marker in text, f"quick brand guide missing marker: {marker}")

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
