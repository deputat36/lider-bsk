#!/usr/bin/env python3
"""Проверяет безопасное подключение фирменного визуального слоя CRM v2."""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BRAND_PATH = ROOT / "crm/v4/assets/v4/brand-foundations-v2.css"
POLISH_PATH = ROOT / "crm/v4/assets/v4/ui-polish.css"


def require(text: str, needle: str, label: str) -> None:
    if needle not in text:
        raise SystemExit(f"CRM brand v2: отсутствует {label}: {needle}")


def forbid(text: str, needle: str, label: str) -> None:
    if needle in text:
        raise SystemExit(f"CRM brand v2: запрещён {label}: {needle}")


def main() -> None:
    if not BRAND_PATH.is_file():
        raise SystemExit(f"CRM brand v2: нет файла {BRAND_PATH.relative_to(ROOT)}")
    if not POLISH_PATH.is_file():
        raise SystemExit(f"CRM brand v2: нет файла {POLISH_PATH.relative_to(ROOT)}")

    brand = BRAND_PATH.read_text(encoding="utf-8")
    polish = POLISH_PATH.read_text(encoding="utf-8")

    require(
        polish,
        '@import url("./brand-foundations-v2.css?v=20260721-1");',
        "версионированное подключение через действующий ui-polish.css",
    )

    required_tokens = {
        "основной оранжевый": "--v4-brand-orange:#ff6a00;",
        "графит": "--v4-brand-graphite:#171717;",
        "нейтральный фон": "--v4-brand-canvas:#f7f7f8;",
        "доступный focus ring": "--v4-brand-focus:0 0 0 4px rgba(255,106,0,.22);",
    }
    for label, token in required_tokens.items():
        require(brand, token, label)

    required_contracts = {
        "приоритет фирменной основной кнопки": "html body button.v4-primary",
        "активная вкладка": ".v4-layout-tabs button.is-active",
        "клавиатурный фокус": "button:focus-visible",
        "мобильная цель 44px": "min-height:44px;",
        "успешный статус": ".v4-status.is-good",
        "предупреждение": ".v4-status.is-warn",
        "ошибка": ".v4-status.is-error",
        "комментарий о границе": "не изменяет DOM-контракты",
    }
    for label, marker in required_contracts.items():
        require(brand, marker, label)

    for old_blue in ("#1d4ed8", "#2563eb", "#075985"):
        forbid(brand.lower(), old_blue, "старый синий основной акцент")

    # Документационные CSS-комментарии могут честно упоминать Supabase.
    # Проверяем только исполняемую часть файла.
    executable_css = re.sub(r"/\*.*?\*/", "", brand, flags=re.S).lower()
    for write_marker in (
        "fetch(",
        ".from(",
        ".insert(",
        ".update(",
        ".delete(",
        "supabase",
    ):
        forbid(executable_css, write_marker, "сетевой или data-write маркер в CSS")

    print("CRM brand foundations v2 check: OK")


if __name__ == "__main__":
    main()
