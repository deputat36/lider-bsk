#!/usr/bin/env python3
from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, urlparse
import sys

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "utm-links.html"
CSS = ROOT / "assets" / "public-utm-links.css"
JS = ROOT / "assets" / "public-utm-links.js"
MODEL = ROOT / "assets" / "public-campaign-link-model.js"
BEHAVIOR_TEST = ROOT / "tools" / "test_public_campaign_link_builder.mjs"
SITEMAP = ROOT / "sitemap.xml"
EXPECTED_HOST = "www.lider-bsk.ru"
EXPECTED_UTM_KEYS = {"utm_source", "utm_medium", "utm_campaign", "utm_content"}


class UTMPageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.robots: list[str] = []
        self.h1_count = 0
        self.inline_style_count = 0
        self.inline_script_count = 0
        self.script_sources: list[str] = []
        self.stylesheets: list[str] = []
        self.tracked_links: list[str] = []
        self.copy_values: list[str] = []
        self.copy_button_errors: list[str] = []
        self.copy_status_count = 0
        self._in_style = False
        self._in_script_without_src = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        data = {key.lower(): (value or "") for key, value in attrs}
        tag = tag.lower()

        if tag == "meta" and data.get("name", "").lower() == "robots":
            self.robots.append(data.get("content", "").lower())
        elif tag == "h1":
            self.h1_count += 1
        elif tag == "style":
            self.inline_style_count += 1
            self._in_style = True
        elif tag == "script":
            src = data.get("src", "").strip()
            if src:
                self.script_sources.append(src)
            else:
                self.inline_script_count += 1
                self._in_script_without_src = True
        elif tag == "link" and "stylesheet" in data.get("rel", "").lower().split():
            self.stylesheets.append(data.get("href", "").strip())
        elif tag == "a" and "linkbox" in data.get("class", "").split():
            self.tracked_links.append(data.get("href", "").strip())
        elif tag == "button" and "data-copy" in data:
            value = data.get("data-copy", "").strip()
            self.copy_values.append(value)
            if data.get("type") != "button":
                self.copy_button_errors.append("copy button must use type=button")
            if data.get("aria-describedby") != "copy-status":
                self.copy_button_errors.append("copy button must reference copy-status")
        if data.get("id") == "copy-status":
            self.copy_status_count += 1
            if data.get("role") != "status":
                self.copy_button_errors.append("copy-status must use role=status")
            if data.get("aria-live") != "polite":
                self.copy_button_errors.append("copy-status must use aria-live=polite")

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "style":
            self._in_style = False
        elif tag.lower() == "script":
            self._in_script_without_src = False


def validate_tracked_url(value: str, errors: list[str]) -> None:
    parsed = urlparse(value)
    if parsed.scheme != "https" or parsed.netloc != EXPECTED_HOST:
        errors.append(f"Tracked link must use https://{EXPECTED_HOST}: {value}")
        return

    query = parse_qs(parsed.query, keep_blank_values=True)
    if set(query) != EXPECTED_UTM_KEYS:
        errors.append(f"Tracked link must contain exactly four UTM keys: {value}")
    for key in EXPECTED_UTM_KEYS:
        values = query.get(key, [])
        if len(values) != 1 or not values[0].strip():
            errors.append(f"Tracked link has invalid {key}: {value}")

    target = parsed.path.lstrip("/")
    if target and not (ROOT / target).is_file():
        errors.append(f"Tracked link target does not exist in repository: {parsed.path}")


