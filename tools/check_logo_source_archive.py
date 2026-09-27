#!/usr/bin/env python3
"""Проверяет, что восстановленный исходник логотипа остаётся архивным."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/brand/source/logo-lider-original-20260621.svg"
PUBLIC = ROOT / "assets/brand/logo-lider-header.svg"
DOC = ROOT / "docs/LOGO_SOURCE_RECOVERY_2026-07-21.md"
SOURCE_REF = "assets/brand/source/logo-lider-original-20260621.svg"


def main() -> int:
    for path in (SOURCE, PUBLIC, DOC):
        if not path.is_file():
            raise AssertionError(f"missing file: {path.relative_to(ROOT)}")

    source_text = SOURCE.read_text(encoding="utf-8")
    if "data:image/png;base64," not in source_text:
        raise AssertionError("archived logo source must preserve the exact embedded PNG")
    if 'viewBox="0 0 300 271"' not in source_text:
        raise AssertionError("archived logo source has unexpected geometry")

    public_text = PUBLIC.read_text(encoding="utf-8").lower()
    if 'data-source-sha256="3bf3bb59ac90cdfe535ec2c66339462d5c7d90199b453563226129744bcef833"' not in public_text:
        raise AssertionError("public logo must refer to the verified owner source from July 17")

    scan_extensions = {".html", ".css", ".js", ".mjs", ".json"}
    for path in ROOT.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in scan_extensions:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        if SOURCE_REF in text:
            raise AssertionError(
                f"archived logo source must not be referenced by published code: {path.relative_to(ROOT)}"
            )

    doc = DOC.read_text(encoding="utf-8")
    for marker in (
        "автоматически трассировать и сразу публиковать",
        "публичный логотип не изменён",
        "визуального согласования",
    ):
        if marker not in doc:
            raise AssertionError(f"logo recovery doc missing marker: {marker}")

    print("logo source archive check: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
