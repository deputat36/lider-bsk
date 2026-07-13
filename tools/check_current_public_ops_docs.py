#!/usr/bin/env python3
"""Validate the current public-site operational documentation baseline.

Historical audit documents may keep their original v8/v9 wording. This checker
covers only the documents that operators should treat as current instructions.
"""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
STATUS = ROOT / "docs" / "STATUS.md"
NEXT_STEPS = ROOT / "docs" / "NEXT_SAFE_STEPS.md"
DECISIONS = ROOT / "docs" / "DECISIONS.md"
E2E_RUNBOOK = ROOT / "docs" / "PUBLIC_REQUEST_BROWSER_E2E_RUNBOOK_2026-07-12.md"


def read(path: Path, errors: list[str]) -> str:
    if not path.is_file():
        errors.append(f"Missing current operations document: {path.relative_to(ROOT)}")
        return ""
    return path.read_text(encoding="utf-8")


def require(text: str, marker: str, source: Path, errors: list[str]) -> None:
    if marker not in text:
        errors.append(f"{source.relative_to(ROOT)}: missing current marker {marker!r}")


def forbid(text: str, marker: str, source: Path, errors: list[str]) -> None:
    if marker in text:
        errors.append(f"{source.relative_to(ROOT)}: forbidden stale instruction {marker!r}")


def main() -> int:
    errors: list[str] = []
    status = read(STATUS, errors)
    next_steps = read(NEXT_STEPS, errors)
    decisions = read(DECISIONS, errors)
    runbook = read(E2E_RUNBOOK, errors)

    for marker in (
        "Дата обновления: 2026-07-13.",
        "## Публичный сайт — актуальный статус",
        "leader-public-lead v10",
        "55 корневых публичных HTML",
        "12 заявок",
        "один audit-результат `accepted / lead_insert_created`",
        "docs/PUBLIC_REQUEST_BROWSER_E2E_RUNBOOK_2026-07-12.md",
        "production-заявка не отправлялась",
        "issues #235, #236 и #206",
        "## Предупреждение готовности потребности",
    ):
        require(status, marker, STATUS, errors)

    for marker in (
        "Дата: 2026-07-13.",
        "leader-public-lead v10",
        "#235",
        "#236",
        "#206",
        "docs/PUBLIC_REQUEST_BROWSER_E2E_RUNBOOK_2026-07-12.md",
        "только после отдельного явного разрешения владельца",
        "read-only SQL",
        "Supabase production не менять",
    ):
        require(next_steps, marker, NEXT_STEPS, errors)

    for marker in (
        "Дата обновления: 2026-07-13.",
        "ADR-012. Публичный сайт не раскрывает внутреннюю терминологию и неподтверждённый NAP",
        "ADR-013. Browser E2E публичной заявки является approval-gated production-действием",
        "leader-public-lead v10",
        "PUBLIC_REQUEST_BROWSER_E2E_RUNBOOK_2026-07-12.md",
    ):
        require(decisions, marker, DECISIONS, errors)

    for marker in (
        "Тест CRM v4 audit v8",
        "Отправить заявку с пометкой `Тест CRM v4 audit v8`",
        "Дата: 2026-06-25.",
    ):
        forbid(next_steps, marker, NEXT_STEPS, errors)

    for marker in (
        "явное разрешение владельца",
        "accepted",
        "duplicate",
        "Runbook содержит только read-only SQL",
    ):
        require(runbook, marker, E2E_RUNBOOK, errors)

    if errors:
        print("\n".join(errors))
        return 1

    print("Current public-site operational documentation is valid for 2026-07-13.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
