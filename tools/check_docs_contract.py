#!/usr/bin/env python3
"""Validate repository documentation contracts with actionable diagnostics."""
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]

FILES = {
    "access": ROOT / "docs/CRM_V4_TEST_ACCESS.md",
    "checklist": ROOT / "docs/CRM_V4_TESTER_CHECKLIST.md",
    "onboarding": ROOT / "docs/CRM_ADMIN_TESTER_ONBOARDING.md",
    "next_steps": ROOT / "docs/NEXT_SAFE_STEPS.md",
    "status": ROOT / "docs/STATUS.md",
    "manual": ROOT / "docs/MANUAL_TEST_CHECKLIST.md",
    "decisions": ROOT / "docs/DECISIONS.md",
    "static_runbook": ROOT / "docs/STATIC_CHECKS_RUNBOOK.md",
    "browser_report": ROOT / "docs/CRM_V4_BROWSER_TEST_REPORT.md",
    "audit": ROOT / "docs/PUBLIC_LEAD_AUDIT.md",
    "public_site_audit": ROOT / "docs/PUBLIC_SITE_AUDIT.md",
    "audit_v8": ROOT / "docs/CRM_V4_AUDIT_V8_CHECK.md",
    "issue_template": ROOT / ".github/ISSUE_TEMPLATE/crm-v4-browser-test.md",
    "current_ops": ROOT / "tools/check_current_public_ops_docs.py",
}

REQUIRED = {
    "access": (
        "https://deputat36.github.io/lidercalculator/app-v4.html",
        "leader_user_profiles",
        "user_metadata",
        "is_active = false",
    ),
    "checklist": (
        "Ctrl + F5",
        "Проверить CRM",
        "Аудит заявок",
        "request_id",
        "docs/CRM_V4_BROWSER_TEST_REPORT.md",
        "https://www.lider-bsk.ru/request.html",
        "Тест CRM v4 audit v8",
        "Скопировать request_id",
        "docs/CRM_V4_AUDIT_V8_CHECK.md",
    ),
    "audit_v8": (
        "Проверка аудита публичной заявки v8",
        "Тест CRM v4 audit v8",
        "Скопировать request_id",
        "Проверить request_id",
        "Проверить цепочку",
        "С request_id",
        "Без request_id",
        "Открыть заявку",
        "Цепочка полная",
        "Дубль",
    ),
    "decisions": (
        "ADR-008. Идемпотентность публичных заявок и явный audit дублей",
        "ADR-009. Трассировка request_id через read-only view",
        "ADR-012. Публичный сайт не раскрывает внутреннюю терминологию и неподтверждённый NAP",
        "ADR-013. Browser E2E публичной заявки является approval-gated production-действием",
        "leader_request_trace",
        "security_invoker = true",
        "request_id_conflict",
    ),
    "static_runbook": (
        "Дата: 2026-06-29.",
        "leader-public-lead v9",
        "leader-crm-leads v12",
        "leader_request_trace",
        "public-lead-audit-v1.js?v=20260629-trace-button-1",
        "public-lead-audit-helper-v1.js?v=20260629-trace-open-lead-1",
        "public-lead-audit-summary-v1.js?v=20260629-request-summary-1",
        "Проверить request_id",
        "Проверить цепочку",
        "С request_id",
        "Без request_id",
        "Открыть заявку",
        "Цепочка полная",
    ),
    "onboarding": (
        "kvmbsk@yandex.ru",
        "роль admin",
        "leader_user_profiles.is_active = false",
    ),
    "manual": (
        "Дата: 2026-06-28.",
        "Доступ и роли",
        "auth.js?v=20260628-access-label-1",
        "user-admin-v1.js?v=20260628-access-label-1",
        "crm-v4-expanded-menu-v1.js?v=20260628-access-label-1",
        "marker `20260628-access-label-1`",
    ),
    "audit": (
        "`v9`",
        "v8 audit contract",
        "duplicate",
        "Скопировать request_id",
        "leader_public_lead_audit_insert_failed",
        "rollback-smoke-test",
    ),
    "public_site_audit": (
        "Обновление статуса: 2026-06-29.",
        "leader-public-lead v9",
        "v8 audit contract",
        "После PR #102",
        "После PR #103",
        "leader-public-header-guard-v1",
        "index.html",
    ),
    "browser_report": (
        "CRM v4 browser test report",
        "Итог: прошло / прошло с замечаниями / не прошло",
    ),
    "issue_template": (
        "CRM v4 browser test",
        "request_id",
    ),
}

FORBIDDEN = {
    "checklist": ("Тест CRM v4 audit v7",),
    "decisions": ("ignore-duplicates",),
    "manual": ("auth.js?v=20260627-access-3",),
    "audit": ("`v7`",),
    "public_site_audit": ("после v8",),
    "next_steps": ("### Шаг 3. Добавить серверный аудит публичных заявок",),
}


def main() -> int:
    errors: list[str] = []
    texts: dict[str, str] = {}

    for key, path in FILES.items():
        if not path.is_file():
            errors.append(f"Missing required documentation file: {path.relative_to(ROOT)}")
            texts[key] = ""
            continue
        texts[key] = path.read_text(encoding="utf-8")

    for key, markers in REQUIRED.items():
        text = texts.get(key, "")
        path = FILES[key].relative_to(ROOT)
        for marker in markers:
            if marker not in text:
                errors.append(f"{path}: missing marker {marker!r}")

    for key, markers in FORBIDDEN.items():
        text = texts.get(key, "")
        path = FILES[key].relative_to(ROOT)
        for marker in markers:
            if marker in text:
                errors.append(f"{path}: forbidden stale marker {marker!r}")

    current_ops = FILES["current_ops"]
    if current_ops.is_file():
        result = subprocess.run(
            [sys.executable, str(current_ops)],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        if result.returncode != 0:
            output = (result.stdout + "\n" + result.stderr).strip()
            errors.append("Current public operations docs contract failed:\n" + output)

    if errors:
        print("\n".join(errors))
        return 1

    print("Repository documentation contracts are valid.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
