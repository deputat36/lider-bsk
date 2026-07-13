#!/usr/bin/env python3
from __future__ import annotations

from collections import defaultdict
from html.parser import HTMLParser
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_SUBPAGES = (
    ROOT / "banner" / "index.html",
    ROOT / "signs" / "index.html",
    ROOT / "auto-stickers" / "index.html",
)
TOKEN_REFERENCE_ATTRIBUTES = {
    "aria-labelledby",
    "aria-describedby",
    "aria-controls",
    "aria-owns",
    "headers",
}
SINGLE_REFERENCE_ATTRIBUTES = {
    "for",
    "form",
    "list",
}
WHITESPACE_RE = re.compile(r"\s")


class DomParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.ids: dict[str, list[tuple[int, str]]] = defaultdict(list)
        self.references: list[tuple[int, str, str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        line, _ = self.getpos()
        values = {name.lower(): value for name, value in attrs if value is not None}
        element_id = values.get("id")
        if element_id is not None:
            self.ids[element_id].append((line, tag.lower()))

        for attr in SINGLE_REFERENCE_ATTRIBUTES:
            value = values.get(attr)
            if value:
                self.references.append((line, tag.lower(), attr, value.strip()))

        for attr in TOKEN_REFERENCE_ATTRIBUTES:
            value = values.get(attr)
            if not value:
                continue
            for token in value.split():
                self.references.append((line, tag.lower(), attr, token))


def public_pages() -> list[Path]:
    pages = sorted(ROOT.glob("*.html"))
    pages.extend(path for path in PUBLIC_SUBPAGES if path.is_file())
    unique = sorted({path.resolve() for path in pages})
    if not unique:
        raise SystemExit("No public HTML pages found")
    return unique


def display(path: Path) -> str:
    return path.resolve().relative_to(ROOT.resolve()).as_posix()


def main() -> None:
    pages = public_pages()
    errors: list[str] = []
    total_ids = 0
    total_references = 0

    for page in pages:
        parser = DomParser()
        parser.feed(page.read_text(encoding="utf-8"))
        total_ids += sum(len(items) for items in parser.ids.values())
        total_references += len(parser.references)

        for element_id, occurrences in parser.ids.items():
            if not element_id:
                locations = ", ".join(f"line {line} <{tag}>" for line, tag in occurrences)
                errors.append(f"{display(page)}: empty id at {locations}")
                continue
            if WHITESPACE_RE.search(element_id):
                locations = ", ".join(f"line {line} <{tag}>" for line, tag in occurrences)
                errors.append(f"{display(page)}: id {element_id!r} contains whitespace at {locations}")
            if len(occurrences) > 1:
                locations = ", ".join(f"line {line} <{tag}>" for line, tag in occurrences)
                errors.append(f"{display(page)}: duplicate id {element_id!r} at {locations}")

        available_ids = set(parser.ids)
        for line, tag, attr, target in parser.references:
            if target not in available_ids:
                errors.append(
                    f"{display(page)}:{line}: <{tag} {attr}={target!r}> references missing id {target!r}"
                )

    if errors:
        print("\n".join(errors))
        sys.exit(1)

    print(
        "Public DOM reference integrity is valid: "
        f"{len(pages)} pages, {total_ids} ids, {total_references} ID references."
    )


if __name__ == "__main__":
    main()
