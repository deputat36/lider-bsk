#!/usr/bin/env python3
"""Apply JSON-LD structured data to configured public pages."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "tools" / "structured_data_pages.json"
MARKER = "  <!-- Structured data / JSON-LD -->"
SCRIPT_RE = re.compile(
    r"\n\s*<!-- Structured data / JSON-LD -->\s*\n\s*<script\s+type=\"application/ld\+json\">.*?</script>\s*\n?",
    re.IGNORECASE | re.DOTALL,
)
LEGACY_LIDER_LOCALBUSINESS_RE = re.compile(
    r"\n\s*<script\s+type=\"application/ld\+json\">\s*\{\s*\"@context\"\s*:\s*\"https://schema\.org\"\s*,\s*\"@type\"\s*:\s*\"LocalBusiness\"\s*,\s*\"name\"\s*:\s*\"РА Лидер\".*?</script>\s*\n?",
    re.IGNORECASE | re.DOTALL,
)


def load_config() -> dict[str, Any]:
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def business_node(config: dict[str, Any]) -> dict[str, Any]:
    business = config["business"]
    return {
        "@type": business["type"],
        "@id": business["id"],
        "name": business["name"],
        "url": business["url"],
        "telephone": business["telephone"],
        "email": business["email"],
        "priceRange": business["priceRange"],
        "image": business["image"],
        "description": business["description"],
        "address": {"@type": business["address"]["type"], **{k: v for k, v in business["address"].items() if k != "type"}},
        "areaServed": business["areaServed"],
    }


def website_node(config: dict[str, Any]) -> dict[str, Any]:
    website = config["website"]
    return {
        "@type": "WebSite",
        "@id": website["id"],
        "name": website["name"],
        "url": website["url"],
        "inLanguage": website["inLanguage"],
        "publisher": {"@id": config["business"]["id"]},
    }


def webpage_node(config: dict[str, Any], page: dict[str, Any]) -> dict[str, Any]:
    return {
        "@type": "WebPage",
        "@id": f"{page['url']}#webpage",
        "url": page["url"],
        "name": page["name"],
        "description": page["description"],
        "inLanguage": config["website"]["inLanguage"],
        "isPartOf": {"@id": config["website"]["id"]},
        "about": {"@id": config["business"]["id"]},
    }


def breadcrumb_node(config: dict[str, Any], page: dict[str, Any]) -> dict[str, Any]:
    items = [
        {
            "@type": "ListItem",
            "position": 1,
            "name": "Главная",
            "item": config["business"]["url"],
        }
    ]
    if page["url"] != config["business"]["url"]:
        items.append(
            {
                "@type": "ListItem",
                "position": 2,
                "name": page["breadcrumb"],
                "item": page["url"],
            }
        )
    return {"@type": "BreadcrumbList", "itemListElement": items}


def service_node(config: dict[str, Any], page: dict[str, Any]) -> dict[str, Any] | None:
    if page["kind"] not in {"service", "service_overview"}:
        return None
    return {
        "@type": "Service",
        "@id": f"{page['url']}#service",
        "name": page["name"],
        "serviceType": page["serviceType"],
        "description": page["description"],
        "url": page["url"],
        "provider": {"@id": config["business"]["id"]},
        "areaServed": config["business"]["areaServed"],
    }


def collection_node(page: dict[str, Any]) -> dict[str, Any] | None:
    if page["kind"] != "collection":
        return None
    return {
        "@type": "CollectionPage",
        "@id": f"{page['url']}#collection",
        "url": page["url"],
        "name": page["name"],
        "description": page["description"],
    }


def build_jsonld(config: dict[str, Any], page: dict[str, Any]) -> str:
    graph: list[dict[str, Any]] = [business_node(config), website_node(config), webpage_node(config, page)]
    service = service_node(config, page)
    collection = collection_node(page)
    if service:
        graph.append(service)
    if collection:
        graph.append(collection)
    graph.append(breadcrumb_node(config, page))
    payload = {"@context": "https://schema.org", "@graph": graph}
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def insert_block(document: str, config: dict[str, Any], page: dict[str, Any]) -> str:
    lower = document.lower()
    head_close = lower.find("</head>")
    if head_close < 0:
        raise ValueError(f"{page['path']}: missing </head>")

    head = document[:head_close]
    rest = document[head_close:]
    head = SCRIPT_RE.sub("\n", head)
    head = LEGACY_LIDER_LOCALBUSINESS_RE.sub("\n", head)
    block = f"{MARKER}\n  <script type=\"application/ld+json\">{build_jsonld(config, page)}</script>\n"
    return head.rstrip() + "\n" + block + rest


def extract_marked_jsonld(document: str) -> dict[str, Any] | None:
    match = re.search(
        r"<!-- Structured data / JSON-LD -->\s*\n\s*<script\s+type=\"application/ld\+json\">(.*?)</script>",
        document,
        re.IGNORECASE | re.DOTALL,
    )
    if not match:
        return None
    return json.loads(match.group(1))


def validate_document(document: str, page: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    data = extract_marked_jsonld(document)
    if data is None:
        return ["missing marked JSON-LD block"]
    graph = data.get("@graph", [])
    types = {node.get("@type") for node in graph if isinstance(node, dict)}
    if "LocalBusiness" not in types:
        errors.append("missing LocalBusiness")
    if "WebSite" not in types:
        errors.append("missing WebSite")
    if "WebPage" not in types:
        errors.append("missing WebPage")
    if "BreadcrumbList" not in types:
        errors.append("missing BreadcrumbList")
    if page["kind"] in {"service", "service_overview"} and "Service" not in types:
        errors.append("missing Service")
    if page["kind"] == "collection" and "CollectionPage" not in types:
        errors.append("missing CollectionPage")
    if page["url"] not in json.dumps(data, ensure_ascii=False):
        errors.append("page URL not found")
    return errors


def run(apply: bool) -> int:
    config = load_config()
    changed: list[str] = []
    failures: dict[str, list[str]] = {}

    for page in config["pages"]:
        path = ROOT / page["path"]
        if not path.exists():
            raise FileNotFoundError(page["path"])
        original = path.read_text(encoding="utf-8")
        updated = insert_block(original, config, page)
        target = updated if apply else original
        errors = validate_document(target, page)
        if errors:
            failures[page["path"]] = errors
        if updated != original:
            changed.append(page["path"])
            if apply:
                path.write_text(updated, encoding="utf-8")

    if failures:
        print("Structured data is not complete:")
        for path, errors in failures.items():
            print(f"- {path}: {', '.join(errors)}")
        if not apply:
            print("Run: python3 tools/apply_structured_data.py --apply")
        return 1

    if apply:
        if changed:
            print("Updated structured data:")
            for item in changed:
                print(f"- {item}")
        else:
            print("Structured data is already up to date.")
    else:
        print("Structured data is complete for configured pages.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true", help="Check configured pages")
    mode.add_argument("--apply", action="store_true", help="Apply configured structured data")
    args = parser.parse_args()
    return run(apply=args.apply)


if __name__ == "__main__":
    raise SystemExit(main())
