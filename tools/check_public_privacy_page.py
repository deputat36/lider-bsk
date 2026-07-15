#!/usr/bin/env python3
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
import sys

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "privacy.html"
CSS = ROOT / "assets" / "public-utility-pages.css"


class Parser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.hrefs: list[str] = []
        self.stylesheets: list[str] = []
        self.robots: list[str] = []
        self.canonicals: list[str] = []
        self.body_classes: set[str] = set()
        self.h1 = 0
        self.main = 0
        self.articles = 0
        self.inline_styles = 0
        self.executable_inline_scripts = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {name.lower(): (value or "").strip() for name, value in attrs}
        tag = tag.lower()
        if tag == "a" and values.get("href"):
            self.hrefs.append(values["href"])
        elif tag == "link" and "stylesheet" in values.get("rel", "").lower().split():
            self.stylesheets.append(values.get("href", ""))
        elif tag == "link" and "canonical" in values.get("rel", "").lower().split():
            self.canonicals.append(values.get("href", ""))
        elif tag == "meta" and values.get("name", "").lower() == "robots":
            self.robots.append(values.get("content", "").lower().replace(" ", ""))
        elif tag == "body":
            self.body_classes.update(values.get("class", "").split())
        elif tag == "h1":
            self.h1 += 1
        elif tag == "main":
            self.main += 1
        elif tag == "article":
            self.articles += 1
        elif tag == "style":
            self.inline_styles += 1
        elif tag == "script" and not values.get("src") and values.get("type", "").lower() != "application/ld+json":
            self.executable_inline_scripts += 1


def require(text: str, marker: str, errors: list[str], source: str = "privacy.html") -> None:
    if marker not in text:
        errors.append(f"{source} is missing {marker!r}")


def main() -> None:
    if not PAGE.is_file():
        raise SystemExit("privacy.html is missing")
    if not CSS.is_file():
        raise SystemExit("assets/public-utility-pages.css is missing")

    text = PAGE.read_text(encoding="utf-8")
    css = CSS.read_text(encoding="utf-8")
    parser = Parser()
    parser.feed(text)
    errors: list[str] = []

    for marker in (
        "<title>Политика конфиденциальности — РА Лидер</title>",
        '<meta name="description"',
        '<meta property="og:type" content="website">',
        '<meta property="og:url" content="https://www.lider-bsk.ru/privacy.html">',
        '<meta property="og:image" content="https://www.lider-bsk.ru/assets/og-lider-default.png">',
        '<meta name="twitter:card" content="summary_large_image">',
        '<meta name="twitter:image" content="https://www.lider-bsk.ru/assets/og-lider-default.png">',
        "Политика обработки персональных данных",
        "Какие данные могут обрабатываться",
        "Цель обработки",
        "Передача данных",
        "Хранение данных",
        "Как отозвать согласие",
        "Данные не продаются третьим лицам.",
        "zakaz@lider-bsk.ru",
        'href="tel:+79802457471"',
        'href="mailto:zakaz@lider-bsk.ru"',
    ):
        require(text, marker, errors)

    if parser.robots != ["index,follow"]:
        errors.append(f"privacy.html must have exactly index,follow robots meta, got {parser.robots!r}")
    if parser.canonicals != ["https://www.lider-bsk.ru/privacy.html"]:
        errors.append(f"privacy.html has unexpected canonical URLs: {parser.canonicals!r}")
    if parser.stylesheets != ["assets/public-utility-pages.css?v=1"]:
        errors.append(f"privacy.html has unexpected stylesheets: {parser.stylesheets!r}")
    if "page-privacy" not in parser.body_classes:
        errors.append("privacy.html must use body class page-privacy")
    if parser.h1 != 1 or parser.main != 1 or parser.articles != 1:
        errors.append(
            f"privacy.html must have one H1, main and article; got h1={parser.h1}, main={parser.main}, article={parser.articles}"
        )
    if parser.inline_styles:
        errors.append("privacy.html must not contain inline style blocks")
    if parser.executable_inline_scripts:
        errors.append("privacy.html must not contain executable inline scripts")

    for marker in (
        "body.page-privacy",
        ".page-privacy .wrap",
        ".page-privacy .card",
        ".page-privacy h1",
        ".page-privacy .btn",
    ):
        if marker not in css:
            errors.append(f"utility stylesheet is missing privacy marker: {marker!r}")

    for href in parser.hrefs:
        path = urlsplit(href).path
        if not path.endswith(".html") or href.startswith(("http://", "https://")):
            continue
        if not (ROOT / path).is_file():
            errors.append(f"privacy.html has broken local link: {href}")

    for forbidden in ("leader-public-lead", "supabase", "request_id", "service_role"):
        if forbidden.lower() in text.lower():
            errors.append(f"privacy.html contains internal marker: {forbidden!r}")

    if errors:
        print("\n".join(errors))
        sys.exit(1)

    print("Public privacy utility page contract is valid.")


if __name__ == "__main__":
    main()
