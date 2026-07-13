#!/usr/bin/env python3
from __future__ import annotations

from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
HOST = "https://www.lider-bsk.ru"
PUBLIC_SUBPAGES = (
    ROOT / "banner" / "index.html",
    ROOT / "signs" / "index.html",
    ROOT / "auto-stickers" / "index.html",
)
ALLOWED_ROBOTS = {"index,follow", "noindex,follow"}


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.html_langs: list[str] = []
        self.charsets: list[str] = []
        self.viewports: list[str] = []
        self.robots: list[str] = []
        self.descriptions: list[str] = []
        self.canonicals: list[str] = []
        self.titles: list[str] = []
        self.h1_texts: list[str] = []
        self._capture_title = False
        self._capture_h1 = False
        self._buffer: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {name.lower(): (value or "").strip() for name, value in attrs}
        tag = tag.lower()
        if tag == "html":
            self.html_langs.append(values.get("lang", ""))
        elif tag == "meta":
            if "charset" in values:
                self.charsets.append(values["charset"])
            name = values.get("name", "").lower()
            content = values.get("content", "").strip()
            if name == "viewport":
                self.viewports.append(content)
            elif name == "robots":
                self.robots.append(content)
            elif name == "description":
                self.descriptions.append(content)
        elif tag == "link":
            rel_tokens = {token.lower() for token in values.get("rel", "").split()}
            if "canonical" in rel_tokens:
                self.canonicals.append(values.get("href", ""))
        elif tag == "title":
            self._capture_title = True
            self._buffer = []
        elif tag == "h1":
            self._capture_h1 = True
            self._buffer = []

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "title" and self._capture_title:
            self.titles.append(" ".join("".join(self._buffer).split()))
            self._capture_title = False
            self._buffer = []
        elif tag == "h1" and self._capture_h1:
            self.h1_texts.append(" ".join("".join(self._buffer).split()))
            self._capture_h1 = False
            self._buffer = []

    def handle_data(self, data: str) -> None:
        if self._capture_title or self._capture_h1:
            self._buffer.append(data)


def public_pages() -> list[Path]:
    pages = sorted(ROOT.glob("*.html"))
    pages.extend(path for path in PUBLIC_SUBPAGES if path.is_file())
    return sorted({path.resolve() for path in pages})


def display(path: Path) -> str:
    return path.resolve().relative_to(ROOT.resolve()).as_posix()


def normalize_robots(value: str) -> str:
    tokens = [token.strip().lower() for token in value.split(",") if token.strip()]
    return ",".join(tokens)


def expected_self_canonical(page: Path) -> str:
    rel = page.resolve().relative_to(ROOT.resolve()).as_posix()
    if rel == "index.html":
        return HOST + "/"
    if rel.endswith("/index.html"):
        return HOST + "/" + rel[: -len("index.html")]
    return HOST + "/" + rel


def sitemap_urls() -> set[str]:
    sitemap = ROOT / "sitemap.xml"
    text = sitemap.read_text(encoding="utf-8")
    return {item.strip() for item in re.findall(r"<loc>(.*?)</loc>", text, flags=re.S)}


def main() -> None:
    pages = public_pages()
    if not pages:
        raise SystemExit("No public HTML pages found")

    sitemap = sitemap_urls()
    errors: list[str] = []
    canonical_owners: dict[str, list[str]] = {}
    indexable_pages = 0
    noindex_pages = 0

    for page in pages:
        parser = PageParser()
        parser.feed(page.read_text(encoding="utf-8"))
        name = display(page)

        if parser.html_langs != ["ru"]:
            errors.append(f"{name}: expected exactly <html lang='ru'>, got {parser.html_langs!r}")

        normalized_charsets = [value.lower().replace("-", "") for value in parser.charsets]
        if normalized_charsets != ["utf8"]:
            errors.append(f"{name}: expected exactly one UTF-8 charset, got {parser.charsets!r}")

        if len(parser.viewports) != 1 or "width=device-width" not in parser.viewports[0].lower():
            errors.append(f"{name}: expected one responsive viewport meta, got {parser.viewports!r}")

        if len(parser.titles) != 1 or not parser.titles[0]:
            errors.append(f"{name}: expected exactly one non-empty <title>, got {parser.titles!r}")

        if len(parser.descriptions) != 1 or len(parser.descriptions[0]) < 30:
            errors.append(
                f"{name}: expected exactly one useful meta description (>=30 chars), got {parser.descriptions!r}"
            )

        if len(parser.h1_texts) != 1 or not parser.h1_texts[0]:
            errors.append(f"{name}: expected exactly one non-empty H1, got {parser.h1_texts!r}")

        if len(parser.canonicals) != 1:
            errors.append(f"{name}: expected exactly one canonical, got {parser.canonicals!r}")
            canonical = ""
        else:
            canonical = parser.canonicals[0]
            parsed = urlsplit(canonical)
            if parsed.scheme != "https" or parsed.netloc != "www.lider-bsk.ru" or parsed.query or parsed.fragment:
                errors.append(f"{name}: invalid public canonical {canonical!r}")
            canonical_owners.setdefault(canonical, []).append(name)

        if len(parser.robots) != 1:
            errors.append(f"{name}: expected exactly one robots meta, got {parser.robots!r}")
            robots = ""
        else:
            robots = normalize_robots(parser.robots[0])
            if robots not in ALLOWED_ROBOTS:
                errors.append(f"{name}: unsupported robots value {parser.robots[0]!r}")

        self_canonical = expected_self_canonical(page)
        is_indexable = robots == "index,follow"
        if is_indexable:
            indexable_pages += 1
            if canonical and canonical != self_canonical:
                errors.append(f"{name}: indexable page canonical must be self URL {self_canonical!r}, got {canonical!r}")
            if page.parent == ROOT and self_canonical not in sitemap:
                errors.append(f"{name}: indexable root page is missing from sitemap: {self_canonical}")
        elif robots == "noindex,follow":
            noindex_pages += 1
            if self_canonical in sitemap:
                errors.append(f"{name}: noindex page must not be present in sitemap: {self_canonical}")

    duplicates = {url: owners for url, owners in canonical_owners.items() if len(owners) > 1}
    for url, owners in sorted(duplicates.items()):
        # Duplicate canonical is allowed only when every owner is noindex; the page-level
        # rules above already ensure indexable pages use their own unique canonical.
        indexable_owners = []
        for owner in owners:
            page = ROOT / owner
            parser = PageParser()
            parser.feed(page.read_text(encoding="utf-8"))
            if parser.robots and normalize_robots(parser.robots[0]) == "index,follow":
                indexable_owners.append(owner)
        if indexable_owners:
            errors.append(f"canonical {url!r} is shared by indexable page(s): {indexable_owners!r}")

    sitemap_duplicates = [url for url, count in Counter(sitemap).items() if count > 1]
    if sitemap_duplicates:
        errors.append(f"sitemap contains duplicate URLs: {sitemap_duplicates!r}")

    if errors:
        print("\n".join(errors))
        sys.exit(1)

    print(
        "Public HTML SEO baseline is valid: "
        f"{len(pages)} pages, {indexable_pages} indexable, {noindex_pages} noindex, "
        f"{len(sitemap)} sitemap URLs."
    )


if __name__ == "__main__":
    main()