def main() -> int:
    errors: list[str] = []
    for path in (PAGE, CSS, JS, MODEL, BEHAVIOR_TEST, SITEMAP):
        if not path.is_file():
            errors.append(f"Missing required file: {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    page = PAGE.read_text(encoding="utf-8")
    css = CSS.read_text(encoding="utf-8")
    js = JS.read_text(encoding="utf-8")
    model = MODEL.read_text(encoding="utf-8")
    behavior_test = BEHAVIOR_TEST.read_text(encoding="utf-8")
    sitemap = SITEMAP.read_text(encoding="utf-8")
    parser = UTMPageParser()
    parser.feed(page)

    if parser.robots != ["noindex, nofollow"]:
        errors.append(f"utm-links.html must keep exact noindex, nofollow robots meta: {parser.robots}")
    if parser.h1_count != 1:
        errors.append(f"utm-links.html must contain exactly one h1, found {parser.h1_count}")
    if parser.inline_style_count:
        errors.append("utm-links.html must not contain inline style blocks")
    if parser.inline_script_count:
        errors.append("utm-links.html must not contain executable inline scripts")
    if parser.stylesheets != ["assets/public-utm-links.css?v=3"]:
        errors.append(f"Unexpected UTM page stylesheets: {parser.stylesheets}")
    if parser.script_sources != ["assets/public-utm-links.js?v=3"]:
        errors.append(f"Unexpected UTM page scripts: {parser.script_sources}")
    if parser.copy_status_count != 1:
        errors.append(f"utm-links.html must contain one accessible copy status, found {parser.copy_status_count}")
    errors.extend(parser.copy_button_errors)

    if len(parser.tracked_links) != 12:
        errors.append(f"Expected 12 tracked links, found {len(parser.tracked_links)}")
    if len(parser.copy_values) != 12:
        errors.append(f"Expected 12 copy buttons, found {len(parser.copy_values)}")
    if len(set(parser.tracked_links)) != len(parser.tracked_links):
        errors.append("Tracked links must be unique")
    if parser.tracked_links != parser.copy_values:
        errors.append("Each tracked link must have a matching copy button in the same order")
    for value in parser.tracked_links:
        validate_tracked_url(value, errors)

    if "https://www.lider-bsk.ru/utm-links.html" in sitemap:
        errors.append("Internal noindex UTM page must not be present in sitemap.xml")

    for marker in (
        'id="builder-target"',
        'id="builder-channel"',
        'id="builder-campaign"',
        'id="builder-content"',
        'id="builder-result"',
        'id="builder-copy"',
        'id="builder-post"',
        'id="builder-copy-post"',
        'id="builder-status"',
        'Собрать ссылку для публикации',
        'Готовый текст для выбранного канала',
        'не обещает цену или срок',
    ):
        if marker not in page:
            errors.append(f"utm-links.html is missing campaign builder marker: {marker}")

    for marker in (
        ":root{--dark:#111827",
        ".copy-status{",
        ".builder-fields{",
        ".generated-link{",
        ".post-preview textarea{",
        ".builder-status{",
        ".btn[disabled]",
        ".linkbox:focus-visible",
        "@media(max-width:820px)",
    ):
        if marker not in css:
            errors.append(f"public-utm-links.css is missing marker: {marker}")
    if len(css.strip()) < 2400:
        errors.append(f"public-utm-links.css looks incomplete: {len(css.strip())} characters")

    for marker in (
        "navigator.clipboard",
        "window.isSecureContext",
        "document.execCommand('copy')",
        "button.dataset.copyState='success'",
        "setStatus(`Скопировано: ${linkContext(button)}.`)",
        "Не удалось скопировать ссылку автоматически",
        "buildCampaignUrl(params)",
        "currentCampaignTag()",
        "builderCopy?.addEventListener('click'",
        "builderCopyPost?.addEventListener('click'",
        "buildCampaignPost(params)",
        "Ссылка скопирована. Вставьте её в публикацию, сообщение или QR-код.",
        "Готовый текст со ссылкой скопирован.",
    ):
        if marker not in js:
            errors.append(f"public-utm-links.js is missing marker: {marker}")
    for marker in ("fetch(", "supabase", "localStorage", "sessionStorage", "alert("):
        if marker in js:
            errors.append(f"public-utm-links.js must not contain {marker!r}")

    for marker in (
        "https://www.lider-bsk.ru",
        "CAMPAIGN_TARGETS",
        "CAMPAIGN_CHANNELS",
        "normalizeUtmToken",
        "currentCampaignTag",
        "buildCampaignUrl",
        "buildCampaignPost",
        "telegram",
        "yandex_maps",
        "two_gis",
        "channel.format === 'message'",
        "channel.format === 'qr'",
        "channel.format === 'listing'",
        "channel.format === 'profile'",
    ):
        if marker not in model:
            errors.append(f"public-campaign-link-model.js is missing marker: {marker}")
    for marker in ("fetch(", "supabase", "localStorage", "sessionStorage", "document.", "window."):
        if marker in model:
            errors.append(f"public-campaign-link-model.js must remain pure and offline: {marker!r}")

    for marker in (
        "CAMPAIGN_TARGETS.length, 10",
        "CAMPAIGN_CHANNELS.length, 9",
        "bannery_iyul_2026",
        "qrRequest.pathname, '/request.html'",
        "const publicPost = buildCampaignPost",
        "CAMPAIGN_TARGETS.forEach",
        "CAMPAIGN_CHANNELS.forEach",
        "Public campaign builder is deterministic",
    ):
        if marker not in behavior_test:
            errors.append(f"campaign link behavior test is missing marker: {marker}")

    if errors:
        print("\n".join(errors))
        return 1

    print("Internal UTM links, 12 presets and the offline link/post builder contracts are valid.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
