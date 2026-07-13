#!/usr/bin/env python3
from html.parser import HTMLParser
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "404.html"
REQUIRED_LINKS = {
    "/",
    "request.html",
    "uslugi.html",
    "primery-rabot-kejsy.html",
    "prices.html",
    "kontakty.html",
    "privacy.html",
    "tel:+79802457471",
}


class Parser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.hrefs: list[str] = []
        self.h1 = 0
        self.main = 0
        self.nav_labels: list[str] = []
        self.robots: list[str] = []
        self.canonicals: list[str] = []
        self.form_markers = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {name.lower(): (value or "").strip() for name, value in attrs}
        tag = tag.lower()
        if tag == "a" and values.get("href"):
            self.hrefs.append(values["href"])
        elif tag == "h1":
            self.h1 += 1
        elif tag == "main":
            self.main += 1
        elif tag == "nav":
            self.nav_labels.append(values.get("aria-label", ""))
        elif tag == "meta" and values.get("name", "").lower() == "robots":
            self.robots.append(values.get("content", "").lower().replace(" ", ""))
        elif tag == "link" and "canonical" in values.get("rel", "").lower().split():
            self.canonicals.append(values.get("href", ""))
        elif tag == "form" or values.get("data-leader-lead-form") or values.get("id") == "leader-lead-form":
            self.form_markers += 1


def main() -> None:
    if not PAGE.is_file():
        raise SystemExit("404.html is missing")

    text = PAGE.read_text(encoding="utf-8")
    parser = Parser()
    parser.feed(text)
    errors: list[str] = []

    if parser.robots != ["noindex,nofollow"]:
        errors.append(f"404.html must have exactly noindex,nofollow robots meta, got {parser.robots!r}")
    if parser.canonicals:
        errors.append(f"404.html must not declare a canonical URL, got {parser.canonicals!r}")
    if parser.h1 != 1:
        errors.append(f"404.html must have exactly one H1, got {parser.h1}")
    if parser.main != 1:
        errors.append(f"404.html must have exactly one main element, got {parser.main}")
    if not any(label for label in parser.nav_labels):
        errors.append("404.html recovery navigation must have an aria-label")
    if parser.form_markers:
        errors.append("404.html must not embed or initialize the public lead form")

    missing = sorted(REQUIRED_LINKS - set(parser.hrefs))
    if missing:
        errors.append(f"404.html is missing recovery links: {missing!r}")

    for forbidden in (
        "leader-public-lead",
        "supabase",
        "request_id",
        "crm",
        "рабочий контур",
    ):
        if forbidden.lower() in text.lower():
            errors.append(f"404.html contains internal marker: {forbidden!r}")

    if "Страница не найдена" not in text or "Такой страницы нет" not in text:
        errors.append("404.html must explain the missing-page state in Russian")

    if errors:
        print("\n".join(errors))
        sys.exit(1)

    print(f"Public 404 page contract is valid: {len(parser.hrefs)} recovery/contact links.")


if __name__ == "__main__":
    main()
