#!/usr/bin/env python3
"""Verify the published CRM lead analytics assets on the official domain.

This read-only deployment smoke check performs HTTPS GET requests only. It
verifies the GitHub Pages alias redirect and the static files served from the
canonical www.lider-bsk.ru origin. It never logs in, submits forms or calls
Supabase.
"""

from __future__ import annotations

import argparse
import sys
import time
from dataclasses import dataclass
from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
from urllib.request import Request, urlopen

CANONICAL_BASE_URL = "https://www.lider-bsk.ru/crm/v4/"
GITHUB_PAGES_ALIAS_URL = "https://deputat36.github.io/lider-bsk/crm/v4/"
EXPECTED_SCHEME = "https"
EXPECTED_HOST = "www.lider-bsk.ru"
EXPECTED_PATH_PREFIX = "/crm/v4/"
MAX_RESPONSE_BYTES = 2_000_000
USER_AGENT = "lider-bsk-published-smoke/1.1"

INDEX_MARKERS = (
    "<title>РА Лидер — CRM v4</title>",
    'assets/v4/leads.js?v=',
    'assets/v4/lead-analytics-badges-v1.js?v=20260709-1',
    'id="leadSearch"',
    'id="leadsList"',
)


@dataclass(frozen=True)
class Target:
    name: str
    url: str
    kind: str
    markers: tuple[str, ...]


TARGETS = (
    Target(
        "GitHub Pages alias redirect",
        GITHUB_PAGES_ALIAS_URL,
        "html",
        INDEX_MARKERS,
    ),
    Target(
        "canonical CRM index",
        CANONICAL_BASE_URL,
        "html",
        INDEX_MARKERS,
    ),
    Target(
        "lead list module",
        f"{CANONICAL_BASE_URL}assets/v4/leads.js?v=20260717-module-singleton-1",
        "javascript",
        (
            "import { leadAnalyticsSearchText } from './lead-analytics-normalization.js';",
            "function leadHaystack(lead)",
            "leadAnalyticsSearchText(lead)",
            "function filteredLeads()",
        ),
    ),
    Target(
        "analytics badges module",
        f"{CANONICAL_BASE_URL}assets/v4/lead-analytics-badges-v1.js?v=20260709-1",
        "javascript",
        (
            "import './lead-analytics-summary-v1.js';",
            "import { deriveLeadAnalytics } from './lead-analytics-normalization.js';",
            "card.dataset.analyticsBadges === '1'",
            "leader-v4:leads-loaded",
            "Услуга:",
            "Источник:",
        ),
    ),
    Target(
        "analytics summary module",
        f"{CANONICAL_BASE_URL}assets/v4/lead-analytics-summary-v1.js",
        "javascript",
        (
            "Сводка по заявкам",
            "data-lead-analytics-search",
            "aria-pressed=",
            "current.toLowerCase() === requested.toLowerCase() ? '' : requested",
            "Сбросить поиск",
        ),
    ),
    Target(
        "analytics normalization module",
        f"{CANONICAL_BASE_URL}assets/v4/lead-analytics-normalization.js",
        "javascript",
        (
            "normalizeLeadServiceCategory",
            "normalizeLeadSourceCategory",
            "deriveLeadAnalytics",
            "leadAnalyticsSearchText",
            "['Сайт', ['сайт', 'site', 'lider-bsk.ru', 'форма сайта']]",
        ),
    ),
)


def cache_busted(url: str) -> str:
    parsed = urlparse(url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query["published_smoke"] = str(int(time.time()))
    return urlunparse(parsed._replace(query=urlencode(query)))


def validate_final_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != EXPECTED_SCHEME or parsed.netloc != EXPECTED_HOST:
        raise RuntimeError(f"unexpected canonical origin: {url}")
    if not parsed.path.startswith(EXPECTED_PATH_PREFIX):
        raise RuntimeError(f"unexpected canonical path: {url}")


def validate_content_type(kind: str, content_type: str) -> None:
    normalized = content_type.split(";", 1)[0].strip().lower()
    if kind == "html" and normalized not in {"text/html", "application/xhtml+xml"}:
        raise RuntimeError(f"unexpected HTML content type: {content_type}")
    if kind == "javascript" and normalized not in {
        "application/javascript",
        "text/javascript",
        "application/x-javascript",
        "text/plain",
    }:
        raise RuntimeError(f"unexpected JavaScript content type: {content_type}")


def fetch_text(target: Target, timeout: float) -> str:
    request = Request(
        cache_busted(target.url),
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/javascript,text/javascript;q=0.9,*/*;q=0.5",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
        },
        method="GET",
    )
    with urlopen(request, timeout=timeout) as response:
        status = getattr(response, "status", response.getcode())
        if status != 200:
            raise RuntimeError(f"HTTP {status} for {target.name}")
        validate_final_url(response.geturl())
        validate_content_type(target.kind, response.headers.get("Content-Type", ""))
        body = response.read(MAX_RESPONSE_BYTES + 1)
        if len(body) > MAX_RESPONSE_BYTES:
            raise RuntimeError(f"response too large for {target.name}")
    try:
        text = body.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise RuntimeError(f"invalid UTF-8 for {target.name}: {exc}") from exc
    if target.kind == "javascript" and "<!doctype html" in text.lower():
        raise RuntimeError(f"HTML fallback returned for {target.name}")
    return text


def missing_markers(text: str, markers: Iterable[str]) -> list[str]:
    return [marker for marker in markers if marker not in text]


def run_once(timeout: float) -> list[str]:
    errors: list[str] = []
    for target in TARGETS:
        try:
            text = fetch_text(target, timeout)
            missing = missing_markers(text, target.markers)
            if missing:
                errors.append(f"{target.name}: missing markers: {missing}")
            else:
                print(f"PASS {target.name}")
        except (HTTPError, URLError, TimeoutError, RuntimeError, OSError) as exc:
            errors.append(f"{target.name}: {exc}")
    return errors


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--attempts", type=int, default=3)
    parser.add_argument("--delay", type=float, default=2.0)
    parser.add_argument("--timeout", type=float, default=20.0)
    args = parser.parse_args()
    if args.attempts < 1:
        parser.error("--attempts must be at least 1")
    if args.delay < 0:
        parser.error("--delay cannot be negative")
    if args.timeout <= 0:
        parser.error("--timeout must be positive")
    return args


def main() -> int:
    args = parse_args()
    for attempt in range(1, args.attempts + 1):
        print(f"Published analytics smoke attempt {attempt}/{args.attempts}")
        errors = run_once(args.timeout)
        if not errors:
            print("Published CRM lead analytics assets are valid on the canonical domain.")
            return 0
        for error in errors:
            print(f"ERROR {error}", file=sys.stderr)
        if attempt < args.attempts:
            time.sleep(args.delay)
    print("Published CRM lead analytics smoke check failed.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
