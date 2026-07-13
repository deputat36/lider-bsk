#!/usr/bin/env python3
from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
import sys

ROOT = Path(__file__).resolve().parents[1]
ROOT_RESOLVED = ROOT.resolve()
PUBLIC_SUBPAGES = (
    ROOT / "banner" / "index.html",
    ROOT / "signs" / "index.html",
    ROOT / "auto-stickers" / "index.html",
)
LOCAL_HOSTS = {"lider-bsk.ru", "www.lider-bsk.ru"}
SKIP_SCHEMES = {"mailto", "tel", "javascript", "data", "blob"}


class ResourceParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.references: list[tuple[str, str, str]] = []
        self.ids: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {name.lower(): value for name, value in attrs if value is not None}
        element_id = values.get("id") or values.get("name")
        if element_id:
            self.ids.add(element_id)

        for attr in ("href", "src", "action", "poster"):
            value = values.get(attr)
            if value:
                self.references.append((tag.lower(), attr, value.strip()))

        for attr in ("srcset",):
            value = values.get(attr)
            if not value:
                continue
            for item in value.split(","):
                candidate = item.strip().split()[0] if item.strip() else ""
                if candidate:
                    self.references.append((tag.lower(), attr, candidate))


_parser_cache: dict[Path, ResourceParser] = {}


def parse_html(path: Path) -> ResourceParser:
    resolved = path.resolve()
    cached = _parser_cache.get(resolved)
    if cached is not None:
        return cached
    parser = ResourceParser()
    parser.feed(path.read_text(encoding="utf-8"))
    _parser_cache[resolved] = parser
    return parser


def public_pages() -> list[Path]:
    pages = sorted(ROOT.glob("*.html"))
    pages.extend(path for path in PUBLIC_SUBPAGES if path.is_file())
    unique = sorted({path.resolve() for path in pages})
    if not unique:
        raise SystemExit("No public HTML pages found")
    return unique


def local_target(source: Path, raw_url: str) -> tuple[Path, str] | None:
    value = raw_url.strip()
    if not value or value == "#":
        return None

    parsed = urlsplit(value)
    scheme = parsed.scheme.lower()
    if scheme in SKIP_SCHEMES:
        return None
    if scheme and scheme not in {"http", "https"}:
        return None

    host = parsed.netloc.lower().split("@")[-1].split(":")[0]
    if host and host not in LOCAL_HOSTS:
        return None

    path_text = unquote(parsed.path)
    fragment = unquote(parsed.fragment)

    if not path_text:
        candidate = source
    elif path_text.startswith("/"):
        relative = path_text.lstrip("/")
        candidate = ROOT / (relative or "index.html")
    else:
        candidate = source.parent / path_text

    if path_text.endswith("/"):
        candidate = candidate / "index.html"

    candidate = candidate.resolve()
    try:
        candidate.relative_to(ROOT_RESOLVED)
    except ValueError as exc:
        raise ValueError(f"reference escapes repository root: {raw_url}") from exc

    if candidate.is_dir():
        candidate = candidate / "index.html"

    return candidate, fragment


def display(path: Path) -> str:
    return path.resolve().relative_to(ROOT_RESOLVED).as_posix()


def main() -> None:
    pages = public_pages()
    errors: list[str] = []
    checked_references = 0
    checked_anchors = 0

    for page in pages:
        parser = parse_html(page)
        for tag, attr, raw_url in parser.references:
            try:
                resolved = local_target(page, raw_url)
            except ValueError as exc:
                errors.append(f"{display(page)}: <{tag} {attr}={raw_url!r}>: {exc}")
                continue
            if resolved is None:
                continue

            target, fragment = resolved
            checked_references += 1
            if not target.is_file():
                errors.append(
                    f"{display(page)}: <{tag} {attr}={raw_url!r}> points to missing {display(target)}"
                )
                continue

            if fragment and target.suffix.lower() in {".html", ".htm"}:
                checked_anchors += 1
                target_parser = parse_html(target)
                if fragment not in target_parser.ids:
                    errors.append(
                        f"{display(page)}: <{tag} {attr}={raw_url!r}> points to missing anchor "
                        f"#{fragment} in {display(target)}"
                    )

    if errors:
        print("\n".join(errors))
        sys.exit(1)

    print(
        "Public local resource integrity is valid: "
        f"{len(pages)} pages, {checked_references} local references, "
        f"{checked_anchors} anchor references."
    )


if __name__ == "__main__":
    main()
