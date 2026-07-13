#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
TARGETS = (
    "bannery-borisoglebsk.html",
    "dizayn-maketov.html",
    "logotip-firmennyy-stil.html",
    "nakleyki-plotternaya-rezka-borisoglebsk.html",
    "oformlenie-vitrin-borisoglebsk.html",
    "outdoor-advertising-borisoglebsk.html",
    "pechat-na-plenke-borisoglebsk.html",
    "socseti-kontent.html",
    "tablichki-borisoglebsk.html",
    "vyveski-borisoglebsk.html",
    "yandex-karty-2gis.html",
)
ROBOTS = '<meta name="robots" content="index, follow">'
DESCRIPTION_RE = re.compile(
    r'<meta\b(?=[^>]*\bname\s*=\s*["\']description["\'])[^>]*>',
    re.IGNORECASE | re.DOTALL,
)
ROBOTS_RE = re.compile(
    r'<meta\b(?=[^>]*\bname\s*=\s*["\']robots["\'])[^>]*>',
    re.IGNORECASE | re.DOTALL,
)


def patch(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    robots_count = len(ROBOTS_RE.findall(text))
    if robots_count == 1:
        if ROBOTS not in text:
            raise SystemExit(f"{path.name}: existing robots meta is not the expected index/follow value")
        return False
    if robots_count != 0:
        raise SystemExit(f"{path.name}: unexpected robots meta count {robots_count}")

    matches = list(DESCRIPTION_RE.finditer(text))
    if len(matches) != 1:
        raise SystemExit(f"{path.name}: expected exactly one meta description, found {len(matches)}")

    match = matches[0]
    line_start = text.rfind("\n", 0, match.start()) + 1
    line_prefix = text[line_start:match.start()]
    indent_match = re.match(r"[ \t]*", line_prefix)
    indent = indent_match.group(0) if indent_match else ""
    updated = text[: match.end()] + "\n" + indent + ROBOTS + text[match.end() :]

    robots_after = ROBOTS_RE.findall(updated)
    if robots_after != [ROBOTS]:
        raise SystemExit(f"{path.name}: robots meta insertion failed")
    if updated.lower().count("<!doctype html>") != text.lower().count("<!doctype html>"):
        raise SystemExit(f"{path.name}: document count changed unexpectedly")
    path.write_text(updated, encoding="utf-8")
    return True


def main() -> None:
    changed = []
    for relative in TARGETS:
        path = ROOT / relative
        if not path.is_file():
            raise SystemExit(f"Missing target: {relative}")
        if patch(path):
            changed.append(relative)

    print(f"Guarded robots patch complete: {len(changed)} changed")
    for relative in changed:
        print(relative)


if __name__ == "__main__":
    main()
