#!/usr/bin/env python3
"""Проверяет изолированный визуальный стенд фирменного слоя CRM."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PREVIEW = ROOT / "crm/v4/brand-preview.html"


def require(text: str, marker: str, label: str) -> None:
    if marker not in text:
        raise SystemExit(f"CRM brand preview: отсутствует {label}: {marker}")


def forbid(text: str, marker: str, label: str) -> None:
    if marker in text:
        raise SystemExit(f"CRM brand preview: запрещён {label}: {marker}")


def main() -> None:
    if not PREVIEW.is_file():
        raise SystemExit("CRM brand preview: файл crm/v4/brand-preview.html не найден")

    html = PREVIEW.read_text(encoding="utf-8")
    lower = html.lower()

    required = {
        "запрет индексации": '<meta name="robots" content="noindex,nofollow,noarchive">',
        "базовый CSS CRM": 'href="assets/v4/styles.css',
        "фирменный слой": 'href="assets/v4/ui-polish.css',
        "объяснение стенда": "Изолированный стенд",
        "главный CTA": 'class="v4-primary"',
        "карточка заявки": 'class="v4-lead-card"',
        "успешный статус": 'class="v4-status is-good"',
        "предупреждение": 'class="v4-status is-warn"',
        "ошибка": 'class="v4-status is-error"',
        "мобильная адаптация": "@media(max-width:860px)",
    }
    for label, marker in required.items():
        require(html, marker, label)

    forbidden = {
        "JavaScript": "<script",
        "Supabase": "supabase",
        "сетевой запрос": "fetch(",
        "форму отправки": "<form",
        "endpoint": "/functions/v1/",
        "внешний ресурс": "http://",
        "внешний защищённый ресурс": "https://",
        "автоматическую отправку": "type=\"submit\"",
    }
    for label, marker in forbidden.items():
        forbid(lower, marker.lower(), label)

    if lower.count("<button") < 8:
        raise SystemExit("CRM brand preview: недостаточно кнопок для проверки состояний")
    if lower.count("v4-status") < 5:
        raise SystemExit("CRM brand preview: недостаточно статусов для визуальной проверки")

    print("CRM brand preview check: OK")


if __name__ == "__main__":
    main()
