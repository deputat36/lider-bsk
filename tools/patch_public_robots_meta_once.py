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
ROBOTS = '  <meta name="robots" content="index, follow">'
DESCRIPTION_RE = re.compile(r'^(\s*<meta\s+name="description"\s+content="[^"]*">)\s*$', re.MULTILINE)


def patch(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    robots_count = text.count('<meta name="robots"')
    if robots_count == 1:
        if ROBOTS.strip() not in text:
            raise SystemExit(f"{path.name}: existing robots meta is not the expected index/follow value")
        return False
    if robots_count != 0:
        raise SystemExit(f"{path.name}: unexpected robots meta count {robots_count}")

    matches = list(DESCRIPTION_RE.finditer(text))
    if len(matches) != 1:
        raise SystemExit(f"{path.name}: expected exactly one single-line meta description, found {len(matches)}")

    match = matches[0]
    updated = text[: match.end()] + "\n" + ROBOTS + text[match.end() :]
    if updated.count('<meta name="robots"') != 1:
        raise SystemExit(f"{path.name}: robots meta insertion failed")
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
