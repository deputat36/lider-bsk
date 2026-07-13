#!/usr/bin/env python3
"""Validate public portfolio and NAP evidence intake documents."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
PORTFOLIO = ROOT / "docs" / "PUBLIC_PORTFOLIO_MATERIALS_INTAKE_2026-07-13.md"
NAP = ROOT / "docs" / "PUBLIC_NAP_CONFIRMATION_FORM_2026-07-13.md"


def read(path: Path, errors: list[str]) -> str:
    if not path.is_file():
        errors.append(f"Missing evidence intake document: {path.relative_to(ROOT)}")
        return ""
    return path.read_text(encoding="utf-8")


def require(text: str, markers: tuple[str, ...], path: Path, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{path.relative_to(ROOT)}: missing marker {marker!r}")


def forbid(text: str, markers: tuple[str, ...], path: Path, errors: list[str]) -> None:
    for marker in markers:
        if marker in text:
            errors.append(f"{path.relative_to(ROOT)}: forbidden instruction {marker!r}")


def main() -> int:
    errors: list[str] = []
    portfolio = read(PORTFOLIO, errors)
    nap = read(NAP, errors)

    require(
        portfolio,
        (
            "Связано: issue #235.",
            "6–10 реальных выполненных заказов",
            "не означает разрешение на публикацию",
            "## Карточка одного кейса",
            "## Минимум для публикации одного кейса",
            "можно ли публиковать фотографии: да / нет",
            "удалены EXIF-координаты",
            "не использовать фразы",
            "увеличили продажи",
            "вымышленного отзыва",
            "alt-текст",
            "закрыть issue #235 только после публикации",
            "Supabase schema, RLS, Edge Functions и production data",
        ),
        PORTFOLIO,
        errors,
    )

    require(
        nap,
        (
            "Связано: issue #236.",
            "точный адрес, график, координаты, карты, мессенджеры и `sameAs` не добавлять",
            "8 980 245-74-71",
            "tel:+79802457471",
            "zakaz@lider-bsk.ru",
            "## 2. Формат работы и адрес",
            "## 3. График",
            "## 5. Социальные сети и мессенджеры",
            "## 6. Яндекс Карты и 2ГИС",
            "## 7. География услуг",
            "## 9. Обещание времени ответа",
            "## Таблица итоговых значений",
            "openingHoursSpecification",
            "sameAs: VK",
            "Если источники расходятся, не выбирать значение по большинству",
            "закрыть issue #236 только после production-проверки",
            "Supabase schema, RLS, Edge Functions, Auth и production data",
        ),
        NAP,
        errors,
    )

    forbid(
        portfolio + "\n" + nap,
        (
            "service_role",
            "SUPABASE_SERVICE_ROLE_KEY",
            "DELETE FROM",
            "UPDATE public.",
            "INSERT INTO public.",
        ),
        PORTFOLIO,
        errors,
    )

    if errors:
        print("\n".join(errors))
        return 1

    print("Public portfolio and NAP evidence intake contracts are valid.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
