#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "kontakty.html"
CSS = ROOT / "assets" / "public-contacts.css"
JS = ROOT / "assets" / "public-contacts.js"
FORM_CSS = 'assets/public-lead-form.css?v=4'
PAGE_CSS = 'assets/public-contacts.css?v=1'
FORM_JS = 'assets/public-lead-form.js?v=23'
PAGE_JS = 'assets/public-contacts.js?v=1'


def main() -> None:
    errors: list[str] = []
    page = PAGE.read_text(encoding="utf-8") if PAGE.is_file() else ""
    css = CSS.read_text(encoding="utf-8") if CSS.is_file() else ""
    js = JS.read_text(encoding="utf-8") if JS.is_file() else ""

    if not page:
        errors.append("Missing kontakty.html")
    if not css:
        errors.append("Missing assets/public-contacts.css")
    if not js:
        errors.append("Missing assets/public-contacts.js")

    if re.search(r"<style\b", page, flags=re.IGNORECASE):
        errors.append("Contacts page must not contain an inline <style> block")

    executable_inline = re.findall(
        r"<script(?![^>]*type=[\"']application/ld\+json[\"'])[^>]*>(.*?)</script>",
        page,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if any(block.strip() for block in executable_inline):
        errors.append("Contacts page must not contain executable inline JavaScript")

    for marker, label in (
        (FORM_CSS, "shared form CSS"),
        (PAGE_CSS, "contacts CSS"),
        (FORM_JS, "shared form JS"),
        (PAGE_JS, "contacts JS"),
    ):
        if page.count(marker) != 1:
            errors.append(f"Contacts page must load {label} exactly once")

    if FORM_CSS in page and PAGE_CSS in page and page.index(FORM_CSS) > page.index(PAGE_CSS):
        errors.append("Shared form CSS must load before contacts page CSS")
    if FORM_JS in page and PAGE_JS in page and page.index(FORM_JS) > page.index(PAGE_JS):
        errors.append("Shared form JS must load before contacts page preset")

    required_page_markers = (
        '<h1>Контакты РА Лидер</h1>',
        'href="tel:+79802457471"',
        'href="mailto:zakaz@lider-bsk.ru"',
        'id="leader-lead-form"',
        'data-leader-lead-form',
        '"@type":"LocalBusiness"',
        '"telephone":"+79802457471"',
        '"email":"zakaz@lider-bsk.ru"',
        'После отправки появится номер обращения',
    )
    for marker in required_page_markers:
        if marker not in page:
            errors.append(f"Contacts page lost required marker: {marker}")

    for forbidden in (
        'openingHours',
        'openingHoursSpecification',
        '"geo"',
        '"sameAs"',
        'postalCode',
        'streetAddress',
        'yandex.ru/maps',
        '2gis.ru',
    ):
        if forbidden in page:
            errors.append(f"Contacts page contains unconfirmed NAP marker: {forbidden}")

    required_css_markers = (
        ":root{",
        ".hero{",
        ".grid{",
        ".card{",
        ".contact{",
        ".cta{",
        "@media(max-width:860px)",
    )
    for marker in required_css_markers:
        if marker not in css:
            errors.append(f"public-contacts.css is missing required marker: {marker}")

    if len(css.strip()) < 1500:
        errors.append(f"public-contacts.css is unexpectedly short: {len(css.strip())} characters")
    if re.search(r"url\s*\(\s*['\"]?https?://", css, flags=re.IGNORECASE):
        errors.append("public-contacts.css must not add remote CSS resources")

    required_js_markers = (
        "DOMContentLoaded",
        "[data-leader-lead-widget]",
        "[name=\"service\"]",
        "[name=\"message\"]",
        "service.options[i].value==='Другое'",
        "Страница контактов. Нужна консультация и расчёт рекламной задачи.",
    )
    for marker in required_js_markers:
        if marker not in js:
            errors.append(f"public-contacts.js is missing required marker: {marker}")

    for forbidden in ("fetch(", "XMLHttpRequest", "leader-public-lead", "supabase.co"):
        if forbidden in js:
            errors.append(f"Contacts page preset must not submit data directly: {forbidden}")

    if errors:
        print("\n".join(errors))
        sys.exit(1)

    print(
        "Public contacts asset contract is valid: external CSS/JS, confirmed phone/email, "
        "no unconfirmed NAP fields."
    )


if __name__ == "__main__":
    main()
